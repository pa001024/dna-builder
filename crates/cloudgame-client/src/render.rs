//! D3D11 硬件路径：MF 解码器直出 DXGI 纹理，VideoProcessor 做 NV12→BGRA 与缩放后呈现。
//! 对应官方 JS 的 WebCodecs(硬解) + WebGL/GPU 合成。

#![cfg(target_os = "windows")]

use anyhow::{Context, Result};
use windows::core::Interface;
use windows::Win32::Foundation::{HWND, RECT, TRUE};
use windows::Win32::Graphics::Direct3D::{
    D3D_DRIVER_TYPE_HARDWARE, D3D_FEATURE_LEVEL, D3D_FEATURE_LEVEL_10_0, D3D_FEATURE_LEVEL_10_1,
    D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_11_1,
};
use windows::Win32::Graphics::Direct3D11::*;
use windows::Win32::Graphics::Dxgi::Common::{
    DXGI_ALPHA_MODE_IGNORE, DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_FORMAT_UNKNOWN, DXGI_RATIONAL, DXGI_SAMPLE_DESC,
};
use windows::Win32::Graphics::Dxgi::{
    CreateDXGIFactory1, IDXGIFactory2, IDXGIOutput, IDXGISwapChain1, IDXGISwapChain2,
    DXGI_ERROR_WAS_STILL_DRAWING, DXGI_PRESENT_DO_NOT_WAIT, DXGI_SCALING_STRETCH,
    DXGI_SWAP_CHAIN_DESC1, DXGI_SWAP_CHAIN_FLAG, DXGI_SWAP_CHAIN_FLAG_FRAME_LATENCY_WAITABLE_OBJECT,
    DXGI_SWAP_EFFECT_FLIP_DISCARD, DXGI_USAGE_RENDER_TARGET_OUTPUT,
};
use windows::Win32::Media::MediaFoundation::{IMFDXGIDeviceManager, MFCreateDXGIDeviceManager};

const LEVELS: [D3D_FEATURE_LEVEL; 4] = [
    D3D_FEATURE_LEVEL_11_1,
    D3D_FEATURE_LEVEL_11_0,
    D3D_FEATURE_LEVEL_10_1,
    D3D_FEATURE_LEVEL_10_0,
];

/// 交换链创建标志。ResizeBuffers 必须原样带上它（DXGI 不允许增删该标志，
/// 传 0 会固定返回 DXGI_ERROR_INVALID_CALL，缩放永远失败）。
const SWAP_FLAGS: u32 = DXGI_SWAP_CHAIN_FLAG_FRAME_LATENCY_WAITABLE_OBJECT.0 as u32;

pub struct GpuContext {
    pub device: ID3D11Device,
    pub manager: IMFDXGIDeviceManager,
}

/// 建 D3D11 设备 + MF DXGI 设备管理器（供硬解 MFT 使用）。
pub fn create_context() -> Result<GpuContext> {
    unsafe {
        let mut device: Option<ID3D11Device> = None;
        let mut context: Option<ID3D11DeviceContext> = None;
        let mut level = D3D_FEATURE_LEVEL_11_0;
        D3D11CreateDevice(
            None::<&windows::Win32::Graphics::Dxgi::IDXGIAdapter>,
            D3D_DRIVER_TYPE_HARDWARE,
            Default::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT | D3D11_CREATE_DEVICE_VIDEO_SUPPORT,
            Some(&LEVELS),
            D3D11_SDK_VERSION,
            Some(&mut device),
            Some(&mut level),
            Some(&mut context),
        )
        .context("D3D11CreateDevice(VideoSupport)")?;
        let device = device.context("no d3d11 device")?;

        // VIDEO_SUPPORT 设备默认关闭多线程保护；MF 解码线程与渲染共用设备时必须手动开启
        if let Ok(mt) = device.cast::<windows::Win32::Graphics::Direct3D10::ID3D10Multithread>() {
            let prev = mt.SetMultithreadProtected(true);
            tracing::info!("d3d11 multithread protected (was {})", prev.as_bool());
        }

        let mut token = 0u32;
        let mut manager: Option<IMFDXGIDeviceManager> = None;
        MFCreateDXGIDeviceManager(&mut token, &mut manager).context("MFCreateDXGIDeviceManager")?;
        let manager = manager.context("no dxgi device manager")?;
        manager.ResetDevice(&device, token).context("ResetDevice")?;
        tracing::info!("D3D11 ready: feature_level={level:?} video_support=1");
        Ok(GpuContext { device, manager })
    }
}

struct Proc {
    en: ID3D11VideoProcessorEnumerator,
    vp: ID3D11VideoProcessor,
    coded_w: u32,
    coded_h: u32,
    disp_w: u32,
    disp_h: u32,
    out_w: u32,
    out_h: u32,
    /// 顶部自绘标题栏高度：视频只画在它下面
    top: u32,
}

pub struct GpuSink {
    device: ID3D11Device,
    swapchain: IDXGISwapChain1,
    vd: ID3D11VideoDevice,
    vc: ID3D11VideoContext,
    out_w: u32,
    out_h: u32,
    top: u32,
    /// DXGI 帧延迟等待句柄（0 = 不可用）
    frame_wait: isize,
    proc: Option<Proc>,
    in_views: Vec<(usize, u32, ID3D11VideoProcessorInputView)>,
    out_views: Vec<(usize, ID3D11VideoProcessorOutputView)>,
    /// 自有 NV12 中转纹理：解码器纹理池随时可能被复用，呈现前先拷一份
    copy_tex: Option<(ID3D11Texture2D, u32, u32)>,
    /// 最后一帧的有效画面尺寸（裁掉宏块对齐后的尺寸），重建 processor 后重绘断线卡片时要用
    last_disp: (u32, u32),
    /// 后备缓冲 RTV 缓存（重启加载页需要整块清黑；flip 链的后备缓冲在两张间轮换）
    rtvs: Vec<(usize, ID3D11RenderTargetView)>,
    /// 自绘覆盖层（0 标题栏 / 1 画质面板 / 2 断线卡片 / 3 重启加载页），每次呈现前贴到交换链
    overlays: [Option<Overlay>; 4],
}

struct Overlay {
    tex: ID3D11Texture2D,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
}

impl GpuSink {
    pub fn new(ctx: &GpuContext, hwnd: isize, w: u32, h: u32, top: u32) -> Result<Self> {
        let (w, h) = (w.max(2), h.max(2));
        unsafe {
            let factory: IDXGIFactory2 = CreateDXGIFactory1().context("CreateDXGIFactory1")?;
            let desc = DXGI_SWAP_CHAIN_DESC1 {
                Width: w,
                Height: h,
                Format: DXGI_FORMAT_B8G8R8A8_UNORM,
                Stereo: false.into(),
                SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                BufferUsage: DXGI_USAGE_RENDER_TARGET_OUTPUT,
                BufferCount: 2,
                Scaling: DXGI_SCALING_STRETCH,
                SwapEffect: DXGI_SWAP_EFFECT_FLIP_DISCARD,
                AlphaMode: DXGI_ALPHA_MODE_IGNORE,
                // 可等待帧延迟对象：Present 前先等 DWM 释放一帧（带超时），
                // 避免最大化↔全屏切换时 Present 永久阻塞解码线程（画面冻结、声音继续）
                Flags: SWAP_FLAGS,
            };
            let hwnd = HWND(hwnd as *mut _);
            let swapchain = factory
                .CreateSwapChainForHwnd(&ctx.device, hwnd, &desc, None, None::<&IDXGIOutput>)
                .context("CreateSwapChainForHwnd")?;
            let frame_wait = (|| -> Result<isize> {
                let sw2: IDXGISwapChain2 = swapchain.cast()?;
                sw2.SetMaximumFrameLatency(1)?;
                Ok(sw2.GetFrameLatencyWaitableObject().0 as isize)
            })()
            .unwrap_or_else(|e| {
                tracing::warn!("帧延迟等待对象不可用: {e:#}");
                0
            });
            let vd: ID3D11VideoDevice = ctx.device.cast().context("ID3D11VideoDevice")?;
            let context: ID3D11DeviceContext = ctx.device.GetImmediateContext()?;
            let vc: ID3D11VideoContext = context.cast().context("ID3D11VideoContext")?;
            tracing::info!("swapchain {w}x{h} ready");
            Ok(Self {
                device: ctx.device.clone(),
                swapchain,
                vd,
                vc,
                out_w: w,
                out_h: h,
                top,
                frame_wait,
                proc: None,
                in_views: Vec::new(),
                out_views: Vec::new(),
                copy_tex: None,
                last_disp: (0, 0),
                rtvs: Vec::new(),
                overlays: [None, None, None, None],
            })
        }
    }

    /// 上传覆盖层位图（BGRA，行宽 w*4）：slot 0=标题栏，1=控制中心面板，2=断线卡片。
    pub fn set_overlay(&mut self, slot: usize, x: u32, y: u32, pixels: &[u8], w: u32, h: u32) {
        if slot >= self.overlays.len() || w == 0 || h == 0 || pixels.len() < (w * h * 4) as usize {
            return;
        }
        unsafe {
            let need_new = match &self.overlays[slot] {
                Some(o) => (o.w, o.h) != (w, h),
                None => true,
            };
            if need_new {
                let desc = D3D11_TEXTURE2D_DESC {
                    Width: w,
                    Height: h,
                    MipLevels: 1,
                    ArraySize: 1,
                    Format: DXGI_FORMAT_B8G8R8A8_UNORM,
                    SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                    Usage: D3D11_USAGE_DEFAULT,
                    BindFlags: 0,
                    CPUAccessFlags: 0,
                    MiscFlags: 0,
                };
                let mut tex: Option<ID3D11Texture2D> = None;
                if self.device.CreateTexture2D(&desc, None, Some(&mut tex)).is_err() {
                    self.overlays[slot] = None;
                    return;
                }
                let Some(tex) = tex else {
                    self.overlays[slot] = None;
                    return;
                };
                self.overlays[slot] = Some(Overlay { tex, x, y, w, h });
            }
            if let Some(o) = &mut self.overlays[slot] {
                o.x = x;
                o.y = y;
                let Ok(ctx) = self.device.GetImmediateContext() else { return };
                ctx.UpdateSubresource(&o.tex, 0, None, pixels.as_ptr() as *const _, w * 4, 0);
            }
        }
    }

    pub fn clear_overlay(&mut self, slot: usize) {
        if slot < self.overlays.len() {
            self.overlays[slot] = None;
        }
    }

    pub fn resize(&mut self, w: u32, h: u32, top: u32) -> Result<()> {
        let (w, h) = (w.max(2), h.max(2));
        let size_changed = (w, h) != (self.out_w, self.out_h);
        if !size_changed && top == self.top {
            return Ok(());
        }
        self.top = top;
        self.proc = None;
        // 输入/输出视图都绑定在创建它们的 enumerator 上：processor 重建后必须一起丢弃，
        // 否则 VideoProcessorBlt 返回 E_INVALIDARG，画面停在最后一帧（最大化→无边框全屏即此路径）
        self.in_views.clear();
        self.out_views.clear();
        self.rtvs.clear();
        if size_changed {
            unsafe {
                self.swapchain
                    .ResizeBuffers(0, w, h, DXGI_FORMAT_UNKNOWN, DXGI_SWAP_CHAIN_FLAG(SWAP_FLAGS as i32))
                    .context("ResizeBuffers")?;
            }
            self.out_w = w;
            self.out_h = h;
            tracing::info!("swapchain resized {w}x{h} top={top}");
        }
        Ok(())
    }

    fn ensure_proc(&mut self, coded_w: u32, coded_h: u32, disp_w: u32, disp_h: u32) -> Result<()> {
        if let Some(p) = &self.proc {
            if (p.coded_w, p.coded_h, p.disp_w, p.disp_h, p.out_w, p.out_h, p.top)
                == (coded_w, coded_h, disp_w, disp_h, self.out_w, self.out_h, self.top)
            {
                return Ok(());
            }
        }
        self.proc = None;
        self.in_views.clear();
        self.out_views.clear();
        unsafe {
            let desc = D3D11_VIDEO_PROCESSOR_CONTENT_DESC {
                InputFrameFormat: D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE,
                InputFrameRate: DXGI_RATIONAL { Numerator: 60, Denominator: 1 },
                InputWidth: coded_w,
                InputHeight: coded_h,
                OutputFrameRate: DXGI_RATIONAL { Numerator: 60, Denominator: 1 },
                OutputWidth: self.out_w,
                OutputHeight: self.out_h,
                Usage: D3D11_VIDEO_USAGE_PLAYBACK_NORMAL,
            };
            let en = self.vd.CreateVideoProcessorEnumerator(&desc).context("vp enumerator")?;
            let vp = self.vd.CreateVideoProcessor(&en, 0).context("vp create")?;
            let _ = self.vc.VideoProcessorSetStreamFrameFormat(&vp, 0, D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE);
            // 输入 BT.709 limited(bitfield: YCbCr_Matrix=1, Nominal_Range=2)
            let cs_in = D3D11_VIDEO_PROCESSOR_COLOR_SPACE { _bitfield: (1 << 3) | (2 << 5) };
            self.vc.VideoProcessorSetStreamColorSpace(&vp, 0, &cs_in);
            // 输出 full-range RGB
            let cs_out = D3D11_VIDEO_PROCESSOR_COLOR_SPACE { _bitfield: 0 };
            self.vc.VideoProcessorSetOutputColorSpace(&vp, &cs_out);
            // 裁掉宏块对齐的行(如 1600x912 → 1600x900)
            let src = RECT { left: 0, top: 0, right: disp_w as i32, bottom: disp_h as i32 };
            self.vc.VideoProcessorSetStreamSourceRect(&vp, 0, true, Some(&src as *const RECT));
            let dst = RECT { left: 0, top: self.top as i32, right: self.out_w as i32, bottom: self.out_h as i32 };
            self.vc.VideoProcessorSetStreamDestRect(&vp, 0, true, Some(&dst as *const RECT));
            tracing::info!(
                "video processor: in={}x{} (disp {disp_w}x{disp_h}) out={}x{} top={}",
                coded_w, coded_h, self.out_w, self.out_h, self.top
            );
            self.proc = Some(Proc { en, vp, coded_w, coded_h, disp_w, disp_h, out_w: self.out_w, out_h: self.out_h, top: self.top });
        }
        Ok(())
    }

    fn ensure_copy(&mut self, w: u32, h: u32) -> Result<ID3D11Texture2D> {
        if let Some((t, cw, ch)) = &self.copy_tex {
            if (*cw, *ch) == (w, h) {
                return Ok(t.clone());
            }
        }
        self.in_views.clear();
        unsafe {
            let desc = D3D11_TEXTURE2D_DESC {
                Width: w.max(2),
                Height: h.max(2),
                MipLevels: 1,
                ArraySize: 1,
                Format: windows::Win32::Graphics::Dxgi::Common::DXGI_FORMAT_NV12,
                SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                Usage: D3D11_USAGE_DEFAULT,
                BindFlags: 0,
                CPUAccessFlags: 0,
                MiscFlags: 0,
            };
            let mut t: Option<ID3D11Texture2D> = None;
            self.device.CreateTexture2D(&desc, None, Some(&mut t)).context("copy texture")?;
            let t = t.context("no copy texture")?;
            self.copy_tex = Some((t.clone(), w, h));
            Ok(t)
        }
    }

    /// 把解码器输出的 NV12 纹理直接合成到窗口（GPU 内完成 YUV→RGB + 缩放）。
    /// 返回 false 表示这一帧因 DWM 尚未释放缓冲而跳过（非错误）。
    pub fn present(&mut self, tex: &ID3D11Texture2D, sub: u32, coded_w: u32, coded_h: u32, disp_w: u32, disp_h: u32) -> Result<bool> {
        static PN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let pn = PN.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        if pn < 3 {
            tracing::debug!("presententer {pn}: {coded_w}x{coded_h} sub={sub}");
        }
        unsafe {
            // 解码器纹理池在 sample 释放后立刻复用槽位，直接 Blt 可能读到下一帧/半更新内容。
            // 先拷进自有纹理再合成（WebCodecs 的 VideoFrame 也是快照语义）。
            let copy = self.ensure_copy(coded_w, coded_h)?;
            self.last_disp = (disp_w, disp_h);
            let ctx: ID3D11DeviceContext = self.device.GetImmediateContext()?;
            ctx.CopySubresourceRegion(&copy, 0, 0, 0, 0, tex, sub, None);
            let (tex, sub) = (&copy, 0u32);
            self.blit_present(tex, sub, coded_w, coded_h, disp_w, disp_h)
        }
    }

    /// 停流/断线时用最后一张中转纹理重画一次（只更新覆盖层，画面保持最后一帧）。
    pub fn repaint(&mut self) -> Result<()> {
        let Some((copy, cw, ch)) = self.copy_tex.clone() else {
            return Ok(());
        };
        // resize 后 processor 已被丢弃：用最后一帧的显示尺寸重建，否则断线卡片永远上不了屏
        let (dw, dh) = match &self.proc {
            Some(p) => (p.disp_w, p.disp_h),
            None => self.last_disp,
        };
        if dw == 0 || dh == 0 {
            return Ok(());
        }
        unsafe { self.blit_present(&copy, 0, cw, ch, dw, dh).map(|_| ()) }
    }

    /// 取后备缓冲的 RTV（缓存：flip 链两张缓冲轮换）。
    fn rtv_for(&mut self, bb: &ID3D11Texture2D) -> Option<ID3D11RenderTargetView> {
        let key = bb.as_raw() as usize;
        if !self.rtvs.iter().any(|(k, _)| *k == key) {
            let mut v: Option<ID3D11RenderTargetView> = None;
            unsafe { self.device.CreateRenderTargetView(bb, None, Some(&mut v)).ok()? };
            let v = v?;
            if self.rtvs.len() >= 4 {
                self.rtvs.clear();
            }
            self.rtvs.push((key, v));
        }
        self.rtvs.iter().find(|(k, _)| *k == key).map(|(_, v)| v.clone())
    }

    /// 后备缓冲清为纯黑（loading 页背景）。
    fn clear_bb(&mut self, bb: &ID3D11Texture2D) -> Result<()> {
        let rtv = self.rtv_for(bb).context("rtv")?;
        let ctx: ID3D11DeviceContext = unsafe { self.device.GetImmediateContext() }?;
        unsafe { ctx.ClearRenderTargetView(&rtv, &[0.0, 0.0, 0.0, 1.0]) };
        Ok(())
    }

    /// 只清标题栏条带：窗口刚缩放、新宽度的标题栏位图还没生成的那一帧，
    /// 条带不会被视频 Blt 覆盖，不清会露出黑条/垃圾。
    fn clear_strip(&mut self, bb: &ID3D11Texture2D) {
        if self.top == 0 || self.out_w == 0 {
            return;
        }
        let Some(rtv) = self.rtv_for(bb) else { return };
        let Ok(ctx) = (unsafe { self.device.GetImmediateContext() }) else { return };
        let Ok(ctx1) = ctx.cast::<ID3D11DeviceContext1>() else { return };
        let (r, g, b) = crate::ui::BAR_RGB;
        let color = [
            r as f32 / 255.0,
            g as f32 / 255.0,
            b as f32 / 255.0,
            1.0,
        ];
        let rect = [RECT { left: 0, top: 0, right: self.out_w as i32, bottom: self.top as i32 }];
        unsafe { ctx1.ClearView(&rtv, &color, Some(&rect)) };
    }

    fn blit_present(&mut self, tex: &ID3D11Texture2D, sub: u32, coded_w: u32, coded_h: u32, disp_w: u32, disp_h: u32) -> Result<bool> {
        unsafe {
            self.ensure_proc(coded_w, coded_h, disp_w, disp_h)?;
            let proc = self.proc.as_ref().unwrap();

            let key = tex.as_raw() as usize;
            let in_view = match self.in_views.iter().find(|(k, s, _)| *k == key && *s == sub) {
                Some((_, _, v)) => v.clone(),
                None => {
                    let desc = D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC {
                        FourCC: 0,
                        ViewDimension: D3D11_VPIV_DIMENSION_TEXTURE2D,
                        Anonymous: D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC_0 {
                            Texture2D: D3D11_TEX2D_VPIV { MipSlice: 0, ArraySlice: sub },
                        },
                    };
                    let mut view: Option<ID3D11VideoProcessorInputView> = None;
                    self.vd
                        .CreateVideoProcessorInputView(tex, &proc.en, &desc, Some(&mut view))
                        .context("input view")?;
                    let view = view.context("no input view")?;
                    if self.in_views.len() >= 8 {
                        self.in_views.clear();
                    }
                    self.in_views.push((key, sub, view.clone()));
                    view
                }
            };

            let bb: ID3D11Texture2D = self.swapchain.GetBuffer(0).context("GetBuffer")?;
            let okey = bb.as_raw() as usize;
            let out_view = match self.out_views.iter().find(|(k, _)| *k == okey) {
                Some((_, v)) => v.clone(),
                None => {
                    let desc = D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC {
                        ViewDimension: D3D11_VPOV_DIMENSION_TEXTURE2D,
                        Anonymous: D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC_0 {
                            Texture2D: D3D11_TEX2D_VPOV { MipSlice: 0 },
                        },
                    };
                    let mut view: Option<ID3D11VideoProcessorOutputView> = None;
                    self.vd
                        .CreateVideoProcessorOutputView(&bb, &proc.en, &desc, Some(&mut view))
                        .context("output view")?;
                    let view = view.context("no output view")?;
                    if self.out_views.len() >= 4 {
                        self.out_views.clear();
                    }
                    self.out_views.push((okey, view.clone()));
                    view
                }
            };

            let stream = D3D11_VIDEO_PROCESSOR_STREAM {
                Enable: TRUE,
                OutputIndex: 0,
                InputFrameOrField: 0,
                PastFrames: 0,
                FutureFrames: 0,
                ppPastSurfaces: std::ptr::null_mut(),
                pInputSurface: std::mem::ManuallyDrop::new(Some(in_view)),
                ppFutureSurfaces: std::ptr::null_mut(),
                ppPastSurfacesRight: std::ptr::null_mut(),
                pInputSurfaceRight: std::mem::ManuallyDrop::new(None),
                ppFutureSurfacesRight: std::ptr::null_mut(),
            };
            self.vc
                .VideoProcessorBlt(&proc.vp, &out_view, 0, &[stream])
                .context("VideoProcessorBlt")?;
            // 重启/重连 loading 页：先把后备缓冲清黑（盖住冻结的最后一帧），再贴精灵；
            // 标题栏/面板/断线卡片最后贴，保持在最上层
            let ctx: ID3D11DeviceContext = self.device.GetImmediateContext()?;
            let loading = self.overlays[3].as_ref().map(|o| (o.x, o.y, o.tex.clone()));
            if let Some((x, y, tex)) = loading {
                self.clear_bb(&bb)?;
                ctx.CopySubresourceRegion(&bb, 0, x, y, 0, &tex, 0, None);
            } else {
                self.clear_strip(&bb);
            }
            for (i, ov) in self.overlays[..3].iter().enumerate().filter_map(|(i, o)| o.as_ref().map(|o| (i, o))) {
                // 窗口刚缩放、标题栏覆盖层还是旧宽度时不上屏：否则交换链已经是新尺寸，
                // 旧标题栏只盖住左边一段，右侧留黑（缩放的瞬间非常明显）。
                if i == 0 && self.top > 0 && (ov.w != self.out_w || ov.h != self.top) {
                    continue;
                }
                ctx.CopySubresourceRegion(&bb, 0, ov.x, ov.y, 0, &ov.tex, 0, None);
            }
            // 同步到垂直空白（官方 JS 走 rAF）。DO_NOT_WAIT：DWM 长时间不释放后备缓冲时
            // （最大化↔无边框全屏切换）Present 会永久阻塞解码线程，画面冻结而声音继续；
            // 此时返回 DXGI_ERROR_WAS_STILL_DRAWING，跳过这一帧即可，线程继续跑看门狗/重画。
            if self.frame_wait != 0 {
                let r = windows::Win32::System::Threading::WaitForSingleObject(
                    windows::Win32::Foundation::HANDLE(self.frame_wait as *mut _),
                    20,
                );
                if r.0 != 0 {
                    return Ok(false);
                }
            }
            let hr = self.swapchain.Present(1, DXGI_PRESENT_DO_NOT_WAIT);
            if hr.is_ok() {
                Ok(true)
            } else if hr.0 == DXGI_ERROR_WAS_STILL_DRAWING.0 {
                Ok(false)
            } else {
                tracing::warn!("Present: {hr:?}");
                Ok(true)
            }
        }
    }

    /// 软解回退：把紧凑 NV12 上传到纹理，再走同一条 GPU 呈现路径。
    pub fn present_nv12(&mut self, data: &[u8], w: u32, h: u32) -> Result<bool> {
        unsafe {
            let (tw, th) = (w.max(2), h.max(2));
            let desc = D3D11_TEXTURE2D_DESC {
                Width: tw,
                Height: th,
                MipLevels: 1,
                ArraySize: 1,
                Format: windows::Win32::Graphics::Dxgi::Common::DXGI_FORMAT_NV12,
                SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                Usage: D3D11_USAGE_DEFAULT,
                BindFlags: 0,
                CPUAccessFlags: 0,
                MiscFlags: 0,
            };
            let mut tex: Option<ID3D11Texture2D> = None;
            self.device.CreateTexture2D(&desc, None, Some(&mut tex)).context("nv12 texture")?;
            let tex = tex.context("no texture")?;
            let context: ID3D11DeviceContext = self.device.GetImmediateContext()?;
            // 紧凑 NV12:Y(tw*th) + UV(tw*th/2)，行 pitch = tw
            if data.len() >= (tw as usize * th as usize * 3 / 2) {
                context.UpdateSubresource(&tex, 0, None, data.as_ptr() as *const _, tw, 0);
            }
            self.present(&tex, 0, tw, th, tw, th)
        }
    }
}
