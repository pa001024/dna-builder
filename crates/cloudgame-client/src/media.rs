//! Media Foundation H264/H265 解码 + NV12→BGRA。

#![cfg(target_os = "windows")]

use anyhow::{Context, Result};
use windows::core::{GUID, Interface};
use windows::Win32::Graphics::Direct3D11::{
    ID3D11Device, ID3D11Texture2D, D3D11_BIND_RENDER_TARGET, D3D11_TEXTURE2D_DESC, D3D11_USAGE_DEFAULT,
};
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_NV12, DXGI_SAMPLE_DESC};
use windows::Win32::Media::MediaFoundation::*;
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};

/// 解码输出：硬解给 GPU 纹理（零拷贝交给 VideoProcessor），软解给紧凑 NV12。
pub enum VideoFrame {
    Texture {
        texture: ID3D11Texture2D,
        /// 持有到呈现完成，避免解码器提前回收该纹理槽位
        sample: IMFSample,
        sub: u32,
        coded_w: u32,
        coded_h: u32,
        disp_w: u32,
        disp_h: u32,
    },
    Nv12 {
        w: u32,
        h: u32,
        data: Vec<u8>,
    },
}

pub struct MfDecoder {
    transform: IMFTransform,
    output_type: IMFMediaType,
    input_ts: i64,
    /// 输出类型报告的编码尺寸（宏块对齐，如 1920x1088）。
    coded_w: u32,
    coded_h: u32,
    /// 显示尺寸（裁掉 SPS cropping，如 1920x1080）。
    disp_w: u32,
    disp_h: u32,
    provides_samples: bool,
    /// 硬解模式：输出 sample 需由本端提供 DXGI 纹理。
    device: Option<ID3D11Device>,
    /// 上一个输出帧的 sample time（检测解码器输出乱序）
    last_out_ts: i64,
    /// 已送入的输入帧数（用于度量解码器内部积压）
    in_n: u64,
}

// CLSID_CMSH264DecoderMFT / CLSID_CMSHEVCDecoderMFT（微软硬解 MFT）
const CLSID_H264: GUID = GUID::from_u128(0x62ce7e72_4c71_4d20_b15d_452831a87d9d);
const CLSID_HEVC: GUID = GUID::from_u128(0x9bf575f5_6d4c_4cd1_b8c1_3fdcc5f5c2cb);

static MF_INIT: std::sync::Once = std::sync::Once::new();

fn mf_init() {
    MF_INIT.call_once(|| unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let _ = MFStartup(MF_VERSION, MFSTARTUP_FULL);
    });
}

struct OutInfo {
    ty: IMFMediaType,
    coded_w: u32,
    coded_h: u32,
    disp_w: u32,
    disp_h: u32,
    provides: bool,
}

/// 选取 NV12 输出类型并读取真实帧尺寸。
/// 解码器会以 SPS 尺寸为准，输入类型里的尺寸只是协商提示。
fn negotiate(transform: &IMFTransform, fallback: (u32, u32)) -> Result<OutInfo> {
    unsafe {
        let mut chosen: Option<IMFMediaType> = None;
        for i in 0.. {
            match transform.GetOutputAvailableType(0, i) {
                Ok(t) => {
                    if let Ok(st) = t.GetGUID(&MF_MT_SUBTYPE) {
                        if st == MFVideoFormat_NV12 {
                            chosen = Some(t);
                            break;
                        }
                    }
                }
                Err(_) => break,
            }
        }
        let ty = chosen.context("decoder has no NV12 output type")?;
        transform.SetOutputType(0, &ty, 0)?;

        let packed = ty
            .GetUINT64(&MF_MT_FRAME_SIZE)
            .unwrap_or(((fallback.0 as u64) << 32) | fallback.1 as u64);
        let coded_w = (((packed >> 32) as u32).max(2)) & !1;
        let coded_h = (((packed & 0xFFFF_FFFF) as u32).max(2)) & !1;

        let (mut disp_w, mut disp_h) = (coded_w, coded_h);
        let mut blob = [0u8; 16];
        if ty.GetBlob(&MF_MT_MINIMUM_DISPLAY_APERTURE, &mut blob, None).is_ok() {
            let area: MFVideoArea = std::ptr::read_unaligned(blob.as_ptr().cast());
            let (cx, cy) = (area.Area.cx, area.Area.cy);
            if cx > 0 && cy > 0 && (cx as u32) <= coded_w && (cy as u32) <= coded_h {
                disp_w = (cx as u32) & !1;
                disp_h = (cy as u32) & !1;
            }
        }
        if disp_w == 0 || disp_h == 0 {
            (disp_w, disp_h) = (coded_w, coded_h);
        }

        let info = transform.GetOutputStreamInfo(0)?;
        let provides = (info.dwFlags & MFT_OUTPUT_STREAM_PROVIDES_SAMPLES.0 as u32) != 0;
        tracing::info!(
            "MF out: coded={}x{} disp={}x{} provides_samples={} flags=0x{:x} cbSize={}",
            coded_w, coded_h, disp_w, disp_h, provides, info.dwFlags, info.cbSize
        );
        Ok(OutInfo { ty, coded_w, coded_h, disp_w, disp_h, provides })
    }
}

/// H264/H265 MFT 的低延迟开关走 ICodecAPI（对应 WebCodecs optimizeForLatency）。
fn set_codec_low_latency(transform: &IMFTransform) {
    unsafe {
        let Ok(api) = transform.cast::<ICodecAPI>() else {
            tracing::warn!("MFT 不实现 ICodecAPI，无法设置低延迟");
            return;
        };
        let supported = api.IsSupported(&CODECAPI_AVLowLatencyMode).is_ok();
        let mut v = windows::Win32::System::Variant::VARIANT::default();
        let inner = &mut *v.Anonymous.Anonymous;
        inner.vt = windows::Win32::System::Variant::VT_UI4;
        inner.Anonymous.ulVal = 1;
        let r = api.SetValue(&CODECAPI_AVLowLatencyMode, &v);
        match &r {
            Ok(()) => tracing::info!("CODECAPI_AVLowLatencyMode=1 (supported={supported})"),
            Err(e) => tracing::warn!("CODECAPI_AVLowLatencyMode 设置失败: {e:?} (supported={supported})"),
        }
    }
}

impl MfDecoder {
    /// 软件解码（CPU 输出 NV12）。codec: 1=H264, 2=H265。
    pub fn new(codec: i32, width: u32, height: u32) -> Result<Self> {
        Self::build(codec, width, height, None)
    }

    /// 硬件解码：MFT 直出 DXGI 纹理（对应官方 WebCodecs hardwareAcceleration）。
    pub fn new_hw(
        codec: i32,
        width: u32,
        height: u32,
        device: &ID3D11Device,
        manager: &IMFDXGIDeviceManager,
    ) -> Result<Self> {
        Self::build(codec, width, height, Some((device, manager)))
    }

    fn build(
        codec: i32,
        width: u32,
        height: u32,
        hw: Option<(&ID3D11Device, &IMFDXGIDeviceManager)>,
    ) -> Result<Self> {
        mf_init();
        unsafe {
            let clsid = if codec == 2 { CLSID_HEVC } else { CLSID_H264 };
            let transform: IMFTransform =
                CoCreateInstance(&clsid, None, CLSCTX_INPROC_SERVER).context("create decoder MFT")?;

            // 官方 WebCodecs 用 optimizeForLatency；不设时 MFT 会缓冲约 30 帧再批量吐。
            // MF_LOW_LATENCY 是管道提示，H264 MFT 真正认的是 ICodecAPI 的低延迟码流参数。
            if let Ok(attrs) = transform.GetAttributes() {
                let r = attrs.SetUINT32(&MF_LOW_LATENCY, 1);
                tracing::info!("MF_LOW_LATENCY set: {r:?}");
                if hw.is_some() {
                    let _ = attrs.SetUINT32(&MF_SA_D3D11_AWARE, 1);
                }
            }
            set_codec_low_latency(&transform);
            if let Some((_device, manager)) = hw {
                transform
                    .ProcessMessage(MFT_MESSAGE_SET_D3D_MANAGER, manager.as_raw() as usize)
                    .context("MFT_MESSAGE_SET_D3D_MANAGER")?;
            }

            let (w, h) = (width.max(2), height.max(2));
            let input = MFCreateMediaType()?;
            input.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)?;
            input.SetGUID(&MF_MT_SUBTYPE, if codec == 2 { &MFVideoFormat_HEVC } else { &MFVideoFormat_H264 })?;
            input.SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_MixedInterlaceOrProgressive.0 as u32)?;
            input.SetUINT64(&MF_MT_FRAME_SIZE, ((w as u64) << 32) | h as u64)?;
            input.SetUINT64(&MF_MT_FRAME_RATE, (60u64 << 32) | 1)?;
            input.SetUINT64(&MF_MT_PIXEL_ASPECT_RATIO, (1u64 << 32) | 1)?;
            transform.SetInputType(0, &input, 0)?;

            let info = negotiate(&transform, (w, h))?;
            transform.ProcessMessage(MFT_MESSAGE_COMMAND_FLUSH, 0)?;
            transform.ProcessMessage(MFT_MESSAGE_NOTIFY_BEGIN_STREAMING, 0)?;
            transform.ProcessMessage(MFT_MESSAGE_NOTIFY_START_OF_STREAM, 0)?;

            Ok(Self {
                transform,
                output_type: info.ty,
                input_ts: 0,
                coded_w: info.coded_w,
                coded_h: info.coded_h,
                disp_w: info.disp_w,
                disp_h: info.disp_h,
                provides_samples: info.provides,
                device: hw.map(|(d, _)| d.clone()),
                last_out_ts: i64::MIN,
                in_n: 0,
            })
        }
    }

    pub fn display_size(&self) -> (u32, u32) {
        (self.disp_w, self.disp_h)
    }

    fn renegotiate(&mut self) -> Result<()> {
        let info = negotiate(&self.transform, (self.disp_w, self.disp_h))?;
        self.output_type = info.ty;
        self.coded_w = info.coded_w;
        self.coded_h = info.coded_h;
        self.disp_w = info.disp_w;
        self.disp_h = info.disp_h;
        self.provides_samples = info.provides;
        Ok(())
    }

    /// 送一帧（Annex-B）。硬解返回 GPU 纹理，软解返回显示尺寸的紧凑 NV12。
    pub fn decode(&mut self, data: &[u8]) -> Result<Vec<VideoFrame>> {
        if data.is_empty() {
            return Ok(Vec::new());
        }
        unsafe {
            let buf = MFCreateMemoryBuffer(data.len() as u32)?;
            let mut ptr = std::ptr::null_mut();
            let mut _max = 0u32;
            buf.Lock(&mut ptr, Some(&raw mut _max), None)?;
            std::ptr::copy_nonoverlapping(data.as_ptr(), ptr, data.len());
            buf.SetCurrentLength(data.len() as u32)?;
            buf.Unlock()?;

            let sample = MFCreateSample()?;
            sample.AddBuffer(&buf)?;
            sample.SetSampleTime(self.input_ts)?;
            sample.SetSampleDuration(166_667)?;
            self.input_ts += 166_667;
            self.in_n += 1;

            match self.transform.ProcessInput(0, &sample, 0) {
                Ok(()) => {}
                Err(e) if e.code() == MF_E_TRANSFORM_STREAM_CHANGE => {
                    tracing::info!("MF stream change on ProcessInput");
                    self.renegotiate()?;
                    self.transform.ProcessInput(0, &sample, 0)?;
                }
                Err(e) => return Err(e.into()),
            }

            let mut out = Vec::new();
            let mut retries = 0u32;
            loop {
                let own_sample = if self.provides_samples {
                    None
                } else if self.device.is_some() {
                    Some(self.alloc_texture_sample()?)
                } else {
                    let sz = (self.coded_w as usize * self.coded_h as usize * 2 + 0x10_0000) as u32;
                    let b = MFCreateMemoryBuffer(sz)?;
                    let s = MFCreateSample()?;
                    s.AddBuffer(&b)?;
                    Some(s)
                };
                let mut outbuf = MFT_OUTPUT_DATA_BUFFER {
                    dwStreamID: 0,
                    pSample: std::mem::ManuallyDrop::new(own_sample.clone()),
                    dwStatus: 0,
                    pEvents: std::mem::ManuallyDrop::new(None),
                };
                let mut status = 0u32;
                let mut outs = [outbuf];
                let res = self.transform.ProcessOutput(0, &mut outs, &mut status);
                // 取回 pSample：provides 模式是解码器给的输出 sample，否则是我们自己的
                let returned = std::mem::ManuallyDrop::take(&mut outs[0].pSample);
                match res {
                    Ok(()) => {
                        let sample = if self.provides_samples { returned } else { own_sample };
                        let Some(s2) = sample else {
                            tracing::debug!("MF ProcessOutput ok but no sample (provides={})", self.provides_samples);
                            break;
                        };
                        if let Ok(ts) = s2.GetSampleTime() {
                            // 输入按 166.667ms 递增打时间戳；ts 对应的是内容真实的输入序号，
                            // in_n 是当前已送入的帧数，差值即解码器内部积压帧数
                            if ts >= 0 {
                                let out_idx = ts as u64 / 166_667;
                                let lag = self.in_n.saturating_sub(out_idx);
                                static LG: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
                                let lg = LG.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                                if lg < 5 || lg % 300 == 0 {
                                    tracing::info!("MF out lag {lag} frames (out_idx={out_idx} in={})", self.in_n);
                                }
                            }
                            if ts < self.last_out_ts {
                                static OO: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
                                if OO.fetch_add(1, std::sync::atomic::Ordering::Relaxed) < 10 {
                                    tracing::warn!("解码输出乱序: ts={ts} last={}", self.last_out_ts);
                                }
                            }
                            self.last_out_ts = ts;
                        }
                        match self.extract(&s2) {
                            Ok(Some(frame)) => out.push(frame),
                            Ok(None) => {}
                            // 取帧失败不能把解码器留在"输出未排空"状态
                            Err(e) => {
                                tracing::warn!("MF extract: {e:#}");
                                break;
                            }
                        }
                    }
                    Err(e) if e.code() == MF_E_TRANSFORM_STREAM_CHANGE && retries < 2 => {
                        retries += 1;
                        tracing::info!("MF stream change (retry {retries})");
                        self.renegotiate()?;
                        continue;
                    }
                    Err(e) if e.code() == MF_E_BUFFERTOOSMALL && retries < 2 => {
                        retries += 1;
                        tracing::warn!("MF output buffer too small");
                        continue;
                    }
                    Err(e) => {
                        tracing::debug!("MF ProcessOutput end: {:#x}", e.code().0);
                        break;
                    }
                }
            }
            Ok(out)
        }
    }

    /// 硬解输出 sample：NV12 纹理 + IMFDXGIBuffer 包装。
    fn alloc_texture_sample(&self) -> Result<IMFSample> {
        unsafe {
            let device = self.device.as_ref().context("no d3d device")?;
            let desc = D3D11_TEXTURE2D_DESC {
                Width: self.coded_w,
                Height: self.coded_h,
                MipLevels: 1,
                ArraySize: 1,
                Format: DXGI_FORMAT_NV12,
                SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                Usage: D3D11_USAGE_DEFAULT,
                BindFlags: D3D11_BIND_RENDER_TARGET.0 as u32,
                CPUAccessFlags: 0,
                MiscFlags: 0,
            };
            let mut tex: Option<ID3D11Texture2D> = None;
            device.CreateTexture2D(&desc, None, Some(&mut tex)).context("CreateTexture2D(NV12)")?;
            let tex = tex.context("no nv12 texture")?;
            let buf = MFCreateDXGISurfaceBuffer(&<ID3D11Texture2D as Interface>::IID, &tex, 0, false)
                .context("MFCreateDXGISurfaceBuffer")?;
            let sample = MFCreateSample()?;
            sample.AddBuffer(&buf)?;
            Ok(sample)
        }
    }

    /// 取解码结果：硬解优先取 IMFDXGIBuffer 纹理；否则按真实 pitch 裁出 NV12。
    fn extract(&self, sample: &IMFSample) -> Result<Option<VideoFrame>> {
        unsafe {
            if self.device.is_some() {
                if let Ok(buf) = sample.GetBufferByIndex(0) {
                    if let Ok(dxgi) = buf.cast::<IMFDXGIBuffer>() {
                        let sub = dxgi.GetSubresourceIndex().unwrap_or(0);
                        let mut raw: *mut core::ffi::c_void = std::ptr::null_mut();
                        if dxgi
                            .GetResource(&<ID3D11Texture2D as Interface>::IID, &mut raw)
                            .is_ok()
                            && !raw.is_null()
                        {
                            let texture = <ID3D11Texture2D as Interface>::from_raw(raw);
                            return Ok(Some(VideoFrame::Texture {
                                texture,
                                sample: sample.clone(),
                                sub,
                                coded_w: self.coded_w,
                                coded_h: self.coded_h,
                                disp_w: self.disp_w,
                                disp_h: self.disp_h,
                            }));
                        }
                    }
                }
            }
            self.extract_nv12(sample)
        }
    }

    fn extract_nv12(&self, sample: &IMFSample) -> Result<Option<VideoFrame>> {
        unsafe {
            let mb: IMFMediaBuffer = sample.ConvertToContiguousBuffer()?;
            let mut p = std::ptr::null_mut();
            let mut pitch = 0i32;
            let mut len = 0u32;
            let mut locked: Option<IMF2DBuffer> = None;
            if let Ok(mb2) = mb.cast::<IMF2DBuffer>() {
                if mb2.Lock2D(&mut p, &mut pitch).is_ok() {
                    locked = Some(mb2);
                }
            }
            if locked.is_none() {
                mb.Lock(&mut p, None, Some(&raw mut len))?;
                pitch = self
                    .output_type
                    .GetUINT32(&MF_MT_DEFAULT_STRIDE)
                    .map(|s| s as i32)
                    .unwrap_or(self.coded_w as i32);
            }
            if len == 0 {
                len = mb.GetCurrentLength().unwrap_or(0);
            }
            let res = self.copy_plane(p, pitch, len);

            if let Some(mb2) = locked {
                let _ = mb2.Unlock2D();
            } else {
                let _ = mb.Unlock();
            }
            Ok(res?.map(|(w, h, data)| VideoFrame::Nv12 { w, h, data }))
        }
    }

    /// 按真实 pitch 裁出显示尺寸的紧凑 NV12。
    unsafe fn copy_plane(&self, p: *const u8, pitch: i32, len: u32) -> Result<Option<(u32, u32, Vec<u8>)>> {
        let pitch_abs = pitch.unsigned_abs() as usize;
        let (w, h) = (self.disp_w as usize, self.disp_h as usize);
        let mut total = len as usize;
        if total == 0 {
            total = pitch_abs * self.coded_h as usize * 3 / 2;
        }

        static ONCE: std::sync::Once = std::sync::Once::new();
        ONCE.call_once(|| {
            tracing::info!("MF frame: pitch={} len={} disp={}x{}", pitch, total, w, h);
        });
        if p.is_null() || pitch_abs < w || total < pitch_abs * h {
            tracing::warn!("MF frame too small: pitch={} len={} want={}x{}", pitch, total, w, h);
            return Ok(None);
        }

        // Y 平面在内存里的行数（宏块对齐），用 buffer 长度反推；UV 平面紧随其后。
        let aligned_h = if total >= pitch_abs * h * 3 / 2 {
            ((2 * total) / (3 * pitch_abs)).max(h)
        } else {
            self.coded_h.max(2) as usize
        };
        let uv_off = aligned_h * pitch_abs;
        let has_uv = uv_off + (h / 2) * pitch_abs <= total;

        let mut v = vec![0u8; w * h * 3 / 2];
        let dst = v.as_mut_ptr();
        for row in 0..h {
            std::ptr::copy_nonoverlapping(p.add(row * pitch_abs), dst.add(row * w), w);
        }
        if has_uv {
            for row in 0..h / 2 {
                std::ptr::copy_nonoverlapping(p.add(uv_off + row * pitch_abs), dst.add(w * h + row * w), w);
            }
        } else {
            std::ptr::write_bytes(dst.add(w * h), 128u8, w * h / 2);
        }
        Ok(Some((w as u32, h as u32, v)))
    }
}

struct BitReader<'a> {
    d: &'a [u8],
    p: usize,
}

impl<'a> BitReader<'a> {
    fn u(&mut self, n: u32) -> u32 {
        let mut v = 0u32;
        for _ in 0..n {
            v = (v << 1) | (((self.d[self.p >> 3] >> (7 - (self.p & 7))) & 1) as u32);
            self.p += 1;
        }
        v
    }
    fn ue(&mut self) -> u32 {
        let mut z = 0u32;
        while self.u(1) == 0 {
            z += 1;
            if z > 31 {
                return 0;
            }
        }
        if z == 0 { 0 } else { (1 << z) - 1 + self.u(z) }
    }
    fn se(&mut self) -> i32 {
        let k = self.ue() as i32;
        if k % 2 == 0 { -(k / 2) } else { (k + 1) / 2 }
    }
}

fn sps_log2_frame_num(nal: &[u8]) -> Option<u32> {
    let mut r = BitReader { d: nal, p: 8 };
    let profile = r.u(8);
    let _ = r.u(8);
    let _ = r.u(8);
    let _ = r.ue();
    if matches!(profile, 100 | 110 | 122 | 244 | 44 | 83 | 86 | 118 | 128 | 138 | 139 | 134 | 135) {
        let chroma = r.ue();
        if chroma == 3 {
            let _ = r.u(1);
        }
        let _ = r.ue();
        let _ = r.ue();
        let _ = r.u(1);
        if r.u(1) == 1 {
            for i in 0..(if chroma != 3 { 8 } else { 12 }) {
                if r.u(1) == 1 {
                    let size = if i < 6 { 16 } else { 64 };
                    let mut last = 8i32;
                    let mut next = 8i32;
                    for _ in 0..size {
                        if next != 0 {
                            next = (last + r.se() + 256) % 256;
                        }
                        if next != 0 {
                            last = next;
                        }
                    }
                }
            }
        }
    }
    Some(r.ue() + 4)
}

/// 取首个 slice 的 (is_idr, frame_num)；顺带用码流里的 SPS 更新 log2_max_frame_num。
pub fn slice_frame_num(data: &[u8], log2_hint: &mut u32) -> Option<(bool, u32)> {
    let mut i = 0usize;
    while i + 4 < data.len() {
        if data[i] != 0 || data[i + 1] != 0 {
            i += 1;
            continue;
        }
        let (sc_len, ok) = if data[i + 2] == 1 {
            (3usize, true)
        } else if data[i + 2] == 0 && data[i + 3] == 1 {
            (4usize, true)
        } else {
            (0, false)
        };
        if !ok {
            i += 1;
            continue;
        }
        let nal = &data[i + sc_len..];
        if nal.is_empty() {
            break;
        }
        match nal[0] & 0x1F {
            7 => {
                if let Some(l) = sps_log2_frame_num(nal) {
                    *log2_hint = l;
                }
            }
            1 | 5 => {
                let idr = (nal[0] & 0x1F) == 5;
                let mut r = BitReader { d: nal, p: 8 };
                let _ = r.ue();
                let _ = r.ue();
                let _ = r.ue();
                return Some((idr, r.u(*log2_hint)));
            }
            _ => {}
        }
        i += sc_len + 1;
    }
    None
}

/// NV12 → BGRA（BT.601 limited）。
pub fn nv12_to_bgra(nv12: &[u8], w: u32, h: u32) -> Vec<u8> {
    let (w, h) = (w as usize, h as usize);
    let mut out = vec![0u8; w * h * 4];
    let y = &nv12[..w * h];
    let uv = &nv12[w * h..];
    let clip = |x: i32| x.clamp(0, 255) as u8;
    for j in 0..h {
        let yrow = &y[j * w..j * w + w];
        let uvrow = &uv[(j / 2) * w..(j / 2) * w + w];
        let orow = &mut out[j * w * 4..j * w * 4 + w * 4];
        let mut i = 0usize;
        while i + 1 < w {
            let u = uvrow[i] as i32 - 128;
            let v = uvrow[i + 1] as i32 - 128;
            let (dv, dg, db) = (409 * v, 100 * u + 208 * v, 516 * u);
            for k in 0..2usize {
                let c = yrow[i + k] as i32 - 16;
                let o = (i + k) * 4;
                orow[o] = clip((298 * c + db + 128) >> 8);
                orow[o + 1] = clip((298 * c - dg + 128) >> 8);
                orow[o + 2] = clip((298 * c + dv + 128) >> 8);
                orow[o + 3] = 255;
            }
            i += 2;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "需要本地放一份 video-hb.h264 抓包（cargo test -- --ignored）"]
    fn decodes_clean_h264() {
        let _ = tracing_subscriber::fmt().with_max_level(tracing::Level::INFO).try_init();
        let data = std::fs::read("video-hb.h264").unwrap();
        // 从 SPS/PPS/IDR 起喂（0x764011 = 7_749_649 = SPS 起点）
        let data = &data[7_749_649..];
        let mut dec = MfDecoder::new(1, 1920, 1080).expect("decoder");
        let mut out = Vec::new();
        for chunk in data.chunks(32768) {
            if let Ok(f) = dec.decode(chunk) {
                out.extend(f);
            }
        }
        assert!(!out.is_empty(), "no frames decoded");
        // 解码器以 SPS 为准重新协商：1920x1088 编码、裁切到 1920x1080
        assert_eq!(dec.display_size(), (1920, 1080));
        let VideoFrame::Nv12 { w, h, data: nv12 } = &out[out.len() / 2] else {
            panic!("software decode should yield NV12");
        };
        println!("{}x{} len={}", w, h, nv12.len());
    }
}
