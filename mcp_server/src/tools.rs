use std::ffi::c_void;
use std::fs::File;
use std::io::Write;
use std::mem::zeroed;
use std::process::{Command, Stdio};

use base64;
use thiserror::Error;
use windows_sys::Win32::Foundation::*;
use windows_sys::Win32::Graphics::Gdi::*;
use windows_sys::Win32::UI::WindowsAndMessaging::*;

use super::util::{Win32Error, get_process_by_name};

#[derive(Error, Debug)]
pub enum ToolError {
    #[error("Win32 error: {0}")]
    Win32(#[from] Win32Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Serialization error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("Custom error: {0}")]
    Custom(String),
}

// 根据进程名获取窗口句柄
fn get_window_handle_by_process_name(process_name: &str) -> Result<HWND, Win32Error> {
    let pid = get_process_by_name(process_name)?;
    if pid == 0 {
        return Err(Win32Error::Custom(format!(
            "Process not found: {}",
            process_name
        )));
    }

    // 使用一个简单的方法获取窗口句柄
    // 注意：这种方法可能无法找到所有窗口，但对于大多数游戏窗口应该足够
    let _window_handle: HWND = std::ptr::null_mut();

    // 简单的窗口查找方法：尝试获取最顶层窗口
    unsafe {
        // 枚举所有窗口，查找匹配进程ID的窗口
        let mut hwnd = GetTopWindow(std::ptr::null_mut());
        while !hwnd.is_null() {
            let mut window_pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, &mut window_pid);

            if window_pid == pid as u32 {
                // 检查窗口是否可见
                if IsWindowVisible(hwnd) != 0 {
                    return Ok(hwnd);
                }
            }
            hwnd = GetWindow(hwnd, GW_HWNDNEXT);
        }
    }

    Err(Win32Error::Custom(format!(
        "Window not found for process: {}",
        process_name
    )))
}

// 截图游戏窗口
pub fn image_grab(process_name: &str) -> Result<String, ToolError> {
    // 获取窗口句柄
    let hwnd = get_window_handle_by_process_name(process_name)?;

    unsafe {
        // 获取窗口的设备上下文
        let hdc_window = GetDC(hwnd);
        if hdc_window.is_null() {
            return Err(ToolError::Win32(Win32Error::Custom(
                "Failed to get window DC".to_string(),
            )));
        }

        // 创建兼容的设备上下文
        let hdc_memory = CreateCompatibleDC(hdc_window);
        if hdc_memory.is_null() {
            ReleaseDC(hwnd, hdc_window);
            return Err(ToolError::Win32(Win32Error::Custom(
                "Failed to create compatible DC".to_string(),
            )));
        }

        // 获取窗口的位置和大小
        let mut rect = RECT::default();
        GetClientRect(hwnd, &mut rect);
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;

        // 创建兼容的位图
        let hbitmap = CreateCompatibleBitmap(hdc_window, width, height);
        if hbitmap.is_null() {
            DeleteDC(hdc_memory);
            ReleaseDC(hwnd, hdc_window);
            return Err(ToolError::Win32(Win32Error::Custom(
                "Failed to create compatible bitmap".to_string(),
            )));
        }

        // 将位图选入设备上下文
        let old_bitmap = SelectObject(hdc_memory, hbitmap as HGDIOBJ);
        if old_bitmap.is_null() {
            DeleteObject(hbitmap as HGDIOBJ);
            DeleteDC(hdc_memory);
            ReleaseDC(hwnd, hdc_window);
            return Err(ToolError::Win32(Win32Error::Custom(
                "Failed to select bitmap".to_string(),
            )));
        }

        // 复制窗口内容到位图
        let result = BitBlt(hdc_memory, 0, 0, width, height, hdc_window, 0, 0, SRCCOPY);

        // 恢复旧的位图
        SelectObject(hdc_memory, old_bitmap);

        if result == 0 {
            DeleteObject(hbitmap as HGDIOBJ);
            DeleteDC(hdc_memory);
            ReleaseDC(hwnd, hdc_window);
            return Err(ToolError::Win32(Win32Error::Custom(
                "Failed to copy bitmap".to_string(),
            )));
        }

        // 获取位图信息
        let mut bitmap_info: BITMAPINFO = zeroed();
        bitmap_info.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bitmap_info.bmiHeader.biWidth = width;
        bitmap_info.bmiHeader.biHeight = -height as i32; // 负高度表示自上而下
        bitmap_info.bmiHeader.biPlanes = 1;
        bitmap_info.bmiHeader.biBitCount = 24; // 24位BGR格式
        bitmap_info.bmiHeader.biCompression = BI_RGB;

        // 计算位图数据大小
        let row_size = (width * 3 + 3) & !3; // 按4字节对齐
        let data_size = row_size * height;

        // 分配内存存储位图数据
        let mut bitmap_data = vec![0u8; data_size as usize];

        // 获取位图数据
        let scan_lines = GetDIBits(
            hdc_window,                              // 设备上下文
            hbitmap,                                 // 位图句柄
            0,                                       // 起始扫描线
            height as u32,                           // 扫描线数量
            bitmap_data.as_mut_ptr() as *mut c_void, // 数据缓冲区
            &mut bitmap_info as *mut BITMAPINFO,     // 位图信息
            DIB_RGB_COLORS,                          // 颜色表类型
        );

        if scan_lines == 0 {
            DeleteObject(hbitmap as HGDIOBJ);
            DeleteDC(hdc_memory);
            ReleaseDC(hwnd, hdc_window);
            return Err(ToolError::Win32(Win32Error::Custom(
                "Failed to get bitmap bits".to_string(),
            )));
        }

        // 创建image::DynamicImage (BGR格式转换为RGB)
        let image = image::ImageBuffer::<image::Rgb<u8>, _>::from_fn(
            width as u32,
            height as u32,
            |x, y| {
                let y_adj = (height as u32 - 1 - y) as usize;
                let row_size_adj = row_size as usize;
                let x_adj = x as usize;
                let offset = (y_adj * row_size_adj) + (x_adj * 3);
                image::Rgb([
                    bitmap_data[offset + 2], // B -> R
                    bitmap_data[offset + 1], // G -> G
                    bitmap_data[offset],     // R -> B
                ])
            },
        );
        let dynamic_image = image::DynamicImage::ImageRgb8(image);

        // 编码为WebP
        let encoder = webp::Encoder::from_image(&dynamic_image).unwrap();
        // Encode the image at a specified quality 0-100
        let webp = encoder.encode(70.0);
        // Cleanup GDI resources
        DeleteObject(hbitmap as HGDIOBJ);
        DeleteDC(hdc_memory);
        ReleaseDC(hwnd, hdc_window);

        // Encode WebP data to base64
        let base64_image =
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &*webp);

        Ok(format!("data:image/webp;base64,{}", base64_image))
    }
}

// 执行AHKv2脚本
pub fn run_script(script: &str) -> Result<(String, String), ToolError> {
    // 创建临时文件
    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join("temp_script.ahk");

    // 写入脚本内容
    let mut file = File::create(&temp_path)?;
    file.write_all(script.as_bytes())?;
    file.flush()?;

    // 执行AHKv2脚本
    let output = Command::new("AutoHotkey64")
        .arg(temp_path.to_str().unwrap())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()?;

    // 读取输出
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    Ok((stdout, stderr))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_run_script() -> Result<(), ToolError> {
        // 测试简单的AHKv2脚本
        let script = "ExitApp";
        let (stdout, stderr) = run_script(script)?;

        // 打印输出以便调试
        println!("stdout: {}", stdout);
        println!("stderr: {}", stderr);

        // 验证脚本执行成功（这里主要检查没有错误）
        assert!(
            !stderr.contains("error"),
            "AHK script execution failed: {}",
            stderr
        );

        Ok(())
    }

    #[test]
    fn test_image_grab_nonexistent_process() {
        // 测试截图不存在的进程
        let result = image_grab("nonexistent_process_12345.exe");

        // 应该返回错误
        assert!(
            result.is_err(),
            "Image grab should fail for nonexistent process"
        );

        let error = result.unwrap_err();
        // 验证错误信息包含进程未找到
        assert!(
            format!("{:?}", error).contains("Process not found"),
            "Error message should indicate process not found"
        );
    }
}
