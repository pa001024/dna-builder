//! 多线程分块下载与断点续传：进度文件格式、进度事件节流、下载命令。

use std::{
    collections::HashSet,
    fs::{self, File},
    io::{Seek, SeekFrom, Write},
    path::{Component, Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use futures_util::StreamExt;
use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};

use tauri::Emitter;

use super::{
    fs::get_file_size,
    net::{GAME_LAUNCHER_USER_AGENT, build_http_client},
};

const DOWNLOAD_CHUNK_SIZE: u64 = 8 * 1024 * 1024;
const MULTITHREAD_THRESHOLD: u64 = 10 * 1024 * 1024;
const PROGRESS_MAGIC: &[u8; 2] = b"PA";
const PROGRESS_HEADER_SIZE: usize = 6;

lazy_static! {
    /// 全局HTTP客户端，用于复用连接
    static ref HTTP_CLIENT: Arc<reqwest::Client> =
        Arc::new(build_http_client().expect("Failed to create HTTP client"));
    static ref DOWNLOAD_PROGRESS_LOCK: Mutex<()> = Mutex::new(());
    static ref PAUSED_DOWNLOADS: Mutex<HashSet<String>> = Mutex::new(HashSet::new());
    static ref ACTIVE_DOWNLOADS: Mutex<HashSet<String>> = Mutex::new(HashSet::new());
}

/// 下载分块进度信息
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ChunkProgress {
    /// 分块索引
    index: usize,
    /// 分块起始位置
    start: u64,
    /// 分块结束位置
    end: u64,
    /// 已下载字节数
    downloaded: u64,
    /// 是否已完成
    completed: bool,
}

/// 下载进度文件
#[derive(Debug, Clone, Serialize, Deserialize)]
struct DownloadProgress {
    /// 文件总大小
    total_size: u64,
    /// 分块总数
    num_chunks: usize,
    /// 各分块进度
    chunks: Vec<ChunkProgress>,
}

/// 下载进度查询结果
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgressSnapshot {
    filename: String,
    downloaded: u64,
    total: u64,
    progress: u64,
    has_progress_file: bool,
    active: bool,
    paused: bool,
}

/// 下载活跃状态守卫。
struct ActiveDownloadGuard {
    filename: String,
}

impl ActiveDownloadGuard {
    fn try_new(filename: &str) -> Result<Self, String> {
        let mut active_downloads = ACTIVE_DOWNLOADS.lock().unwrap();
        if active_downloads.contains(filename) {
            return Err("download_already_active".to_string());
        }
        active_downloads.insert(filename.to_string());
        Ok(Self {
            filename: filename.to_string(),
        })
    }
}

impl Drop for ActiveDownloadGuard {
    fn drop(&mut self) {
        ACTIVE_DOWNLOADS.lock().unwrap().remove(&self.filename);
    }
}

/// 将下载文件名归一化为后端状态表使用的 key。
fn get_download_state_key(filename: &str) -> Result<String, String> {
    let current_dir =
        std::env::current_dir().map_err(|e| format!("Failed to get current directory: {}", e))?;
    let mut normalized = PathBuf::new();
    for component in current_dir.join(filename).components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }
    Ok(normalized
        .to_string_lossy()
        .replace('/', "\\")
        .to_lowercase())
}

/// 下载进度事件节流器。
struct DownloadProgressEmitter {
    app_handle: tauri::AppHandle,
    filename: String,
    total_size: u64,
    last_emit: Mutex<Instant>,
}

/// 多线程下载期间的内存进度与节流落盘状态。
struct DownloadProgressStore {
    file_path: PathBuf,
    progress: Mutex<DownloadProgress>,
    last_save: Mutex<Instant>,
}

impl DownloadProgressStore {
    /// 创建内存进度存储。
    fn new(file_path: &Path, progress: DownloadProgress) -> Self {
        Self {
            file_path: file_path.to_path_buf(),
            progress: Mutex::new(progress),
            last_save: Mutex::new(Instant::now()),
        }
    }

    /// 更新单个分块进度，并按固定间隔保存快照。
    fn record(&self, chunk_index: usize, downloaded: u64, completed: bool) -> Result<(), String> {
        {
            let mut progress = self.progress.lock().unwrap();
            let chunk = progress
                .chunks
                .get_mut(chunk_index)
                .ok_or_else(|| "分块索引超出范围".to_string())?;
            chunk.downloaded = downloaded;
            chunk.completed = completed;
        }

        let now = Instant::now();
        let should_save = {
            let mut last_save = self.last_save.lock().unwrap();
            if now.duration_since(*last_save) < Duration::from_millis(500) {
                false
            } else {
                *last_save = now;
                true
            }
        };
        if should_save {
            self.persist()?;
        }
        Ok(())
    }

    /// 将当前完整进度快照写入进度文件。
    fn persist(&self) -> Result<(), String> {
        let progress_file = {
            let progress = self.progress.lock().unwrap();
            encode_progress_file(&progress)?
        };
        let _guard = DOWNLOAD_PROGRESS_LOCK.lock().unwrap();
        fs::write(get_progress_file_path(&self.file_path), progress_file)
            .map_err(|e| format!("写入进度文件失败: {}", e))
    }
}

impl DownloadProgressEmitter {
    fn new(app_handle: tauri::AppHandle, filename: &str, total_size: u64) -> Self {
        Self {
            app_handle,
            filename: filename.to_string(),
            total_size,
            last_emit: Mutex::new(Instant::now() - Duration::from_millis(250)),
        }
    }

    fn emit(&self, downloaded: u64, force: bool) -> Result<(), String> {
        let now = Instant::now();
        let mut last_emit = self.last_emit.lock().unwrap();
        if !force && now.duration_since(*last_emit) < Duration::from_millis(250) {
            return Ok(());
        }
        *last_emit = now;
        let progress_percent = if self.total_size > 0 {
            (downloaded * 100) / self.total_size
        } else {
            0
        };
        self.app_handle
            .emit(
                "download_progress",
                serde_json::json!({
                    "filename": self.filename,
                    "progress": progress_percent,
                    "downloaded": downloaded,
                    "total": self.total_size,
                }),
            )
            .map_err(|e| format!("发送进度事件失败: {}", e))
    }
}

/// 获取进度文件路径
fn get_progress_file_path(file_path: &Path) -> PathBuf {
    let file_name = file_path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    let parent = file_path.parent().unwrap_or(Path::new(""));
    let progress_file_name = format!("{}.progress", file_name);
    parent.join(progress_file_name)
}

/// 创建初始进度文件
fn create_progress_file(
    file_path: &Path,
    total_size: u64,
    chunk_size: u64,
    num_chunks: usize,
) -> Result<DownloadProgress, String> {
    let _guard = DOWNLOAD_PROGRESS_LOCK.lock().unwrap();
    let progress = build_download_progress(total_size, chunk_size, num_chunks, &[]);
    let progress_path = get_progress_file_path(file_path);
    fs::write(&progress_path, encode_progress_file(&progress)?)
        .map_err(|e| format!("写入进度文件失败: {}", e))?;

    Ok(progress)
}

/// 计算保存指定分块数所需的位图字节数。
fn progress_mask_size(num_chunks: usize) -> usize {
    num_chunks.div_ceil(8)
}

/// 从位图构造内存中的分块状态。
fn build_download_progress(
    total_size: u64,
    chunk_size: u64,
    num_chunks: usize,
    progress_mask: &[u8],
) -> DownloadProgress {
    let chunks = (0..num_chunks)
        .map(|index| {
            let start = index as u64 * chunk_size;
            let end = (start + chunk_size - 1).min(total_size.saturating_sub(1));
            let completed = progress_mask
                .get(index / 8)
                .is_some_and(|byte| byte & (1 << (index % 8)) != 0);
            ChunkProgress {
                index,
                start,
                end,
                downloaded: if completed {
                    end.saturating_sub(start) + 1
                } else {
                    0
                },
                completed,
            }
        })
        .collect();

    DownloadProgress {
        total_size,
        num_chunks,
        chunks,
    }
}

#[cfg(test)]
mod download_progress_tests {
    use super::{
        build_download_progress, decode_progress_file, encode_progress_file, progress_mask_size,
    };

    /// 验证文件头和低位优先位图使用固定紧凑格式。
    #[test]
    fn progress_mask_uses_one_bit_per_chunk() {
        let progress_mask = [0b1000_0001, 0b0000_0011];
        let progress = build_download_progress(80, 8, 10, &progress_mask);
        let encoded = encode_progress_file(&progress).unwrap();
        let (num_chunks, decoded_mask) = decode_progress_file(&encoded).unwrap();

        assert_eq!(progress_mask_size(10), 2);
        assert_eq!(encoded, [b'P', b'A', 10, 0, 0, 0, 0b1000_0001, 0b0000_0011]);
        assert_eq!(num_chunks, 10);
        assert_eq!(decoded_mask, progress_mask);
        assert_eq!(decoded_mask[1] & 0b1111_1100, 0);
        assert!(progress.chunks[0].completed);
        assert!(progress.chunks[7].completed);
        assert!(progress.chunks[8].completed);
        assert!(progress.chunks[9].completed);
        assert!(!progress.chunks[1].completed);
    }
}

/// 将内存中的完成状态编码为位图。
fn encode_progress_mask(progress: &DownloadProgress) -> Vec<u8> {
    let mut progress_mask = vec![0; progress_mask_size(progress.num_chunks)];
    for chunk in &progress.chunks {
        if chunk.completed {
            progress_mask[chunk.index / 8] |= 1 << (chunk.index % 8);
        }
    }
    progress_mask
}

/// 将固定文件头与完成位图编码为进度文件内容。
fn encode_progress_file(progress: &DownloadProgress) -> Result<Vec<u8>, String> {
    let num_chunks =
        u32::try_from(progress.num_chunks).map_err(|_| "分块数量超过 u32 范围".to_string())?;
    let progress_mask = encode_progress_mask(progress);
    let mut content = Vec::with_capacity(PROGRESS_HEADER_SIZE + progress_mask.len());
    content.extend_from_slice(PROGRESS_MAGIC);
    content.extend_from_slice(&num_chunks.to_le_bytes());
    content.extend_from_slice(&progress_mask);
    Ok(content)
}

/// 解析并校验进度文件头与正文长度。
fn decode_progress_file(content: &[u8]) -> Option<(usize, &[u8])> {
    if content.len() < PROGRESS_HEADER_SIZE || &content[..2] != PROGRESS_MAGIC {
        return None;
    }
    let num_chunks = u32::from_le_bytes(content[2..6].try_into().ok()?) as usize;
    let progress_mask = &content[PROGRESS_HEADER_SIZE..];
    if progress_mask.len() != progress_mask_size(num_chunks) {
        return None;
    }
    Some((num_chunks, progress_mask))
}

/// 按给定分块布局读取位图进度文件。
fn read_progress_file(
    file_path: &Path,
    total_size: u64,
    chunk_size: u64,
    num_chunks: usize,
) -> Option<DownloadProgress> {
    let _guard = DOWNLOAD_PROGRESS_LOCK.lock().unwrap();
    let content = fs::read(get_progress_file_path(file_path)).ok()?;
    let (stored_num_chunks, progress_mask) = decode_progress_file(&content)?;
    if stored_num_chunks != num_chunks {
        return None;
    }
    Some(build_download_progress(
        total_size,
        chunk_size,
        num_chunks,
        progress_mask,
    ))
}

/// 根据文件头中的分块数推断进度布局，用于页面恢复显示。
fn read_progress_snapshot(file_path: &Path) -> Option<DownloadProgress> {
    let total_size = fs::metadata(file_path).ok()?.len();
    let stored_num_chunks = {
        let _guard = DOWNLOAD_PROGRESS_LOCK.lock().unwrap();
        let content = fs::read(get_progress_file_path(file_path)).ok()?;
        decode_progress_file(&content)?.0
    };
    let range_chunks = total_size.div_ceil(DOWNLOAD_CHUNK_SIZE) as usize;
    if total_size > MULTITHREAD_THRESHOLD && stored_num_chunks == range_chunks {
        return read_progress_file(file_path, total_size, DOWNLOAD_CHUNK_SIZE, range_chunks);
    }
    if stored_num_chunks == 1 {
        return read_progress_file(file_path, total_size, total_size.max(1), 1);
    }
    None
}

/// 删除进度文件
fn delete_progress_file(file_path: &Path) {
    let _guard = DOWNLOAD_PROGRESS_LOCK.lock().unwrap();
    let progress_path = get_progress_file_path(file_path);
    let _ = fs::remove_file(progress_path);
}

/// 判断指定下载是否已被暂停。
fn is_download_paused(filename: &str) -> bool {
    match get_download_state_key(filename) {
        Ok(key) => PAUSED_DOWNLOADS.lock().unwrap().contains(&key),
        Err(_) => false,
    }
}

/// 清除指定下载的暂停标记。
fn clear_download_paused(filename: &str) {
    if let Ok(key) = get_download_state_key(filename) {
        PAUSED_DOWNLOADS.lock().unwrap().remove(&key);
    }
}

/// 查询下载进度文件中的当前进度。
#[tauri::command]
pub async fn get_download_progress(filename: String) -> Result<DownloadProgressSnapshot, String> {
    let current_dir =
        std::env::current_dir().map_err(|e| format!("Failed to get current directory: {}", e))?;
    let file_path = current_dir.join(&filename);
    let download_key = get_download_state_key(&filename)?;
    let active = ACTIVE_DOWNLOADS.lock().unwrap().contains(&download_key);
    let paused = PAUSED_DOWNLOADS.lock().unwrap().contains(&download_key);
    let progress_path = get_progress_file_path(&file_path);
    if let Some(progress) = read_progress_snapshot(&file_path) {
        let downloaded = progress.chunks.iter().map(|chunk| chunk.downloaded).sum();
        let progress_percent = if progress.total_size > 0 {
            (downloaded * 100) / progress.total_size
        } else {
            0
        };
        return Ok(DownloadProgressSnapshot {
            filename,
            downloaded,
            total: progress.total_size,
            progress: progress_percent,
            has_progress_file: true,
            active,
            paused,
        });
    }

    if progress_path.exists() {
        let total = fs::metadata(&file_path)
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        return Ok(DownloadProgressSnapshot {
            filename,
            downloaded: 0,
            total,
            progress: 0,
            has_progress_file: true,
            active,
            paused,
        });
    }

    let total = get_file_size(filename.clone()).await.unwrap_or(0);
    Ok(DownloadProgressSnapshot {
        filename,
        downloaded: total,
        total,
        progress: if total > 0 { 100 } else { 0 },
        has_progress_file: false,
        active,
        paused,
    })
}

/// 暂停指定下载，保留进度文件用于后续续传。
#[tauri::command]
pub async fn pause_download(filename: String) -> Result<String, String> {
    PAUSED_DOWNLOADS
        .lock()
        .unwrap()
        .insert(get_download_state_key(&filename)?);
    Ok(format!("已暂停下载: {}", filename))
}

/// 多线程下载单个分块，支持断点续传和自动重试
async fn download_chunk(
    url: &str,
    start: u64,
    end: u64,
    file_path: &Path,
    chunk_index: usize,
    resume_offset: u64, // 断点续传的偏移量
    filename: &str,
    event_progress: Arc<std::sync::atomic::AtomicU64>,
    progress_emitter: Arc<DownloadProgressEmitter>,
    extra_headers: &[(String, String)],
) -> Result<u64, String> {
    const MAX_RETRIES: u32 = 3; // 最大重试次数
    const RETRY_DELAY_MS: u64 = 1000; // 重试延迟（毫秒）

    let client = HTTP_CLIENT.clone();

    // 计算实际下载的起始位置（支持断点续传）
    let actual_start = start + resume_offset;

    // 如果已经下载完成，直接返回
    if actual_start > end {
        return Ok(resume_offset);
    }

    // 构建Range 请求头
    let range_header = format!("bytes={}-{}", actual_start, end);

    // 重试循环
    for retry in 0..MAX_RETRIES {
        if is_download_paused(filename) {
            return Err("download_paused".to_string());
        }

        // 发送 Range 请求
        let response = with_extra_headers(
            client
                .get(url)
                .header(reqwest::header::USER_AGENT, GAME_LAUNCHER_USER_AGENT)
                .header(reqwest::header::ACCEPT_ENCODING, "deflate, gzip")
                .header("Range", range_header.clone()),
            extra_headers,
        )
        .send()
        .await;

        match response {
            Ok(resp) => {
                // 检查响应状态
                if resp.status() == reqwest::StatusCode::PARTIAL_CONTENT {
                    // 获取响应体流
                    let mut stream = resp.bytes_stream();
                    let mut downloaded = 0u64;

                    // 打开文件并定位到指定位置
                    let mut file = File::options()
                        .write(true)
                        .open(file_path)
                        .map_err(|e| format!("分块 {} 打开文件失败: {}", chunk_index, e))?;

                    file.seek(SeekFrom::Start(actual_start))
                        .map_err(|e| format!("分块 {} 定位文件位置失败: {}", chunk_index, e))?;

                    // 读取并写入文件
                    while let Some(chunk) = stream.next().await {
                        if is_download_paused(filename) {
                            return Err("download_paused".to_string());
                        }
                        let chunk = chunk
                            .map_err(|e| format!("分块 {} 读取数据失败: {}", chunk_index, e))?;

                        file.write_all(&chunk)
                            .map_err(|e| format!("分块 {} 写入文件失败: {}", chunk_index, e))?;

                        downloaded += chunk.len() as u64;
                        let current_chunk_downloaded = resume_offset + downloaded;

                        let old_progress = event_progress
                            .fetch_add(chunk.len() as u64, std::sync::atomic::Ordering::Relaxed);
                        let new_progress = old_progress + chunk.len() as u64;
                        progress_emitter
                            .emit(new_progress, current_chunk_downloaded >= end - start + 1)?;
                    }

                    // 返回总共下载的字节数（包括之前已下载的部分）
                    return Ok(resume_offset + downloaded);
                } else {
                    // 响应状态错误，重试
                    if retry < MAX_RETRIES - 1 {
                        eprintln!(
                            "分块 {} 下载失败 (HTTP {})，{} 秒后重试 ({}/{})",
                            chunk_index,
                            resp.status(),
                            RETRY_DELAY_MS / 1000,
                            retry + 1,
                            MAX_RETRIES
                        );
                        tokio::time::sleep(tokio::time::Duration::from_millis(RETRY_DELAY_MS))
                            .await;
                        continue;
                    } else {
                        return Err(format!(
                            "分块 {} 下载失败: HTTP {} (已重试 {} 次)",
                            chunk_index,
                            resp.status(),
                            MAX_RETRIES
                        ));
                    }
                }
            }
            Err(e) => {
                // 请求错误，重试
                if retry < MAX_RETRIES - 1 {
                    eprintln!(
                        "分块 {} 请求错误: {}，{} 秒后重试 ({}/{})",
                        chunk_index,
                        e,
                        RETRY_DELAY_MS / 1000,
                        retry + 1,
                        MAX_RETRIES
                    );
                    tokio::time::sleep(tokio::time::Duration::from_millis(RETRY_DELAY_MS)).await;
                    continue;
                } else {
                    return Err(format!(
                        "分块 {} 请求失败: {} (已重试 {} 次)",
                        chunk_index, e, MAX_RETRIES
                    ));
                }
            }
        }
    }

    // 理论上不会到达这里
    Err("未知错误".to_string())
}

/// 使用 Range 多线程下载大文件，支持断点续传
async fn download_file_multithreaded(
    app_handle: tauri::AppHandle,
    url: &str,
    file_path: &Path,
    total_size: u64,
    filename: &str,
    concurrent_threads: usize,
    extra_headers: &[(String, String)],
) -> Result<String, String> {
    // 计算分块数量
    let num_chunks = total_size.div_ceil(DOWNLOAD_CHUNK_SIZE) as usize;

    // 检查是否存在进度文件（断点续传）
    let progress_info = read_progress_file(file_path, total_size, DOWNLOAD_CHUNK_SIZE, num_chunks);
    let progress_info = if let Some(info) = progress_info {
        info
    } else {
        // 创建新的进度文件
        create_progress_file(file_path, total_size, DOWNLOAD_CHUNK_SIZE, num_chunks)
            .map_err(|e| format!("创建进度文件失败: {}", e))?
    };

    // 创建目标文件并一次性预分配完整空间，断点文件也同步校正长度。
    let file = File::options()
        .create(true)
        .write(true)
        .truncate(false)
        .open(file_path)
        .map_err(|e| format!("创建文件失败: {}", e))?;
    file.set_len(total_size)
        .map_err(|e| format!("预分配文件空间失败: {}", e))?;

    // 创建并发控制器
    let semaphore = Arc::new(tokio::sync::Semaphore::new(concurrent_threads.clamp(1, 32)));
    let file_path = file_path.to_path_buf();
    let url = url.to_string();
    let filename = filename.to_string();

    // 创建进度跟踪（用于发送进度事件）
    let event_progress = Arc::new(std::sync::atomic::AtomicU64::new(0));
    let progress_emitter = Arc::new(DownloadProgressEmitter::new(
        app_handle.clone(),
        &filename,
        total_size,
    ));

    // 计算已下载的总字节数
    let initial_downloaded: u64 = progress_info.chunks.iter().map(|c| c.downloaded).sum();
    let progress_store = Arc::new(DownloadProgressStore::new(
        &file_path,
        progress_info.clone(),
    ));

    // 更新事件进度
    event_progress.store(initial_downloaded, std::sync::atomic::Ordering::Relaxed);

    // 创建任务列表
    let mut tasks = Vec::with_capacity(num_chunks);
    // 分块任务在 tokio 里要求 'static，请求头需要在每个任务内各自持有
    let headers = extra_headers.to_vec();

    for i in 0..num_chunks {
        let chunk_info = &progress_info.chunks[i];

        // 如果分块已完成，跳过
        if chunk_info.completed {
            continue;
        }

        let start = chunk_info.start;
        let end = chunk_info.end;
        let resume_offset = chunk_info.downloaded;

        let url_clone = url.clone();
        let file_path_clone = file_path.clone();
        let filename_clone = filename.clone();
        let event_progress_clone = event_progress.clone();
        let progress_emitter_clone = progress_emitter.clone();
        let progress_store_clone = progress_store.clone();
        let semaphore_clone = semaphore.clone();
        let headers_clone = headers.clone();

        let task = tokio::spawn(async move {
            // 获取信号量许可
            let _permit = semaphore_clone
                .acquire()
                .await
                .map_err(|e| format!("获取并发许可失败: {}", e))?;

            // 下载分块（传入断点续传偏移量）
            let downloaded = download_chunk(
                &url_clone,
                start,
                end,
                &file_path_clone,
                i,
                resume_offset,
                &filename_clone,
                event_progress_clone,
                progress_emitter_clone,
                &headers_clone,
            )
            .await?;

            let expected_size = end - start + 1;
            if downloaded != expected_size {
                return Err(format!(
                    "分块 {} 下载不完整: 预期 {} 字节，实际 {} 字节",
                    i, expected_size, downloaded
                ));
            }

            // 记录分块完成状态，最终由父任务统一强制落盘。
            progress_store_clone
                .record(i, downloaded, true)
                .map_err(|e| format!("更新进度文件失败: {}", e))?;

            Ok::<u64, String>(downloaded)
        });

        tasks.push(task);
    }

    // 等待所有任务完成。暂停时不能提前返回，否则仍在运行的分块会和续传任务同时写同一个文件。
    let mut first_error: Option<String> = None;
    for task in tasks {
        match task.await {
            Ok(Ok(_downloaded)) => {}
            Ok(Err(e)) => {
                if first_error.is_none() {
                    first_error = Some(format!("下载分块失败: {}", e));
                }
            }
            Err(e) => {
                if first_error.is_none() {
                    first_error = Some(format!("任务执行失败: {}", e));
                }
            }
        }
    }
    progress_store.persist()?;

    if let Some(error) = first_error {
        return Err(error);
    }

    // 下载完成，删除进度文件
    delete_progress_file(&file_path);

    Ok(format!("成功下载文件到 {}", file_path.to_string_lossy()))
}

/// 把调用方附加的请求头套到请求构建器上（如 MOD 下载需要的鉴权 token）。
/// reqwest 跟随重定向时会保留这些自定义头，因此接口 302 到 CDN 后依然可用。
fn with_extra_headers(
    builder: reqwest::RequestBuilder,
    headers: &[(String, String)],
) -> reqwest::RequestBuilder {
    headers.iter().fold(builder, |builder, (name, value)| {
        builder.header(name.as_str(), value.as_str())
    })
}

#[tauri::command]
pub async fn download_file(
    app_handle: tauri::AppHandle,
    url: String,
    filename: String,
    concurrent_threads: usize,
    headers: Option<Vec<(String, String)>>,
    single_stream: Option<bool>,
) -> Result<String, String> {
    let download_key = get_download_state_key(&filename)?;
    let _active_download_guard = ActiveDownloadGuard::try_new(&download_key)?;
    clear_download_paused(&filename);
    let client = HTTP_CLIENT.clone();
    let extra_headers = headers.unwrap_or_default();

    // 发送 HEAD 请求获取文件信息和 Range 支持
    let head_response = with_extra_headers(
        client
            .head(&url)
            .header(reqwest::header::USER_AGENT, GAME_LAUNCHER_USER_AGENT)
            .header(reqwest::header::ACCEPT_ENCODING, "deflate, gzip"),
        &extra_headers,
    )
    .send()
    .await;

    let (total_size, accept_ranges) = match head_response {
        Ok(response) => {
            if response.status().is_success() {
                // 直接从响应头读取 Content-Length
                let length = response
                    .headers()
                    .get("content-length")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|s| s.parse::<u64>().ok())
                    .unwrap_or(0);

                let ranges = response
                    .headers()
                    .get("Accept-Ranges")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("")
                    .to_string();
                (length, ranges)
            } else {
                // HEAD 请求失败，使用 GET 请求
                let get_response = with_extra_headers(
                    client
                        .get(&url)
                        .header(reqwest::header::USER_AGENT, GAME_LAUNCHER_USER_AGENT)
                        .header(reqwest::header::ACCEPT_ENCODING, "deflate, gzip"),
                    &extra_headers,
                )
                .send()
                .await
                .map_err(|e| format!("Failed to send GET request: {}", e))?;

                if !get_response.status().is_success() {
                    return Err(format!(
                        "Failed to get file info: HTTP {}",
                        get_response.status()
                    ));
                }

                // 直接从响应头读取 Content-Length
                let length = get_response
                    .headers()
                    .get("content-length")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|s| s.parse::<u64>().ok())
                    .unwrap_or(0);

                let ranges = get_response
                    .headers()
                    .get("Accept-Ranges")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("")
                    .to_string();
                (length, ranges)
            }
        }
        Err(_) => {
            // HEAD 请求失败，使用 GET 请求
            let get_response = client
                .get(&url)
                .header(reqwest::header::USER_AGENT, GAME_LAUNCHER_USER_AGENT)
                .header(reqwest::header::ACCEPT_ENCODING, "deflate, gzip")
                .send()
                .await
                .map_err(|e| format!("Failed to send GET request: {}", e))?;

            if !get_response.status().is_success() {
                return Err(format!(
                    "Failed to get file info: HTTP {}",
                    get_response.status()
                ));
            }

            // 直接从响应头读取 Content-Length
            let length = get_response
                .headers()
                .get("content-length")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(0);

            let ranges = get_response
                .headers()
                .get("Accept-Ranges")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .to_string();
            (length, ranges)
        }
    };

    // 获取当前工作目录
    let current_dir =
        std::env::current_dir().map_err(|e| format!("Failed to get current directory: {}", e))?;

    // 创建文件路径
    let file_path = current_dir.join(&filename);

    // 确保父目录存在
    if let Some(parent_dir) = file_path.parent() {
        if !parent_dir.exists() {
            fs::create_dir_all(parent_dir)
                .map_err(|e| format!("Failed to create parent directories: {}", e))?;
        }
    }

    // single_stream 用于必须「一次 GET 拿完」的场景（如 MOD 包走服务端 302 转 CDN 的接口）：
    // 分块下载会对同一个地址重复发 Range 请求，既重复触发服务端计数，也依赖重定向后的 Range 支持。
    let allow_multithreaded = !single_stream.unwrap_or(false);
    if allow_multithreaded && total_size > MULTITHREAD_THRESHOLD && accept_ranges == "bytes" {
        println!(
            "文件大小: {} bytes ({} MB)，启用多线程下载",
            total_size,
            total_size / (1024 * 1024)
        );
        // 使用多线程下载
        return download_file_multithreaded(
            app_handle.clone(),
            &url,
            &file_path,
            total_size,
            &filename,
            concurrent_threads,
            &extra_headers,
        )
        .await;
    }

    // 单线程下载
    let response = with_extra_headers(
        client
            .get(&url)
            .header(reqwest::header::USER_AGENT, GAME_LAUNCHER_USER_AGENT)
            .header(reqwest::header::ACCEPT_ENCODING, "deflate, gzip"),
        &extra_headers,
    )
    .send()
    .await
    .map_err(|e| format!("Failed to send request: {}", e))?;

    // 检查响应状态
    if !response.status().is_success() {
        return Err(format!(
            "Failed to download file: HTTP {}",
            response.status()
        ));
    }

    // 创建文件
    let mut file = File::create(&file_path).map_err(|e| format!("Failed to create file: {}", e))?;
    file.set_len(total_size)
        .map_err(|e| format!("预分配文件空间失败: {}", e))?;
    let _ = create_progress_file(&file_path, total_size, total_size.max(1), 1)?;

    // 获取响应体流
    let mut stream = response.bytes_stream();
    let progress_emitter = DownloadProgressEmitter::new(app_handle.clone(), &filename, total_size);

    // 已下载字节数
    let mut downloaded = 0u64;

    // 读取并写入文件，同时发送进度更新
    while let Some(chunk) = stream.next().await {
        if is_download_paused(&filename) {
            return Err("download_paused".to_string());
        }
        let chunk = chunk.map_err(|e| format!("Failed to read chunk: {}", e))?;

        // 写入文件
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write file: {}", e))?;

        // 更新已下载字节数
        downloaded += chunk.len() as u64;
        progress_emitter.emit(downloaded, downloaded >= total_size)?;
    }
    delete_progress_file(&file_path);

    Ok(format!(
        "Successfully downloaded file to {}",
        file_path.to_string_lossy()
    ))
}
