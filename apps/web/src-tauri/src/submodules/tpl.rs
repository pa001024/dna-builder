use base64::{Engine as _, engine::general_purpose};
use opencv::{core::Mat, imgcodecs};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, RwLock};
use thiserror::Error;

// 自定义错误类型，让调用者可以精准处理不同错误
#[derive(Error, Debug)]
pub enum TemplateError {
    #[error("模板文件不存在或路径无效: {0}")]
    FileNotFound(String),

    #[error("图像解码失败，无法加载模板: {0}")]
    ImreadFailed(String),

    #[error("缓存锁获取失败（{0}），可能发生死锁或线程异常")]
    CacheLockFailed(String),

    #[error("Base64 解码失败: {0}")]
    Base64DecodeFailed(String),
}

// 优化1：使用RwLock替换Mutex（读多写少场景更高效，支持多线程同时读）
// 优化2：缓存Key改为PathBuf（支持路径规范化，避免重复缓存）
static TEMPLATE_CACHE: LazyLock<RwLock<HashMap<PathBuf, Box<Mat>>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));

// Base64 字符串缓存（使用 String 作为键，直接使用 base64 字符串）
static BASE64_TEMPLATE_CACHE: LazyLock<RwLock<HashMap<String, Box<Mat>>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));

/// 获取模板（优先从缓存读取，未命中则加载文件并缓存）
/// 返回Result<Box<Mat>, TemplateError>，方便调用者处理错误
pub(crate) fn get_template(path: &str) -> Result<Box<Mat>, TemplateError> {
    // 步骤1：路径规范化（解析./、../，转为绝对路径），避免重复缓存
    let path_buf = Path::new(path)
        .canonicalize() // 规范化路径，失败则返回文件不存在错误
        .map_err(|e| TemplateError::FileNotFound(format!("{}: {}", path, e)))?;
    let path_str = path_buf.to_string_lossy();

    // 步骤2：先查缓存（仅获取读锁，支持多线程同时读取，锁持有时间极短）
    {
        // 读锁获取失败（通常是poisoned，即持有锁的线程panic）
        let cache = TEMPLATE_CACHE
            .read()
            .map_err(|e| TemplateError::CacheLockFailed(format!("读锁: {}", e)))?;

        // 缓存命中，直接返回克隆的模板
        if let Some(item) = cache.get(&path_buf) {
            // 注意：Mat::clone()是浅拷贝（仅复制矩阵头，不拷贝像素数据），高效但共享底层数据
            // 若需要深拷贝，请替换为：Ok(Box::new(item.as_ref().clone_with_alloc()?))
            return Ok(item.clone());
        }
    } // 读锁在此处自动释放（代码块结束，变量销毁）

    // 步骤3：缓存未命中，执行耗时操作（无锁状态，不阻塞其他线程）
    // 检查文件是否存在（规范化路径后，此处检查更可靠）
    if !path_buf.exists() {
        return Err(TemplateError::FileNotFound(path_str.into_owned()));
    }

    // 加载并解码图像（保持原始通道数，支持带透明度的图像）
    let mat = imgcodecs::imread(&path_str, imgcodecs::IMREAD_UNCHANGED)
        .map_err(|e| TemplateError::ImreadFailed(format!("{}: {:?}", path_str, e)))?;
    let new_template = Box::new(mat);

    // 步骤4：写入缓存（仅获取写锁，独占访问，锁持有时间极短）
    {
        let mut cache = TEMPLATE_CACHE
            .write()
            .map_err(|e| TemplateError::CacheLockFailed(format!("写锁: {}", e)))?;

        // 二次检查缓存（解决多线程竞态条件，避免重复插入）
        if let Some(existing_item) = cache.get(&path_buf) {
            return Ok(existing_item.clone());
        }

        // 插入缓存
        cache.insert(path_buf, new_template.clone());
    } // 写锁在此处自动释放

    // 步骤5：返回新加载的模板
    Ok(new_template)
}

/// 从 base64 字符串获取模板（优先从缓存读取，未命中则解码并缓存）
/// 返回Result<Box<Mat>, TemplateError>，方便调用者处理错误
pub(crate) fn get_template_b64(b64_str: &str) -> Result<Box<Mat>, TemplateError> {
    // 步骤1：先查缓存（仅获取读锁，支持多线程同时读取，锁持有时间极短）
    {
        let cache = BASE64_TEMPLATE_CACHE
            .read()
            .map_err(|e| TemplateError::CacheLockFailed(format!("读锁: {}", e)))?;

        if let Some(item) = cache.get(b64_str) {
            return Ok(item.clone());
        }
    }

    // 步骤2：缓存未命中，执行解码操作（无锁状态，不阻塞其他线程）
    let bytes = general_purpose::STANDARD
        .decode(b64_str)
        .map_err(|e| TemplateError::Base64DecodeFailed(format!("解码失败: {}", e)))?;

    let mat = imgcodecs::imdecode(
        &opencv::core::Vector::<u8>::from(bytes),
        imgcodecs::IMREAD_UNCHANGED,
    )
    .map_err(|e| TemplateError::ImreadFailed(format!("解码图像失败: {:?}", e)))?;

    let new_template = Box::new(mat);

    // 步骤3：写入缓存（仅获取写锁，独占访问，锁持有时间极短）
    {
        let mut cache = BASE64_TEMPLATE_CACHE
            .write()
            .map_err(|e| TemplateError::CacheLockFailed(format!("写锁: {}", e)))?;

        if let Some(existing_item) = cache.get(b64_str) {
            return Ok(existing_item.clone());
        }

        cache.insert(b64_str.to_string(), new_template.clone());
    }

    Ok(new_template)
}
