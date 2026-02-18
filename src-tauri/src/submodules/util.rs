use crate::submodules::d3d11::{self, create_d3d_device};
use opencv::{
    core::{CV_8UC4, Mat},
    imgproc,
    prelude::*,
};
use scopeguard::guard;
use std::{
    cell::RefCell,
    mem::zeroed,
    ptr,
    time::{Duration, Instant},
};
use thiserror::Error;
use windows::{
    Graphics::{
        Capture::{
            Direct3D11CaptureFrame, Direct3D11CaptureFramePool, GraphicsCaptureItem,
            GraphicsCaptureSession,
        },
        DirectX::{Direct3D11::IDirect3DDevice, DirectXPixelFormat},
        SizeInt32,
    },
    Win32::{
        Foundation::{HWND, POINT, RECT},
        Graphics::{
            Direct3D11::*,
            Dwm::{DWMWA_EXTENDED_FRAME_BOUNDS, DwmGetWindowAttribute},
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

/// 获取 WGC 截图对齐所需的窗口/客户区信息。
///
/// 优先使用 DWM 的扩展窗口边界（不含阴影）作为基准矩形；
/// 若 DWM 调用失败，则退回 GetWindowRect。
fn get_window_and_client_rect_for_wgc(hwnd: HWND) -> Result<(RECT, RECT, i32, i32), UtilError> {
    unsafe {
        let mut base_rect = RECT::default();
        let mut client_rect = RECT::default();

        // 兜底：先拿到 GetWindowRect，供 DWM 失败时使用
        GetWindowRect(hwnd, &mut base_rect)
            .map_err(|e| UtilError::WINAPI(format!("GetWindowRect: {e}")))?;

        // 对齐 WGC：扩展边框矩形不包含阴影区域
        let mut dwm_rect = RECT::default();
        let dwm_result = DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut dwm_rect as *mut _ as *mut _,
            std::mem::size_of::<RECT>() as u32,
        );
        if dwm_result.is_ok() {
            base_rect = dwm_rect;
        }

        GetClientRect(hwnd, &mut client_rect)
            .map_err(|e| UtilError::WINAPI(format!("GetClientRect: {e}")))?;

        let mut client_origin = POINT::default();
        let _ = ClientToScreen(hwnd, &mut client_origin);
        let offset_x = client_origin.x - base_rect.left;
        let offset_y = client_origin.y - base_rect.top;

        Ok((base_rect, client_rect, offset_x, offset_y))
    }
}

/// 将 ROI 约束到给定边界内，返回 `(x, y, w, h)`。
///
/// 参数说明：
/// - `bound_w/bound_h`: 边界尺寸
/// - `roi`: 可选 `(x, y, w, h)`，坐标相对边界左上角
/// - 当 ROI 无效（宽高<=0 或与边界无交集）时返回 `None`。
fn normalize_roi_in_bounds(
    bound_w: i32,
    bound_h: i32,
    roi: Option<(i32, i32, i32, i32)>,
) -> Option<(i32, i32, i32, i32)> {
    if bound_w <= 0 || bound_h <= 0 {
        return None;
    }
    let Some((x, y, w, h)) = roi else {
        return Some((0, 0, bound_w, bound_h));
    };
    if w <= 0 || h <= 0 {
        return None;
    }

    let start_x = x.clamp(0, bound_w);
    let start_y = y.clamp(0, bound_h);
    let end_x = (x as i64 + w as i64).clamp(0, bound_w as i64) as i32;
    let end_y = (y as i64 + h as i64).clamp(0, bound_h as i64) as i32;
    let out_w = end_x - start_x;
    let out_h = end_y - start_y;
    if out_w <= 0 || out_h <= 0 {
        return None;
    }
    Some((start_x, start_y, out_w, out_h))
}

/// 对已有 Mat 按 ROI 裁剪并返回新图像。
fn crop_mat_with_roi(mat: &Mat, roi: (i32, i32, i32, i32)) -> Option<Box<Mat>> {
    let (x, y, w, h) = normalize_roi_in_bounds(mat.cols(), mat.rows(), Some(roi))?;
    let roi_rect = opencv::core::Rect::new(x, y, w, h);
    let roi_view = mat.roi(roi_rect).ok()?;
    let mut out = Mat::default();
    roi_view.copy_to(&mut out).ok()?;
    Some(Box::new(out))
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

    // 关键：缓存上一帧，当 WGC 没有新帧产生时（画面静止），可以兜底返回
    cached_mat: Option<Box<Mat>>,
    // 缓存帧生成时间，用于判断缓存是否过旧（避免返回明显滞后的图像）
    cached_at: Option<Instant>,
    // 最近一次成功返回的 WGC 帧时间戳（100ns 单位）
    last_frame_ticks: Option<i64>,
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
            cached_at: None,
            last_frame_ticks: None,
        })
    }

    /// 处理单帧数据并更新缓存。
    ///
    /// - `roi` 为 `None` 时返回完整客户区图像；
    /// - `roi` 为 `Some(x,y,w,h)` 时，直接在拷贝阶段输出 ROI 小图。
    fn process_new_frame(
        &mut self,
        frame: Direct3D11CaptureFrame,
        roi: Option<(i32, i32, i32, i32)>,
    ) -> Option<Box<Mat>> {
        // WGC 帧时间戳（100ns 单位），用于跨调用判断是否为“新帧”。
        let frame_ticks = frame.SystemRelativeTime().ok().map(|ts| ts.Duration);

        // === 成功获取新帧，处理并更新缓存 ===
        let texture = get_d3d_texture_from_frame(&frame)?;

        // 复制 GPU -> CPU
        let (tex_w, tex_h, tex_data) =
            copy_texture_to_cpu(&self.d3d_device, &self.d3d_context, &texture)?;

        // 计算输出尺寸与裁剪起点：
        // WGC 在不同窗口/系统配置下，可能返回“整窗帧”或“客户区帧”。
        // 这里通过比较两种假设下的横纵缩放一致性，自动选择更合理的裁剪策略。
        let (client_w, client_h, crop_x, crop_y) = {
            let (window_w, window_h, want_w, want_h, offset_x, offset_y) =
                get_window_and_client_rect_for_wgc(self.target_hwnd)
                    .map(|(window_rect, client_rect, ox, oy)| {
                        (
                            (window_rect.right - window_rect.left).max(1),
                            (window_rect.bottom - window_rect.top).max(1),
                            (client_rect.right - client_rect.left).max(1),
                            (client_rect.bottom - client_rect.top).max(1),
                            ox.max(0),
                            oy.max(0),
                        )
                    })
                    .unwrap_or((tex_w as i32, tex_h as i32, tex_w as i32, tex_h as i32, 0, 0));

            let tex_w_f = tex_w as f64;
            let tex_h_f = tex_h as f64;

            // 假设A：当前帧是“整窗帧”
            let sx_window = tex_w_f / window_w as f64;
            let sy_window = tex_h_f / window_h as f64;
            let anis_window = (sx_window - sy_window).abs();

            // 假设B：当前帧是“客户区帧”
            let sx_client = tex_w_f / want_w as f64;
            let sy_client = tex_h_f / want_h as f64;
            let anis_client = (sx_client - sy_client).abs();

            let use_window_crop = anis_window + 1e-6 < anis_client;

            if use_window_crop {
                let crop_x = ((offset_x as f64) * sx_window).round() as i32;
                let crop_y = ((offset_y as f64) * sy_window).round() as i32;
                let crop_x = crop_x.clamp(0, tex_w as i32 - 1);
                let crop_y = crop_y.clamp(0, tex_h as i32 - 1);

                let out_w = ((want_w as f64) * sx_window).round() as i32;
                let out_h = ((want_h as f64) * sy_window).round() as i32;
                let out_w = out_w.clamp(1, tex_w as i32 - crop_x);
                let out_h = out_h.clamp(1, tex_h as i32 - crop_y);

                (out_w, out_h, crop_x, crop_y)
            } else {
                // 客户区帧无需偏移裁剪，只按目标客户区尺寸截取（避免带到边框）
                let out_w = want_w.min(tex_w as i32).max(1);
                let out_h = want_h.min(tex_h as i32).max(1);
                (out_w, out_h, 0, 0)
            }
        };

        // 计算最终输出 ROI（相对客户区），并在拷贝阶段直接输出小图，避免二次裁剪。
        let (roi_x, roi_y, roi_w, roi_h) = normalize_roi_in_bounds(client_w, client_h, roi)?;

        // 创建 BGRA Mat 并完成客户端/ROI区域裁剪复制
        let mut mat_bgra = unsafe { Mat::new_rows_cols(roi_h, roi_w, CV_8UC4).ok()? };

        let src_stride = tex_w as usize * 4;
        let dst_stride = roi_w as usize * 4;
        let src_ptr = tex_data.as_ptr();
        let dst_ptr = mat_bgra.data_mut();

        for r in 0..roi_h {
            let src_off =
                (r + crop_y + roi_y) as usize * src_stride + ((crop_x + roi_x) as usize * 4);
            let dst_off = r as usize * dst_stride;
            unsafe {
                std::ptr::copy_nonoverlapping(
                    src_ptr.add(src_off),
                    dst_ptr.add(dst_off),
                    dst_stride,
                );
            }
        }

        // WGC 原始帧为 BGRA(4 通道)，为保持脚本侧一致性统一转换为 BGR(3 通道)
        let mut mat_bgr = Mat::default();
        imgproc::cvt_color(&mat_bgra, &mut mat_bgr, imgproc::COLOR_BGRA2BGR, 0).ok()?;

        let boxed_mat = Box::new(mat_bgr);
        // 仅完整客户区截图更新缓存，避免 ROI 小图污染缓存。
        if roi.is_none() {
            self.cached_mat = Some(boxed_mat.clone());
            self.cached_at = Some(Instant::now());
        }
        if let Some(ticks) = frame_ticks {
            self.last_frame_ticks = Some(ticks);
        }
        Some(boxed_mat)
    }

    /// 捕获窗口图像，可选 ROI 直接裁剪。
    fn capture_with_roi(&mut self, roi: Option<(i32, i32, i32, i32)>) -> Option<Box<Mat>> {
        // 1. 检查窗口尺寸是否变化
        let current_size = match self.item.Size() {
            Ok(s) => s,
            Err(_) => {
                return if let Some(roi_rect) = roi {
                    self.cached_mat
                        .as_ref()
                        .and_then(|cached| crop_mat_with_roi(cached.as_ref(), roi_rect))
                } else {
                    self.cached_mat.clone()
                };
            } // 窗口可能被关闭了
        };

        // 如果尺寸变了，必须 Recreate，否则捕获流会停止或数据错乱
        if current_size.Width != self.last_size.Width
            || current_size.Height != self.last_size.Height
        {
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

        // 2. 实时优先策略：
        // - 短间隔调用：直接等待“时间戳更大”的新帧。
        // - 长间隔调用：先清空已有队列（这些帧可能是历史积压），再等待后续新帧。
        let long_gap = self
            .cached_at
            .map(|ts| ts.elapsed() >= Duration::from_millis(33))
            .unwrap_or(true);

        let mut baseline_ticks = self.last_frame_ticks.unwrap_or(i64::MIN);
        if long_gap {
            // 先把当前积压帧全部取走并丢弃，避免返回“上次调用后积压的第一帧”。
            while let Ok(frame) = self.frame_pool.TryGetNextFrame() {
                let ticks = frame
                    .SystemRelativeTime()
                    .ok()
                    .map(|ts| ts.Duration)
                    .unwrap_or(i64::MIN);
                if ticks > baseline_ticks {
                    baseline_ticks = ticks;
                }
            }
        }

        // 长间隔给更长一点等待窗口，确保等到真正的新帧提交。
        let wait_ms = if long_gap { 90 } else { 35 };
        let deadline = Instant::now() + Duration::from_millis(wait_ms);
        let mut latest_frame: Option<Direct3D11CaptureFrame> = None;
        let mut latest_ticks = i64::MIN;
        loop {
            let mut got_any = false;
            while let Ok(frame) = self.frame_pool.TryGetNextFrame() {
                got_any = true;
                let ticks = frame
                    .SystemRelativeTime()
                    .ok()
                    .map(|ts| ts.Duration)
                    .unwrap_or(i64::MIN);
                if ticks >= latest_ticks {
                    latest_ticks = ticks;
                    latest_frame = Some(frame);
                }
            }

            if latest_frame.is_some() && latest_ticks > baseline_ticks {
                break;
            }
            if Instant::now() >= deadline {
                break;
            }

            if got_any {
                // 有帧但还不够新，短等下一轮提交。
                std::thread::sleep(Duration::from_millis(1));
            } else {
                std::thread::sleep(Duration::from_millis(2));
            }
        }

        if latest_frame.is_some() && latest_ticks > baseline_ticks {
            if let Some(frame) = latest_frame {
                return self.process_new_frame(frame, roi);
            }
        }

        // 3. WGC 未拿到“真正新帧”时，回退到 GDI 强制抓当前帧，避免滞后图像。
        if let Some(mat) = if let Some((x, y, w, h)) = roi {
            capture_window_roi(self.target_hwnd, x, y, w, h)
        } else {
            capture_window(self.target_hwnd)
        } {
            self.cached_mat = Some(mat.clone());
            self.cached_at = Some(Instant::now());
            return Some(mat);
        }

        // 4. 最后兜底：返回最近缓存
        if let Some(roi_rect) = roi {
            self.cached_mat
                .as_ref()
                .and_then(|cached| crop_mat_with_roi(cached.as_ref(), roi_rect))
        } else {
            self.cached_mat.clone()
        }
    }

}

thread_local! {
    static CAPTURER: RefCell<Option<WgcContext>> = RefCell::new(None);
}

/// 使用 Windows Graphics Capture (WGC) API 截图（更快的截图方式）
pub(crate) fn capture_window_wgc(hwnd: HWND) -> Option<Box<Mat>> {
    capture_window_wgc_roi_internal(hwnd, None)
}

/// 使用 Windows Graphics Capture (WGC) API 截图并直接按 ROI 裁剪。
pub(crate) fn capture_window_wgc_roi(
    hwnd: HWND,
    x: i32,
    y: i32,
    w: i32,
    h: i32,
) -> Option<Box<Mat>> {
    capture_window_wgc_roi_internal(hwnd, Some((x, y, w, h)))
}

/// WGC 截图内部入口：支持可选 ROI。
fn capture_window_wgc_roi_internal(
    hwnd: HWND,
    roi: Option<(i32, i32, i32, i32)>,
) -> Option<Box<Mat>> {
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
            let result = ctx.capture_with_roi(roi);

            // 如果第一次捕获就因为没有帧而失败（Result None, Cache None）
            // 我们可以尝试再等一下并在内部重试
            if result.is_none() && ctx.cached_mat.is_none() {
                std::thread::sleep(std::time::Duration::from_millis(50));
                return ctx.capture_with_roi(roi);
            }
            return result;
        }

        None
    })
}

// 截图（完整客户区）
pub(crate) fn capture_window(hwnd: HWND) -> Option<Box<Mat>> {
    capture_window_with_roi_internal(hwnd, None)
}

/// 截图并直接按 ROI 裁剪（ROI 相对客户区）。
pub(crate) fn capture_window_roi(
    hwnd: HWND,
    x: i32,
    y: i32,
    w: i32,
    h: i32,
) -> Option<Box<Mat>> {
    capture_window_with_roi_internal(hwnd, Some((x, y, w, h)))
}

/// GDI 截图内部入口：支持可选 ROI，并在一次 ROI 取图阶段直接返回结果。
fn capture_window_with_roi_internal(
    hwnd: HWND,
    roi: Option<(i32, i32, i32, i32)>,
) -> Option<Box<Mat>> {
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
        let (roi_x, roi_y, roi_w, roi_h) = normalize_roi_in_bounds(width, height, roi)?;
        let capture_roi = opencv::core::Rect::new(offset_x + roi_x, offset_y + roi_y, roi_w, roi_h);
        let client_mat = full_mat.roi(capture_roi);
        // 检查Mat是否创建成功
        match client_mat {
            Ok(boxed_ref) => {
                let mut mat_bgra = Mat::new_rows_cols(roi_h, roi_w, CV_8UC4).expect("内存不足");

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
