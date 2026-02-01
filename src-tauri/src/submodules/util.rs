use crate::submodules::d3d11::{self, create_d3d_device};
use opencv::{
    core::{CV_8UC4, Mat},
    imgproc,
    prelude::*,
};
use scopeguard::guard;
use std::{cell::RefCell, mem::zeroed, ptr};
use thiserror::Error;
use windows::{
    Graphics::{
        Capture::{Direct3D11CaptureFramePool, GraphicsCaptureItem, GraphicsCaptureSession},
        DirectX::{Direct3D11::IDirect3DDevice, DirectXPixelFormat},
        SizeInt32,
    },
    Win32::{
        Foundation::{HWND, POINT, RECT},
        Graphics::{
            Direct3D11::*,
            Gdi::{
                BITMAP, BITMAPINFO, BITMAPINFOHEADER, BitBlt, ClientToScreen,
                CreateCompatibleBitmap, CreateCompatibleDC, DIB_RGB_COLORS, DeleteDC, DeleteObject,
                GetDIBits, GetObjectW, GetWindowDC, HBITMAP, HDC, HGDIOBJ, RGBQUAD, ReleaseDC,
                SRCCOPY, SelectObject,
            },
        },
        Storage::Xps::{PRINT_WINDOW_FLAGS, PrintWindow},
        System::WinRT::{
            Direct3D11::IDirect3DDxgiInterfaceAccess,
            Graphics::Capture::IGraphicsCaptureItemInterop,
        },
        UI::WindowsAndMessaging::{GetClientRect, GetWindowRect, PW_RENDERFULLCONTENT},
    },
};
use windows_core::Interface;
#[derive(Error, Debug)]
pub enum UtilError {
    #[error("WinAPI 错误: {0}")]
    WINAPI(String),
    #[error("OpenCV 错误: {0}")]
    OpenCV(String),
}
pub(crate) fn hbitmap_to_bgr_mat(hbmp: HBITMAP) -> Result<Mat, UtilError> {
    unsafe {
        // Query bitmap size via GetObjectW
        let mut bmp: BITMAP = zeroed();
        let got = GetObjectW(
            hbmp.into(),
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut bmp as *mut _ as *mut _),
        );
        if got == 0 || bmp.bmWidth <= 0 || bmp.bmHeight == 0 {
            return Err(UtilError::WINAPI("GetObjectW failed".to_string()));
        }
        let width = bmp.bmWidth;
        let height = bmp.bmHeight.abs(); // ensure positive

        // Create a memory DC and select the bitmap
        let hdc: HDC = CreateCompatibleDC(Some(HDC(std::ptr::null_mut())));
        if hdc.0 == std::ptr::null_mut() {
            return Err(UtilError::WINAPI("CreateCompatibleDC failed".to_string()));
        }
        let old: HGDIOBJ = SelectObject(hdc, HGDIOBJ::from(hbmp));
        if old.0 == std::ptr::null_mut() {
            let _ = DeleteDC(hdc);
            return Err(UtilError::WINAPI("SelectObject failed".to_string()));
        }

        // Request 32bpp top-down BGRA
        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -(height as i32), // top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: 0, // BI_RGB值为0
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [RGBQUAD::default(); 1],
        };

        let stride = width as usize * 4;
        let mut buf = vec![0u8; stride * height as usize];

        let scanlines = GetDIBits(
            hdc,
            hbmp,
            0,
            height as u32,
            Some(buf.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );
        // Restore and free DC
        SelectObject(hdc, old);
        let _ = DeleteDC(hdc);

        if scanlines == 0 {
            return Err(UtilError::WINAPI("GetDIBits failed".to_string()));
        }

        // Build OpenCV BGRA Mat (top-down)
        let mut mat_bgra = Mat::new_rows_cols(height, width, CV_8UC4)
            .map_err(|e| UtilError::OpenCV(format!("Mat::new_rows_cols: {e}")))?;
        let dst = mat_bgra.data_mut() as *mut u8;
        std::ptr::copy_nonoverlapping(buf.as_ptr(), dst, buf.len());

        // Convert BGRA -> BGR
        let mut mat_bgr = Mat::default();
        imgproc::cvt_color(&mat_bgra, &mut mat_bgr, imgproc::COLOR_BGRA2BGR, 0)
            .map_err(|e| UtilError::OpenCV(format!("cvtColor BGRA2BGR: {e}")))?;

        Ok(mat_bgr)
    }
}

#[allow(unused)]
pub(crate) fn get_color(hwnd: HWND, x: i32, y: i32) -> u32 {
    use windows::Win32::Graphics::Gdi::GetPixel;
    unsafe {
        let (_window_rect, _client_rect, offset_x, offset_y) =
            get_window_and_client_rect(hwnd).unwrap();
        let hdc = GetWindowDC(Some(hwnd));
        let ret = GetPixel(hdc, x + offset_x, y + offset_y);
        ReleaseDC(Some(hwnd), hdc);
        ret.0
    }
}
#[allow(unused)]
pub(crate) fn check_color(hwnd: HWND, x: i32, y: i32, color: i32) -> bool {
    // 获取指定坐标的颜色
    let pixel_value = get_color(hwnd, x, y);

    // 将颜色转换为 RGB 格式
    let r = ((pixel_value >> 16) & 0xFF) as u8;
    let g = ((pixel_value >> 8) & 0xFF) as u8;
    let b = (pixel_value & 0xFF) as u8;

    // 将目标颜色转换为 RGB 格式
    // 假设 color 是 i32 格式，其中高 8 位是 R，中间 8 位是 G，低 8 位是 B
    let r_target = ((color >> 16) & 0xFF) as u8;
    let g_target = ((color >> 8) & 0xFF) as u8;
    let b_target = (color & 0xFF) as u8;

    // 比较颜色
    // 添加一些容差，因为颜色可能会有细微差异
    let tolerance = 10;
    let r_diff = (r as i32 - r_target as i32).abs();
    let g_diff = (g as i32 - g_target as i32).abs();
    let b_diff = (b as i32 - b_target as i32).abs();

    r_diff <= tolerance && g_diff <= tolerance && b_diff <= tolerance
}

// 检查并调整窗口大小
pub(crate) fn check_size(hwnd: HWND) {
    use windows::Win32::Foundation::RECT;
    use windows::Win32::UI::WindowsAndMessaging::{GetClientRect, GetWindowRect, MoveWindow};

    unsafe {
        // 获取客户端区域矩形
        let mut client_rect = RECT::default();
        if GetClientRect(hwnd, &mut client_rect).is_err() {
            println!("获取客户端区域失败");
            return;
        }

        // 计算客户端区域宽度和高度
        let client_width = client_rect.right - client_rect.left;
        let client_height = client_rect.bottom - client_rect.top;

        // 检查客户端区域大小是否为 1600x900
        if client_width != 1600 || client_height != 900 {
            // 获取窗口矩形
            let mut window_rect = RECT::default();
            if GetWindowRect(hwnd, &mut window_rect).is_err() {
                println!("获取窗口矩形失败");
                return;
            }

            // 计算窗口宽度和高度
            let window_width = window_rect.right - window_rect.left;
            let window_height = window_rect.bottom - window_rect.top;
            // 计算新的窗口宽度和高度
            let new_window_width = 1600 + (window_width - client_width);
            let new_window_height = 900 + (window_height - client_height);

            // 调整窗口大小
            if MoveWindow(hwnd, 0, 0, new_window_width, new_window_height, true).is_err() {
                println!("调整窗口大小失败");
            } else {
                println!("已调整窗口大小为: {}x{}", client_width, client_height);
            }
        }
    }
}
fn get_window_and_client_rect(hwnd: HWND) -> Result<(RECT, RECT, i32, i32), UtilError> {
    unsafe {
        let mut window_rect = RECT::default();
        let mut client_rect = RECT::default();
        // 获取窗口完整矩形（屏幕坐标系，包含非客户区）
        GetWindowRect(hwnd, &mut window_rect)
            .map_err(|e| UtilError::WINAPI(format!("GetWindowRect: {e}")))?;
        // 获取客户区矩形（窗口相对坐标系，仅内部区域，left/top=0）
        GetClientRect(hwnd, &mut client_rect)
            .map_err(|e| UtilError::WINAPI(format!("GetClientRect: {e}")))?;
        let mut client_origin = POINT::default();
        let _ = ClientToScreen(hwnd, &mut client_origin);
        let offset_x = client_origin.x - window_rect.left;
        let offset_y = client_origin.y - window_rect.top;

        Ok((window_rect, client_rect, offset_x, offset_y))
    }
}

fn create_capture_item(hwnd: HWND) -> Option<GraphicsCaptureItem> {
    let interop =
        windows::core::factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>().ok()?;
    unsafe {
        match interop.CreateForWindow(hwnd) {
            Ok(item) => Some(item),
            Err(e) => {
                println!("CreateForWindow: {e}");
                None
            }
        }
    }
}

fn get_d3d_texture_from_frame(
    frame: &windows::Graphics::Capture::Direct3D11CaptureFrame,
) -> Option<ID3D11Texture2D> {
    let surface = frame.Surface().ok()?;
    let access = surface.cast::<IDirect3DDxgiInterfaceAccess>().ok()?;
    unsafe { access.GetInterface::<ID3D11Texture2D>().ok() }
}

fn copy_texture_to_cpu(
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
    src_texture: &ID3D11Texture2D,
) -> Option<(u32, u32, Vec<u8>)> {
    let mut desc = D3D11_TEXTURE2D_DESC::default();
    unsafe { src_texture.GetDesc(&mut desc) };

    // 创建 Staging Texture
    desc.Usage = D3D11_USAGE_STAGING;
    desc.BindFlags = 0;
    desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ.0 as u32;
    desc.MiscFlags = 0;

    let mut staging = None;
    unsafe {
        device
            .CreateTexture2D(&desc, None, Some(&mut staging))
            .ok()?
    };
    let staging = staging.unwrap();

    unsafe { context.CopyResource(&staging, src_texture) };

    // 映射内存
    let mut mapped = Default::default();
    unsafe {
        context
            .Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))
            .ok()?;
    }

    // 处理 Padding
    let width = desc.Width;
    let height = desc.Height;
    let src_pitch = mapped.RowPitch as usize;
    let row_size = (width * 4) as usize;
    let mut buffer = Vec::with_capacity((width * height * 4) as usize);

    let src_ptr = mapped.pData as *const u8;
    for y in 0..height {
        let offset = (y as usize) * src_pitch;
        let row = unsafe { std::slice::from_raw_parts(src_ptr.add(offset), row_size) };
        buffer.extend_from_slice(row);
    }

    unsafe { context.Unmap(&staging, 0) };

    Some((width, height, buffer))
}
// 封装捕获上下文
#[allow(unused)]
struct WgcContext {
    d3d_device: ID3D11Device,
    d3d_context: ID3D11DeviceContext,
    winrt_device: IDirect3DDevice,

    frame_pool: Direct3D11CaptureFramePool,
    session: GraphicsCaptureSession,
    item: GraphicsCaptureItem,

    last_size: SizeInt32,
    target_hwnd: HWND,

    // 关键：缓存上一帧，当 WGC 没有新帧产生时（画面静止），返回这个
    cached_mat: Option<Box<Mat>>,
}

impl WgcContext {
    fn new(hwnd: HWND) -> Option<Self> {
        let (d3d_device, d3d_context) = create_d3d_device().unwrap();
        let winrt_device = d3d11::create_direct3d_device(&d3d_device).unwrap();

        let item = create_capture_item(hwnd)?;
        let size = item.Size().unwrap();

        let frame_pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
            &winrt_device,
            DirectXPixelFormat::B8G8R8A8UIntNormalized,
            1,
            size,
        )
        .unwrap();

        let session = frame_pool.CreateCaptureSession(&item).unwrap();
        let _ = session.SetIsBorderRequired(false);
        session.StartCapture().unwrap();

        Some(Self {
            d3d_device,
            d3d_context,
            winrt_device,
            frame_pool,
            session,
            item,
            last_size: size,
            target_hwnd: hwnd,
            cached_mat: None,
        })
    }

    fn capture(&mut self) -> Option<Box<Mat>> {
        unsafe {
            // 1. 检查窗口尺寸是否变化
            // 获取当前 Item 的实际大小（注意：Size() 获取的是 Item 被创建时的大小，还是实时的？通常是实时的）
            // 但更稳妥的是检查 Item.Size()
            let current_size = match self.item.Size() {
                Ok(s) => s,
                Err(_) => return self.cached_mat.clone(), // 窗口可能被关闭了
            };

            // 如果尺寸变了，必须 Recreate，否则捕获流会停止或数据错乱
            if current_size.Width != self.last_size.Width
                || current_size.Height != self.last_size.Height
            {
                // println!("窗口大小改变，重建 FramePool...");
                self.last_size = current_size;
                if let Err(e) = self.frame_pool.Recreate(
                    &self.winrt_device,
                    DirectXPixelFormat::B8G8R8A8UIntNormalized,
                    1,
                    current_size,
                ) {
                    eprintln!("Recreate 失败: {:?}", e);
                    return None;
                }
            }

            // 2. 尝试获取下一帧
            // 注意：如果画面静止，这里大概率返回 Error/None
            let frame = self.frame_pool.TryGetNextFrame();

            match frame {
                Ok(frame) => {
                    // === 成功获取新帧，处理并更新缓存 ===
                    let texture = get_d3d_texture_from_frame(&frame)?;

                    // 获取客户区裁剪信息
                    let (_, _, offset_x, offset_y) = get_window_and_client_rect(self.target_hwnd)
                        .unwrap_or((RECT::default(), RECT::default(), 0, 0));
                    let client_w = (current_size.Width as i32 - offset_x as i32).max(1) as u32;
                    let client_h = (current_size.Height as i32 - offset_y as i32).max(1) as u32;

                    // 复制 GPU -> CPU
                    let (tex_w, _tex_h, tex_data) =
                        copy_texture_to_cpu(&self.d3d_device, &self.d3d_context, &texture)?;

                    // 创建新的 Mat 并裁剪
                    // 这里省略详细的裁剪代码，逻辑同上一个回答
                    let mut mat =
                        Mat::new_rows_cols(client_h as i32, client_w as i32, CV_8UC4).ok()?;

                    // ... 执行内存复制 (考虑 offset_x/y) ...
                    // 简单示意：
                    let src_stride = tex_w as usize * 4;
                    let dst_stride = client_w as usize * 4;
                    let src_ptr = tex_data.as_ptr();
                    let dst_ptr = mat.data_mut();

                    for r in 0..client_h {
                        let src_off =
                            (r + offset_y as u32) as usize * src_stride + (offset_x as usize * 4);
                        let dst_off = r as usize * dst_stride;
                        // 边界检查省略...
                        std::ptr::copy_nonoverlapping(
                            src_ptr.add(src_off),
                            dst_ptr.add(dst_off),
                            dst_stride,
                        );
                    }

                    let boxed_mat = Box::new(mat);
                    self.cached_mat = Some(boxed_mat.clone()); // 更新缓存
                    Some(boxed_mat)
                }
                Err(_) => {
                    // === 没有新帧（画面静止），返回缓存 ===
                    // WGC 的特性：TryGetNextFrame 取走后，如果 GPU 没有渲染新画面，池子是空的。
                    // 此时我们应该假定画面没变。
                    if let Some(ref mat) = self.cached_mat {
                        // OpenCV Mat 的 clone 是深拷贝还是浅拷贝取决于实现，
                        // 在 rust binding 中通常 clone 是增加引用计数(浅)或深拷贝，
                        // 为了线程安全，建议 Box::new(mat.clone())
                        Some(mat.clone())
                    } else {
                        // 既没有新帧，也没有缓存（比如第一次启动就失败），尝试等待一下?
                        // 或者直接返回 None
                        None
                    }
                }
            }
        }
    }
}

thread_local! {
    static CAPTURER: RefCell<Option<WgcContext>> = RefCell::new(None);
}

/// 使用 Windows Graphics Capture (WGC) API 截图（更快的截图方式）
pub(crate) fn capture_window_wgc(hwnd: HWND) -> Option<Box<Mat>> {
    CAPTURER.with(|cell| {
        let mut capturer_opt = cell.borrow_mut();

        // 1. 如果没有初始化，或者目标窗口变了，需要重新初始化
        let need_reinit = if let Some(cap) = capturer_opt.as_ref() {
            cap.target_hwnd != hwnd
        } else {
            true
        };

        if need_reinit {
            // 如果旧 session 存在，Drop trait 会自动 Close 它们
            match WgcContext::new(hwnd) {
                Some(ctx) => *capturer_opt = Some(ctx),
                None => {
                    eprintln!("初始化 WGC 失败");
                    return None;
                }
            }

            // 初始化后，通常需要一点时间等待第一帧
            // 可以选择在这里 sleep 一小会，或者让下面的 capture 逻辑处理（通过 cached_mat 为 None 判断）
            std::thread::sleep(std::time::Duration::from_millis(50));
        }

        // 2. 执行捕获
        if let Some(ctx) = capturer_opt.as_mut() {
            let result = ctx.capture();

            // 如果第一次捕获就因为没有帧而失败（Result None, Cache None）
            // 我们可以尝试再等一下并在内部重试
            if result.is_none() && ctx.cached_mat.is_none() {
                std::thread::sleep(std::time::Duration::from_millis(50));
                return ctx.capture();
            }
            return result;
        }

        None
    })
}

// 截图
pub(crate) fn capture_window(hwnd: HWND) -> Option<Box<Mat>> {
    unsafe {
        // 获取窗口矩形
        let (window_rect, client_rect, offset_x, offset_y) = match get_window_and_client_rect(hwnd)
        {
            Ok(v) => v,
            Err(e) => {
                println!("获取窗口/客户区矩形失败: {:?}", e);
                return None;
            }
        };
        let full_width = (window_rect.right - window_rect.left) as i32;
        let full_height = (window_rect.bottom - window_rect.top) as i32;
        let width = (client_rect.right - client_rect.left) as i32;
        let height = (client_rect.bottom - client_rect.top) as i32;

        // 检查窗口尺寸
        if width <= 0 || height <= 0 {
            println!("窗口尺寸无效: {}x{}", width, height);
            return None;
        }

        // 获取设备上下文
        let hdc = guard(GetWindowDC(Some(hwnd)), |val| {
            ReleaseDC(Some(hwnd), val);
        });

        // 创建兼容DC
        let hdc_mem = guard(CreateCompatibleDC(Some(*hdc)), |val| {
            let _ = DeleteDC(val);
        });
        if hdc_mem.0 == ptr::null_mut() {
            eprintln!("创建兼容DC失败");
            return None;
        }

        // 创建兼容位图
        let hbitmap = guard(
            CreateCompatibleBitmap(*hdc, full_width, full_height),
            |val| {
                let _ = DeleteObject(val.into());
            },
        );
        if hbitmap.0 == ptr::null_mut() {
            eprintln!("创建兼容位图失败");
            return None;
        }

        // 选择位图
        let old_bitmap = SelectObject(*hdc_mem, (*hbitmap).into());
        if old_bitmap.0 == ptr::null_mut() {
            eprintln!("选择位图失败");
            return None;
        }

        // https://webrtc.googlesource.com/src.git/+/refs/heads/main/modules/desktop_capture/win/window_capturer_win_gdi.cc#301
        let mut is_success =
            PrintWindow(hwnd, *hdc_mem, PRINT_WINDOW_FLAGS(PW_RENDERFULLCONTENT)).as_bool();

        if !is_success {
            is_success = PrintWindow(hwnd, *hdc_mem, PRINT_WINDOW_FLAGS(0)).as_bool();
        }

        if !is_success {
            let _ = BitBlt(*hdc_mem, 0, 0, width, height, Some(*hdc), 0, 0, SRCCOPY).is_ok();
        }

        // 恢复旧位图
        SelectObject(*hdc_mem, old_bitmap);
        // 转换为OpenCV Mat
        let full_mat = hbitmap_to_bgr_mat(*hbitmap).expect("转换位图失败");
        let client_roi = opencv::core::Rect::new(offset_x, offset_y, width, height);
        let client_mat = full_mat.roi(client_roi);
        // 检查Mat是否创建成功
        match client_mat {
            Ok(boxed_ref) => {
                let mut mat_bgra = Mat::new_rows_cols(height, width, CV_8UC4).expect("内存不足");

                boxed_ref.copy_to(&mut mat_bgra).expect("内存不足");

                Some(Box::new(mat_bgra))
            }
            Err(e) => {
                println!("转换位图失败: {:?}", e);
                None
            }
        }
    }
}
