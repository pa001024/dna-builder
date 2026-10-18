use crate::submodules::d3d11::{self, create_d3d_device};
use crate::submodules::script::should_stop_current_script;
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
    sync::{Arc, Condvar, Mutex},
    time::{Duration, Instant},
};
use thiserror::Error;
use windows::{
    Foundation::TypedEventHandler,
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

/// 检查并调整窗口大小。
///
/// - `target_width/target_height` 为目标客户区宽高；
/// - 当客户区尺寸不一致时，将窗口调整到目标尺寸（位置保持旧逻辑：移动到 0,0）。
pub(crate) fn check_size(hwnd: HWND, target_width: i32, target_height: i32) -> bool {
    use windows::Win32::Foundation::RECT;
    use windows::Win32::UI::WindowsAndMessaging::{GetClientRect, GetWindowRect, MoveWindow};

    if hwnd.is_invalid() {
        return false;
    }

    unsafe {
        // 获取客户端区域矩形
        let mut client_rect = RECT::default();
        if GetClientRect(hwnd, &mut client_rect).is_err() {
            println!("获取客户端区域失败");
            return false;
        }

        // 计算客户端区域宽度和高度
        let client_width = client_rect.right - client_rect.left;
        let client_height = client_rect.bottom - client_rect.top;

        // 检查客户端区域大小是否为目标宽高
        if client_width != target_width || client_height != target_height {
            // 获取窗口矩形
            let mut window_rect = RECT::default();
            if GetWindowRect(hwnd, &mut window_rect).is_err() {
                println!("获取窗口矩形失败");
                return false;
            }

            // 计算窗口宽度和高度
            let window_width = window_rect.right - window_rect.left;
            let window_height = window_rect.bottom - window_rect.top;
            // 计算新的窗口宽度和高度
            let new_window_width = target_width + (window_width - client_width);
            let new_window_height = target_height + (window_height - client_height);

            // 调整窗口大小
            if MoveWindow(hwnd, 0, 0, new_window_width, new_window_height, true).is_err() {
                return false;
            }
        }
    }

    true
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

/// 为窗口创建 WGC 采集项。
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

/// 从采集帧提取 D3D 纹理。
fn get_d3d_texture_from_frame(
    frame: &windows::Graphics::Capture::Direct3D11CaptureFrame,
) -> Option<ID3D11Texture2D> {
    let surface = frame.Surface().ok()?;
    let access = surface.cast::<IDirect3DDxgiInterfaceAccess>().ok()?;
    unsafe { access.GetInterface::<ID3D11Texture2D>().ok() }
}

use std::collections::HashMap;

/// 会话空闲回收超时，超时未被取帧则关闭释放系统资源。
const WGC_SERVER_IDLE_TIMEOUT: Duration = Duration::from_secs(60);
/// 对齐几何缓存有效期。
const WGC_ALIGNMENT_TTL: Duration = Duration::from_millis(250);
/// 新建服务器后的首帧等待上限。
const WGC_FIRST_FRAME_WAIT: Duration = Duration::from_millis(100);

/// 可复用的 CPU 可读 Staging 纹理，只按 ROI 尺寸创建。
struct CpuStagingSurface {
    texture: ID3D11Texture2D,
    width: u32,
    height: u32,
    format_code: i32,
}

/// 确保 Staging 纹理与源尺寸/格式匹配，失配时重建。
fn ensure_cpu_staging_surface(
    device: &ID3D11Device,
    staging_surface: &mut Option<CpuStagingSurface>,
    src_desc: &D3D11_TEXTURE2D_DESC,
) -> Option<ID3D11Texture2D> {
    let need_recreate = staging_surface
        .as_ref()
        .map(|state| {
            state.width != src_desc.Width
                || state.height != src_desc.Height
                || state.format_code != src_desc.Format.0
        })
        .unwrap_or(true);

    if need_recreate {
        let mut staging_desc = *src_desc;
        staging_desc.Usage = D3D11_USAGE_STAGING;
        staging_desc.BindFlags = 0;
        staging_desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ.0 as u32;
        staging_desc.MiscFlags = 0;

        let mut staging_tex = None;
        unsafe {
            device
                .CreateTexture2D(&staging_desc, None, Some(&mut staging_tex))
                .ok()?
        };
        let staging_tex = staging_tex?;
        *staging_surface = Some(CpuStagingSurface {
            texture: staging_tex.clone(),
            width: src_desc.Width,
            height: src_desc.Height,
            format_code: src_desc.Format.0,
        });
    }

    staging_surface.as_ref().map(|state| state.texture.clone())
}

#[derive(Default)]
/// 采集运行计数。
struct WgcStats {
    gpu_frames: u64,
    fetches: u64,
    cache_hits: u64,
    readbacks: u64,
    readback_us: u64,
    gdi_fallbacks: u64,
}

/// 常驻 GPU 采集管线：持续会话 + 持有最新帧的常驻纹理。
struct GpuPipeline {
    d3d_device: ID3D11Device,
    d3d_context: ID3D11DeviceContext,
    winrt_device: IDirect3DDevice,

    frame_pool: Direct3D11CaptureFramePool,
    session: GraphicsCaptureSession,
    item: GraphicsCaptureItem,

    last_size: SizeInt32,
    target_hwnd: HWND,

    latest_gpu: Option<ID3D11Texture2D>,
    latest_gpu_w: u32,
    latest_gpu_h: u32,
    latest_gpu_format: i32,
    published_seq: u64,

    staging_surface: Option<CpuStagingSurface>,
    frame_arrived_token: Option<i64>,
    alignment_cache: Option<(i32, i32, i32, i32, i32, i32)>,
    alignment_cached_at: Option<Instant>,
}

impl GpuPipeline {
    /// 发布一帧到常驻 GPU 纹理，仅 GPU 拷贝，无 CPU 回读。
    fn publish_frame(&mut self, frame: Direct3D11CaptureFrame, stats: &mut WgcStats) {
        let texture = match get_d3d_texture_from_frame(&frame) {
            Some(t) => t,
            None => return,
        };
        let mut tex_desc = D3D11_TEXTURE2D_DESC::default();
        unsafe { texture.GetDesc(&mut tex_desc) };
        if tex_desc.Width == 0 || tex_desc.Height == 0 {
            return;
        }

        if let Ok(content) = frame.ContentSize() {
            if content.Width != self.last_size.Width || content.Height != self.last_size.Height {
                self.last_size = content;
                let _ = self.frame_pool.Recreate(
                    &self.winrt_device,
                    DirectXPixelFormat::B8G8R8A8UIntNormalized,
                    2,
                    content,
                );
            }
        }

        let need_recreate = self
            .latest_gpu
            .as_ref()
            .map(|_| {
                self.latest_gpu_w != tex_desc.Width
                    || self.latest_gpu_h != tex_desc.Height
                    || self.latest_gpu_format != tex_desc.Format.0
            })
            .unwrap_or(true);
        if need_recreate {
            let mut gpu_desc = tex_desc;
            gpu_desc.Usage = D3D11_USAGE_DEFAULT;
            gpu_desc.BindFlags = 0;
            gpu_desc.CPUAccessFlags = 0;
            gpu_desc.MiscFlags = 0;
            let mut gpu_tex = None;
            let created = unsafe {
                self.d3d_device
                    .CreateTexture2D(&gpu_desc, None, Some(&mut gpu_tex))
                    .is_ok()
            };
            if !created {
                return;
            }
            match gpu_tex {
                Some(t) => {
                    self.latest_gpu = Some(t);
                    self.latest_gpu_w = tex_desc.Width;
                    self.latest_gpu_h = tex_desc.Height;
                    self.latest_gpu_format = tex_desc.Format.0;
                }
                None => return,
            }
        }

        let src_res: ID3D11Texture2D = texture;
        let Some(dst_tex) = self.latest_gpu.clone() else {
            return;
        };
        let (Ok(dst_res), Ok(src_res)) = (
            dst_tex.cast::<ID3D11Resource>(),
            src_res.cast::<ID3D11Resource>(),
        ) else {
            return;
        };
        unsafe { self.d3d_context.CopyResource(&dst_res, &src_res) };
        self.published_seq = self.published_seq.wrapping_add(1);
        stats.gpu_frames += 1;
    }

    /// 计算客户区在纹理中的可视区域。
    /// 返回 `(client_w, client_h, view_w, view_h, crop_x, crop_y)`，前两者为逻辑尺寸，后四者为纹理像素。
    fn source_view(&mut self, tex_w: i32, tex_h: i32) -> Option<(i32, i32, i32, i32, i32, i32)> {
        let should_refresh = self
            .alignment_cached_at
            .map(|ts| ts.elapsed() >= WGC_ALIGNMENT_TTL)
            .unwrap_or(true);
        if should_refresh {
            self.alignment_cache = get_window_and_client_rect_for_wgc(self.target_hwnd)
                .ok()
                .map(|(window_rect, client_rect, ox, oy)| {
                    (
                        (window_rect.right - window_rect.left).max(1),
                        (window_rect.bottom - window_rect.top).max(1),
                        (client_rect.right - client_rect.left).max(1),
                        (client_rect.bottom - client_rect.top).max(1),
                        ox.max(0),
                        oy.max(0),
                    )
                });
            self.alignment_cached_at = Some(Instant::now());
        }
        let (window_w, window_h, client_w, client_h, offset_x, offset_y) = self
            .alignment_cache
            .unwrap_or((tex_w, tex_h, tex_w, tex_h, 0, 0));

        let tex_w_f = tex_w as f64;
        let tex_h_f = tex_h as f64;
        let sx_window = tex_w_f / window_w as f64;
        let sy_window = tex_h_f / window_h as f64;
        let sx_client = tex_w_f / client_w as f64;
        let sy_client = tex_h_f / client_h as f64;

        let (view_w, view_h, crop_x, crop_y) =
            if (sx_window - sy_window).abs() + 1e-6 < (sx_client - sy_client).abs() {
                let crop_x = ((offset_x as f64) * sx_window).round() as i32;
                let crop_y = ((offset_y as f64) * sy_window).round() as i32;
                let crop_x = crop_x.clamp(0, tex_w - 1);
                let crop_y = crop_y.clamp(0, tex_h - 1);
                let view_w = ((client_w as f64) * sx_window).round() as i32;
                let view_h = ((client_h as f64) * sy_window).round() as i32;
                let view_w = view_w.clamp(1, tex_w - crop_x);
                let view_h = view_h.clamp(1, tex_h - crop_y);
                (view_w, view_h, crop_x, crop_y)
            } else {
                let view_w = client_w.min(tex_w).max(1);
                let view_h = client_h.min(tex_h).max(1);
                (view_w, view_h, 0, 0)
            };
        Some((client_w, client_h, view_w, view_h, crop_x, crop_y))
    }

    /// 从常驻 GPU 纹理回读 ROI，输出 BGR Mat。
    fn readback_roi(&mut self, roi: Option<(i32, i32, i32, i32)>) -> Option<Box<Mat>> {
        let gpu = self.latest_gpu.clone()?;
        let tex_w = self.latest_gpu_w as i32;
        let tex_h = self.latest_gpu_h as i32;

        let (client_w, client_h, view_w, view_h, crop_x, crop_y) =
            self.source_view(tex_w, tex_h)?;
        let (roi_x, roi_y, roi_w, roi_h) = normalize_roi_in_bounds(client_w, client_h, roi)?;
        let src_box = compute_roi_box(
            tex_w, tex_h, client_w, client_h, view_w, view_h, crop_x, crop_y, roi_x, roi_y, roi_w,
            roi_h,
        )?;
        let out_w = (src_box.2 - src_box.0).max(1);
        let out_h = (src_box.3 - src_box.1).max(1);

        let mut want_desc = D3D11_TEXTURE2D_DESC::default();
        unsafe { gpu.GetDesc(&mut want_desc) };
        want_desc.Width = out_w as u32;
        want_desc.Height = out_h as u32;
        let staging =
            ensure_cpu_staging_surface(&self.d3d_device, &mut self.staging_surface, &want_desc)?;

        let src_box_d3d = D3D11_BOX {
            left: src_box.0 as u32,
            top: src_box.1 as u32,
            front: 0,
            right: src_box.2 as u32,
            bottom: src_box.3 as u32,
            back: 1,
        };
        let (Ok(dst_res), Ok(src_res)) = (
            staging.cast::<ID3D11Resource>(),
            gpu.cast::<ID3D11Resource>(),
        ) else {
            return None;
        };
        unsafe {
            self.d3d_context.CopySubresourceRegion(
                &dst_res,
                0,
                0,
                0,
                0,
                &src_res,
                0,
                Some(&src_box_d3d as *const D3D11_BOX),
            )
        };

        let mut mapped = Default::default();
        unsafe {
            self.d3d_context
                .Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))
                .ok()?;
        }
        let _unmap_guard = guard((), |_| unsafe { self.d3d_context.Unmap(&staging, 0) });

        let mut mat_bgra = unsafe { Mat::new_rows_cols(out_h, out_w, CV_8UC4).ok()? };
        let src_stride = mapped.RowPitch as usize;
        let dst_stride = out_w as usize * 4;
        let src_ptr = mapped.pData as *const u8;
        let dst_ptr = mat_bgra.data_mut();
        if src_stride == dst_stride {
            unsafe {
                std::ptr::copy_nonoverlapping(src_ptr, dst_ptr, dst_stride * out_h as usize);
            }
        } else {
            for r in 0..out_h {
                let src_off = r as usize * src_stride;
                let dst_off = r as usize * dst_stride;
                unsafe {
                    std::ptr::copy_nonoverlapping(
                        src_ptr.add(src_off),
                        dst_ptr.add(dst_off),
                        dst_stride,
                    );
                }
            }
        }

        let mut mat_bgr = Mat::default();
        imgproc::cvt_color(&mat_bgra, &mut mat_bgr, imgproc::COLOR_BGRA2BGR, 0).ok()?;
        Some(Box::new(mat_bgr))
    }
}

impl Drop for GpuPipeline {
    fn drop(&mut self) {
        if let Some(token) = self.frame_arrived_token.take() {
            let _ = self.frame_pool.RemoveFrameArrived(token);
        }
        let _ = self.session.Close();
        let _ = self.frame_pool.Close();
    }
}

/// 将逻辑 ROI 映射为纹理像素盒 `(x0, y0, x1, y1)`，非法返回 `None`。
/// `tex_*` 为纹理尺寸，`client_*` 为逻辑客户区尺寸，`view_*/crop_*` 描述客户区在纹理中的位置，`roi_*` 为已归一化的逻辑 ROI。
fn compute_roi_box(
    tex_w: i32,
    tex_h: i32,
    client_w: i32,
    client_h: i32,
    view_w: i32,
    view_h: i32,
    crop_x: i32,
    crop_y: i32,
    roi_x: i32,
    roi_y: i32,
    roi_w: i32,
    roi_h: i32,
) -> Option<(i32, i32, i32, i32)> {
    if tex_w <= 0 || tex_h <= 0 || client_w <= 0 || client_h <= 0 {
        return None;
    }
    if roi_w <= 0 || roi_h <= 0 {
        return None;
    }
    let sx = view_w as f64 / client_w as f64;
    let sy = view_h as f64 / client_h as f64;
    let x0 = crop_x + (roi_x as f64 * sx).round() as i32;
    let y0 = crop_y + (roi_y as f64 * sy).round() as i32;
    let w = (roi_w as f64 * sx).round() as i32;
    let h = (roi_h as f64 * sy).round() as i32;
    if w <= 0 || h <= 0 {
        return None;
    }
    let x0 = x0.clamp(0, tex_w);
    let y0 = y0.clamp(0, tex_h);
    let x1 = (x0 as i64 + w as i64).clamp(0, tex_w as i64) as i32;
    let y1 = (y0 as i64 + h as i64).clamp(0, tex_h as i64) as i32;
    if x1 <= x0 || y1 <= y0 {
        return None;
    }
    Some((x0, y0, x1, y1))
}

/// 无新帧时复用的 CPU 帧缓存。
struct CpuFrameCache {
    mat: Option<Box<Mat>>,
    roi: Option<(i32, i32, i32, i32)>,
    seq: u64,
}

/// per-hwnd 常驻采集服务器，归属脚本执行线程。
struct WgcCaptureServer {
    pipeline: GpuPipeline,
    cpu_cache: CpuFrameCache,
    frame_signal: Arc<(Mutex<u64>, Condvar)>,
    frame_seen: u64,
    last_fetch: Instant,
    stats: WgcStats,
}

impl WgcCaptureServer {
    /// 启动指定窗口的常驻采集服务器。
    fn start(hwnd: HWND) -> Option<Self> {
        let (d3d_device, d3d_context) = create_d3d_device().ok()?;
        let winrt_device = d3d11::create_direct3d_device(&d3d_device).ok()?;

        let item = create_capture_item(hwnd)?;
        let size = item.Size().ok()?;
        if size.Width <= 0 || size.Height <= 0 {
            return None;
        }

        let frame_pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
            &winrt_device,
            DirectXPixelFormat::B8G8R8A8UIntNormalized,
            2,
            size,
        )
        .ok()?;

        let frame_signal = Arc::new((Mutex::new(0_u64), Condvar::new()));
        let signal_for_handler = frame_signal.clone();
        let frame_arrived_handler = TypedEventHandler::new(move |_, _| {
            if let Ok(mut seq) = signal_for_handler.0.lock() {
                *seq = seq.wrapping_add(1);
                signal_for_handler.1.notify_all();
            }
            Ok(())
        });
        let frame_arrived_token: Option<i64> = frame_pool.FrameArrived(&frame_arrived_handler).ok();

        let session = frame_pool.CreateCaptureSession(&item).ok()?;
        let _ = session.SetIsBorderRequired(false);
        session.StartCapture().ok()?;

        Some(Self {
            pipeline: GpuPipeline {
                d3d_device,
                d3d_context,
                winrt_device,
                frame_pool,
                session,
                item,
                last_size: size,
                target_hwnd: hwnd,
                latest_gpu: None,
                latest_gpu_w: 0,
                latest_gpu_h: 0,
                latest_gpu_format: 0,
                published_seq: 0,
                staging_surface: None,
                frame_arrived_token,
                alignment_cache: None,
                alignment_cached_at: None,
            },
            cpu_cache: CpuFrameCache {
                mat: None,
                roi: None,
                seq: 0,
            },
            frame_signal,
            frame_seen: 0,
            last_fetch: Instant::now(),
            stats: WgcStats::default(),
        })
    }

    /// 会话是否健康，失效时应重建。
    fn is_healthy(&self) -> bool {
        self.pipeline.item.Size().is_ok()
    }

    /// 排空帧池，只发布最新帧到常驻纹理，非阻塞。
    fn pump(&mut self) {
        let mut latest: Option<Direct3D11CaptureFrame> = None;
        loop {
            match self.pipeline.frame_pool.TryGetNextFrame() {
                Ok(frame) => latest = Some(frame),
                Err(_) => break,
            }
        }
        if let Some(frame) = latest {
            let (pipeline, stats) = (&mut self.pipeline, &mut self.stats);
            pipeline.publish_frame(frame, stats);
        }
    }

    /// 有界等待首帧，仅新建服务器后一次。
    fn wait_first_frame(&mut self) {
        if self.pipeline.published_seq > 0 {
            return;
        }
        let signal = self.frame_signal.clone();
        let deadline = Instant::now() + WGC_FIRST_FRAME_WAIT;
        while Instant::now() < deadline {
            if should_stop_current_script() {
                return;
            }
            let has_signal = match signal.0.lock() {
                Ok(seq) => {
                    if *seq > self.frame_seen {
                        self.frame_seen = *seq;
                        true
                    } else {
                        false
                    }
                }
                Err(_) => false,
            };
            if has_signal {
                self.pump();
                if self.pipeline.published_seq > 0 {
                    return;
                }
                continue;
            }
            let remain = deadline.saturating_duration_since(Instant::now());
            if remain.is_zero() {
                break;
            }
            let slice = remain.min(Duration::from_millis(20));
            let seen = self.frame_seen;
            if let Ok(guard) = signal.0.lock() {
                let (new_guard, _) = signal
                    .1
                    .wait_timeout_while(guard, slice, |seq| *seq <= seen)
                    .unwrap_or_else(|e| e.into_inner());
                if *new_guard > seen {
                    self.frame_seen = *new_guard;
                    drop(new_guard);
                    self.pump();
                    if self.pipeline.published_seq > 0 {
                        return;
                    }
                }
            }
        }
    }

    /// 取最新一帧；无新帧时复用缓存，冷启动返回 `None`。
    fn fetch(&mut self, roi: Option<(i32, i32, i32, i32)>) -> Option<Box<Mat>> {
        self.last_fetch = Instant::now();
        self.stats.fetches += 1;

        self.pump();

        if self.pipeline.published_seq == 0 {
            return None;
        }

        if self.cpu_cache.seq == self.pipeline.published_seq && self.cpu_cache.roi == roi {
            if let Some(mat) = self.cpu_cache.mat.as_ref() {
                self.stats.cache_hits += 1;
                return Some(mat.clone());
            }
        }

        let started = Instant::now();
        let result = self.pipeline.readback_roi(roi);
        if let Some(ref mat) = result {
            self.stats.readbacks += 1;
            self.stats.readback_us += started.elapsed().as_micros() as u64;
            self.cpu_cache.mat = Some(mat.clone());
            self.cpu_cache.roi = roi;
            self.cpu_cache.seq = self.pipeline.published_seq;
        }
        result
    }

    /// 复用同 ROI 陈旧缓存。
    fn cached_clone(&mut self, roi: Option<(i32, i32, i32, i32)>) -> Option<Box<Mat>> {
        if self.cpu_cache.roi != roi {
            return None;
        }
        let mat = self.cpu_cache.mat.as_ref()?;
        self.stats.cache_hits += 1;
        Some(mat.clone())
    }

    /// 单窗口运行计数 JSON 片段。
    fn stats_entry(&self, hwnd_key: isize) -> String {
        let avg_us = if self.stats.readbacks > 0 {
            self.stats.readback_us / self.stats.readbacks
        } else {
            0
        };
        format!(
            "{{\"hwnd\":{hwnd_key},\"hasFrame\":{},\
            \"gpuFrames\":{},\"fetches\":{},\"cacheHits\":{},\"readbacks\":{},\
            \"avgReadbackUs\":{avg_us},\"gdiFallbacks\":{}}}",
            self.pipeline.published_seq > 0,
            self.stats.gpu_frames,
            self.stats.fetches,
            self.stats.cache_hits,
            self.stats.readbacks,
            self.stats.gdi_fallbacks,
        )
    }
}

thread_local! {
    static WGC_SERVERS: RefCell<HashMap<isize, WgcCaptureServer>> = RefCell::new(HashMap::new());
}

/// 句柄是否仍然有效。
fn is_window_alive(hwnd: HWND) -> bool {
    unsafe { windows::Win32::UI::WindowsAndMessaging::IsWindow(Some(hwnd)).as_bool() }
}

/// WGC 截图（完整客户区）。
pub(crate) fn capture_window_wgc(hwnd: HWND) -> Option<Box<Mat>> {
    capture_window_wgc_roi_internal(hwnd, None)
}

/// WGC 截图并按 ROI 裁剪，ROI 相对客户区。
pub(crate) fn capture_window_wgc_roi(
    hwnd: HWND,
    x: i32,
    y: i32,
    w: i32,
    h: i32,
) -> Option<Box<Mat>> {
    capture_window_wgc_roi_internal(hwnd, Some((x, y, w, h)))
}

/// WGC 截图内部入口。
fn capture_window_wgc_roi_internal(
    hwnd: HWND,
    roi: Option<(i32, i32, i32, i32)>,
) -> Option<Box<Mat>> {
    if should_stop_current_script() {
        return None;
    }
    if !is_window_alive(hwnd) {
        WGC_SERVERS.with(|cell| {
            cell.borrow_mut().remove(&(hwnd.0 as isize));
        });
        return None;
    }

    WGC_SERVERS.with(|cell| {
        let mut servers = cell.borrow_mut();
        let key = hwnd.0 as isize;

        let now = Instant::now();
        servers.retain(|_, s| now.duration_since(s.last_fetch) < WGC_SERVER_IDLE_TIMEOUT);

        let need_spawn = match servers.get(&key) {
            Some(server) => !server.is_healthy(),
            None => true,
        };
        if need_spawn {
            servers.remove(&key);
            match WgcCaptureServer::start(hwnd) {
                Some(mut server) => {
                    server.wait_first_frame();
                    servers.insert(key, server);
                }
                None => {
                    drop(servers);
                    return capture_window_with_roi_internal(hwnd, roi);
                }
            }
        }

        let Some(server) = servers.get_mut(&key) else {
            return None;
        };
        if let Some(mat) = server.fetch(roi) {
            return Some(mat);
        }
        if let Some(mat) = server.cached_clone(roi) {
            return Some(mat);
        }

        server.stats.gdi_fallbacks += 1;
        drop(servers);
        capture_window_with_roi_internal(hwnd, roi)
    })
}

/// 运行计数 JSON，`hwnd` 为空时汇总全部服务器。
pub(crate) fn wgc_capture_stats_json(hwnd: Option<isize>) -> String {
    WGC_SERVERS.with(|cell| {
        let servers = cell.borrow();
        let mut entries = Vec::new();
        for (key, server) in servers.iter() {
            if let Some(filter) = hwnd {
                if *key != filter {
                    continue;
                }
            }
            entries.push(server.stats_entry(*key));
        }
        format!("{{\"servers\":[{}]}}", entries.join(","))
    })
}

#[cfg(test)]
mod wgc_server_tests {
    use super::*;

    #[test]
    fn roi_box_identity_at_full_scale() {
        let result = compute_roi_box(1600, 900, 1600, 900, 1600, 900, 0, 0, 100, 50, 200, 100);
        assert_eq!(result, Some((100, 50, 300, 150)));
    }

    #[test]
    fn roi_box_scales_with_dpi() {
        let result = compute_roi_box(2400, 1350, 1600, 900, 2400, 1350, 0, 0, 0, 30, 1600, 900);
        assert_eq!(result, Some((0, 45, 2400, 1350)));
    }

    #[test]
    fn roi_box_applies_window_frame_offset() {
        let result = compute_roi_box(1616, 939, 1600, 900, 1600, 900, 8, 30, 0, 0, 1600, 900);
        assert_eq!(result, Some((8, 30, 1608, 930)));
    }

    #[test]
    fn roi_box_clamps_and_rejects_invalid() {
        let result = compute_roi_box(800, 600, 800, 600, 800, 600, 0, 0, 700, 500, 200, 200);
        assert_eq!(result, Some((700, 500, 800, 600)));
        assert_eq!(
            compute_roi_box(800, 600, 800, 600, 800, 600, 0, 0, 10, 10, 0, 100),
            None
        );
        assert_eq!(
            compute_roi_box(800, 600, 800, 600, 800, 600, 0, 0, 900, 0, 100, 100),
            None
        );
    }

    #[test]
    fn stats_json_empty_without_servers() {
        let json = wgc_capture_stats_json(None);
        assert_eq!(json, "{\"servers\":[]}");
    }
}

// 截图（完整客户区）
pub(crate) fn capture_window(hwnd: HWND) -> Option<Box<Mat>> {
    capture_window_with_roi_internal(hwnd, None)
}

/// 截图并直接按 ROI 裁剪（ROI 相对客户区）。
pub(crate) fn capture_window_roi(hwnd: HWND, x: i32, y: i32, w: i32, h: i32) -> Option<Box<Mat>> {
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
