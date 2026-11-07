//! 与官方网页一致的加载动画：纯黑背景 + 184×183 精灵图（29 帧 / 1s 循环）。
//! 精灵图来自官方 loading.css 的 data-URL，运行时用 WIC 解一次并缓存。

#![cfg(target_os = "windows")]

use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use windows::Win32::Graphics::Imaging::{
    IWICImagingFactory, CLSID_WICImagingFactory, GUID_WICPixelFormat32bppBGRA,
    WICBitmapDitherTypeNone, WICBitmapPaletteTypeCustom, WICDecodeMetadataCacheOnLoad,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
};
use windows::Win32::UI::Shell::SHCreateMemStream;

/// loading 页下方的状态文案。排队数值与官方 LobbyView 排队面板同口径：
/// 名次取 queuingSize，等待分钟由 seatNo 推导。0 表示未知，显示时按官方 `|| 1` 处理。
enum Notice {
    None,
    Queuing { rank: i64, minutes: i64 },
    Text(String),
}

static NOTICE: Mutex<Notice> = Mutex::new(Notice::None);

/// 与官方 computedQueueData 一致：seatNo<=1 不刷新，2..=30 记 1 分钟，
/// 之后按 sqrt(seatNo-30)*10+1 取整并封顶 90。
pub fn set_queue(seat: i64, size: i64) {
    let mut n = NOTICE.lock().unwrap();
    let (rank, minutes) = match &*n {
        Notice::Queuing { rank, minutes } => (*rank, *minutes),
        _ => (0, 0),
    };
    *n = if seat > 1 {
        let m = if seat <= 30 {
            1
        } else {
            ((((seat - 30) as f64).sqrt() * 10.0).floor() as i64 + 1).min(90)
        };
        Notice::Queuing { rank: size.max(0), minutes: m }
    } else {
        Notice::Queuing { rank, minutes }
    };
}

/// 排队结束/失败后的提示（官方进入游戏加载弹窗文案）。
pub fn set_notice(text: &str) {
    *NOTICE.lock().unwrap() = Notice::Text(text.to_string());
}

fn notice_text() -> Option<String> {
    match &*NOTICE.lock().unwrap() {
        Notice::None => None,
        Notice::Queuing { rank, minutes } => Some(format!(
            "排队中\n目前排队名次 {} 位\n预计等待时间 {} 分钟",
            (*rank).max(1),
            (*minutes).max(1)
        )),
        Notice::Text(t) => Some(t.clone()),
    }
}

const SPRITE_PNG: &[u8] = include_bytes!("../assets/loading_sprite.png");
const FRAME_MS: u64 = 1000 / 29;

/// 当前应显示的帧序号（29 帧 / 秒，和官方 CSS steps(29) 一致）。
pub fn frame_index(elapsed: Duration) -> u64 {
    (elapsed.as_millis() as u64 / FRAME_MS) % 29
}

struct Sprite {
    w: usize,
    frame_h: usize,
    frames: usize,
    /// BGRA，RGB 已按 alpha 预乘到黑底
    data: Vec<u8>,
}

static SPRITE: OnceLock<Option<Sprite>> = OnceLock::new();

fn sprite() -> Option<&'static Sprite> {
    SPRITE.get_or_init(load).as_ref()
}

fn load() -> Option<Sprite> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let stream = SHCreateMemStream(Some(SPRITE_PNG))?;
        let factory: IWICImagingFactory =
            CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER).ok()?;
        let dec = factory
            .CreateDecoderFromStream(&stream, std::ptr::null(), WICDecodeMetadataCacheOnLoad)
            .ok()?;
        let frame = dec.GetFrame(0).ok()?;
        let conv = factory.CreateFormatConverter().ok()?;
        conv.Initialize(
            &frame,
            &GUID_WICPixelFormat32bppBGRA,
            WICBitmapDitherTypeNone,
            None,
            0.0,
            WICBitmapPaletteTypeCustom,
        )
        .ok()?;
        let (mut w, mut h) = (0u32, 0u32);
        conv.GetSize(&mut w, &mut h).ok()?;
        let stride = w * 4;
        let mut data = vec![0u8; (stride * h) as usize];
        conv.CopyPixels(std::ptr::null(), stride, &mut data).ok()?;
        for px in data.chunks_exact_mut(4) {
            let a = px[3] as u32;
            px[0] = (px[0] as u32 * a / 255) as u8;
            px[1] = (px[1] as u32 * a / 255) as u8;
            px[2] = (px[2] as u32 * a / 255) as u8;
        }
        let frame_h = 183usize;
        Some(Sprite { w: w as usize, frame_h, frames: (h as usize / frame_h).max(1), data })
    }
}

/// 画进 softbuffer 的 u32 缓冲：整窗纯黑，视频区居中绘制当前帧与排队/状态文案。
/// 标题栏覆盖层随后再合成，所以这里只处理视频区背景。
pub fn draw(buf: &mut [u32], dw: usize, dh: usize, top: usize, elapsed: Duration, scale: f32) {
    buf.fill(0);
    if dw == 0 || dh == 0 {
        return;
    }
    let bottom = draw_sprite(buf, dw, dh, top, elapsed, scale);
    draw_notice(buf, dw, dh, bottom, scale);
}

fn draw_sprite(buf: &mut [u32], dw: usize, dh: usize, top: usize, elapsed: Duration, scale: f32) -> usize {
    let Some(sp) = sprite() else {
        return top + dh.saturating_sub(top) / 2;
    };
    let tw = ((sp.w as f32 * scale).round() as usize).max(1);
    let th = ((sp.frame_h as f32 * scale).round() as usize).max(1);
    let vh = dh.saturating_sub(top).max(1);
    let ox = dw.saturating_sub(tw) / 2;
    let oy = top + vh.saturating_sub(th) / 2;
    blit_sprite(buf, dw, dh, ox, oy, tw, th, elapsed, &sp);
    oy + th
}

/// 把当前精灵帧缩放到 tw×th，画到 (ox, oy)。
fn blit_sprite(
    buf: &mut [u32],
    dw: usize,
    dh: usize,
    ox: usize,
    oy: usize,
    tw: usize,
    th: usize,
    elapsed: Duration,
    sp: &Sprite,
) {
    let idx = frame_index(elapsed) % sp.frames as u64;
    let src_y = idx as usize * sp.frame_h;
    let src_stride = sp.w * 4;

    if tw == sp.w && th == sp.frame_h {
        // 1:1 直接拷贝
        for y in 0..th {
            let dy = oy + y;
            if dy >= dh {
                break;
            }
            let src = (src_y + y) * src_stride;
            for x in 0..tw {
                let dx = ox + x;
                if dx >= dw {
                    break;
                }
                let i = src + x * 4;
                buf[dy * dw + dx] = u32::from_le_bytes([sp.data[i], sp.data[i + 1], sp.data[i + 2], 0xff]);
            }
        }
        return;
    }

    // 非整数缩放：对预乘颜色做双线性
    let fx = sp.w as f32 / tw as f32;
    let fy = sp.frame_h as f32 / th as f32;
    for y in 0..th {
        let dy = oy + y;
        if dy >= dh {
            break;
        }
        let sy = ((y as f32 + 0.5) * fy - 0.5).clamp(0.0, (sp.frame_h - 1) as f32);
        let y0 = sy.floor() as usize;
        let y1 = (y0 + 1).min(sp.frame_h - 1);
        let ty = sy - y0 as f32;
        for x in 0..tw {
            let dx = ox + x;
            if dx >= dw {
                break;
            }
            let sx = ((x as f32 + 0.5) * fx - 0.5).clamp(0.0, (sp.w - 1) as f32);
            let x0 = sx.floor() as usize;
            let x1 = (x0 + 1).min(sp.w - 1);
            let tx = sx - x0 as f32;
            let mut out = [0u8; 4];
            out[3] = 0xff;
            for c in 0..3 {
                let p00 = sp.data[((src_y + y0) * sp.w + x0) * 4 + c] as f32;
                let p10 = sp.data[((src_y + y0) * sp.w + x1) * 4 + c] as f32;
                let p01 = sp.data[((src_y + y1) * sp.w + x0) * 4 + c] as f32;
                let p11 = sp.data[((src_y + y1) * sp.w + x1) * 4 + c] as f32;
                out[c] = (p00 * (1.0 - tx) * (1.0 - ty)
                    + p10 * tx * (1.0 - ty)
                    + p01 * (1.0 - tx) * ty
                    + p11 * tx * ty)
                    .round() as u8;
            }
            buf[dy * dw + dx] = u32::from_le_bytes(out);
        }
    }
}

/// 重启加载页的 GPU 覆盖层：精灵帧 + 状态文案，BGRA（背景透明，覆盖层只贴精灵区域）。
pub fn render_overlay(elapsed: Duration, scale: f32) -> (Vec<u8>, u32, u32) {
    let Some(sp) = sprite() else {
        return (Vec::new(), 0, 0);
    };
    let tw = ((sp.w as f32 * scale).round() as usize).max(1);
    let th = ((sp.frame_h as f32 * scale).round() as usize).max(1);
    let (notice_px, nw, nh) = match notice_text() {
        Some(t) => {
            let (d, w, h) = crate::ui::render_notice(&t, scale, 640.0);
            (Some(d), w as usize, h as usize)
        }
        None => (None, 0, 0),
    };
    let gap = if notice_px.is_some() { (20.0 * scale).round() as usize } else { 0 };
    let w = tw.max(nw).max(2);
    let h = th + gap + nh;
    let mut buf = vec![0u32; w * h];
    blit_sprite(&mut buf, w, h, (w - tw) / 2, 0, tw, th, elapsed, &sp);
    if let Some(px) = &notice_px {
        let ox = (w - nw) / 2;
        let oy = th + gap;
        for y in 0..nh {
            for x in 0..nw {
                let i = (y * nw + x) * 4;
                let (b, g, r) = (px[i] as u32, px[i + 1] as u32, px[i + 2] as u32);
                if b | g | r == 0 {
                    continue;
                }
                let v = buf[(oy + y) * w + ox + x];
                let nb = ((v & 0xff) + b).min(255);
                let ng = (((v >> 8) & 0xff) + g).min(255);
                let nr = (((v >> 16) & 0xff) + r).min(255);
                buf[(oy + y) * w + ox + x] = (0xff << 24) | (nr << 16) | (ng << 8) | nb;
            }
        }
    }
    let mut out = vec![0u8; w * h * 4];
    for (i, v) in buf.iter().enumerate() {
        out[i * 4..i * 4 + 4].copy_from_slice(&v.to_le_bytes());
    }
    (out, w as u32, h as u32)
}

struct NoticePixels {
    text: String,
    scale_key: u32,
    w: usize,
    h: usize,
    data: Vec<u8>,
}

static NOTICE_PIXELS: Mutex<Option<NoticePixels>> = Mutex::new(None);

/// 文案按黑底直接叠加：GDI 只写 RGB，未命中像素为 0，不改变背景。
fn draw_notice(buf: &mut [u32], dw: usize, dh: usize, sprite_bottom: usize, scale: f32) {
    let Some(text) = notice_text() else { return };
    let scale_key = (scale * 100.0).round() as u32;
    let mut cache = NOTICE_PIXELS.lock().unwrap();
    let stale = cache
        .as_ref()
        .map(|c| c.text != text || c.scale_key != scale_key || c.w > dw)
        .unwrap_or(true);
    if stale {
        let (data, w, h) = crate::ui::render_notice(&text, scale, dw as f32 / scale);
        *cache = Some(NoticePixels { text, scale_key, w: w as usize, h: h as usize, data });
    }
    let Some(c) = cache.as_ref() else { return };
    let ox = dw.saturating_sub(c.w) / 2;
    let oy = sprite_bottom + (20.0 * scale).round() as usize;
    for y in 0..c.h {
        let dy = oy + y;
        if dy >= dh {
            break;
        }
        for x in 0..c.w {
            let dx = ox + x;
            if dx >= dw {
                break;
            }
            let i = (y * c.w + x) * 4;
            let (b, g, r) = (c.data[i] as u32, c.data[i + 1] as u32, c.data[i + 2] as u32);
            if b | g | r == 0 {
                continue;
            }
            let v = buf[dy * dw + dx];
            let nb = ((v & 0xff) + b).min(255);
            let ng = (((v >> 8) & 0xff) + g).min(255);
            let nr = (((v >> 16) & 0xff) + r).min(255);
            buf[dy * dw + dx] = (0xff << 24) | (nr << 16) | (ng << 8) | nb;
        }
    }
}
