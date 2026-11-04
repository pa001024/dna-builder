//! 应用自更新：exe 差量包检查、断点下载、SHA-256 校验、解压暂存与安装替换。
//!
//! 与 `tauri-plugin-updater` 的整包 MSI 更新不同，这里只下载 exe 的 zip 包
//! （安装目录里的 DLL 等文件不参与更新），并复用 magpie 的 Windows 替换策略：
//! 先等旧进程退出，再 rename 旧 exe 为 `.old`、把暂存 exe 换入，最后重新拉起。

use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

use semver::Version;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// 应用标识，与 tauri.conf.json 的 identifier 保持一致（暂存目录按它隔离）
const APP_IDENTIFIER: &str = "com.pa.dna-builder";
/// 覆盖更新源的测试用环境变量，多个地址用逗号分隔
const FEED_ENV: &str = "DNA_BUILDER_UPDATE_FEED";
/// 默认更新源：CDN 的 latest.json（保留旧版 MSI 字段）与 GitHub 上的 exe 专用 feed
const DEFAULT_FEEDS: &[&str] = &[
    "https://cdn.dna-builder.cn/latest.json",
    "https://cdn.dobapp.cc/latest.json",
    "https://github.com/pa001024/dna-builder/releases/latest/download/update.json",
];
/// 只接受 exe 差量包的 platform key，避免误取整包 MSI
const EXE_PLATFORM_KEYS: &[&str] = &["windows-x86_64-exe"];
const USER_AGENT: &str = concat!("DNABuilder-Updater/", env!("CARGO_PKG_VERSION"));
const MAX_DOWNLOAD_ATTEMPTS: u32 = 5;
const MAX_EXE_SIZE: u64 = 512 * 1024 * 1024;

/// 一次可用更新的描述（同时作为前端命令的返回结构）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub notes: String,
    pub pub_date: Option<String>,
    pub url: String,
    pub size: u64,
    pub sha256: String,
    pub current_version: String,
    /// 本次发版改动了 DLL / resources，只能通过完整安装包升级
    pub requires_full_install: bool,
    /// 完整安装包地址（requires_full_install 为 true 时有值）
    pub installer_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawFeed {
    version: String,
    #[serde(default)]
    notes: Option<String>,
    #[serde(default, alias = "pubDate")]
    pub_date: Option<String>,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    size: Option<u64>,
    #[serde(default)]
    sha256: Option<String>,
    #[serde(default)]
    platforms: Option<HashMap<String, RawAsset>>,
    /// 显式要求完整安装包（DLL / resources 有变化时由发布端设置）
    #[serde(default, alias = "requiresFullInstall")]
    requires_full_install: bool,
    /// 完整安装包地址；缺省时回退到 platforms 的 windows-x86_64 条目
    #[serde(default, alias = "installerUrl")]
    installer_url: Option<String>,
    /// 差量包可安全套用的最低已安装版本；客户端低于它时必须走完整安装包
    #[serde(default, alias = "deltaBase")]
    delta_base: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawAsset {
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    size: Option<u64>,
    #[serde(default)]
    sha256: Option<String>,
}

/// feed 中选中要下载的 exe 包
struct ExeAsset {
    url: String,
    size: u64,
    sha256: String,
}

/// 当前可执行文件版本（Cargo.toml 与 tauri.conf.json 同步维护）
pub fn current_version() -> Version {
    Version::parse(env!("CARGO_PKG_VERSION")).expect("Cargo.toml 版本号必须是合法 semver")
}

/// 暂存根目录：`%LOCALAPPDATA%\com.pa.dna-builder\updates`，helper 与主进程共用。
pub fn staging_root() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    base.join(APP_IDENTIFIER).join("updates")
}

/// 某个版本暂存 exe 的固定路径。
pub fn staged_exe(version: &str) -> PathBuf {
    staging_root().join(version).join("dna-builder.exe")
}

/// 读取更新源列表（环境变量优先，便于本地联调）。
fn feed_urls() -> Vec<String> {
    if let Ok(raw) = std::env::var(FEED_ENV) {
        let urls: Vec<String> = raw
            .split([',', ';'])
            .map(str::trim)
            .filter(|url| !url.is_empty())
            .map(ToOwned::to_owned)
            .collect();
        if !urls.is_empty() {
            return urls;
        }
    }
    DEFAULT_FEEDS.iter().map(|url| (*url).to_string()).collect()
}

/// 检查更新：按顺序尝试各更新源，返回第一个可用的新版本。
///
/// 已经响应但版本不比当前新的源会继续往后找，避免某一端 CDN 未及时同步时
/// 把用户卡在旧版本；只有所有源都失败才报错。
pub async fn check_for_update(current: &Version) -> Result<Option<UpdateInfo>, String> {
    let client = crate::commands::net::build_http_client()
        .map_err(|error| format!("创建 HTTP 客户端失败: {error}"))?;
    let mut errors = Vec::new();
    let mut reachable = false;
    for feed_url in feed_urls() {
        match fetch_feed(&client, &feed_url, current).await {
            Ok(Some(info)) => return Ok(Some(info)),
            Ok(None) => reachable = true,
            Err(error) => errors.push(format!("{feed_url}: {error}")),
        }
    }
    if reachable {
        return Ok(None);
    }
    Err(if errors.is_empty() {
        "没有可用的更新源".to_string()
    } else {
        errors.join("\n")
    })
}

/// 拉取并解析单个 feed；返回 None 表示已是最新版本。
async fn fetch_feed(
    client: &reqwest::Client,
    feed_url: &str,
    current: &Version,
) -> Result<Option<UpdateInfo>, String> {
    let response = client
        .get(feed_url)
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|error| format!("请求失败: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    let feed: RawFeed = response
        .json()
        .await
        .map_err(|error| format!("解析 feed 失败: {error}"))?;

    let latest = Version::parse(feed.version.trim_start_matches('v'))
        .map_err(|error| format!("feed 版本号非法: {error}"))?;
    if latest <= *current {
        return Ok(None);
    }

    let asset =
        select_update_asset(&feed, current).ok_or_else(|| "feed 中没有可用的更新包".to_string())?;
    Ok(Some(match asset {
        UpdateAsset::Exe(asset) => UpdateInfo {
            version: latest.to_string(),
            notes: feed.notes.unwrap_or_default(),
            pub_date: feed.pub_date,
            url: asset.url,
            size: asset.size,
            sha256: asset.sha256.to_ascii_lowercase(),
            current_version: current.to_string(),
            requires_full_install: false,
            installer_url: None,
        },
        UpdateAsset::FullInstaller(installer_url) => UpdateInfo {
            version: latest.to_string(),
            notes: feed.notes.unwrap_or_default(),
            pub_date: feed.pub_date,
            url: installer_url.clone(),
            size: 0,
            sha256: String::new(),
            current_version: current.to_string(),
            requires_full_install: true,
            installer_url: Some(installer_url),
        },
    }))
}

enum UpdateAsset {
    Exe(ExeAsset),
    FullInstaller(String),
}

/// 选择本次更新方式：显式要求完整安装、客户端低于差量基线或缺少 exe 包时回退到 MSI。
fn select_update_asset(feed: &RawFeed, current: &Version) -> Option<UpdateAsset> {
    if !feed.requires_full_install && !is_below_delta_base(feed, current) {
        if let Some(asset) = select_exe_asset(feed) {
            return Some(UpdateAsset::Exe(asset));
        }
    }
    full_installer_url(feed).map(UpdateAsset::FullInstaller)
}

/// 客户端是否低于差量基线：跳过了改动 DLL / resources 的整包版本后，exe 差量不再安全。
fn is_below_delta_base(feed: &RawFeed, current: &Version) -> bool {
    feed.delta_base
        .as_deref()
        .and_then(|raw| Version::parse(raw.trim_start_matches('v')).ok())
        .is_some_and(|base| current < &base)
}

/// 完整安装包地址：优先顶层 `installer_url`，其次 `platforms` 的 `windows-x86_64`（旧客户端用的 MSI 条目）。
fn full_installer_url(feed: &RawFeed) -> Option<String> {
    if let Some(url) = &feed.installer_url {
        return Some(url.clone());
    }
    let platforms = feed.platforms.as_ref()?;
    platforms
        .get("windows-x86_64")
        .and_then(|asset| asset.url.clone())
}

/// 从 feed 中取出 exe 包地址，兼容 magpie 风格（顶层字段）与 tauri 风格（platforms）。
fn select_exe_asset(feed: &RawFeed) -> Option<ExeAsset> {
    if let (Some(url), Some(sha256)) = (&feed.url, &feed.sha256) {
        if !sha256.is_empty() {
            return Some(ExeAsset {
                url: url.clone(),
                size: feed.size.unwrap_or(0),
                sha256: sha256.clone(),
            });
        }
    }

    let platforms = feed.platforms.as_ref()?;
    for key in EXE_PLATFORM_KEYS {
        if let Some(asset) = platforms.get(*key) {
            if let (Some(url), Some(sha256)) = (&asset.url, &asset.sha256) {
                if !sha256.is_empty() {
                    return Some(ExeAsset {
                        url: url.clone(),
                        size: asset.size.unwrap_or(0),
                        sha256: sha256.clone(),
                    });
                }
            }
        }
    }
    None
}

/// 下载并解压 exe 到暂存目录；已存在且校验通过的暂存文件会直接复用。
pub async fn download_update<F>(info: &UpdateInfo, mut on_progress: F) -> Result<PathBuf, String>
where
    F: FnMut(u64, Option<u64>) + Send,
{
    let dir = staging_root().join(&info.version);
    let staged = dir.join("dna-builder.exe");
    let marker = dir.join("ready");
    fs::create_dir_all(&dir).map_err(|error| format!("创建暂存目录失败: {error}"))?;

    if staged.is_file() && read_marker(&marker).is_some_and(|value| value == info.sha256) {
        let size = staged.metadata().map(|meta| meta.len()).unwrap_or(0);
        on_progress(size, Some(size));
        return Ok(staged);
    }

    let client = crate::commands::net::build_http_client()
        .map_err(|error| format!("创建 HTTP 客户端失败: {error}"))?;
    let archive = dir.join("package.zip");
    // 上次下载已完成但解压失败时，直接复用已校验的包，避免续传请求落到文件末尾触发 416
    let archive_matches = archive.is_file()
        && sha256_file(&archive)
            .ok()
            .is_some_and(|hash| hash == info.sha256);
    if !archive_matches {
        if archive.exists()
            && archive
                .metadata()
                .is_ok_and(|meta| info.size > 0 && meta.len() >= info.size)
        {
            let _ = fs::remove_file(&archive);
        }
        download_to(&client, &info.url, &archive, info.size, &mut on_progress).await?;
        let actual = sha256_file(&archive)?;
        if actual != info.sha256 {
            let _ = fs::remove_file(&archive);
            return Err(format!(
                "更新包校验失败: 期望 {}, 实际 {}",
                info.sha256, actual
            ));
        }
    } else {
        on_progress(info.size, Some(info.size));
    }

    extract_exe(&archive, &staged)?;
    verify_pe(&staged)?;
    fs::write(&marker, &info.sha256).map_err(|error| format!("写入校验标记失败: {error}"))?;
    let _ = fs::remove_file(&archive);
    Ok(staged)
}

fn read_marker(path: &Path) -> Option<String> {
    fs::read_to_string(path)
        .ok()
        .map(|value| value.trim().to_string())
}

/// 带断点续传与重试的下载。
async fn download_to<F>(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    expected_size: u64,
    on_progress: &mut F,
) -> Result<(), String>
where
    F: FnMut(u64, Option<u64>),
{
    let mut last_error = String::new();
    for attempt in 0..MAX_DOWNLOAD_ATTEMPTS {
        match download_once(client, url, dest, expected_size, on_progress).await {
            Ok(()) => return Ok(()),
            Err(error) => {
                last_error = error;
                if attempt + 1 < MAX_DOWNLOAD_ATTEMPTS {
                    let backoff = 1000u64 << attempt.min(4);
                    tokio::time::sleep(Duration::from_millis(backoff)).await;
                }
            }
        }
    }
    Err(format!(
        "下载失败（已重试 {MAX_DOWNLOAD_ATTEMPTS} 次）: {last_error}"
    ))
}

async fn download_once<F>(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    expected_size: u64,
    on_progress: &mut F,
) -> Result<(), String>
where
    F: FnMut(u64, Option<u64>),
{
    let mut existing = dest.metadata().map(|meta| meta.len()).unwrap_or(0);
    if expected_size > 0 && existing > expected_size {
        let _ = fs::remove_file(dest);
        existing = 0;
    }

    let mut request = client
        .get(url)
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .timeout(Duration::from_secs(600));
    if existing > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={existing}-"));
    }

    let response = request.send().await.map_err(|error| error.to_string())?;
    let status = response.status();
    if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
        let _ = fs::remove_file(dest);
        return Err("服务器拒绝续传，已丢弃残留文件".to_string());
    }
    if status != reqwest::StatusCode::PARTIAL_CONTENT && !status.is_success() {
        return Err(format!("HTTP {status}"));
    }

    let resume = status == reqwest::StatusCode::PARTIAL_CONTENT;
    let content_length = response.content_length().unwrap_or(0);
    let total = if resume {
        Some(existing + content_length)
    } else {
        existing = 0;
        if content_length > 0 {
            Some(content_length)
        } else if expected_size > 0 {
            Some(expected_size)
        } else {
            None
        }
    };

    let mut file = if resume {
        OpenOptions::new()
            .append(true)
            .open(dest)
            .map_err(|error| format!("打开残留文件失败: {error}"))?
    } else {
        File::create(dest).map_err(|error| format!("创建下载文件失败: {error}"))?
    };

    let mut downloaded = existing;
    let mut stream = response.bytes_stream();
    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| error.to_string())?;
        file.write_all(&chunk)
            .map_err(|error| format!("写入下载文件失败: {error}"))?;
        downloaded += chunk.len() as u64;
        on_progress(downloaded, total);
    }
    file.flush()
        .map_err(|error| format!("刷新下载文件失败: {error}"))?;

    if expected_size > 0 && downloaded != expected_size {
        return Err(format!(
            "下载大小不符: 期望 {expected_size}, 实际 {downloaded}"
        ));
    }
    Ok(())
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|error| format!("打开文件失败: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1024 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("读取文件失败: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// 解压 zip 中的 exe；若更新包本身是裸 exe 也兼容。
fn extract_exe(archive: &Path, staged: &Path) -> Result<(), String> {
    let mut probe = File::open(archive).map_err(|error| format!("打开更新包失败: {error}"))?;
    let mut magic = [0u8; 4];
    probe
        .read_exact(&mut magic)
        .map_err(|error| format!("读取更新包失败: {error}"))?;
    probe
        .seek(SeekFrom::Start(0))
        .map_err(|error| format!("读取更新包失败: {error}"))?;

    let temp = staged.with_extension("exe.tmp");
    let _ = fs::remove_file(&temp);

    if &magic == b"PK\x03\x04" {
        extract_from_zip(probe, &temp)?;
    } else {
        let mut out = File::create(&temp).map_err(|error| format!("创建暂存文件失败: {error}"))?;
        std::io::copy(&mut probe, &mut out)
            .map_err(|error| format!("写入暂存文件失败: {error}"))?;
    }

    let _ = fs::remove_file(staged);
    fs::rename(&temp, staged).map_err(|error| format!("保存暂存文件失败: {error}"))?;
    Ok(())
}

fn extract_from_zip(file: File, out_path: &Path) -> Result<(), String> {
    let mut archive =
        zip::ZipArchive::new(file).map_err(|error| format!("解析 zip 失败: {error}"))?;
    let mut target_index = None;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| format!("读取 zip 条目失败: {error}"))?;
        if !entry.is_file() {
            continue;
        }
        let name = entry.name().to_ascii_lowercase();
        let is_exe = name.ends_with(".exe");
        let is_preferred = name.rsplit(['/', '\\']).next() == Some("dna-builder.exe");
        if is_preferred {
            target_index = Some(index);
            break;
        }
        if is_exe && target_index.is_none() {
            target_index = Some(index);
        }
    }

    let index = target_index.ok_or_else(|| "更新包中没有 exe".to_string())?;
    let mut entry = archive
        .by_index(index)
        .map_err(|error| format!("读取 zip 条目失败: {error}"))?;
    if entry.size() > MAX_EXE_SIZE {
        return Err("更新包内的 exe 体积异常".to_string());
    }
    let mut out = File::create(out_path).map_err(|error| format!("创建暂存文件失败: {error}"))?;
    std::io::copy(&mut entry, &mut out).map_err(|error| format!("解压 exe 失败: {error}"))?;
    Ok(())
}

fn verify_pe(path: &Path) -> Result<(), String> {
    let mut file = File::open(path).map_err(|error| format!("打开暂存文件失败: {error}"))?;
    let mut magic = [0u8; 2];
    file.read_exact(&mut magic)
        .map_err(|error| format!("读取暂存文件失败: {error}"))?;
    if &magic != b"MZ" {
        return Err("暂存文件不是合法的 exe".to_string());
    }
    Ok(())
}

/// 目标目录是否可写（Program Files 安装需要提权）。
pub fn is_dir_writable(dir: &Path) -> bool {
    let probe = dir.join(format!(".dna-update-probe-{}", std::process::id()));
    match OpenOptions::new().write(true).create_new(true).open(&probe) {
        Ok(_) => {
            let _ = fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

fn old_exe_path(target: &Path) -> Result<PathBuf, String> {
    let name = target
        .file_name()
        .ok_or_else(|| "目标 exe 路径缺少文件名".to_string())?;
    Ok(target.with_file_name(format!("{}.old", name.to_string_lossy())))
}

/// 启动一个脱离当前进程的安装 helper；目标目录不可写时用 UAC 提权启动。
pub fn spawn_apply_helper(
    staged: &Path,
    target: &Path,
    parent_pid: u32,
    relaunch: bool,
    elevated: bool,
) -> Result<(), String> {
    let helper = std::env::current_exe().map_err(|error| format!("定位当前程序失败: {error}"))?;
    let mut args = vec![
        "--update-apply".to_string(),
        "--parent-pid".to_string(),
        parent_pid.to_string(),
        "--staged".to_string(),
        staged.to_string_lossy().into_owned(),
        "--target".to_string(),
        target.to_string_lossy().into_owned(),
    ];
    if relaunch {
        args.push("--relaunch".to_string());
    }
    if elevated {
        args.push("--elevated".to_string());
    }

    #[cfg(target_os = "windows")]
    if elevated {
        let params = args
            .iter()
            .map(|arg| quote_windows_arg(arg))
            .collect::<Vec<_>>()
            .join(" ");
        crate::util::shell_execute_runas(&helper.to_string_lossy(), Some(&params), None)
            .map_err(|error| format!("请求管理员权限失败（可能已取消）: {error}"))?;
        return Ok(());
    }

    let mut command = std::process::Command::new(&helper);
    command.args(&args);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("启动安装进程失败: {error}"))
}

#[cfg(target_os = "windows")]
fn quote_windows_arg(arg: &str) -> String {
    if arg.contains([' ', '\t', '"']) {
        format!("\"{}\"", arg.replace('"', "\\\""))
    } else {
        arg.to_string()
    }
}

/// 清理上次更新遗留的 `.old`（helper 退出后文件锁才会释放）。
pub fn cleanup_old_install(target: &Path) {
    if let Ok(old) = old_exe_path(target) {
        if old.exists() {
            let _ = fs::remove_file(old);
        }
    }
}

/// 安装 helper 主流程：等旧进程退出 → 替换 exe → 重新拉起。
fn run_apply_helper(args: &[String]) -> i32 {
    let Some(target) = arg_value(args, "--target") else {
        log_helper("缺少 --target");
        return 2;
    };
    let Some(staged) = arg_value(args, "--staged") else {
        log_helper("缺少 --staged");
        return 2;
    };
    let Some(parent_pid) =
        arg_value(args, "--parent-pid").and_then(|value| value.parse::<u32>().ok())
    else {
        log_helper("缺少或非法的 --parent-pid");
        return 2;
    };
    let target = PathBuf::from(target);
    let staged = PathBuf::from(staged);
    let relaunch = args.iter().any(|arg| arg == "--relaunch");
    let elevated = args.iter().any(|arg| arg == "--elevated");

    log_helper(&format!(
        "开始安装: parent={parent_pid}, staged={}, target={}, relaunch={relaunch}, elevated={elevated}",
        staged.display(),
        target.display()
    ));

    if !wait_for_process_exit(parent_pid, Duration::from_secs(60)) {
        report_failure("旧进程未能在 60 秒内退出，本次更新已取消", relaunch);
        return 5;
    }
    cleanup_old_install(&target);

    if let Err(error) = swap_exe(&staged, &target) {
        if !is_dir_writable(target.parent().unwrap_or(Path::new("."))) && !elevated {
            log_helper(&format!("权限不足，尝试提权: {error}"));
            if spawn_apply_helper(&staged, &target, parent_pid, relaunch, true).is_ok() {
                return 0;
            }
            report_failure("请求管理员权限失败或已取消，本次更新未完成", relaunch);
            return 3;
        }
        report_failure(&format!("替换 exe 失败: {error}"), relaunch);
        return 1;
    }

    log_helper("替换完成");
    if relaunch {
        if let Err(error) = relaunch_app(&target, elevated) {
            report_failure(&format!("新版本已替换，但重新启动失败: {error}"), relaunch);
            return 4;
        }
        log_helper("已重新拉起");
        // 安装成功后暂存目录只剩余校验标记，顺手清掉；失败时保留以便重试
        if let Some(dir) = staged.parent() {
            let _ = fs::remove_dir_all(dir);
        }
    }
    0
}

fn swap_exe(staged: &Path, target: &Path) -> Result<(), String> {
    if !staged.is_file() {
        return Err(format!("暂存文件不存在: {}", staged.display()));
    }
    let old = old_exe_path(target)?;

    // 上次安装中断在「已备份、未换入」时，先把原 exe 恢复回来再继续
    if !target.exists() && old.exists() {
        fs::rename(&old, target).map_err(|error| format!("恢复上次安装前的 exe 失败: {error}"))?;
    }

    // 第一步只做「备份旧 exe」：杀毒软件 / OneDrive 可能短暂占用文件，允许重试
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        if old.exists() {
            match fs::remove_file(&old) {
                Ok(()) => {}
                Err(error) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(250));
                    let _ = error;
                    continue;
                }
                Err(error) => return Err(format!("删除旧备份失败: {error}")),
            }
        }
        match fs::rename(target, &old) {
            Ok(()) => break,
            Err(error) if Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(250));
                let _ = error;
            }
            Err(error) => return Err(format!("备份当前 exe 失败: {error}")),
        }
    }

    // 第二步换入新 exe；失败必须恢复旧文件，且不再重试，避免误删唯一可用的备份
    match move_into_place(staged, target) {
        Ok(()) => Ok(()),
        Err(error) => match fs::rename(&old, target) {
            Ok(()) => Err(format!("换入新 exe 失败，已回滚: {error}")),
            Err(restore_error) => Err(format!(
                "换入新 exe 失败且回滚失败，原程序保留在 {}: {error}; {restore_error}",
                old.display()
            )),
        },
    }
}

/// 把暂存 exe 移到目标位置。
///
/// 暂存目录在 `%LOCALAPPDATA%`，便携版可能装在别的盘，`rename` 会返回
/// `ERROR_NOT_SAME_DEVICE`；此时先复制到目标目录的临时文件，再原子 rename 换入。
fn move_into_place(staged: &Path, target: &Path) -> Result<(), String> {
    match fs::rename(staged, target) {
        Ok(()) => return Ok(()),
        Err(error) if !is_cross_device(&error) => {
            return Err(format!("换入新 exe 失败: {error}"));
        }
        Err(_) => {}
    }

    let name = target
        .file_name()
        .ok_or_else(|| "目标 exe 路径缺少文件名".to_string())?;
    let temp = target.with_file_name(format!("{}.new", name.to_string_lossy()));
    let _ = fs::remove_file(&temp);
    fs::copy(staged, &temp).map_err(|error| format!("跨盘复制新 exe 失败: {error}"))?;
    match fs::rename(&temp, target) {
        Ok(()) => Ok(()),
        Err(error) => {
            let _ = fs::remove_file(&temp);
            Err(format!("跨盘换入新 exe 失败: {error}"))
        }
    }
}

fn is_cross_device(error: &std::io::Error) -> bool {
    #[cfg(target_os = "windows")]
    {
        error.raw_os_error() == Some(17) // ERROR_NOT_SAME_DEVICE
    }
    #[cfg(not(target_os = "windows"))]
    {
        error.raw_os_error() == Some(18) // EXDEV
    }
}

fn relaunch_app(target: &Path, elevated: bool) -> Result<(), String> {
    let dir = target.parent().map(Path::to_path_buf);
    #[cfg(target_os = "windows")]
    if elevated {
        // 提权进程直接 spawn 会让新实例继承管理员令牌，改由 explorer 以当前用户身份启动
        let mut command = std::process::Command::new("explorer.exe");
        command.arg(target);
        if let Ok(mut child) = command.spawn() {
            let _ = child.wait();
            std::thread::sleep(Duration::from_millis(800));
            return Ok(());
        }
    }

    let mut command = std::process::Command::new(target);
    if let Some(dir) = dir {
        command.current_dir(dir);
    }
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("启动新版本失败: {error}"))
}

/// 等待旧进程退出；超时返回 false（此时不能再替换，否则会和仍在运行的实例打架）。
#[cfg(target_os = "windows")]
fn wait_for_process_exit(pid: u32, timeout: Duration) -> bool {
    use windows::Win32::{
        Foundation::{CloseHandle, WAIT_TIMEOUT},
        System::Threading::{OpenProcess, PROCESS_ACCESS_RIGHTS, WaitForSingleObject},
    };

    const PROCESS_SYNCHRONIZE: PROCESS_ACCESS_RIGHTS = PROCESS_ACCESS_RIGHTS(0x0010_0000);
    unsafe {
        let Ok(handle) = OpenProcess(PROCESS_SYNCHRONIZE, false, pid) else {
            return true;
        };
        let result = WaitForSingleObject(handle, timeout.as_millis() as u32);
        let _ = CloseHandle(handle);
        result != WAIT_TIMEOUT
    }
}

#[cfg(not(target_os = "windows"))]
fn wait_for_process_exit(_pid: u32, _timeout: Duration) -> bool {
    true
}

/// 记录并（生产模式下）弹出错误框：helper 在旧进程退出后运行，没有控制台可看。
fn report_failure(message: &str, show_dialog: bool) {
    log_helper(message);
    #[cfg(target_os = "windows")]
    if show_dialog {
        use windows::Win32::UI::WindowsAndMessaging::{MB_ICONERROR, MB_OK, MessageBoxW};
        use windows::core::HSTRING;
        let _ = unsafe {
            MessageBoxW(
                None,
                &HSTRING::from(message),
                &HSTRING::from("DNA Builder 更新失败"),
                MB_OK | MB_ICONERROR,
            )
        };
    }
    #[cfg(not(target_os = "windows"))]
    let _ = show_dialog;
}

fn log_helper(message: &str) {
    let dir = staging_root();
    let _ = fs::create_dir_all(&dir);
    let path = dir.join("apply.log");
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "[{}] {message}", timestamp());
    }
    eprintln!("[dna-builder updater] {message}");
}

fn timestamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}.{:03}", now.as_secs(), now.subsec_millis())
}

fn arg_value(args: &[String], name: &str) -> Option<String> {
    args.iter()
        .position(|arg| arg == name)
        .and_then(|index| args.get(index + 1))
        .cloned()
}

/// 处理安装/命令行模式；返回 Some(exit_code) 表示不应继续启动 GUI。
pub fn handle_process_modes() -> Option<i32> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.iter().any(|arg| arg == "--update-apply") {
        return Some(run_apply_helper(&args));
    }
    if args.iter().any(|arg| arg == "--update-check") {
        return Some(run_check_cli());
    }
    if args.iter().any(|arg| arg == "--update-cli") {
        return Some(run_update_cli(&args));
    }
    None
}

fn block_on<F: std::future::Future>(future: F) -> F::Output {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("创建 tokio 运行时失败")
        .block_on(future)
}

fn run_check_cli() -> i32 {
    let current = current_version();
    match block_on(check_for_update(&current)) {
        Ok(Some(info)) => {
            println!(
                "{}",
                serde_json::json!({
                    "currentVersion": info.current_version,
                    "latestVersion": info.version,
                    "available": true,
                    "url": info.url,
                    "size": info.size,
                    "sha256": info.sha256,
                    "requiresFullInstall": info.requires_full_install,
                    "installerUrl": info.installer_url,
                })
            );
            0
        }
        Ok(None) => {
            println!(
                "{}",
                serde_json::json!({
                    "currentVersion": current.to_string(),
                    "latestVersion": current.to_string(),
                    "available": false,
                })
            );
            0
        }
        Err(error) => {
            eprintln!("检查更新失败: {error}");
            1
        }
    }
}

/// `--update-cli [--install] [--no-relaunch]`：本地端到端测试入口。
fn run_update_cli(args: &[String]) -> i32 {
    let current = current_version();
    let info = match block_on(check_for_update(&current)) {
        Ok(Some(info)) => info,
        Ok(None) => {
            println!(
                "{}",
                serde_json::json!({
                    "currentVersion": current.to_string(),
                    "available": false,
                })
            );
            return 0;
        }
        Err(error) => {
            eprintln!("检查更新失败: {error}");
            return 1;
        }
    };

    if info.requires_full_install {
        println!(
            "{}",
            serde_json::json!({
                "currentVersion": info.current_version,
                "latestVersion": info.version,
                "available": true,
                "requiresFullInstall": true,
                "installerUrl": info.installer_url,
            })
        );
        return 0;
    }

    let mut last_report = Instant::now();
    let staged = match block_on(download_update(&info, |downloaded, total| {
        if last_report.elapsed() >= Duration::from_millis(500) {
            last_report = Instant::now();
            eprintln!("下载中: {downloaded}/{total:?}");
        }
    })) {
        Ok(path) => path,
        Err(error) => {
            eprintln!("下载更新失败: {error}");
            return 1;
        }
    };

    let install = args.iter().any(|arg| arg == "--install");
    let relaunch = !args.iter().any(|arg| arg == "--no-relaunch");
    let mut installed = false;
    let mut elevated = false;
    if install {
        let target = match std::env::current_exe() {
            Ok(path) => path,
            Err(error) => {
                eprintln!("定位当前程序失败: {error}");
                return 1;
            }
        };
        elevated = !is_dir_writable(target.parent().unwrap_or(Path::new(".")));
        if let Err(error) =
            spawn_apply_helper(&staged, &target, std::process::id(), relaunch, elevated)
        {
            eprintln!("启动安装进程失败: {error}");
            return 1;
        }
        installed = true;
    }

    println!(
        "{}",
        serde_json::json!({
            "currentVersion": info.current_version,
            "latestVersion": info.version,
            "available": true,
            "staged": staged.to_string_lossy(),
            "installed": installed,
            "elevated": elevated,
            "relaunch": relaunch,
        })
    );
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_tauri_style_feed_exe_asset() {
        let raw: RawFeed = serde_json::from_str(
            r#"{
                "version": "1.5.3",
                "notes": "fix",
                "platforms": {
                    "windows-x86_64": { "url": "https://example.com/a.msi", "signature": "x" },
                    "windows-x86_64-exe": { "url": "https://example.com/a.zip", "size": 42, "sha256": "AB" }
                }
            }"#,
        )
        .unwrap();
        let asset = select_exe_asset(&raw).unwrap();
        assert_eq!(asset.url, "https://example.com/a.zip");
        assert_eq!(asset.size, 42);
        assert_eq!(asset.sha256, "AB");
    }

    #[test]
    fn parses_magpie_style_feed() {
        let raw: RawFeed = serde_json::from_str(
            r#"{ "version": "1.5.3", "url": "https://example.com/a.zip", "size": 7, "sha256": "cd" }"#,
        )
        .unwrap();
        assert_eq!(
            select_exe_asset(&raw).unwrap().url,
            "https://example.com/a.zip"
        );
    }

    #[test]
    fn rejects_feed_without_sha256() {
        let raw: RawFeed =
            serde_json::from_str(r#"{ "version": "1.5.3", "url": "https://example.com/a.zip" }"#)
                .unwrap();
        assert!(select_exe_asset(&raw).is_none());
    }

    #[test]
    fn full_install_flag_wins_over_exe_asset() {
        let raw: RawFeed = serde_json::from_str(
            r#"{
                "version": "1.5.3",
                "requires_full_install": true,
                "installer_url": "https://example.com/a.msi",
                "platforms": {
                    "windows-x86_64-exe": { "url": "https://example.com/a.zip", "sha256": "ab" }
                }
            }"#,
        )
        .unwrap();
        match select_update_asset(&raw, &Version::parse("1.5.2").unwrap()).unwrap() {
            UpdateAsset::FullInstaller(url) => assert_eq!(url, "https://example.com/a.msi"),
            UpdateAsset::Exe(_) => panic!("显式 full install 时不应选择 exe 包"),
        }
    }

    #[test]
    fn delta_base_requires_full_install_for_old_clients() {
        let raw: RawFeed = serde_json::from_str(
            r#"{
                "version": "1.7.0",
                "delta_base": "1.6.0",
                "installer_url": "https://example.com/c.msi",
                "platforms": {
                    "windows-x86_64-exe": { "url": "https://example.com/c.zip", "sha256": "ab" }
                }
            }"#,
        )
        .unwrap();
        let old = Version::parse("1.5.2").unwrap();
        match select_update_asset(&raw, &old).unwrap() {
            UpdateAsset::FullInstaller(url) => assert_eq!(url, "https://example.com/c.msi"),
            UpdateAsset::Exe(_) => panic!("低于差量基线时应回退完整安装包"),
        }
        let current = Version::parse("1.6.0").unwrap();
        assert!(matches!(
            select_update_asset(&raw, &current),
            Some(UpdateAsset::Exe(_))
        ));
    }

    #[test]
    fn missing_exe_asset_falls_back_to_msi() {
        let raw: RawFeed = serde_json::from_str(
            r#"{
                "version": "1.5.3",
                "platforms": { "windows-x86_64": { "url": "https://example.com/a.msi", "signature": "x" } }
            }"#,
        )
        .unwrap();
        match select_update_asset(&raw, &Version::parse("1.5.2").unwrap()).unwrap() {
            UpdateAsset::FullInstaller(url) => assert_eq!(url, "https://example.com/a.msi"),
            UpdateAsset::Exe(_) => panic!("缺少 exe 包时应回退到 MSI"),
        }
    }

    #[test]
    fn version_comparison_is_semver() {
        assert!(Version::parse("1.5.10").unwrap() > Version::parse("1.5.9").unwrap());
        assert!(Version::parse("1.5.3-beta.1").unwrap() < Version::parse("1.5.3").unwrap());
    }

    #[test]
    fn swap_exe_replaces_target_and_keeps_backup() {
        let dir = std::env::temp_dir().join(format!("dna-updater-swap-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let target = dir.join("dna-builder.exe");
        let staged = dir.join("staged.exe");
        fs::write(&target, b"OLD").unwrap();
        fs::write(&staged, b"NEW").unwrap();

        swap_exe(&staged, &target).unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"NEW");
        assert_eq!(fs::read(old_exe_path(&target).unwrap()).unwrap(), b"OLD");

        // 第二次更新：旧备份被替换，新内容生效
        fs::write(&staged, b"NEWER").unwrap();
        swap_exe(&staged, &target).unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"NEWER");
        assert_eq!(fs::read(old_exe_path(&target).unwrap()).unwrap(), b"NEW");

        let _ = fs::remove_dir_all(&dir);
    }
}
