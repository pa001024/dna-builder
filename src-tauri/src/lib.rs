use tauri::menu::*;
use tauri::tray::*;
use tauri::Manager;
use tauri_plugin_window_state::{AppHandleExt, StateFlags};
use window_vibrancy::*;

// #[macro_use]
// extern crate lazy_static;

// 退出程序
#[tauri::command]
async fn app_close(app_handle: tauri::AppHandle) {
    // let Some(window) = app_handle.get_webview_window("main") else {
    //     return app_handle.exit(0);
    // };
    app_handle.save_window_state(StateFlags::all()).ok(); // don't really care if it saves it

    // if let Err(_) = window.close() {
    return app_handle.exit(0);
    // }
}

#[tauri::command]
fn apply_material(window: tauri::WebviewWindow, material: &str) -> String {
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
    "Success".to_string()
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
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let handle = app.handle();
            let window = app.get_webview_window("main").unwrap();
            // window.set_shadow(true).expect("Unsupported platform!");

            #[cfg(target_os = "macos")]
            apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)
                .expect("Unsupported platform! 'apply_vibrancy' is only supported on macOS");

            #[cfg(target_os = "windows")]
            {
                use sysinfo::System;
                let mut sys = System::new_all();
                sys.refresh_all();

                use windows_sys::Win32::Foundation::CloseHandle;
                use windows_sys::Win32::System::Threading::CreateMutexA;
                use windows_sys::Win32::UI::WindowsAndMessaging::*;
                let h_mutex =
                    unsafe { CreateMutexA(std::ptr::null_mut(), 0, "weys-mutex".as_ptr()) };
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

                let _tray = TrayIconBuilder::new()
                    .menu(&menu)
                    .on_menu_event(move |_app, event| match event.id().as_ref() {
                        "exit" => {
                            std::process::exit(0);
                        }
                        "None" => {
                            set_mat_check("None");
                            let _ = apply_material(window.clone(), "None");
                        }
                        "Blur" => {
                            set_mat_check("Blur");
                            let _ = apply_material(window.clone(), "Blur");
                        }
                        "Acrylic" => {
                            set_mat_check("Acrylic");
                            let _ = apply_material(window.clone(), "Acrylic");
                        }
                        "Mica" => {
                            set_mat_check("Mica");
                            let _ = apply_material(window.clone(), "Mica");
                        }
                        "Mica_Dark" => {
                            set_mat_check("Mica_Dark");
                            let _ = apply_material(window.clone(), "Mica_Dark");
                        }
                        "Mica_Tabbed" => {
                            set_mat_check("Mica_Tabbed");
                            let _ = apply_material(window.clone(), "Mica_Tabbed");
                        }
                        "Mica_Tabbed_Dark" => {
                            set_mat_check("Mica_Tabbed_Dark");
                            let _ = apply_material(window.clone(), "Mica_Tabbed_Dark");
                        }
                        _ => (),
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(webview_window) = app.get_webview_window("main") {
                                if let Ok(is_visible) = webview_window.is_visible() {
                                    if is_visible {
                                        let _ = webview_window.hide();
                                    } else {
                                        let _ = webview_window.show();
                                        let _ = webview_window.set_focus();
                                    }
                                }
                            }
                        }
                    })
                    .icon(
                        tauri::image::Image::from_bytes(include_bytes!("../icons/icon.ico"))
                            .expect("icon missing"),
                    )
                    .build(app)?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            apply_material,
            app_close,
            get_os_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
