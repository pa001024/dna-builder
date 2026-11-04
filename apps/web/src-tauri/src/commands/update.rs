//! 自定义更新命令：检查 feed、下载 exe 差量包、启动安装 helper。

use std::{
    path::Path,
    time::{Duration, Instant},
};

use tauri::{AppHandle, Emitter};

use crate::update;

/// 检查更新；无更新或所有更新源不可用时返回 None / 错误。
#[tauri::command]
pub async fn update_check() -> Result<Option<update::UpdateInfo>, String> {
    update::check_for_update(&update::current_version()).await
}

/// 重新检查并下载当前版本的 exe 差量包，返回版本号；进度通过 `update-progress` 事件推送。
#[tauri::command]
pub async fn update_download(app: AppHandle) -> Result<String, String> {
    let info = update::check_for_update(&update::current_version())
        .await?
        .ok_or_else(|| "当前已是最新版本".to_string())?;
    if info.requires_full_install {
        return Err(format!(
            "该版本需要完整安装包（tauri updater 整包安装），差量下载不可用：{}",
            info.installer_url.as_deref().unwrap_or(&info.url)
        ));
    }

    let mut last_emit: Option<Instant> = None;
    update::download_update(&info, |downloaded, total| {
        let finished = total.is_some_and(|size| size > 0 && downloaded >= size);
        let due = last_emit.is_none_or(|last| last.elapsed() >= Duration::from_millis(200));
        if finished || due {
            last_emit = Some(Instant::now());
            let _ = app.emit(
                "update-progress",
                serde_json::json!({ "downloaded": downloaded, "total": total }),
            );
        }
    })
    .await?;

    Ok(info.version)
}

/// 安装已下载的更新并重启应用；调用成功时进程会退出，由 helper 完成替换。
#[tauri::command]
pub async fn update_install(app: AppHandle, version: String) -> Result<(), String> {
    let version = semver::Version::parse(version.trim_start_matches('v'))
        .map_err(|error| format!("非法版本号: {error}"))?;
    let staged = update::staged_exe(&version.to_string());
    if !staged.is_file() {
        return Err("更新包尚未下载完成，请重新下载".to_string());
    }

    let target = std::env::current_exe().map_err(|error| format!("定位当前程序失败: {error}"))?;
    let writable = update::is_dir_writable(target.parent().unwrap_or_else(|| Path::new(".")));
    update::spawn_apply_helper(&staged, &target, std::process::id(), true, !writable)?;
    app.exit(0);
    Ok(())
}
