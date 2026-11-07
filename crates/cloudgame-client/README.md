# cloudgame-client

云·二重螺旋 云游戏的原生 Windows 客户端（独立 exe）。协议与媒体链路对齐官方 Web 客户端
（`WelinkCloudGame` + `wgc.wasm`）：WebTransport(WL_RTC) 传输、wasmtime 嵌入官方协议引擎、
Media Foundation 硬解 + D3D11 VideoProcessor 呈现、自绘无边框窗口与多账号会话。

## 功能

- **多账号会话**：标题栏标签显示登录账号名，可新建 / 切换 / 关闭；会话保存在
  `%APPDATA%\dna-builder\cloudgame-sessions.json`，进程退出后保留。点 “+” 会启动独立登录进程
  （全新 WebView2 profile），原窗口不关闭。
- **分辨率跟随窗口**：窗口缩放 200ms 防抖后通过 `SetGameResolution` 下发，服务端切流；
  鼠标坐标始终映射到实际码流分辨率。
- **画质档位**：控制中心「画面质量」三档（标准 / 高清 / 超清），对应
  `ResetVideoBitrate` + `autoBitrateAdjust`。
- **无边框窗口**：Win11 DWM 原生圆角；`Alt+Enter` 或控制中心「显示 → 全屏」切换无边框全屏，
  全屏隐藏标题栏，进入时顶部提示 2 秒，`Alt+Enter` 退出。
- **状态区**：信号格按 `WelinkHeartBeat` 的「回测延时」RTT 分档，显示连接时长；
  悬停显示精确延迟毫秒数。喇叭按钮为本地静音。
- **加载界面**：与官方网页一致——黑底 + `loading.css` 的 29 帧精灵图循环。
- 自绘标题栏 / 控制中心面板：GDI 3 倍超采样后降采样，图标与文字平滑。

## 构建

需要 Rust stable 与 Windows MSVC 工具链（`rc.exe` 用于嵌入 exe 图标）。`assets/wgc.wasm`、
图标与加载精灵图已内嵌，无额外运行时依赖。

```bash
cargo build --release
# target\release\cloudgame-client.exe
```

`release` 构建为 Windows **GUI 子系统**程序（不弹控制台窗口），并启用 `tracing` 的
`release_max_level_off`：所有 `info!/warn!/debug!` 调用在编译期裁掉，release 运行时不会输出
（也不会携带）任何日志；调试请使用 debug 构建（保留控制台与日志）。

若命令行里没有 MSVC 环境（`cl`/`rc` 找不到），先执行：

```bat
"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
```

## 运行

双击 exe 即可（首次需在弹出的登录窗登录）。命令行参数：

| 参数 | 说明 |
|---|---|
| `--session <id>` | 打开指定会话（id 见 sessions.json） |
| `--new-session` | 忽略已存会话，先登录新账号 |
| `--add-account` | 独立进程：用全新 WebView2 profile 登录并追加账号（“+” 自动调用） |
| `--probe` | 抓取官方协议字节到 `probe-capture.json` |
| `--ui-preview` | 只起自绘窗口离线预览 UI；配合 `--loading` 预览加载动画 |

## 代码结构

| 文件 | 职责 |
|---|---|
| `main.rs` | 启动流程、会话/登录、路由线程、窗口事件、输入与渲染调度 |
| `wgc.rs` | wgc.wasm 宿主（wasmtime），复刻官方 worker glue 的 imports / 事件 |
| `transport.rs` | WebTransport（WL_RTC）连接与收发 |
| `proto.rs` | SimpleCmd / 各类 protobuf 编解码 |
| `api.rs` / `sign.rs` / `config.rs` | SDK HTTP 接口、签名、常量 |
| `auth.rs` | wry 登录窗（可指定全新 WebView2 profile）与会话持久化 |
| `media.rs` | Media Foundation H.264/H.265 解码（硬解优先，软解回退） |
| `render.rs` | D3D11 交换链 / VideoProcessor 呈现与覆盖层合成 |
| `input.rs` | 键鼠虚拟键值映射 |
| `ui.rs` | 自绘标题栏、控制中心、命中测试、GDI 超采样渲染 |
| `loading.rs` | 官方加载动画精灵图（WIC 解码） |
| `sessions.rs` | 多账号会话列表 |
| `control.rs` | 出流分辨率与码率档位控制 |

## 数据文件

- 会话与登录态：`%APPDATA%\dna-builder\cloudgame-sessions.json`（含 token，请勿外传）
- 新增账号的临时 profile：`%APPDATA%\dna-builder\webview-login\<uuid>`（登录结束即删除）

## 测试

```bash
cargo test
```

`decodes_clean_h264` 默认忽略，需要本地放一份 `video-hb.h264` 抓包后：

```bash
cargo test -- --ignored
```

## 文档

协议逆向、握手时序、坐标系与渲染细节见仓库根目录
[`.agents/docs/cloudgame-native.md`](../../.agents/docs/cloudgame-native.md)。

## License

MIT，见 [LICENSE](LICENSE)。游戏图标、加载精灵图等素材版权归原权利方，仅作为该客户端的资源使用。
