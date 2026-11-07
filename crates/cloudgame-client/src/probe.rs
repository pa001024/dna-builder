//! 协议探针：wry 打开官方云游戏页，注入 localStorage 登录态 + 自动点开始 +
//! hook Worker/MessagePort postMessage，把 send_protobuf/fn_exec 真实字节经 ipc 回传。

use anyhow::{bail, Result};

use crate::auth::Session;
use crate::config;

/// 返回捕获到的字节流列表（每条 {action, actionName, args, data_b64}）。
pub fn capture(session: &Session) -> Result<Vec<String>> {
    use tao::event_loop::{ControlFlow, EventLoopBuilder};
    use tao::platform::run_return::EventLoopExtRunReturn;
    use tao::window::WindowBuilder;
    use wry::{WebContext, WebViewBuilder};

    let mut event_loop = EventLoopBuilder::new().build();
    let window = WindowBuilder::new()
        .with_title("probe")
        .with_inner_size(tao::dpi::LogicalSize::new(1280.0, 800.0))
        .build(&event_loop)?;

    // 简化：直接把 storage 值序列化进 init script
    let init_script = {
        let cache = serde_json::to_string(&format!("{{\"phone\":\"{}\",\"phoneToken\":\"{}\",\"type\":\"phone\",\"cUid\":\"{}\",\"cName\":\"{}\"}}",
            session.phone, session.phone_token, session.cuid, session.cname)).unwrap();
        let usdk = serde_json::to_string(&session.usdk_login_result).unwrap();
        let gc = serde_json::to_string(&session.game_config).unwrap();
        let tok = serde_json::to_string(&session.access_token).unwrap();
        format!(
            r#"
const STORE = {{ CSDK_ACCESS_TOKEN: {tok}, LOGIN_CACHE_INTERNAL: {cache}, USDK_LOGIN_RESULT: {usdk}, GAME_CONFIG_INTERNAL: {gc} }};
for (const [k, v] of Object.entries(STORE)) try {{ localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }} catch(e) {{}}
const b64 = u8 => {{ let s=''; for (let i=0;i<u8.length;i++) s+=String.fromCharCode(u8[i]); return btoa(s); }};
const dump = o => {{ try {{ window.ipc.postMessage(JSON.stringify(o)); }} catch(e) {{}} }};
const ser = (k, v) => v instanceof ArrayBuffer ? {{__b64: b64(new Uint8Array(v))}} : ArrayBuffer.isView(v) ? {{__b64: b64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength))}} : v;

// 给 wgc worker 源码尾部追加 wasm exports 包装：protobuf 入参回传
const WPATCH = `;(function(){{
const b64 = u8=>{{let s='';for(let i=0;i<u8.length;i++)s+=String.fromCharCode(u8[i]);return btoa(s)}};
const tx = o => {{ try{{self.postMessage(o)}}catch(e){{}} }};
const wi = WebAssembly.instantiate.bind(WebAssembly);
WebAssembly.instantiate = function(...a){{
  const imports = a[1];
  if (imports && imports.env) {{
    for (const k of ['send','send_datagram']) {{
      const of = imports.env[k];
      if (typeof of === 'function') imports.env[k] = function(...args){{
        try{{
          const ex = WebAssembly.__wgc_exports;
          if (ex){{ const d = new Uint8Array(ex.memory.buffer, args[1], args[2]); tx({{action:'__wgc_out', fn:k, data:b64(new Uint8Array(d))}}); }}
        }}catch(e){{}}
        return of.apply(this,args);
      }};
    }}
  }}
  return wi.apply(WebAssembly,a).then(r=>{{
    try{{
      const ex = r.instance ? r.instance.exports : r.exports;
      if (ex && ex.protobuf && ex.memory) {{
        WebAssembly.__wgc_exports = ex;
        for (const fn of ['protobuf','input_app','input_string','on_connected','open_session','key_event','mouse','keep_alive','send_keyframe','decryption','encryption']) {{
          const of = ex[fn];
          if (typeof of !== 'function') continue;
          ex[fn] = function(...args){{
            try{{
              if (fn==='protobuf'||fn==='decryption'||fn==='encryption'){{
                const d = new Uint8Array(ex.memory.buffer, args[1], args[2]);
                tx({{action:'__wgc_in', fn, data:b64(new Uint8Array(d))}});
              }} else {{
                tx({{action:'__wgc_in', fn, args:JSON.stringify(args)}});
              }}
            }}catch(e){{}}
            return of.apply(this,args);
          }};
        }}
      }}
    }}catch(e){{}}
    return r;
  }});
}};
}})();`;

const OB = window.Blob;
window.Blob = function(parts, opts) {{
  if (parts) parts = parts.map(p => (typeof p === 'string' && (p.includes('wgc_worker') || p.includes('send_protobuf'))) ? p + WPATCH : p);
  return new OB(parts, opts);
}};
window.Blob.prototype = OB.prototype;
const OW = window.Worker;
window.Worker = function(url, opts) {{
  try {{
    if (typeof url === 'string' && url.startsWith('data:application/javascript,')) {{
      const dec = decodeURIComponent(url.slice('data:application/javascript,'.length));
      if (dec.includes('wgc_worker') || dec.includes('send_protobuf'))
        url = 'data:application/javascript,' + encodeURIComponent(dec + WPATCH);
    }}
  }} catch(e) {{}}
  return new OW(url, opts);
}};
window.Worker.prototype = OW.prototype;

for (const P of [Worker.prototype, MessagePort.prototype]) {{
  const orig = P.postMessage;
  P.postMessage = function(msg, ...rest) {{
    try {{
      if (msg && (msg.action === 'fn_exec' || msg.action === 'x_fn_exec' || msg.action === 'connect' || msg.action === 'load'))
        dump({{ dir: 'out', msg: JSON.parse(JSON.stringify(msg, ser)) }});
    }} catch(e) {{}}
    return orig.call(this, msg, ...rest);
  }};
}}
// hook onmessage setters（属性赋值方式绑定的监听器）
for (const P of [Worker.prototype, MessagePort.prototype]) {{
  const desc = Object.getOwnPropertyDescriptor(P, 'onmessage');
  if (desc && desc.set) {{
    Object.defineProperty(P, 'onmessage', {{
      get: desc.get,
      set: function(fn) {{
        const wrapped = ev => {{
          try {{
            const msg = ev.data;
            if (msg && ['fn_exec','on_message','x_fn_exec','__wgc_in','__wgc_out','connected','notify_close','ondisconnect','on_video_config','on_video_first'].includes(msg.action))
              dump({{ dir: 'in', msg: JSON.parse(JSON.stringify(msg, ser)) }});
          }} catch(e) {{}}
          return fn.call(this, ev);
        }};
        return desc.set.call(this, wrapped);
      }},
    }});
  }}
}}
setInterval(() => {{
  try {{
    const labels = ['开始游戏','进入游戏','启动游戏','立即开始','确定','确认','开始','进入','OK','好的'];
    for (const el of document.querySelectorAll('button, [class*="btn"], [class*="start"], .cursor-pointer, [role="button"]')) {{
      const t = (el.innerText || '').trim();
      if (labels.includes(t)) {{ el.click(); dump({{dir:'ui', click:t}}); }}
    }}
    // 节点选择列表项
    for (const el of document.querySelectorAll('[class*="node"], li, [class*="item"]')) {{
      const t = (el.innerText || '').trim();
      if (/^2001\d\d$|节点|线路/.test(t) && t.length < 30) {{ el.click(); dump({{dir:'ui', click:t}}); break; }}
    }}
  }} catch(e) {{}}
}}, 1500);
"#
        )
    };

    let found: std::sync::Arc<std::sync::Mutex<Vec<String>>> = Default::default();
    let found2 = found.clone();
    let mut web_ctx = WebContext::new(None);
    let _webview = WebViewBuilder::new_with_web_context(&mut web_ctx)
        .with_url(config::CLOUDGAME_PAGE_URL)
        .with_initialization_script(&init_script)
        .with_ipc_handler(move |req| {
            found2.lock().unwrap().push(req.body().to_string());
        })
        .build(&window)?;

    // 最多跑 120s
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(120);
    let f3 = found.clone();
    event_loop.run_return(move |event, _, control_flow| {
        *control_flow = ControlFlow::Poll;
        if std::time::Instant::now() > deadline {
            *control_flow = ControlFlow::Exit;
        }
        if let tao::event::Event::WindowEvent {
            event: tao::event::WindowEvent::CloseRequested,
            ..
        } = event
        {
            *control_flow = ControlFlow::Exit;
        }
    });

    let out = f3.lock().unwrap().clone();
    if out.is_empty() {
        bail!("probe: 未捕获到任何消息");
    }
    Ok(out)
}
