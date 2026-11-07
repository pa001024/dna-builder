# 云·二重螺旋 — 云游戏协议逆向与 Native 客户端

目标：用 Rust 独立 exe（`crates/cloudgame-client`）替代 `apps/web` 里基于 WebView 的云游戏窗口
（`src-tauri/src/commands/cloudgame.rs` + `cloudgame_init.js` 注入桥）。

逆向来源：`https://dna.yingxiong.com/cloudgame/`（index-B98g2EJD.js + WelinkCloudGame.5.11.4 + WeLinkQueue.1.0.4，
均已 pretty-print 存于 `.tmp/cloudgame-re/`）。

## 传输协议总览

官方 SDK 双栈：
- `rtcType = WEBRTC (1)`：标准 RTCPeerConnection + `welink` datachannel，SDP 经
  `wss://webrtc-signaling.vlinkcloud.cn/ws-proxy` 中转。**Native 客户端走这条。**
- `rtcType = WL_RTC (2)`：自研 Emscripten wasm 协议（WebTransport stream + datagram），
  私有二进制，不重实现。不调用 `initWLRTC` 即走 WEBRTC。

### WEBRTC 会话时序（DISPATCH 模式）

1. `PeerConnection` → `createDataChannel("welink")` → `addTransceiver(video, sendrecv)` +
   `addTransceiver(audio, sendrecv)` → `createOffer({iceRestart:true})` → SDP munge（opus stereo、
   flexfec、FEC-FR ssrc；codecType==18 时剥掉 H265）→ `setLocalDescription`。
2. `new WebSocket("wss://webrtc-signaling.vlinkcloud.cn/ws-proxy")`
   → 发送 `{"gsUrl": "ws://{gsIp}:{webRtcPort}"}`（两个值来自 play.lg 的 sdkMsg）。
3. 服务端回 `{code:0, message:"...connected to gs..."}` → 客户端发送 offer `{type:"offer",sdp}`。
4. 服务端回 `{code:0, answer:{type,sdp}}` → 把 answer 中 `a=candidate` 行的 IP/端口改写为
   `gsIp:webRtcPort` → `setRemoteDescription` → 每秒经 datachannel 发原始字符串 `"READY"`。
5. datachannel open → 服务端推 SimpleCmd `protoVersion` → 客户端回
   `SimpleCmd{cmd:"PackedData", arg:<sdpInfo JSON>, data: base64(encodeURI(sdkMsg.packedData))}`。
6. RTP 视频/音频流入站；输入经 datachannel 发 SimpleCmd `CtrlMsg`。
7. 游戏内消息：SimpleCmd `SendDataToGame`（arg=base64(JSON utf8), arg1=自增 index）。

sdpInfo JSON（`getSDPInfo`）：
```json
{
  "local": {"v":"5.11.4.260113143905-wlweb-release","os":"WINDOWS","t":"h5","dpi":0,
            "decode":<codecType>,"sample_rate":48000,"channel":2,"audio_format":"opus",
            "screen_width":1920,"screen_height":1080},
  "user": {"uid":<sdkData.userId>,"t":<sdkData.gsmToken>},
  "function": {"tr_file_pb":0,"tr_json_pb":0,"input_ver":[1,2,3],"support_cmd_v2":true},
  "net": {"t":"connected"}
}
```

### datachannel 消息 = protobuf

```proto
message SimpleCmd {                 // 唯一信封，双向
  string cmd  = 1;  string arg = 2; bytes data = 3;
  string arg1 = 4;  string arg2 = 5;
}
message CoordinatePos { int32 x=1; int32 y=2; }
message OneInputOPData {            // CtrlMsg 的 data 载荷 (CG.PROTO)
  int32 input_op=1; int32 input_state=2; int32 value=3;
  CoordinatePos cursor_pos=4; CoordinatePos mouse_pos=5;
  int32 op_device=6; int32 xinput_user_index=7;
}
message InputOPData { repeated OneInputOPData op_list=1; }
```

关键常量：
- input_op（CG.PROTO.OneInputOPData.InputOP）：键盘=Windows VK 码（0..510）;
  `OP_MOUSE_BUTTON_LEFT=512, MIDDLE=513, RIGHT=514, WHEEL=515, MOV=516, XBUTTON1_BACK=518, XBUTTON2=519`
- input_state：`DEFAULT=1, DOWN=2, UP=3, VK_UNTOGGLED=4, VK_TOGGLED=5`
- op_device（OpMappingDevice）：`KEYBOARD=1, MOUSE=2, XINPUT=3, GAMEPAD=4, TOUCH=16`
- 鼠标移动：`input_op=516, input_state=1, mouse_pos=绝对位移累计, cursor_pos=当前游标`
  （3D 捕获模式 cursor 不动只累计 mouse；普通模式两者同动）
- 滚轮：`input_op=515, value=±120`
- 服务端→客户端 SimpleCmd 已见 cmd：`protoVersion`、`NotifyEvent`、`Offline`、`GameExit`、`RestartGame` 等。

WLCGV2 命名空间另有 `ClientFirstOnline`（DIRECT 模式首包）与 `VideoSettings`
（width=1,height=2,codec_type=3,bit_rate=4,fps=6）；DISPATCH 模式不需要手构 —— packedData 由服务端下发。

## HTTP API

两个 base，均 `POST application/x-www-form-urlencoded`：

### sdk-api.yingxiong.com（业务，签名=MD5+换位）

| 端点 | 用途 |
|---|---|
| `/sdkcom/c1/cloudgame/init.lg` | 租户/gateway/gameId → `data.prod.{gateWayUrl,tenantKey,gameId}` |
| `/sdkcom/c1/cloudgame/user/info.lg` | 时长/freeDuration/paidDuration/playCardEnable |
| `/sdkcom/c1/cloudgame/user/play.lg` | 入场 → `sdkMsg`（session 凭证）或 queuing |
| `/sdkcom/c1/auth/phone/login.lg` | 手机号+验证码登录 → `phoneToken`,`code` |
| `/sdkcom/c1/auth/phone/autoLogin.lg` | `{token:phoneToken,phone,client_id:appKey}` 静默登录 |
| `/sdkcom/auth/getToken.lg` | `{code,client_id,client_secret,...}` → `access_token` |
| `/sdkcom/auth/getUserInfo.lg` | `{access_token}` → 用户信息 |

签名（`hN`）：body = data ∪ GAME_CONFIG_INTERNAL(channelParams 字段） + `deviceNum`(UUID，持久化）
+ `sign`；`sign = swap(md5(sorted "k=v&" join + "&" + appKey), [1↔13,5↔17,7↔23])`，空值字段剔除。

固定配置：`appKey=qkMwl7BaLLBBxxLbHBXw`, `appSecret=kun4PXFFDDJHwSVsSR3A`,
`productId=D10724A`, `projectId=P39425A`, `serverId=M1706A`, `pkg=com.cloudegame.h5`,
`cid=314`, `channel=heroh5cloud`, `pcode=17337`, CONFIG_COMMON_DATA=`{__e__:"1",grant_type:"authorization_code",redirect_uri:"1",response_type:"code",market:"PC",platform:"PC",sdkVersion:"5.0.0"}`。

### usdk.yingxiong.com/hu（登录态 token，AES 信封）

`/v1/login/checklgn.lg` `{cToken: accessToken}` → 返回 `{accessToken,cToken,cUid,cName,phone,...}`，
**cToken 才是云游戏 API 的 access_token**（play.lg/user/info.lg 都带它）。

请求信封（`JP`，init.lg 除外）：
`{pcode, timestamp(秒), data, _e_:aki, sign}`
- `data` = base64_swap(AES-256-CBC-PKCS7(JSON(merge(body, 固定 envelope.data)), key, iv))
- key = base64dec(`dDNWeEtjZXdKdm9XUUNmVjdjV1lSQ1hZaWs1U1ZObmo=`) = `sCtVcNewJvoWQCfV7cWYRCXYik5UVNnj`，iv = key[:16]
- base64_swap：len>51 时 swap 字符位 [1↔33,10↔42,18↔50,19↔51]
- `sign` = md5(sorted-join({pcode,timestamp,data,_e_}) + "&" + appKey=productKey)
- envelope.data 固定字段：`{lang,active:"1",smd5:"1",vc:"1",vn:"1",svc:"0.0.1",svn:"0.0.1",cc:"10",cn:"5.0.0",plat:"4",dn:"1111",imei:"111",imsi:"",ov:"",om:"",pkg,channel,cid}`，`aki="1373718187"`
- 响应解包（`QP`）：先 JSON.parse → 否则 unswap → base64dec → 再 JSON.parse → 否则 AES 解密

### 排队（WeLinkQueue 1.0.4，挂 SDK IspUrl = gateWayUrl）

play.lg 的 sdkMsg `identiType=="queuing"`、`seatNo/queuingSize != -1`、`token` 非空且非 `"{}"` 时进入排队。
官方：先用 play sdkMsg 内嵌数值上屏，**立即** `POST {gateWayUrl}/sdk_api/web/queue/search_queue_info`
（FormData：`token/requestId/requestTime=Date.now()`，单次请求 2s 超时），之后每 10s 一次；
`code:200|4000` → `data.sdkMsg` 出现即真 session，否则 `data.{seatNo,queuingSize}`；
`seatNo` 单调不增（`min(旧,新)`，下限 0），`queuingSize<=0` 归 0；`500` 继续轮询，其他 code 取消并报错；
30s 无成功响应 → `POST /sdk_api/web/queue/cancel` 并失败。

UI 口径（官方 CloudGameContainer 排队面板）：`queuingSize` 即「目前排队名次」（0 显示 1），
`seatNo` 只用于推算分钟数：`<=1` 不刷新、`2..=30` 记 1 分钟、`>30` 为
`min(floor(sqrt(seatNo-30)*10+1), 90)`。native 端在 loading 页居中显示三行
`排队中 / 目前排队名次 N 位 / 预计等待时间 M 分钟`（`loading::set_queue`）。

### 节点选择

`getNode` 从 `paas-sdk-config.vlinkcloud.cn/gameDeployNode/{gameId}/{instanceId}.html?t=` 拉 nodeList，
ping 后返回 `nodeResult.nodeId` 填 play.lg 的 `node`。v1 可直接取首个节点。

### play.lg 请求体

`{userId:cUid, node:nodeId, resolution:"WxH", bitRate, fps:60, codecType, version:"v1.0", cmdLine:"",
env:0, bizData:<bizData JSON>, access_token:cToken, queueType:1|2}`；
bizData=`{btype:"",os:"WINDOWS",osVer:"",clientVer:"5.11.4.260113143905-wlweb-release",osCategory:"H5",isOneLine:1,extSDK:"{...}",ping:[...]}`。
sdkMsg 非 queuing 时 = `{auth,verify,packedData,assignResultParam,gsIp,gsPort|webRtcPort,gsmToken,userId,codecType,schemeType,gsVer,...}`。

### 游戏内登录（进房后）

datachannel 上 `SendDataToGame` 两条：
1. `{type:"initData",plat:"pcWeb",data:{channelId:"314",channelName:"英雄互娱-h5云游戏",channelSdkVersionName:"5.0.0",channelProjectId:"P39425A",deviceNum,...},cloud_app_msg:<json>}`
2. `{type:"login",plat:"pcWeb",data:{pcode:"17337",accessToken,cName,cUid}}`
载荷整体先 `JSON.stringify` 再 base64（`VU`=btoa(utf8)）。

## 登录/持久化设计（native）

- 首登：wry(WebView2）小窗嵌官方登录页完成 253 验证码+短信 → 抓 `phoneToken`/`access_token` → 落盘
  `%APPDATA%/dna-builder/cloudgame-session.json`（phoneToken + deviceNum + checklgn 结果）。
- 之后：`autoLogin.lg`（phoneToken）→ getToken → checklgn 全静默；30002 = 失效重登。

## Native 客户端结构

```
crates/cloudgame-client/
  src/main.rs      — 状态机：login → init → node → play/queue → rtc → 渲染
  src/api.rs       — sdk-api + usdk 客户端（签名/AES 信封）
  src/auth.rs      — wry 登录窗 + token 持久化
  src/rtc.rs       — webrtc-rs PC + ws-proxy 信令 + datachannel SimpleCmd
  src/proto.rs     — 手写 protobuf 编解码（SimpleCmd/InputOPData）
  src/input.rs     — winit DeviceEvent 原始鼠标 + 键盘 VK → CtrlMsg
  src/video.rs     — H264 解码（Media Foundation / openh264）+ wgpu/softbuffer 渲染
  src/audio.rs     — opus → cpal
```

## WL_RTC / WebTransport 路径（已选定为主方案）

官方 SDK 的 WL_RTC 是 Emscripten wasm 私有协议引擎，**完整重实现不可行，故 native 端直接加载官方 wasm**:

### wasm 提取（已验证）
- `welink.js` 内嵌 bootstrap wasm（7-bit packed 字符串，`y=[0,10,13,34,38,92]` 表解码）
- bootstrap.wasm(594KB)导出 `load(0)`→len、`data(0)`→ptr、`memory` → 真实 `wgc.wasm`(2.24MB)
- 已落盘 `crates/cloudgame-client/assets/wgc.wasm`，wasmtime/node 均可实例化
- 解密 blob(`decryption(...)`)只是画质增强 shader，非必需

### wasm ABI
- env imports: `send`(→WT bidi write)、`send_datagram`、`on_video(sid,?,key,ptr,len)`、`on_video_config(sid,codec,w,h)`、`on_audio`/`on_audio_config`、`on_message(sid,type,p1,l1,p2,l2)`、`on_bitrate_update`、`on_stats`、`send_keyframe`、`log_message`、`rand_bytes`、`date_now`(u64ms)、`_hrtime`(u64 sec+u64 nsec)、`_localtime_r`、`delay_work(idle)`、`schedule_work(ms)`、`on_memory_growth`、`emscripten_return_address`→0
- exports: `startup(16)`、`open_session(sid,1,video_codec,audio_codec)`、`on_connected(sid,jsonPtr,len)`、`ondata`/`ondatagram(sid,ptr,len)`、`close_session`、`on_disconnect`、`protobuf(sid,ptr,len)`、`input_app`、`input_string`、`audio_open/send/close`、`mouse`、`key_event`、`touch`、`request_key_frame`、`set_video_bitrate`、`change_avc`、`encryption`/`decryption`、`malloc`/`free`
- x_fn_exec 语义 = 直接调同名 export(mouse(sid,mx,my,cx,cy,action,code,value,extra)、key_event(sid,state,vk))

### 连接流程
1. `play.lg` sdkMsg → `gsIp`/`webRtcPort`/`gsmToken`/`userId`/`codecType`/`extSDK.cert_hash`
2. cert hash: `JSON.parse(extSDK.cert_hash)` = `[{algorithm:"sha-256",value:b64}]`；fallback `GET https://transfer-inner.wl-times.com/cert_hash/{ip}/{port}`
3. `new WebTransport("https://{ip}:{port}/v2/game", {serverCertificateHashes, requireUnreliable:true})` → 等 ready → `createBidirectionalStream`
4. `open_session(sid,1,video_codec,audio_codec)`；codec: codecType 18→1(H264)、21→2(H265)
5. `on_connected(sid, JSON.stringify({auth:{token:gsmToken,uid:userId,"transport-protocol":1},game_info:{}}))`
6. WT bidi reader→`ondata`、datagrams reader→`ondatagram`；wasm `send`→bidi write、`send_datagram`→datagram
7. 游戏消息走 `protobuf` export（同 SimpleCmd 编码：`SendDataToGame` initData/login)

### native 实现状态（cargo check 通过）
`crates/cloudgame-client/`:wgc.rs(wasmtime 宿主)、transport.rs(wtransport+hash pinning)、media.rs(MF 硬解+NV12→BGRA)、auth.rs(wry 登录窗+session 持久化)、main.rs（编排+winit 鼠标捕获+键鼠→wasm+softbuffer 渲染+cpal 音频）

### 待真机验证
- audio_codec 值（暂写 1)、mouse() 参数顺序、SendDataToGame 发送时机、cert_hash 结构

## WL_RTC 握手时序(实测确认)
1. WT connect → open_session(sid,1,vcodec,acodec) → on_connected(sid,{auth:{token:gsmToken,uid,transport-protocol:1},game_info:{}})
2. 服务端推 kind=99 protoVersion(arg=2.2 arg1=5.13.2)
3. 应答序列(顺序重要):LocalIm{arg:"1"} → auth{arg=gsmToken,arg1=codecType,data=utf8(userId)} → authV2{arg="authV2",arg1=sdpJson} → PackedData{arg=sdpJson,data=encodeURI(packedData)}
4. 服务端回:OnAuthResult{arg=success} → ginput_level{arg=1} → PipeState{arg=0}
5. 周期:SendDataToGame initData/login 每1s重发 + keep_alive + READY(raw bytes) + request_key_frame
注意:
- jspb setData(字符串) 按 base64 解码!data 字段线上字节=encodeURI(packedData) 原文,不是 double-b64
- PackedData 在 auth 之前发会被踢(156:close code260);auth+authV2 单独发不踢
- sdpJson: {local:{v,os,t:"h5",dpi:0,decode:codecType,sample_rate:48000,channel:2,audio_format:"opus",screen_width,screen_height},user:{uid,t:gsmToken},function:{tr_file_pb:0,tr_json_pb:0,input_ver:[1,2,3],support_cmd_v2:true},net:{t:"connected"}}
- play.lg codecType:gsVer=2.4.1 实测 18(H264);gsVer>=5 用 gsPort 否则 webRtcPort
- weilinSdkStatus: 0=成功 1=时长耗尽 2=分配失败重试
- 待解决:PipeState 停 0,on_video 从未触发;session ~2min 后 Session::OnClosed

## 握手补充验证（DISPATCH 首次启动，逐条对照官方 JS）
protoVersion 后官方实际发送序(DISPATCH 分支,startType=DISPATCH,mIsStart=false):
1. LocalIm {cmd:"LocalIm", arg:"1"}
2. PackedData {cmd:"PackedData", arg:sdpJson, data:encodeURI(packedData)原始字节}
3. R1()/w(): ChannelType {cmd:"ChannelType", arg:"主通道", data:"3015001000", arg1:"0", arg2:"23"}(me||R1())
4. (可选)OpenAudio {cmd:"OpenAudio", arg:"opus", data:utf8"12", arg1:"48000"}
另:sO/I 构造时 SendDataToGame/auth/authV2 的 cmd 字段为空(按字段形状识别)
服务端回:OnAuthResult{arg=success} → ginput_level → PipeState=0 → BitrateChange → AudioOpen → swap_gs_info → ~13s → PipeState=1
- initData/login(SendDataToGame,arg=b64(json),arg1=index):官方在首帧(6038=FIRST_VIDEO_FRAME_RECEIVED)后才发,提前发游戏进程还没起
- kind=7 = WGC_DATA_FROM_GAME;kind=1=WGC_CONNECTED;kind=19≈SET_ANSWER_SUCCESS
- auth/verify/assignResultParam 只走标准 WebRTC ws:// 信令,WL_RTC 不用
- getBizData/play.lg bizData:{btype:"",os:ag(),osVer:"",clientVer,osCategory:"H5",isOneLine:1,extSDK:{certHash:true},ping:[{nodeId,result}]}
- 节点测速:GET {nodeConfigBase}/ping/{md5(nodeId+"H5")}.html → bizData.ping(可能影响分配/线路)
- 仍未解:媒体零字节(stream 仅控制包,datagram 协商成功但 0 收),on_video 从未触发

## 突破:媒体链路打通(2026-11-06)
**根因**:`SendDataToGame` 的 `cmd` 字段必须是 `"SendDataToGame"` —— 官方 `I(t,e)` 恒 `setCmd(e)`。
之前 cmd="" 导致游戏进程丢弃全部 initData/login → 不推流。
**握手全集(DISPATCH,protoVersion 后)**:LocalIm + PackedData + ChannelType + intercept_app + ClientOnline + OpenAudio
- ChannelType:`{cmd:"ChannelType",arg:"主通道",data:"3015001000",arg1:"0",arg2:"23"}`
- intercept_app:`{cmd:"intercept_app",arg:'{"transFile":true,"transJson":true,"transTxt":false}'}`
- authV2:`{cmd:"authV2",arg:"authV2",arg1:sdpJson}`(arg 是字面量"authV2"不是数据!)
- SendDataToGame:`{cmd:"SendDataToGame",arg:b64(json),arg1:index}` index 全局单调递增
**媒体路径**:视频 RTP 走 QUIC datagram(PT=96,H264 FU-A+SPS,~1200b/包,seq 无缺口)
→ feed `ondatagram` → wasm 组帧 → `on_video` 回调(编码帧)→ MfDecoder(H264)→ NV12→BGRA→softbuffer
- on_video_config codec=1 先触发,关键帧 key=true 随后,~50fps
- on_audio 1920b PCM(wasm 内部已解码 opus)
- MfDecoder 需 MF_MT_INTERLACE_MODE/FRAME_SIZE/FRAME_RATE/PIXEL_ASPECT_RATIO 属性,否则 0xC00D36E6
- datagram_receive_buffer_size 16MB(突发防丢)
- open_session flag=1 正确(0 直接关会话),video_codec=1 H264 配 codecType=18

## 视频"隔行条纹"根因(2026-11-07)

**现象**:on_video 输出的 H264 用 ffmpeg 解码干净，MFT 解码整屏横向条纹(奇数 Y 行损坏，仍能辨认 UI)。

**根因**:流真实尺寸是 1920x1080(profile_idc=100，SPS 1920x1088，crop bottom 4 → 1920x1080)，
而 MfDecoder 的输入/输出类型都固定为请求分辨率 1600x900。解码器仍按 SPS 以 1920 pitch 写帧，
旧代码在 `MF_E_TRANSFORM_STREAM_CHANGE` 只做 `GetOutputCurrentType` + `continue`、从不重新
`SetOutputType`，输出类型元数据停留在 1600x900 → 按 1600 读行，每行横向错位 320 字节
(1920-1600)，整幅图斜切并在水平方向约 6 次折返，看起来像"隔行条纹"。
逐行 FFT 相关可量化：修复前相邻行 ~0.196 @ 位移 320px，修复后 0.998 @ 位移 ~0。

**修复**(`src/media.rs`):
- `MfDecoder::new(codec, w, h)` 用 on_video_config 的真实尺寸(官方 JS 也是用它
  `videoDecoder.configure({codedWidth, codedHeight})`)；
- `MF_E_TRANSFORM_STREAM_CHANGE`(ProcessInput/ProcessOutput 两处)→ 重新枚举 NV12 输出类型并
  `SetOutputType`，编码尺寸更新为 1920x1088，显示尺寸取 `MF_MT_MINIMUM_DISPLAY_APERTURE`(=1920x1080)；
- 取帧优先 `IMF2DBuffer::Lock2D` 的真实 pitch，按 aperture 裁到显示尺寸；UV 偏移用 buffer
  长度反推的宏块对齐行数，不再由长度硬推；
- 输出 sample 缓冲按编码尺寸分配(原固定 4MB 对 1920x1088*1.5 不够)。

**验证**:`cargo test decodes_clean_h264` —— video-hb.h264 从 SPS(offset 7_749_649)起解出
383 帧，`mftest.nv12` 为干净 1920x1080(登录失败对话框可读)。

**附带结论**:
- 与 wasm 内部丢包/`do_delay_work` 时序无关；`No decodable frame requesting keyframe` 是启动期
  常态日志，不是条纹来源。send/send_datagram 未就绪语义、JS 背压丢帧同样未参与该现象。
- dump 的 800 帧里只有 1 组 SPS/PPS+IDR(位于 46% 处)，此前"ffmpeg 解同一份数据干净"只在
  参数集刷新之后成立；前半段 ffmpeg 报 `non-existing PPS 2` 并整帧丢弃，MFT 则继续硬解。
- 截帧中游戏侧显示"登录失败：由于未知的网络原因，暂时无法登录"——视频链路之外的另一问题。

## 硬件解码 + GPU 呈现(对应官方 WebCodecs 硬解 + WebGL 合成)

两个独立问题:
1. **只有音频没有画面**:解码线程只在输入队列为空(`pending==0`)时才转换显示帧；稳定 50fps
   输入下队列永不为空，`frame` 槽永远不更新。改为"每帧都解，显示转换限速且必须周期性出帧"。
2. **帧率低/无硬解**:原路径是 MFT 软解 + CPU 逐像素 NV12→BGRA + CPU 缩放 + softbuffer。

现路径(`src/render.rs` + `src/media.rs`):
- D3D11 设备需 `D3D11_CREATE_DEVICE_VIDEO_SUPPORT | BGRA`，并**必须**
  `ID3D10Multithread::SetMultithreadProtected(TRUE)`；否则与 MF 解码线程共用立即上下文时
  `CreateVideoProcessorEnumerator` 会永久卡死(实测)。
- `MFCreateDXGIDeviceManager` → `MFT_MESSAGE_SET_D3D_MANAGER` 后，MFT 输出流变为
  `provides_samples=true`(flags=0x107)：样本由解码器提供，buffer 是 `IMFDXGIBuffer` 纹理。
- `ID3D11VideoDevice/Context` + `D3D11_VIDEO_PROCESSOR_CONTENT_DESC`：NV12 纹理直接
  `VideoProcessorBlt` 到交换链(驱动内完成 YUV→RGB + 缩放)，`VideoProcessorSetStreamSourceRect`
  裁掉宏块补齐行(1600x912→1600x900)；`Present(0)`。窗口尺寸变化 → `ResizeBuffers` + 重建处理器。
- 输入尺寸变化(实测服务端会从 1600x900 切到 1920x1080)由 STREAM_CHANGE 重协商驱动，
  VideoProcessor 按新尺寸重建。
- 回退链:硬解初始化失败 → 软解;GPU 呈现连续失败 → 软解 NV12 → `present_nv12` 上传纹理
  仍走 GPU;再失败 → CPU 转换 + softbuffer。UI 线程在 GPU 生效后切 `ControlFlow::Wait`。

实测(debug 构建，1920x1080): 稳定 58~62fps，整进程 CPU ≈ 40% 单核(含 wasm 引擎 2000 包/秒),
窗口截图为干净的全彩画面。

**帧序/回溯问题(2026-11-07 追加)**:
- 服务端码流无 B 帧(SPS `pic_order_cnt_type=2`，只有 I/P slice)，`frame_num` 逐帧 +1。
  已加两层检测：码流级 `slice_frame_num`(非 IDR 期望 prev+1)与解码输出 sample time 单调性；
  实测 1800+ 帧均为 0 异常 → 不存在上游或解码器乱序。
- 视觉上的"乱序/回溯"来自呈现:flip 交换链 `Present(sync=0)` 允许在扫描中翻转，观感就是画面
  反复回跳。改为 `Present(1, 0)` 垂直同步(等价官方 JS 的 requestAnimationFrame 节奏)。
- 另按官方渲染 worker 的 queue≤3 策略：`pending>2` 时丢弃**显示帧**(编码帧仍全解，保参考链)，
  避免 vsync 下积压无限增长(实测输入 ~60fps 时 600 帧用 11.3s，队列会慢慢堆积)。
  加丢帧后稳态 `pending=0`。

## 帧序/回溯修复(2026-11-07 晚，逐条对照官方 JS worker)

官方参考:`welink.pretty.js:7310`(v_decoder_worker)、`:7318`(v_renderer_worker)。

1. **解码器延迟**：MFT 光设 `MF_LOW_LATENCY` 属性不够，H264 MFT 真正认的是
   `ICodecAPI::SetValue(CODECAPI_AVLowLatencyMode, VARIANT{vt=VT_UI4, ulVal=1})`
   （传 VT_BOOL 返回 `0x80070057 Invalid argument (VT_UI4 != pValue->vt)`）。两条都设后
   实测 `MF out lag 1 frames`（用输出 sample time 反推的内容滞后），对应 WebCodecs
   `optimizeForLatency`。
2. **纹理槽位复用**：`provides_samples=true` 时输出纹理来自解码器纹理池，释放 IMFSample 后
   解码器立刻复用槽位，`VideoProcessorBlt` 可能读到下一帧或半更新内容（观感=画面回跳）。
   现在 sample 保留最近 4 帧，且呈现前 `CopySubresourceRegion` 到自有 NV12 纹理再合成
   （WebCodecs 的 VideoFrame 同样是快照语义）。
3. **关键帧门控**：官方解码 worker 的 `r` 门控——重建后只解 key 帧，delta 累计 11 帧或
   200ms 未等到 key 就重发请求。新增 `await_key`：config 变更/解码出错/flush 后置位，
   key 帧清除；门控期间每 200ms `request_key_frame`（wasm export，1 个 i32 参数，官方传空参）。
4. **积压 flush**：官方 `decodeQueueSize>=15` 时 `flush()` 再等 key；这里在 `pending>=15`
   的 delta 上重建解码器并等 key。启动瞬间触发 1 次，之后 pending 稳态为 0。
5. **wasm 工作回调调度**：原来 `delay_work`/`schedule_work` 把 `do_work` 塞进与 datagram
   相同的 FIFO，最多排在数千个 feed 之后（每个 ~40µs）；JS 用 setTimeout(0)，每条消息处理完
   就会跑。改为原子标志位(bit0 `do_work`/bit1 `do_idle_work`/bit2 `do_delay_work`)，每条命令
   dispatch 返回后立即执行，最多 32 轮防自排死循环。`No decodable frame` 从早期单次运行
   20~69 条降到 3~8 条，且全部集中在启动/游戏重启的瞬间。

**实测**(run15, debug 构建, 1600x900→1920x1080):
- `MF out lag 1 frames`(稳态 in=N, out_idx=N-1)，`present latency avg≈0.4ms`，`pending=0`；
  码流 `frame_num` 单调、输出 sample time 单调、呈现顺序=解码顺序，均为 0 异常。
- 60fps 抓屏 25s/1500 帧做序列比对：1483 帧最佳匹配为前一帧(lag=1)，11 帧 lag=2(抓屏抖动)，
  仅 3 帧 lag>2 且全部落在背景过场硬切上（匹配距离 28~56，属切镜而非回溯）。
- 注：`cargo test decodes_clean_h264` 把 dump 按 32KB 任意切块喂入（非按 access unit）且跨分辨率
  切换，日志里的 `解码输出乱序` 是该喂法 + stream change 的产物；live 路径一帧一 AU，实测 0 条。

**登录态过期**：wry/tao 登录窗跑完事件循环后，同线程再建 winit 事件循环会静默退出(无 stderr)。
现在登录成功后直接 `Command::new(current_exe)` 重启进程再进游戏。

## 游戏内登录对齐官方(2026-11-07 晚)

现象：云实例里游戏停在"登录失败：由于未知的网络原因，暂时无法登录"，而官方 JS 客户端能登进去。

对照 `index.pretty.js`：

- `handleSpeed()` 把 `Qn().sdkLoginResult` 传给 `handleGameMessage()`，首帧(6038)时执行
  `initGame()` + `loginGame({pcode, accessToken, cName, cUid})`。**`accessToken` 取的是
  `sdkLoginResult.accessToken`（USDK/checklgn 的 token，如 `63a2c614-…`），不是
  `CSDK_ACCESS_TOKEN`（`e282cc41-…`，还带前导引号）**。原实现发的是后者 → 游戏拒绝登录。
  现在 `Session::game_access_token()` 从 `USDK_LOGIN_RESULT` 解（兼容顶层/`data` 包裹），缺失才退回 CSDK token。
- `initGame()` 的 `cloud_app_msg` 是 `JSON.stringify({#device_key,#os,#user_agent,#session_id,#click_id,…})`
  的埋点串，原实现发 `"{}"`；已按官方字段补齐。`deviceNum` = HERO_DEVICE_ID（本端 `session.device_num`）。
- `SendDataToGame` 信封与官方一致：`arg`=base64(JSON)、`arg1`=index（官方 `VU=base64(utf8)`，
  经 `sO` 的 `setArg(data).setArg1(index)`）。序号 `GAME_DATA_IDX` 单调递增，**游戏重启后继续累加**。
- 游戏重启(`SimpleCmd cmd=GameRestart/GameRestartV2`，官方对应 6089 `RESTART_GAME_X86`)后
  官方在画面恢复约 2s 时重发 initData+login；本端在路由线程记 `restart_at`，之后第一帧超过 2s 时重发。

## 输入坐标系 + 出流分辨率 / 画质控制(2026-11-07)

**鼠标坐标**：`mouse(sid, mouseX, mouseY, cursorX, cursorY, action, code, value)`
- `mouseX/mouseY` 是官方 `U()` 的原始位移累计：每个鼠标事件的 `dx/dy` 先 clamp ±127，再**无上限**累加；
  捕获模式下游标 = 上一点 + 位移 × (gameW/winW, gameH/winH)，再 clamp 到码流范围。
- `cursorX/cursorY` 必须是**实际码流分辨率**（`gameWidth/gameHeight`）坐标：
  运行时服务端会把 1600x900 的握手分辨率切到 1920x1080（`on_video_config` / `BitrateChange arg2` / `frameSizeChanged`）。
  用握手分辨率换算会整体偏移，表现为"点不到按钮"。客户端用 `game_size` 实时跟踪，窗口坐标 → 码流坐标：
  `x = win_x * gameW / winW`，`y = (win_y - title_h) * gameH / (winH - title_h)`。

**游戏鼠标捕获的触发条件**：服务端 `mouse_mode=1` 只是"请求捕获"，客户端还要 `grab_armed` 才真正
`set_cursor_grab`。`grab_armed` 只由**落在渲染区、且未被自绘 UI 消费的鼠标按下**置位；窗口激活
（Alt-Tab 回来）、标题栏/控件点击、光标在标题栏上方移动都不会进入捕获。失焦、Esc 释放、断线卡片
都会释放捕获并清除 armed，恢复游戏需再次点击渲染区。旧的实现只要 `mouse_mode=1` 就在任意鼠标事件里
重新捕获，点标题栏/回焦即被游戏锁鼠标。

捕获必须用 `CursorGrabMode::Locked`（失败才退回 Confined）：winit 在 Windows 上对
**Confined + set_cursor_visible(false)** 的组合会把光标钳到窗口中心 1px 处；游戏里拖拽滚动等场景
也会触发捕获，拖拽结束释放后指针就跳回窗口中心，交互割裂。Locked 把光标固定在进入捕获时的位置，
释放后仍在原处（与浏览器 pointer lock 一致）。

**窗口缩放 → SetGameResolution（必须）**：`Resized` 后 200ms 防抖下发 `SimpleCmd SetGameResolution(arg=w, arg1=h)`，
否则服务端输出分辨率与本地呈现尺寸不匹配，画面显示错误。官方 SDK 除此之外还会在游戏侧主动上报
（`6426` → `setGameResolution`）时下发同样的命令。

**最大化后 Alt+Enter 画面冻结的真正根因**：`ID3D11VideoProcessorInputView/OutputView` 绑定在创建它们的
enumerator 上；`resize()`/`ensure_proc()` 重建 processor 时如果只清 `proc` 而保留 `in_views/out_views`，
`VideoProcessorBlt` 返回 `E_INVALIDARG`，画面停在最后一帧（声音正常）。修复：重建 processor 时
**同时清空两个视图缓存**。这条与 SetGameResolution 无关。

**画质档位**（官方 `bitRateLevelMap`，默认高清）：标准 2000/6000、高清 4000/10000、超清 8000/12000 Kbps。
下发顺序 `ResetVideoBitrate(arg=maxKbps)` → `autoBitrateAdjust(arg=minKbps)`；首帧和游戏重启后重发。

## 自绘窗口 / 多会话 UI(2026-11-07)

- 无边框 winit 窗口；顶部 `title_h` 由 `ui::title_height(scale)` 给出，视频从 `title_h` 开始。
  边缘 6px 命中后交给系统模态缩放循环（`window.drag_resize_window(ResizeDirection)`），
  空白标题栏用 `window.drag_window()`；不要自己累计鼠标位移去 `set_outer_position/request_inner_size`
  （会与系统缩放不同步、界面撕裂）。
- 标题栏与控制中心面板用 GDI 画到 DIB，**按 3 倍尺寸绘制后盒式降采样**（`ui.rs` 的 `SS`），
  圆角/图标/文字都获得平滑边缘；GDI 不写 alpha，所以整块按不透明合成。
- GPU 路径把覆盖层作为两张 BGRA 纹理（slot 0 标题栏、slot 1 面板），呈现前
  `CopySubresourceRegion` 到交换链后备缓冲（不做 alpha 混合，故面板是直角）；
  CPU(softbuffer) 路径在 `RedrawRequested` 里逐像素合成。
- 命中测试直接在**物理像素窗口坐标**做；按下时用 `GetCursorPos`+`ScreenToClient` 重取光标，
  避免合成的鼠标移动事件还没送达导致用旧坐标命中。
- 缩放时 CPU 路径合成的标题栏位图可能仍是旧宽度：按新行宽强行合成会“拉丝”。现在检测
  `bar_pixels.len() == dw*title_h*4`，不匹配时该帧先铺标题栏底色，等 AboutToWait 按新尺寸
  重绘后再合成；加载动画在软呈现下只在精灵帧序号变化时（约 29fps）请求重绘，避免拖动时
  60fps 全窗重绘拖慢。
- 多会话：`%APPDATA%/dna-builder/cloudgame-sessions.json`
  `{ sessions: Profile[{id,name,node,session}], default: <id>, active?: <兼容旧字段> }`；
  不带 `--id` 启动用 `default`（上次启动的账号），`--id <id>` 指定本窗口账号，可多开；
  不存在的 id 会被忽略退回 `default`。点**非当前**标签 → 新进程 `--id <id>`（不杀当前进程）；
  点标签的 × → 从列表移除该账号并退出（其他窗口在 AboutToWait 发现自己被移除后自行退出）。
  账号切换通过重启自身实现（`relaunch_after` 带 `--delay-start` 让旧进程先释放实例）；
  **重连与换线路都在进程内重建连接，不重启进程**。
  登录态按账号隔离在 `%APPDATA%/dna-builder/webview-login/<id>`，**登录后不删除**，下次重登复用同一 profile。
- 状态区：信号格数按 `威测延时` RTT 分档；其右是**实时下行码率**（`7.8MB/s`）与**呈现帧率**（`FPS60`），
  再右是连接时长。码率在 `transport.rs` 入站（datagram + bidi stream）累加 `ui::add_rx_bytes`，
  帧率在各呈现路径成功后 `ui::add_frame`；事件循环 `AboutToWait` 每 ~500ms 调 `ui::sample_stats()`
  把累计量换成速率（指数平滑）。两个值用**固定宽度槽位**绘制，数字变化不会让标题栏重排。
  连接时长从首帧开始计（`WelinkHeartBeat` 每 2s 记录发送时间，
  收到 `SimpleCmd cmd="威测延时"` 即 RTT）。喇叭按钮 = 本地静音（输出置零，不中断解码）。

## 状态栏延迟 / 加载画面 / 全屏 / 新增账号(2026-11-07 晚)

**延迟**：`WelinkHeartBeat` 是 29 字节裸 protobuf（field1=`测延时`），服务端回 `SimpleCmd cmd="回测延时"`
（官方常量 `Vt = Mt(utf8 "回测延时")`）。发送时记 `timeDelay`，收到回包时 `now - timeDelay` 即 RTT；
`native` 里对应 `ui::heartbeat_sent/heartbeat_recv`，信号格 4 档 (<60/<120/<220/其余) 按 RTT 着色。
鼠标悬停信号区显示精确毫秒（`Hit::Signal`，不参与点击）。

**加载画面**：与官方网页 `loading-wrapper` 一致——纯黑背景 + 官方 `loading.css` 内嵌的 184×183 精灵图，
29 帧 / 1s 循环（`animation: loadingAppCustom 1s steps(29)`）。精灵图存
`assets/loading_sprite.png`，运行时用 **WIC** 解一次（`loading.rs`），RGB 预乘到黑底后按窗口 DPI 居中绘制。
窗口在 play/排队之前就创建：`spawn_startup` 把 play、排队、transport 放到后台线程（`Handle::block_on`），
主线程直接进 `run_window`，所以排队期间 loading 页可见；排队完成后文案切到官方的
「游戏启动中，请耐心等待～」，首帧到达即显示码流。

**全屏**：`Alt+Enter` 或控制中心「显示 → 全屏」切换 `Fullscreen::Borderless(None)`（无边框窗口化）。
进入前用 `GetWindowPlacement` 保存 placement：`rcNormalPosition` 是“还原矩形”（**最大化窗口也保留
最大化前的位置**），`showCmd` 记录是否最大化。若当前是最大化，**先 `set_maximized(false)` 再进全屏**——
最大化状态直接进无边框全屏会让 DWM 停止消费 flip 链的 Present，表现为画面冻结、声音继续。
退出时先 `set_fullscreen(None)`（winit 恢复它自己保存的 placement），150ms 后在 AboutToWait 里按保存的
placement `SetWindowPlacement`，因此 `窗口化→最大化→全屏→退出` 仍能还原到最初窗口位置与最大化状态。
`SetWindowPlacement` 引起的最大化和 winit 的 `Resized` 缓存可能不同步，恢复后要按 `GetClientRect`
**强制重排一次**（`title_h`、`video_area`、softbuffer、`RenderCmd::Resize` + `Repaint`、`bar_sig = None`），
否则最大化后界面/交换链停在旧尺寸。`title_h` 按全屏状态在 AboutToWait 兜底对齐（窗口矩形可能恰好不变、没有 `Resized`）。全屏时 `title_h = 0`：
不绘制标题栏、不响应标题栏命中、清除 slot 0 覆盖层、关闭 DWM 圆角（`DWMWCP_DONOTROUND`），
视频铺满整屏；退出全屏恢复标题栏与 `DWMWCP_ROUND`。进入全屏后顶部居中显示 2 秒浮动提示（“按 Alt + Enter
退出全屏”，复用覆盖层 slot 0），到时自动清除。窗口缩放仍走 200ms 防抖 → `SetGameResolution`。

**Present 不阻塞**：交换链创建时带 `DXGI_SWAP_CHAIN_FLAG_FRAME_LATENCY_WAITABLE_OBJECT` +
`SetMaximumFrameLatency(1)`；Present 前 `WaitForSingleObject(句柄, 20ms)`，超时说明 DWM 没释放缓冲，
这一帧直接跳过（不算呈现成功，5s 未呈现看门狗会重建交换链）；Present 本身用
`DXGI_PRESENT_DO_NOT_WAIT`，解码线程不会被 `Present` 永久卡死。

**新增账号**：点 “+” 启动独立进程 `--add-account`，**先分配新 id**，再用该 id 的独立 WebView2 数据目录
（`%APPDATA%/dna-builder/webview-login/<id>`）打开官方登录页；登录成功只把新 `Profile` 追加进
`cloudgame-sessions.json` 并保留原有 `default`（不改变下次启动账号），原窗口全程保持运行；
AboutToWait 轮询子进程退出后重新加载会话列表刷新标签。浏览器 profile 不再在登录后删除，
同一 id 的重登复用原 profile，不会串号。

## 节点选择 / 测速 / 昵称 / 断线重连（2026-11-07 晚二）

**线路表**：`GET {config}/ping/{md5hex(tenantKey+"H5")}.html?t=<ms>`（`paas-sdk-config.vlinkcloud.cn`，
备份 `-ks`）→ `{lines:[{nodeId,nodeName,nodeAlias,lineH5Addr,lineH5Port}], pingNum, timeOut}`。
注意 md5 的输入是 **tenantKey**（`sessions[].session` 里的租户 key），不是 nodeId；
`/gameDeployNode/{instanceId}/{gid}.html` 只是备用（官方 web 传 null 走租户线路）。

**测速**：每条线路 `wss://{lineH5Addr}/ws`，发 `{"type":"ping","index":i,"ws_index":idx}`，
收 `{"type":"pong","index":i}`；默认 5 次、单次 500ms 超时、整体 20s 上限，取平均 RTT 截断取整。
按 nodeId 去重保留更小值；推荐节点 = 最小 ping。开流前 `nodes::prepare` 同步测速并把**全部节点**的
`{nodeId,result}` 放进 `bizData.ping`，顶层 `node` 传选中节点；控制中心「线路」组可切换（保存 `Profile.node`，
进程内重新 play.lg 换实例并显示 loading，不重启进程）。

**昵称**：官方没有昵称字段；`LOGIN_CACHE_INTERNAL.cName` 是 `U346603733A` 这类内部 ID。
真正的玩家昵称来自游戏数据 `roleReport.data.roleName`（base64url JSON，`decode_game_msg` 解码），
拿到后写回 `Profile.name`，标签页文案随之刷新（active 标签本身就标明当前窗口，标题栏不再额外显示昵称）。
账号名是手机号时，界面标签经 `sessions::mask_phone` 打码（`17800001111` → `178****1111`），
`sessions.json` 内的 `name` 仍保留原文。

**游戏内消息（onGameData）**：实际链路上游戏数据走 `SimpleCmd cmd="BusinessData"`，`data` 字段是
**base64url(JSON) 文本或嵌套的 SimpleCmd 二进制**（官方 `Qm(data)` 反序列化再取字段）；`arg` 是自增
序号，收到后回 `BusinessDataConfirm(arg)`。客户端 `decode_business` 依次尝试：直接 JSON →
base64url → 嵌套 SimpleCmd 的 arg/arg1/arg2/data。data channel 的非 99 kind 消息作为兜底同样解析。
处理 `roleReport`（`data.roleName` 写回昵称）与 `{type:"openBrowser", plat:"pcWeb", data:{url}}`
→ `ShellExecuteW("open")` 默认浏览器打开（官方 `handleLink`）。debug 构建会打印
`BusinessData arg=… data=…` 与解码后的 `game data: {…}` 便于排查。

**断线检测 / 进程内重连 / 换线路**（同一进程内重建 WebTransport，不重启进程）：
- 连接循环由 `spawn_startup` 里的 manager 持有：`allocate`（play.lg+排队+解析 sdkMsg+证书哈希）→ 建链 →
  `OpenSession`/`OnConnected` → select 转发 `srx/drx` 到本连接的出站通道。
  路由器用 `try_send` 转发（断开期间没有消费者，不能阻塞路由线程）。
- 每次连接递增 `conn_gen`；路由器按代际处理：`protoVersion` 每代只答一次，
  **首次/换线路**（`ConnInfo.first`）发 `LocalIm+PackedData+ChannelType`，
  **同一实例重连**发 `LocalIm+auth+authV2+ChannelType`（不发 PackedData，实例已出过首帧才算 started）；
  每代首帧都重发 `intercept_app+initData/login+SDKHeartBeat` 并 `mark_connected`。断开时按官方顺序
  `close_session` → `on_disconnect`。`SDKHeartBeat` 定时线程只起一次（重连不重复起）。
- 传输结束 → `ui::Conn::Lost` 断线卡片（slot 2）；点「重新连接」→ UI 发 `ReconnCmd::Reconnect`
  → manager 重建 transport、`set_restart_loading(true)` 显示 loading 页，新连接首帧到达后恢复。
- 控制中心换线路 → `ReconnCmd::SwitchNode(node)`：manager 断开当前连接、`play.lg` 重新分配实例
  （新 node），再按首次连接握手；全程窗口不关、显示 loading。
- 服务端 `GameRestart`/`GameRestartV2`（游戏更新/重启）→ `ui::set_restart_loading(true)` 显示 loading 页
  （覆盖冻结的最后一帧），新实例关键帧到达（>500ms）后清除；同时 ~2s 后重发 initData/login。
  loading 超过 90s 自动切断线卡片。
- 服务端 `Offline`/`GameExit`/`踢下线`（v1 `arg="<code>-<msg>"`）与 `OfflineV2`/`GameExitV2`
  （`arg=code, arg1=msg`）→ 直接置 Lost 并展示 `msg`；官方置 `gsErrorReceived` 后不再自动重连
  （本端由用户点按钮重建连接）。已置 Lost 时传输结束不再覆盖文案。
  路由线程同时置共享 `kicked` 标记：重连时 manager 消费该标记，改用 **重新 `play.lg` 分配**
  （同换线路）而不是原实例 auth 重连——被踢后原实例已结束，auth 重连必失败。
- `GSProxyHeartbeat`：首帧后每 1s 发 `SDKHeartBeat`；收到回包记时间，超过 3s（官方 `Sc=3000`）
  没再收到 → Lost（「游戏服务器连接断开」）。未收到过任何回包时不判定（对齐官方只在首个回包后起计时）；
  `mark_connected` 会把该时间戳清零，重连后不会沿用上一代的时间。
- 视频停流 **不再**作为断线判据：游戏加载界面会短暂 FPS 0（音频也未必持续），按帧判定会误弹断线卡片。
  帧/媒体包沉默只可能是加载或编码器重启，WT 仍连通就继续等；真正的断连只由传输结束、心跳失联或服务端事件触发。

**loading 页（GPU 路径）**：断线重连/换线路/GameRestart 时用覆盖层 slot 3：`loading::render_overlay`
渲染「精灵帧 + 文案」小图（约 29fps 更新），`GpuSink` 先 `ClearRenderTargetView` 把后备缓冲清黑再贴精灵，
标题栏/面板/断线卡片最后贴；CPU 路径把 `frame` 置空即自动画 loading 页。

**标题栏缩放边框**：`WM_NCHITTEST` 里先按 `GetSystemMetricsForDpi(SM_CXSIZEFRAME)+SM_CXPADDEDBORDER`
还原四边/四角热区（非最大化、面板关闭、鼠标未捕获时），**之后**才把标题栏空白处算 HTCAPTION，
否则上边缘会被 HTCAPTION 吃掉、无法拖拽缩放。

## 发布与前端部署（2026-11-07）

- 打包上传：`bun tools/cloudgame-upload.ts build upload`（或 `pnpm cloudgame`）完整链路：
  `cargo build --release` → `upx --best --lzma` 就地压缩 → 直传单文件 exe 到
  `cloudgame/cloudgame-client-v<版本>.exe`（`application/vnd.microsoft.portable-executable`），
  OSS 与 R2 双写并各自探测一次可访问性。可用 `--exe <path>` 指定别的构建产物，
  `--skip-upx` 跳过压缩。
- 版本号在前端 `apps/web/src/utils/cloudgame-native.ts` 的 `CLOUDGAME_NATIVE_VERSION`；
  对象名带版本，发新客户端时**必须同时换版本号**：CDN 边缘按路径缓存（OSS 侧 TTL 30 天），
  覆盖同名对象不会立即生效。旧安装因版本标记不匹配会自动重新下载。
- 前端部署：启动器云游戏按钮右侧下拉选「原生客户端（新版）」，选择后立即
  `downloadFile`（优先测速选中的 CDN，失败回退另一端）直写
  `%APPDATA%/dna-builder/bin/cloudgame-client.exe`（无解压步骤），再写
  `cloudgame-client.version`，最后 `launch_normal` 启动 exe；
  选择保存在 localStorage `cloudgame.implementation`，默认为原 WEB 端。
- WEB 端（原版）仍走 `open_cloudgame_window` 的 WebView 注入桥，行为不变。

