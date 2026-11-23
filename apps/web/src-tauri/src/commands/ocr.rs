//! 截图 OCR：base64 图片 → 结构化文本行（供升华装备截图导入）。

use base64::{Engine as _, engine::general_purpose::STANDARD};
use dob_script_runtime::ocr::{OcrInitConfig, OcrTextLine, init_ocr, ocr_lines_from_image_bytes};

/// base64 字符长度上限（约 24MB 原图），超出直接报错。
const MAX_IMAGE_BASE64_LEN: usize = 32 * 1024 * 1024;

/// 一行 OCR 结果（前端契约：camelCase；坐标取四点包围盒）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrLineDto {
    pub text: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub det_score: f32,
    pub rec_score: f32,
}

/// 识别 base64 图片中的文本行：首次调用会初始化并下载模型，之后复用实例池。
#[tauri::command]
pub async fn ocr_recognize_lines(image_base64: String) -> Result<Vec<OcrLineDto>, String> {
    if image_base64.len() > MAX_IMAGE_BASE64_LEN {
        return Err(format!(
            "OCR 识别失败: 图片过大（base64 长度 {} 超过上限 {MAX_IMAGE_BASE64_LEN}）",
            image_base64.len()
        ));
    }
    tauri::async_runtime::spawn_blocking(move || recognize_lines(&image_base64))
        .await
        .map_err(|e| format!("OCR 识别失败: 识别线程异常: {e}"))?
}

fn recognize_lines(image_base64: &str) -> Result<Vec<OcrLineDto>, String> {
    // 与脚本入口 initOcr 保持一致，避免不同配置触发实例池重建
    let config = OcrInitConfig {
        local_root_dir: None,
        cdn_base_url: None,
        num_thread: 4,
        pool_size: 4,
    };
    init_ocr(config).map_err(|e| format!("OCR 初始化失败: {e}"))?;
    let bytes = STANDARD
        .decode(image_base64.trim())
        .map_err(|e| format!("OCR 识别失败: base64 解码失败: {e}"))?;
    let lines = ocr_lines_from_image_bytes(&bytes).map_err(|e| format!("OCR 识别失败: {e}"))?;
    Ok(lines.into_iter().map(to_dto).collect())
}

fn to_dto(line: OcrTextLine) -> OcrLineDto {
    let xs = line.points.iter().map(|point| point[0]);
    let ys = line.points.iter().map(|point| point[1]);
    let min_x = xs.clone().min().unwrap_or(0);
    let max_x = xs.max().unwrap_or(min_x);
    let min_y = ys.clone().min().unwrap_or(0);
    let max_y = ys.max().unwrap_or(min_y);
    OcrLineDto {
        text: line.text,
        x: min_x,
        y: min_y,
        width: max_x - min_x,
        height: max_y - min_y,
        det_score: line.det_score,
        rec_score: line.rec_score,
    }
}
