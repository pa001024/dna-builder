# @pa001024/mihome-api

MiHome 云协议的 TypeScript 实现（MIT，与本仓一致）：扫码登录、手动场景列表/执行、设备列表与 miot-spec 读写。零依赖，不引用 Tauri；`fetch` 可注入以便测试。

```ts
import { MiHomeClient, InMemoryTokenStore } from "@pa001024/mihome-api"

const client = new MiHomeClient(new InMemoryTokenStore())
if (!await client.status()) {
    const begin = await client.qrBegin()
    if (!begin.already) renderQr(begin.login_url)
    await client.qrWait(begin.login_url, begin.lp)
}
const scenes = await client.listScenes()
await client.runScene(scenes[0].scene_id, scenes[0].home_id)
```

浏览器环境由宿主提供 `localStorage` TokenStore（见 `plugins/mihome`）；
`Cookie` 由浏览器 jar 随 `credentials: "include"` 自动携带，`fetch` 会静默忽略手动 `Cookie` 头。
