//! 应用入口：只负责插件注册、托盘装配与 Tauri 命令注册，
//! 具体命令实现按领域拆分在 `commands/` 下，引擎实现放在 `submodules/` 下。

mod commands;
mod submodules;
mod util;

use tauri::Manager;

// CLI 示例（examples/dob-script.rs）通过库根路径调用脚本执行入口。
#[cfg(feature = "dob-script-cli")]
pub use commands::script_cmds::run_script_cli;

/// 应用主入口：注册插件、装配托盘并启动 Tauri 应用。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut app = tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build());
    #[cfg(target_os = "windows")]
    {
        app = app
            .plugin(tauri_plugin_autostart::Builder::new().build())
            .plugin(tauri_plugin_window_state::Builder::default().build());
    }
    app.setup(|app| {
        let handle = app.handle();
        let window = app.get_webview_window("main").unwrap();
        // window.set_shadow(true).expect("Unsupported platform!");
        // window.open_devtools();

        #[cfg(target_os = "macos")]
        apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)
            .expect("Unsupported platform! 'apply_vibrancy' is only supported on macOS");

        #[cfg(target_os = "windows")]
        {
            use sysinfo::System;
            use tauri::menu::*;
            use tauri::tray::*;
            use window_vibrancy::*;

            use commands::window::apply_material;
            let mut sys = System::new_all();
            sys.refresh_all();

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
        // 窗口
        commands::window::apply_material,
        commands::window::set_window_style,
        commands::window::get_window_by_process_name,
        commands::window::float_window_set,
        commands::window::float_window_disable,
        commands::window::float_window_trigger,
        commands::window::float_window_state,
        // 系统
        commands::system::app_close,
        commands::system::get_os_version,
        commands::system::get_documents_dir,
        commands::system::list_system_fonts,
        commands::system::is_launch_at_startup_enabled,
        commands::system::set_launch_at_startup_enabled,
        // 游戏
        commands::game::get_game_install,
        commands::game::is_game_running,
        commands::game::launch_exe,
        commands::game::launch_normal,
        commands::game::run_as_admin,
        commands::game::check_is_admin,
        commands::game::create_desktop_shortcut,
        commands::game::apply_game_patch,
        // MOD 导入
        commands::mod_import::import_mod,
        commands::mod_import::import_mod_files,
        commands::mod_import::enable_mod,
        commands::mod_import::import_pic,
        commands::mod_import::import_pic_data,
        // 网络
        commands::net::fetch,
        commands::net::get_local_qq,
        // WebSocket 心跳
        commands::websocket::start_heartbeat,
        commands::websocket::stop_heartbeat,
        commands::websocket::send_ws_msg,
        // 下载
        commands::download::download_file,
        commands::download::get_download_progress,
        commands::download::pause_download,
        // 文件系统
        commands::fs::list_script_files,
        commands::fs::read_text_file,
        commands::fs::write_text_file,
        commands::fs::export_binary_file,
        commands::fs::move_file,
        commands::fs::get_file_size,
        commands::fs::get_file_hash,
        commands::fs::cleanup_temp_dir,
        commands::fs::rename_file,
        commands::fs::delete_file,
        commands::fs::path_exists,
        commands::fs::remove_dir_all,
        commands::fs::watch_file,
        commands::fs::unwatch_file,
        commands::fs::list_files,
        commands::fs::list_directories,
        // pak 包
        commands::pak::enumerate_pak_files,
        commands::pak::list_pak_files,
        commands::pak::export_pak_files,
        commands::pak::pack_pak_folder,
        commands::pak::decompile_lua_bytecode_files,
        // 解压
        commands::archive::extract_game_assets,
        // 脚本
        commands::script_cmds::run_script,
        commands::script_cmds::exec_script,
        commands::script_cmds::resolve_script_config_request,
        commands::script_cmds::resolve_script_help_request,
        commands::script_cmds::stop_script,
        commands::script_cmds::stop_script_by_path,
        commands::script_cmds::get_script_running_state,
        commands::script_cmds::get_script_runtime_info,
        commands::script_cmds::get_script_mcp_server_state,
        commands::script_cmds::clear_script_mcp_cache,
        commands::script_cmds::clear_script_mcp_status,
        commands::script_cmds::clear_script_mcp_console,
        commands::script_cmds::set_script_mcp_server_enabled,
        commands::script_cmds::sync_script_hotkey_bindings,
        commands::script_cmds::get_script_hotkey_bindings,
        commands::script_cmds::set_script_input_recorder_hotkey_enabled,
        commands::script_cmds::get_script_input_recorder_snapshot,
        commands::script_cmds::clear_script_input_recorder_actions,
        // 云游戏窗口
        commands::cloudgame::dispatch_cloudgame_bridge_event,
        commands::cloudgame::open_cloudgame_window,
        commands::cloudgame::get_cloudgame_window_state,
        commands::cloudgame::close_cloudgame_window,
        commands::cloudgame::show_cloudgame_window,
        commands::cloudgame::hide_cloudgame_window,
        commands::cloudgame::focus_cloudgame_window,
        commands::cloudgame::reload_cloudgame_window,
        commands::cloudgame::navigate_cloudgame_window,
        commands::cloudgame::dispatch_cloudgame_command,
        commands::cloudgame::eval_cloudgame_window,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
