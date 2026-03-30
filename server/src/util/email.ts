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
