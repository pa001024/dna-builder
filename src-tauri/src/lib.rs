use std::{
    fs::{self, File},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    time::Duration,
};

use reqwest::multipart;
use serde::{Deserialize, Serialize};
use tauri::Manager;
use zip::ZipArchive;
mod util;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(untagged)]
enum FormDataValue {
    Text(String),
    File {
        filename: String,
        data: Vec<u8>,
        mime: Option<String>,
    },
}

// #[macro_use]
// extern crate lazy_static;
// const GAME_PROCESS: &str = "EM.exe";
const GAME_PROCESS: &str = "EM-Win64-Shipping.exe";

// 退出程序
#[tauri::command]
async fn app_close(app_handle: tauri::AppHandle) {
    // let Some(window) = app_handle.get_webview_window("main") else {
    //     return app_handle.exit(0);
    // };
    #[cfg(target_os = "windows")]
    {
        use tauri_plugin_window_state::{AppHandleExt, StateFlags};
        app_handle.save_window_state(StateFlags::all()).ok(); // don't really care if it saves it
    }
    // if let Err(_) = window.close() {
    return app_handle.exit(0);
    // }
}

#[tauri::command]
async fn get_local_qq(port: u32) -> String {
    let client = reqwest::Client::builder()
        .cookie_store(true)
        .build()
        .unwrap();
    if let Ok(res) = {
        client.get("https://xui.ptlogin2.qq.com/cgi-bin/xlogin?s_url=https%3A%2F%2Fgraph.qq.com%2Foauth2.0%2Flogin_jump").send().await
    } {
        let val = res
            .cookies()
            .into_iter()
            .find(|x| x.name() == "pt_local_token")
            .unwrap()
            .value()
            .to_string();

        if let Ok(res) = {
            let url = format!(
                "https://localhost.ptlogin2.qq.com:{}/pt_get_uins?callback=ptui_getuins_CB&pt_local_tk={}",
                port, val
            );
            client
                .get(url)
                .header("Referer", "https://xui.ptlogin2.qq.com/")
                .send()
                .await
        } {
            let text = res.text().await.unwrap();
            if text.len() > 57 {
                let s = text.as_str();
                let s = &s[21..text.len() - 35];
                return s.to_string();
            }
        }
    }

    return "[]".to_string();
}

fn is_zip_file(path: &Path) -> io::Result<bool> {
    let meta = fs::metadata(path)?;
    if meta.is_dir() {
        return Ok(false);
    }
    let mut file = File::open(path)?;
    let mut signature = [0u8; 4];
    let read = file.read(&mut signature)?;
    Ok(read >= 2 && signature[0] == b'P' && signature[1] == b'K')
}

fn extract_zip_into(
    archive_path: &Path,
    target_dir: &Path,
    output: &mut Vec<(String, u64)>,
) -> io::Result<()> {
    let file = File::open(archive_path)?;
    let mut archive = ZipArchive::new(file)
        .map_err(|err| io::Error::new(io::ErrorKind::Other, err.to_string()))?;
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|err| io::Error::new(io::ErrorKind::Other, err.to_string()))?;
        if entry.is_dir() {
            continue;
        }
        let relative = entry.mangled_name();
        let out_path = target_dir.join(relative);
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut extracted = File::create(&out_path)?;
        io::copy(&mut entry, &mut extracted)?;
        output.push((out_path.to_string_lossy().to_string(), entry.size()));
    }
    Ok(())
}

fn copy_regular_file(
    file_path: &Path,
    target_dir: &Path,
    output: &mut Vec<(String, u64)>,
) -> io::Result<()> {
    if !file_path.is_file() {
        return Ok(());
    }
    let Some(file_name) = file_path.file_name() else {
        return Ok(());
    };
    let dest = target_dir.join(file_name);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(file_path, &dest)?;
    let size = fs::metadata(&dest)?.len();
    output.push((dest.to_string_lossy().to_string(), size));
    Ok(())
}

#[tauri::command]
fn import_mod(gamebase: String, paths: Vec<String>) -> String {
    let base_path = PathBuf::from(gamebase);
    if let Err(err) = fs::create_dir_all(&base_path) {
        eprintln!("Failed to prepare gamebase dir: {err}");
        return "[]".to_string();
    }

    let mut output: Vec<(String, u64)> = Vec::new();
    for raw in paths {
        let src = PathBuf::from(&raw);
        if !src.exists() {
            eprintln!("Path not found: {raw}");
            continue;
        }
        match is_zip_file(&src) {
            Ok(true) => {
                if let Err(err) = extract_zip_into(&src, &base_path, &mut output) {
                    eprintln!("Failed to extract {:?}: {err}", src);
                }
            }
            Ok(false) => {
                if let Err(err) = copy_regular_file(&src, &base_path, &mut output) {
                    eprintln!("Failed to copy {:?}: {err}", src);
                }
            }
            Err(err) => eprintln!("Failed to inspect {:?}: {err}", src),
        }
    }

    serde_json::to_string(&output).unwrap_or_else(|_| "[]".to_string())
}

#[tauri::command]
fn enable_mod(srcdir: String, dstdir: String, files: Vec<String>) -> String {
    let base_path = PathBuf::from(dstdir.clone());
    if let Err(err) = fs::create_dir_all(&base_path) {
        eprintln!("Failed to prepare moddir: {err}");
        return "[]".to_string();
    }
    // 将srcdir下的files移动到dstdir
    for file in files {
        let src = srcdir.clone() + "\\" + file.as_str();
        let dest = dstdir.clone() + "\\" + file.as_str();
        if let Err(err) = fs::rename(&src, &dest) {
            eprintln!("Failed to move {:?} -> {:?}: {err}", src, dest);
            return format!("Failed to move {:?} -> {:?}: {err}", src, dest);
        }
    }
    "".to_string()
}

#[tauri::command]
fn import_pic(path: String) -> Result<String, String> {
    // 导入图片 转换为dataurl
    let mut file = File::open(&path).map_err(|e| format!("无法打开文件: {}", e))?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)
        .map_err(|e| format!("读取文件失败: {}", e))?;

    // 截取文件扩展名
    let ext = path
        .split(".")
        .last()
        .ok_or_else(|| "无效的文件路径".to_string())?;

    let data_url = format!(
        "data:image/{};base64,{}",
        ext,
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, buffer)
    );
    Ok(data_url)
}

#[tauri::command]
fn get_game_install() -> String {
    #[cfg(target_os = "windows")]
    {
        use winreg::{RegKey, enums::*};
        // 读取注册表
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let key = "Software\\Hero Games\\Duet Night Abyss";
        let sk = hkcu.open_subkey(key);
        if let Ok(sk) = sk {
            for file in sk
                .enum_keys()
                .map(|x| x.unwrap())
                .filter(|x| x.ends_with("EMLauncher.exe"))
            {
                // 截取文件夹路径
                let parts: Vec<&str> = file.split("\\").collect();
                let dir = &parts[..parts.len() - 1].join("\\");
                let game_dir = dir.to_string() + "\\DNA Game\\EM.exe";
                return game_dir;
            }
        }
    }
    return "".to_string();
}

#[tauri::command]
async fn is_game_running(is_run: bool) -> String {
    #[cfg(target_os = "windows")]
    {
        use crate::util::{get_process_by_name, get_process_exe_path};

        let mut elapsed = Duration::from_secs(0);
        let timeout = Duration::from_secs(60 * 60); // 1h
        let interval = Duration::from_millis(500); // 500ms

        while elapsed <= timeout {
            let now_is_run = get_process_by_name(GAME_PROCESS).unwrap_or(0) > 0;
            if now_is_run != is_run {
                break;
            }
            tokio::time::sleep(interval).await;
            elapsed += interval;
        }

        if !is_run {
            if let Ok(Some(path)) = get_process_exe_path(GAME_PROCESS) {
                return path;
            }
        }
    }
    "".to_string()
}

#[tauri::command]
async fn launch_exe(path: String, params: String) -> bool {
    #[cfg(target_os = "windows")]
    {
        use crate::util::shell_execute;
        let pid = shell_execute(path.as_str(), Some(params.as_str()), None);
        if let Err(err) = pid {
            println!("Failed to launch game: {:?}", err);
            return false;
        }
    }
    true
}

#[tauri::command]
fn apply_material(window: tauri::WebviewWindow, material: &str) -> String {
    #[cfg(target_os = "windows")]
    {
        use window_vibrancy::*;
        {
            let _ = clear_blur(&window);
            let _ = clear_acrylic(&window);
            let _ = clear_mica(&window);
            let _ = clear_tabbed(&window);
        }
        match material {
            "None" => {}
            "Blur" => {
                if apply_blur(&window, Some((0, 0, 0, 0))).is_err() {
                    return "Unsupported platform! 'apply_blur' is only supported on Windows 7, Windows 10 v1809 or newer"
                .to_string();
                }
            }
            "Acrylic" => {
                if apply_acrylic(&window, Some((0, 0, 0, 0))).is_err() {
                    return "Unsupported platform! 'apply_acrylic' is only supported on Windows 10 v1809 or newer"
                .to_string();
                }
            }
            "Mica" => {
                if apply_mica(&window, Some(false)).is_err() {
                    return "Unsupported platform! 'apply_mica' is only supported on Windows 11"
                        .to_string();
                }
            }
            "Mica_Dark" => {
                if apply_mica(&window, Some(true)).is_err() {
                    return "Unsupported platform! 'apply_mica' is only supported on Windows 11"
                        .to_string();
                }
            }
            "Mica_Tabbed" => {
                if apply_tabbed(&window, Some(false)).is_err() {
                    return "Unsupported platform! 'apply_mica' is only supported on Windows 11"
                        .to_string();
                }
            }
            "Mica_Tabbed_Dark" => {
                if apply_tabbed(&window, Some(true)).is_err() {
                    return "Unsupported platform! 'apply_mica' is only supported on Windows 11"
                        .to_string();
                }
            }
            _ => return "Unsupported material!".to_string(),
        }
    }
    "Success".to_string()
}

// 定义响应结构体
#[derive(Debug, Clone, Deserialize, Serialize)]
struct FetchResponse {
    status: u16,
    body: String,
}

#[tauri::command]
async fn fetch(
    url: String,
    method: String,
    body: Option<String>,
    headers: Option<Vec<(String, String)>>,
    multipart: Option<Vec<(String, FormDataValue)>>,
) -> Result<FetchResponse, String> {
    let client = reqwest::Client::new();
    let mut request_builder = match method.to_uppercase().as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        _ => return Err(format!("Unsupported method: {}", method)),
    };

    if let Some(form_data) = multipart {
        let mut form = multipart::Form::new();
        for (key, value) in form_data {
            match value {
                FormDataValue::Text(text) => {
                    form = form.text(key, text);
                }
                FormDataValue::File {
                    filename,
                    data,
                    mime,
                } => {
                    let part = match mime {
                        Some(mime_type) => {
                            match multipart::Part::bytes(data.clone())
                                .file_name(filename.clone())
                                .mime_str(&mime_type)
                            {
                                Ok(p) => p,
                                Err(_) => multipart::Part::bytes(data).file_name(filename),
                            }
                        }
                        None => multipart::Part::bytes(data).file_name(filename),
                    };
                    form = form.part(key, part);
                }
            }
        }
        request_builder = request_builder.multipart(form);
    } else if let Some(ref b) = body {
        request_builder = request_builder.body(b.clone());
    }

    if let Some(h) = headers {
        for (key, value) in h {
            request_builder = request_builder.header(&key, &value);
        }
    }

    let response = request_builder.send().await;

    match response {
        Ok(resp) => {
            let status = resp.status();
            let text = match resp.text().await {
                Ok(t) => t,
                Err(e) => return Err(format!("Failed to read response: {}", e)),
            };
            Ok(FetchResponse {
                status: status.as_u16(),
                body: text,
            })
        }
        Err(e) => Err(format!("Request failed: {}", e)),
    }
}

/// 导出JSON文件到指定路径
#[tauri::command]
async fn export_json_file(file_path: String, json_content: String) -> Result<String, String> {
    // 创建文件路径
    let path = Path::new(&file_path);

    // 确保父目录存在
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }
    }

    // 写入JSON内容到文件
    let mut file = File::create(path).map_err(|e| format!("Failed to create file: {}", e))?;
    file.write_all(json_content.as_bytes())
        .map_err(|e| format!("Failed to write JSON content: {}", e))?;

    Ok(format!("Successfully exported JSON to {}", file_path))
}

#[tauri::command]
fn get_os_version() -> String {
    use sysinfo::System;
    let mut sys = System::new_all();
    sys.refresh_all();
    if let Some(version) = sysinfo::System::os_version() {
        version
    } else {
        "".to_string()
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut app = tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init());
    #[cfg(target_os = "windows")]
    {
        app = app
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_window_state::Builder::default().build());
    }
    app.setup(|app| {
        let handle = app.handle();
        let window = app.get_webview_window("main").unwrap();
        // window.set_shadow(true).expect("Unsupported platform!");

        #[cfg(target_os = "macos")]
        apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)
            .expect("Unsupported platform! 'apply_vibrancy' is only supported on macOS");

        #[cfg(target_os = "windows")]
        {
            use sysinfo::System;
            use tauri::menu::*;
            use tauri::tray::*;
            use window_vibrancy::*;
            let mut sys = System::new_all();
            sys.refresh_all();

            use windows_sys::Win32::Foundation::CloseHandle;
            use windows_sys::Win32::System::Threading::CreateMutexA;
            use windows_sys::Win32::UI::WindowsAndMessaging::*;
            let h_mutex = unsafe { CreateMutexA(std::ptr::null_mut(), 0, "weys-mutex".as_ptr()) };
            if h_mutex == std::ptr::null_mut() {
                // Mutex already exists, app is already running.
                unsafe {
                    CloseHandle(h_mutex);
                    let hwnd = FindWindowA(std::ptr::null(), "WeYS".as_ptr());
                    let mut wpm = std::mem::zeroed::<WINDOWPLACEMENT>();
                    if GetWindowPlacement(hwnd, &mut wpm) != 0 {
                        ShowWindow(hwnd, SW_SHOWNORMAL);
                        SetForegroundWindow(hwnd);
                    }
                };
                handle.exit(0);
            }
            let submenu = SubmenuBuilder::new(handle, "材质")
                .check("None", "None")
                .check("Blur", "Blur")
                .check("Acrylic", "Acrylic")
                .check("Mica", "Mica")
                .check("Mica_Dark", "Mica_Dark")
                .check("Mica_Tabbed", "Mica_Tabbed")
                .check("Mica_Tabbed_Dark", "Mica_Tabbed_Dark")
                .build()?;
            let menu = MenuBuilder::new(app)
                .items(&[&submenu])
                .text("exit", "退出 (&Q)")
                .build()?;

            let set_mat_check = move |x: &str| {
                submenu.items().unwrap().iter().for_each(|item| {
                    if let Some(check_menuitem) = item.as_check_menuitem() {
                        let _ = check_menuitem.set_checked(check_menuitem.id() == x);
                    }
                });
            };
            if let Some(version) = System::os_version() {
                if version.starts_with("11") {
                    let acrylic_available = apply_acrylic(&window, Some((0, 0, 0, 0))).is_ok();
                    if acrylic_available {
                        println!("Acrylic is available");
                        set_mat_check("Acrylic");
                    }
                } else if version.starts_with("10") {
                    let blur_available = apply_blur(&window, Some((0, 0, 0, 0))).is_ok();
                    if blur_available {
                        println!("Blur is available");
                        set_mat_check("Blur");
                    }
                } else {
                    set_mat_check("None");
                }
            }
        }

        Ok(())
    })
    .invoke_handler(tauri::generate_handler![
        apply_material,
        app_close,
        get_os_version,
        get_game_install,
        is_game_running,
        launch_exe,
        import_mod,
        enable_mod,
        import_pic,
        fetch,
        get_local_qq,
        export_json_file
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
