//! wgc.wasm（WeLink WL_RTC 协议引擎）的 wasmtime 宿主。
//! 复刻 worker glue：env imports + fn_exec/x_fn_exec 语义。

use std::sync::mpsc::{channel, Receiver, Sender};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use wasmtime::*;

/// wasm → host 事件。
pub enum WgcEvent {
    /// 视频编码帧（codec:1=H264,2=H265；key:1=IDR）。
    Video { key: bool, data: Vec<u8> },
    VideoConfig { codec: i32, width: i32, height: i32 },
    /// PCM s16le 48kHz stereo。
    Audio { data: Vec<u8> },
    AudioConfig { arg1: i32, arg2: i32 },
    /// WT bidi stream 出站数据。
    StreamSend(Vec<u8>),
    /// WT datagram 出站数据。
    DatagramSend(Vec<u8>),
    /// on_message(type, arg1, arg2)。99 时 arg1 为二进制。
    Message { sid: i32, kind: i32, a: Vec<u8>, b: Vec<u8> },
    BitrateUpdate { sid: i32, a: i32, b: i32 },
    Stats { a: i32, b: i32 },
    Log { level: i32, text: String },
    RequestKeyframe,
}

/// host → wasm 命令。
pub enum WgcCmd {
    /// WT bidi stream 入站数据。
    StreamData(Vec<u8>),
    /// WT datagram 入站数据。
    DatagramData(Vec<u8>),
    /// open_session(sid, 1, video_codec, audio_codec)
    OpenSession { sid: i32, video_codec: i32, audio_codec: i32 },
    /// on_connected(sid, json parameters)
    OnConnected { sid: i32, params_json: String },
    /// x_fn_exec 语义：任意 wasm export 数字调用（mouse/key_event/...）。
    Call { name: String, args: Vec<i32> },
    /// protobuf(sid, bytes) — SimpleCmd 等 protobuf 载荷。
    Protobuf { sid: i32, data: Vec<u8> },
    /// input_app(sid, seq, text, extra)
    InputApp { sid: i32, seq: i32, text: String, extra: String },
    /// input_string(sid, text)
    InputString { sid: i32, text: String },
    /// send_audio(sid, bytes)
    AudioSend { sid: i32, data: Vec<u8> },
    CloseSession { sid: i32 },
    OnDisconnect { sid: i32 },
    Encryption { text: String, reply: Sender<String> },
    Decryption { text: String, reply: Sender<String> },
    /// 定时器唤醒：只用于让命令循环检查待执行的 wasm 工作回调。
    Wake,
    Shutdown,
}

struct Host {
    sid: i32,
    mem: Option<Memory>,
}

pub struct WgcEngine {
    cmd_tx: Sender<WgcCmd>,
}

impl WgcEngine {
    /// 在独立线程上跑引擎；返回 (引擎句柄, 事件接收端)。
    pub fn spawn() -> Result<(Self, Receiver<WgcEvent>)> {
        let (cmd_tx, cmd_rx) = channel::<WgcCmd>();
        let (ev_tx, ev_rx) = channel::<WgcEvent>();
        std::thread::Builder::new()
            .name("wgc-engine".into())
            .spawn({
                let cmd_tx2 = cmd_tx.clone();
                move || run(cmd_rx, ev_tx, cmd_tx2)
            })?;
        Ok((Self { cmd_tx }, ev_rx))
    }

    pub fn send(&self, cmd: WgcCmd) {
        let _ = self.cmd_tx.send(cmd);
    }

    pub fn sender(&self) -> Sender<WgcCmd> {
        self.cmd_tx.clone()
    }
}

fn mem_bytes(caller: &mut Caller<'_, Host>, ptr: i32, len: i32) -> Vec<u8> {
    let mem = caller.data().mem.unwrap();
    let mut v = vec![0u8; len as usize];
    let _ = mem.read(&mut *caller, ptr as usize, &mut v);
    v
}

fn mem_write_u64(caller: &mut Caller<'_, Host>, ptr: i32, v: u64) {
    let mem = caller.data().mem.unwrap();
    let _ = mem.write(caller, ptr as usize, &v.to_le_bytes());
}

fn mem_write_u32(caller: &mut Caller<'_, Host>, ptr: i32, v: u32) {
    let mem = caller.data().mem.unwrap();
    let _ = mem.write(caller, ptr as usize, &v.to_le_bytes());
}

fn mem_write_bytes(caller: &mut Caller<'_, Host>, ptr: i32, data: &[u8]) {
    let mem = caller.data().mem.unwrap();
    let _ = mem.write(caller, ptr as usize, data);
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64
}

fn run(cmd_rx: Receiver<WgcCmd>, ev: Sender<WgcEvent>, cmd_tx: Sender<WgcCmd>) {
    if let Err(e) = run_inner(cmd_rx, ev.clone(), cmd_tx) {
        let _ = ev.send(WgcEvent::Log {
            level: 3,
            text: format!("wgc engine fatal: {e:#}"),
        });
    }
}

fn run_inner(cmd_rx: Receiver<WgcCmd>, ev: Sender<WgcEvent>, cmd_tx: Sender<WgcCmd>) -> Result<()> {
    let engine = Engine::default();
    let wasm = include_bytes!("../assets/wgc.wasm");
    let module = Module::new(&engine, wasm).context("wgc.wasm compile")?;
    let mut store = Store::new(&engine, Host { sid: 0, mem: None });
    let mut linker = Linker::<Host>::new(&engine);

    let tx = ev.clone();
    linker.func_wrap("env", "on_video", move |mut c: Caller<'_, Host>, sid: i32, a: i32, k: i32, p: i32, l: i32| {
        let data = mem_bytes(&mut c, p, l);
        static ONCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let n = ONCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        if n < 10 || n % 300 == 0 {
            tracing::info!("on_video env: sid={sid} a={a} key={k} len={l}");
        }
        let _ = tx.send(WgcEvent::Video { key: k != 0, data });
    })?;
    let tx = ev.clone();
    linker.func_wrap("env", "on_video_config", move |_c: Caller<'_, Host>, _s: i32, codec: i32, w: i32, h: i32| {
        let _ = tx.send(WgcEvent::VideoConfig { codec, width: w, height: h });
    })?;
    let tx = ev.clone();
    linker.func_wrap("env", "on_audio", move |mut c: Caller<'_, Host>, _s: i32, _a: i32, p: i32, l: i32| {
        let data = mem_bytes(&mut c, p, l);
        let _ = tx.send(WgcEvent::Audio { data });
    })?;
    let tx = ev.clone();
    linker.func_wrap("env", "on_audio_config", move |_c: Caller<'_, Host>, _s: i32, a: i32, b: i32| {
        let _ = tx.send(WgcEvent::AudioConfig { arg1: a, arg2: b });
    })?;
    let tx = ev.clone();
    linker.func_wrap("env", "send", move |mut c: Caller<'_, Host>, _s: i32, p: i32, l: i32| {
        let data = mem_bytes(&mut c, p, l);
        let _ = tx.send(WgcEvent::StreamSend(data));
    })?;
    let tx = ev.clone();
    linker.func_wrap("env", "send_datagram", move |mut c: Caller<'_, Host>, _s: i32, p: i32, l: i32| {
        let data = mem_bytes(&mut c, p, l);
        let _ = tx.send(WgcEvent::DatagramSend(data));
    })?;
    let tx = ev.clone();
    linker.func_wrap("env", "on_message", move |mut c: Caller<'_, Host>, sid: i32, kind: i32, p1: i32, l1: i32, p2: i32, l2: i32| {
        let a = mem_bytes(&mut c, p1, l1);
        let b = mem_bytes(&mut c, p2, l2);
        let _ = tx.send(WgcEvent::Message { sid, kind, a, b });
    })?;
    let tx = ev.clone();
    linker.func_wrap("env", "on_bitrate_update", move |_c: Caller<'_, Host>, sid: i32, a: i32, b: i32, _c2: i32| {
        let _ = tx.send(WgcEvent::BitrateUpdate { sid, a, b });
    })?;
    let tx = ev.clone();
    linker.func_wrap("env", "on_stats", move |_c: Caller<'_, Host>, a: i32, b: i32, _c2: i32| {
        let _ = tx.send(WgcEvent::Stats { a, b });
    })?;
    let tx = ev.clone();
    linker.func_wrap("env", "send_keyframe", move |_c: Caller<'_, Host>, _s: i32| {
        let _ = tx.send(WgcEvent::RequestKeyframe);
    })?;
    let tx = ev.clone();
    linker.func_wrap("env", "log_message", move |mut c: Caller<'_, Host>, level: i32, p: i32, l: i32| {
        let text = String::from_utf8_lossy(&mem_bytes(&mut c, p, l)).into_owned();
        let _ = tx.send(WgcEvent::Log { level, text });
    })?;
    linker.func_wrap("env", "rand_bytes", |mut c: Caller<'_, Host>, p: i32, l: i32| {
        let mut v = vec![0u8; l as usize];
        rand::Rng::fill(&mut rand::thread_rng(), &mut v[..]);
        mem_write_bytes(&mut c, p, &v);
    })?;
    linker.func_wrap("env", "date_now", |mut c: Caller<'_, Host>, p: i32| {
        // JS: Math.round(1e3*Date.now()) —— 微秒
        mem_write_u64(&mut c, p, now_ms() * 1000);
    })?;
    linker.func_wrap("env", "_hrtime", |mut c: Caller<'_, Host>, p: i32| {
        // JS: performance.now() —— 单调钟
        static T0: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();
        let t = T0.get_or_init(Instant::now).elapsed();
        mem_write_u64(&mut c, p, t.as_secs());
        mem_write_u64(&mut c, p + 8, t.subsec_nanos() as u64);
    })?;
    linker.func_wrap("env", "_localtime_r", |mut c: Caller<'_, Host>, lo: i32, hi: i32, t: i32| {
        // JS 传秒、写 6×u32(sec,min,hour,mday,mon-1,year)
        let secs = (((hi as u64) << 32) | lo as u32 as u64) as i64;
        let days = secs.div_euclid(86_400);
        let ds = secs.rem_euclid(86_400);
        let (y, mo, d) = civil_from_days(days);
        let tm: [i32; 6] = [
            (ds % 60) as i32,
            ((ds / 60) % 60) as i32,
            (ds / 3600) as i32,
            d as i32,
            mo as i32 - 1,
            y as i32,
        ];
        for (i, v) in tm.iter().enumerate() {
            mem_write_u32(&mut c, t + (i * 4) as i32, *v as u32);
        }
    })?;
    linker.func_wrap("env", "emscripten_return_address", |_a: i32| 0i32)?;
    linker.func_wrap("env", "on_memory_growth", |_c: Caller<'_, Host>| {})?;
    let work = std::sync::Arc::new(std::sync::atomic::AtomicU8::new(0));
    let w = work.clone();
    linker.func_wrap("env", "delay_work", move |_c: Caller<'_, Host>, idle: i32| {
        // JS 语义：setTimeout(0) 调 do_idle_work/do_work。
        // 不能在 import 内重入 wasm，改为置标志，由命令循环在当前调用返回后立即执行。
        let bit = if idle != 0 { 2 } else { 1 };
        w.fetch_or(bit, std::sync::atomic::Ordering::SeqCst);
    })?;
    // JS: this.timer&&clearTimeout(this.timer) —— 单挂起定时器,新调用取消旧的
    let pending = cmd_tx.clone();
    let w = work.clone();
    linker.func_wrap("env", "schedule_work", move |_c: Caller<'_, Host>, ms: i32| {
        static GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let gen = GEN.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
        let tx2 = pending.clone();
        let w2 = w.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(ms.max(0) as u64));
            if GEN.load(std::sync::atomic::Ordering::SeqCst) == gen {
                w2.fetch_or(4, std::sync::atomic::Ordering::SeqCst);
                let _ = tx2.send(WgcCmd::Wake);
            }
        });
    })?;

    let instance = linker.instantiate(&mut store, &module)?;
    let mem = instance.get_memory(&mut store, "memory").context("wgc memory")?;
    store.data_mut().mem = Some(mem);
    instance.get_typed_func::<i32, i32>(&mut store, "startup")?.call(&mut store, 16)?;

    // 命令循环：每条命令返回后立刻执行 wasm 排的 do_work 回调(等价 JS setTimeout(0))，
    // 否则工作回调会排在成百上千个 datagram feed 之后，wasm 内部重排/解码节奏被打乱。
    loop {
        match cmd_rx.recv() {
            Err(_) => break,
            Ok(cmd) => {
                if matches!(cmd, WgcCmd::Shutdown) { break; }
                dispatch(&mut store, &instance, cmd)?;
                run_pending_work(&mut store, &instance, &work);
                while let Ok(cmd) = cmd_rx.try_recv() {
                    if matches!(cmd, WgcCmd::Shutdown) { return Ok(()); }
                    dispatch(&mut store, &instance, cmd)?;
                    run_pending_work(&mut store, &instance, &work);
                }
            }
        }
    }
    Ok(())
}

fn feed_bytes(store: &mut Store<Host>, instance: &Instance, fname: &str, sid: i32, data: Vec<u8>) -> Result<()> {
    let mem = store.data().mem.unwrap();
    let malloc = instance.get_typed_func::<i32, i32>(&mut *store, "malloc")?;
    let free = instance.get_typed_func::<i32, ()>(&mut *store, "free")?;
    let p = malloc.call(&mut *store, data.len() as i32)?;
    mem.write(&mut *store, p as usize, &data)?;
    instance.get_typed_func::<(i32, i32, i32), ()>(&mut *store, fname)?
        .call(&mut *store, (sid, p, data.len() as i32))?;
    // JS 里 free 是同步的,但如果 wasm 延迟处理数据,free 会让内存被复用变垃圾
    if std::env::var("WGC_NO_FREE").is_err() {
        free.call(&mut *store, p)?;
    }
    Ok(())
}

/// 执行 wasm 通过 delay_work/schedule_work 排下的回调（bit 0=do_work, 1=do_idle_work, 2=do_delay_work）。
/// 反复取标志和 JS 的 setTimeout(0) 链一致；设上限防止 wasm 自排自跑死循环。
fn run_pending_work(store: &mut Store<Host>, instance: &Instance, work: &std::sync::atomic::AtomicU8) {
    for _ in 0..32 {
        let bits = work.swap(0, std::sync::atomic::Ordering::SeqCst);
        if bits == 0 {
            return;
        }
        for (bit, name) in [(1u8, "do_work"), (2, "do_idle_work"), (4, "do_delay_work")] {
            if bits & bit != 0 {
                if let Err(e) = call_by_name(store, instance, name, &[]) {
                    tracing::warn!("{name}: {e:#}");
                }
            }
        }
    }
}

fn dispatch(store: &mut Store<Host>, instance: &Instance, cmd: WgcCmd) -> Result<()> {
    let sid = store.data().sid;
    match cmd {
        WgcCmd::OpenSession { sid: s, video_codec, audio_codec } => {
            store.data_mut().sid = s;
            let flag = std::env::var("WGC_SESSION_FLAG").ok().and_then(|v| v.parse().ok()).unwrap_or(1);
            instance.get_typed_func::<(i32, i32, i32, i32), ()>(&mut *store, "open_session")?
                .call(&mut *store, (s, flag, video_codec, audio_codec))?;
        }
        WgcCmd::OnConnected { sid: s, params_json } => {
            let bytes = params_json.into_bytes();
            let mem = store.data().mem.unwrap();
            let malloc = instance.get_typed_func::<i32, i32>(&mut *store, "malloc")?;
            let free = instance.get_typed_func::<i32, ()>(&mut *store, "free")?;
            let p = malloc.call(&mut *store, bytes.len() as i32)?;
            mem.write(&mut *store, p as usize, &bytes)?;
            instance.get_typed_func::<(i32, i32, i32), ()>(&mut *store, "on_connected")?
                .call(&mut *store, (s, p, bytes.len() as i32))?;
            free.call(&mut *store, p)?;
        }
        WgcCmd::StreamData(data) => {
            feed_bytes(store, instance, "ondata", sid, data)?;
        }
        WgcCmd::DatagramData(data) => {
            static DRX_N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            static DT_US: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let t0 = std::time::Instant::now();
            let fname = if std::env::var("WGC_DGRAM_TO_ONDATA").is_ok() { "ondata" } else { "ondatagram" };
            feed_bytes(store, instance, fname, sid, data)?;
            let n = DRX_N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            DT_US.fetch_add(t0.elapsed().as_micros() as u64, std::sync::atomic::Ordering::Relaxed);
            if n % 1000 == 999 {
                let us = DT_US.swap(0, std::sync::atomic::Ordering::Relaxed);
                tracing::info!("dgram feed: {n} pkts avg={}us", us / 1000);
            }
        }
        WgcCmd::Call { name, args } => {
            call_by_name(store, instance, &name, &args)?;
        }
        WgcCmd::Protobuf { sid: s, data } => {
            let mem = store.data().mem.unwrap();
            let malloc = instance.get_typed_func::<i32, i32>(&mut *store, "malloc")?;
            let free = instance.get_typed_func::<i32, ()>(&mut *store, "free")?;
            let p = malloc.call(&mut *store, data.len() as i32)?;
            mem.write(&mut *store, p as usize, &data)?;
            instance.get_typed_func::<(i32, i32, i32), ()>(&mut *store, "protobuf")?
                .call(&mut *store, (s, p, data.len() as i32))?;
            free.call(&mut *store, p)?;
        }
        WgcCmd::InputApp { sid: s, seq, text, extra } => {
            let mem = store.data().mem.unwrap();
            let malloc = instance.get_typed_func::<i32, i32>(&mut *store, "malloc")?;
            let free = instance.get_typed_func::<i32, ()>(&mut *store, "free")?;
            let a = text.into_bytes();
            let b = extra.into_bytes();
            let p = malloc.call(&mut *store, (a.len() + b.len()) as i32)?;
            mem.write(&mut *store, p as usize, &a)?;
            mem.write(&mut *store, (p as usize + a.len()) as usize, &b)?;
            instance.get_typed_func::<(i32, i32, i32, i32, i32, i32), ()>(&mut *store, "input_app")?
                .call(&mut *store, (s, seq, p, a.len() as i32, p + a.len() as i32, b.len() as i32))?;
            free.call(&mut *store, p)?;
        }
        WgcCmd::InputString { sid: s, text } => {
            let bytes = text.into_bytes();
            let mem = store.data().mem.unwrap();
            let malloc = instance.get_typed_func::<i32, i32>(&mut *store, "malloc")?;
            let free = instance.get_typed_func::<i32, ()>(&mut *store, "free")?;
            let p = malloc.call(&mut *store, bytes.len() as i32)?;
            mem.write(&mut *store, p as usize, &bytes)?;
            instance.get_typed_func::<(i32, i32, i32), ()>(&mut *store, "input_string")?
                .call(&mut *store, (s, p, bytes.len() as i32))?;
            free.call(&mut *store, p)?;
        }
        WgcCmd::AudioSend { sid: s, data } => {
            let mem = store.data().mem.unwrap();
            let malloc = instance.get_typed_func::<i32, i32>(&mut *store, "malloc")?;
            let free = instance.get_typed_func::<i32, ()>(&mut *store, "free")?;
            let p = malloc.call(&mut *store, data.len() as i32)?;
            mem.write(&mut *store, p as usize, &data)?;
            instance.get_typed_func::<(i32, i32, i32), ()>(&mut *store, "audio_send")?
                .call(&mut *store, (s, p, data.len() as i32))?;
            free.call(&mut *store, p)?;
        }
        WgcCmd::CloseSession { sid: s } => {
            instance.get_typed_func::<i32, ()>(&mut *store, "close_session")?.call(&mut *store, s)?;
        }
        WgcCmd::OnDisconnect { sid: s } => {
            instance.get_typed_func::<i32, ()>(&mut *store, "on_disconnect")?.call(&mut *store, s)?;
        }
        WgcCmd::Encryption { text, reply } => {
            crypt(store, instance, "encryption", text, reply)?;
        }
        WgcCmd::Decryption { text, reply } => {
            crypt(store, instance, "decryption", text, reply)?;
        }
        WgcCmd::Wake => {}
        WgcCmd::Shutdown => {}
    }
    Ok(())
}

fn crypt(store: &mut Store<Host>, instance: &Instance, fname: &str, text: String, reply: Sender<String>) -> Result<()> {
    {
            let bytes = text.into_bytes();
            let mem = store.data().mem.unwrap();
            let malloc = instance.get_typed_func::<i32, i32>(&mut *store, "malloc")?;
            let free = instance.get_typed_func::<i32, ()>(&mut *store, "free")?;
            let rp = malloc.call(&mut *store, 4)?;
            let ap = malloc.call(&mut *store, bytes.len() as i32)?;
            mem.write(&mut *store, ap as usize, &bytes)?;
            let out = instance.get_typed_func::<(i32, i32, i32), i32>(&mut *store, fname)?
                .call(&mut *store, (ap, bytes.len() as i32, rp))?;
            let mut lenb = [0u8; 4];
            mem.read(&mut *store, rp as usize, &mut lenb)?;
            let len = i32::from_le_bytes(lenb);
            let mut buf = vec![0u8; len.max(0) as usize];
            mem.read(&mut *store, out as usize, &mut buf)?;
            free.call(&mut *store, ap)?;
            free.call(&mut *store, rp)?;
            let _ = reply.send(String::from_utf8_lossy(&buf).into_owned());
    }
    Ok(())
}

/// x_fn_exec：按名字调 wasm export（mouse/key_event/request_key_frame/...）。
fn call_by_name(store: &mut Store<Host>, instance: &Instance, name: &str, args: &[i32]) -> Result<()> {
    let Some(f) = instance.get_func(&mut *store, name) else {
        tracing::warn!("wasm export missing: {name}");
        return Ok(());
    };
    let want = f.ty(&mut *store).params().len();
    if want != args.len() {
        tracing::warn!("export {name} takes {want} args, got {} — skipped", args.len());
        return Ok(());
    }
    let params: Vec<Val> = args.iter().map(|&a| Val::I32(a)).collect();
    if let Err(e) = f.call(&mut *store, &params, &mut []) {
        tracing::warn!("export {name} call failed: {e}");
    }
    Ok(())
}

fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}
