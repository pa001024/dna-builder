import nodemailer from "nodemailer"

// 创建邮件发送 transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_PORT === "465", // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    // debug: true,
    // logger: true,
})

/**
 * 发送密码重置邮件
 * @param email 用户邮箱
 * @param code 6位数字验证码
 */
export async function sendPasswordResetEmail(email: string, code: string) {
    const mailOptions = {
        from: process.env.SMTP_FROM,
        to: email,
        subject: "DNA Builder - 密码重置验证码",
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                <h2 style="color: #333; text-align: center;">DNA Builder 密码重置验证码</h2>
                <p>您好，</p>
                <p>您请求重置DNA Builder账号的密码。以下是您的验证码：</p>
                <div style="text-align: center; margin: 20px 0;">
                    <div style="display: inline-block; font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 16px 32px; background-color: #f0f0f0; border-radius: 8px; color: #333;">
                        ${code}
                    </div>
                </div>
                <p>验证码有效期为30分钟，请尽快使用。</p>
                <p>如果您没有请求此重置，请忽略此邮件。</p>
                <p>此致<br>DNA Builder团队</p>
            </div>
        `,
    }

    return await transporter.sendMail(mailOptions)
}

/** MOD 上传通知所需的简要信息。 */
export interface ModUploadNotificationInfo {
    /** MOD 名称。 */
    name: string
    /** 适用分类。 */
    category: string
    /** 适用实体。 */
    entity?: string
    /** 上传者名称。 */
    uploader: string
    /** 描述（可含 markdown，仅取纯文本摘要）。 */
    description?: string
    /** MOD 大小（字节）。 */
    fileSize: number
}

/**
 * @description 有新 MOD 上传时给管理员发送审核通知邮件（发送到 .env 的 ADMIN_EMAIL）。
 * 邮件发送失败不影响上传流程，仅记录日志。
 * @param info MOD 简要信息。
 */
export async function sendModUploadNotification(info: ModUploadNotificationInfo) {
    const adminEmail = process.env.ADMIN_EMAIL
    if (!adminEmail) {
        console.warn("未配置 ADMIN_EMAIL，跳过 MOD 审核通知邮件")
        return
    }
    const categoryLabel: Record<string, string> = {
        char: "角色",
        weapon: "武器",
        other: "其他",
        standalone: "独立",
    }
    const description = (info.description || "")
        .replace(/[#*`>[\]()!_-]/g, "")
        .trim()
        .slice(0, 200)
    const sizeMB = (info.fileSize / 1024 / 1024).toFixed(1)
    const mailOptions = {
        from: process.env.SMTP_FROM,
        to: adminEmail,
        subject: `【MOD 审核】新 MOD 待审核：${info.name}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                <h2 style="color: #333; text-align: center;">DNA Builder - 新 MOD 审核通知</h2>
                <p>有新的 MOD 上传，等待您的审核：</p>
                <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                    <tr><td style="padding: 8px; border: 1px solid #e0e0e0;"><b>MOD 名称</b></td><td style="padding: 8px; border: 1px solid #e0e0e0;">${info.name}</td></tr>
                    <tr><td style="padding: 8px; border: 1px solid #e0e0e0;"><b>适用分类</b></td><td style="padding: 8px; border: 1px solid #e0e0e0;">${categoryLabel[info.category] || info.category}${info.entity ? `（${info.entity}）` : ""}</td></tr>
                    <tr><td style="padding: 8px; border: 1px solid #e0e0e0;"><b>上传者</b></td><td style="padding: 8px; border: 1px solid #e0e0e0;">${info.uploader}</td></tr>
                    <tr><td style="padding: 8px; border: 1px solid #e0e0e0;"><b>大小</b></td><td style="padding: 8px; border: 1px solid #e0e0e0;">${sizeMB} MB</td></tr>
                </table>
                ${description ? `<p style="color: #555;">描述：${description}</p>` : ""}
                <p style="text-align: center; margin: 24px 0;">
                    <a href="${process.env.API_BASE_URL || "https://api.dna-builder.cn/"}admin/game-mod" style="display: inline-block; padding: 10px 24px; background-color: #4f46e5; color: #fff; text-decoration: none; border-radius: 6px;">前往后台审核</a>
                </p>
                <p style="color: #888; font-size: 12px;">此邮件由 DNA Builder 自动发送，请勿直接回复。</p>
            </div>
        `,
    }

    try {
        await transporter.sendMail(mailOptions)
    } catch (error) {
        console.error("发送 MOD 审核通知邮件失败:", error)
    }
}
