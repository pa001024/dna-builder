# dna-api

> DNA BBS API - 用于游戏《Duet Night Abyss》的官方论坛 API 客户端

[![npm version](https://img.shields.io/npm/v/dna-api)](https://www.npmjs.com/package/dna-api)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 目录

- [简介](#简介)
- [安装](#安装)
- [快速开始](#快速开始)
- [核心功能](#核心功能)
- [API 文档](#api-文档)
    - [DNAAPI 类](#dnaapi-类)
    - [GameAPI 模块](#gameapi-模块)
    - [HomeAPI 模块](#homeapi-模块)
    - [ProfileAPI 模块](#profileapi-模块)
    - [SettingAPI 模块](#settingapi-模块)
    - [TrendAPI 模块](#trendapi-模块)
    - [UserAPI 模块](#userapi-模块)
    - [UserGrowingAPI 模块](#usergrowingapi-模块)
    - [H5API 模块](#h5api-模块)
- [类型定义](#类型定义)
- [配置选项](#配置选项)
- [开发与构建](#开发与构建)
- [测试](#测试)
- [许可证](#许可证)

## 简介

`dna-api` 是一个 TypeScript 编写的 API 客户端库，用于与《Duet Night Abyss》游戏的官方论坛服务器进行交互。该库提供了完整的 API 封装，包括用户认证、帖子发布、评论管理、角色管理等功能。

### 特性

- ✅ **完整的 TypeScript 类型支持** - 提供完整的类型定义，享受类型检查和智能提示
- ✅ **自动签名机制** - 内置 RSA 签名和 MD5 加密，无需手动处理签名
- ✅ **自动重试机制** - 请求失败时自动重试（最多 3 次）
- ✅ **超时控制** - 默认 10 秒超时，可配置
- ✅ **模块化设计** - 按功能模块划分，易于维护和扩展
- ✅ **浏览器和 Node.js 兼容** - 支持在浏览器和 Node.js 环境中使用

## 安装

```bash
pnpm install dna-api
```

或使用 npm/yarn/bun：

```bash
npm install dna-api
yarn add dna-api
bun add dna-api
```

## 快速开始

### 基础使用

```typescript
import { DNAAPI } from "dna-api"

// 初始化 API 客户端
const api = new DNAAPI({
    dev_code: "", // 开发者代码（可选）
    token: "", // 用户令牌（登录后获取）
    // 可选配置
    // fetchFn: fetch,       // 自定义 fetch 函数
    // is_h5: false,         // 是否为 H5 环境
    // rsa_public_key: "",   // 自定义 RSA 公钥
})

// 获取基础配置
async function getCommonConfig() {
    const config = await api.user.getCommonConfig()
    if (config.success) {
        console.log("配置获取成功:", config.data)
    }
}

getCommonConfig()
```

### 用户登录

```typescript
import { DNAAPI } from "dna-api"

const api = new DNAAPI()

async function loginUser(mobile: string) {
    // 1. 获取验证码
    const smsRes = await api.user.sendSms(mobile, "阿里验证码vJson...")
    if (!smsRes.success) {
        console.error("验证码发送失败")
        return
    }

    // 2. 用户输入验证码后登录
    const loginRes = await api.login(mobile, "123456")
    if (loginRes.success && loginRes.data?.token) {
        // 保存 token
        api.token = loginRes.data.token
        console.log("登录成功")
    }
}
```

### 获取帖子列表

```typescript
async function getPosts() {
    const posts = await api.getPostList(48, 1, 20)
    if (posts.success && posts.data) {
        console.log("帖子列表:", posts.data.postList)
    }
}
```

## 核心功能

### 1. 用户认证

- 手机号验证码登录
- 用户注册
- Token 刷新
- 用户信息管理

### 2. 论坛功能

- 发布帖子
- 评论和回复
- 点赞和收藏
- 帖子搜索

### 3. 游戏角色管理

- 获取角色详情
- 获取武器详情
- 角色绑定和管理
- 魂印任务

### 4. 个人中心

- 个人资料管理
- 粉丝和关注
- 历史记录
- 黑名单管理

### 5. 用户成长

- 签到系统
- 任务系统
- 等级系统
- 商城和抽奖

## API 文档

### DNAAPI 类

主要的 API 客户端类，包含所有 API 模块的便捷方法。

#### 构造函数

```typescript
new DNAAPI(options: {
    dev_code?: string;        // 设备代码, 留空自动生成
    token?: string;          // 用户令牌
    fetchFn?: typeof fetch;   // 自定义 fetch 函数
    is_h5?: boolean;         // 是否为 H5 环境
    rsa_public_key?: string;  // 自定义 RSA 公钥
})
```

#### 属性

| 属性          | 类型             | 描述                  |
| ------------- | ---------------- | --------------------- |
| `GAME_ID`     | `number`         | 游戏 ID（固定为 268） |
| `token`       | `string`         | 用户访问令牌          |
| `dev_code`    | `string`         | 开发者代码            |
| `BASE_URL`    | `string`         | API 基础地址          |
| `game`        | `GameAPI`        | 游戏相关 API 模块     |
| `home`        | `HomeAPI`        | 首页/论坛 API 模块    |
| `profile`     | `ProfileAPI`     | 个人中心 API 模块     |
| `setting`     | `SettingAPI`     | 设置 API 模块         |
| `trend`       | `TrendAPI`       | 动态/帖子 API 模块    |
| `user`        | `UserAPI`        | 用户 API 模块         |
| `userGrowing` | `UserGrowingAPI` | 用户成长 API 模块     |
| `h5`          | `H5API`          | H5 游戏相关 API 模块  |

#### 方法

##### 初始化

```typescript
async initialize(): Promise<void>
```

手动初始化 API 配置（获取签名配置等）。

### GameAPI 模块

游戏相关的 API 方法。

```typescript
// 获取默认角色（用于工具）
api.game.defaultRoleForTool(otherUserId?: string, type?: number)

// 获取角色详情
api.game.getRoleDetail(char_id: string, char_eid: string, otherUserId?: string)

// 获取武器详情
api.game.getWeaponDetail(weapon_id: string, weapon_eid: string, otherUserId?: string)

// 获取简短笔记信息
api.game.getShortNoteInfo()

// 获取魂印任务
api.game.soulTask()

// 获取/更新推送开关状态
api.game.getMhSwitchStatus()
api.game.updateMhSwitchStatus(config: string)
```

### HomeAPI 模块

首页和论坛相关的 API 方法。

```typescript
// 获取帖子列表
api.getPostList(forumId?: number, pageIndex?: number, pageSize?: number, searchType?: number, timeType?: number)

// 获取帖子详情
api.getPostDetail(postId: string)

// 按主题获取帖子
api.getPostByTopic(topicId?: number, pageIndex?: number, pageSize?: number, searchType?: number, timeType?: number)

// 获取推荐帖子
api.getRecommendPosts(gameId?: number, pageIndex?: number, pageSize?: number)

// 获取游戏横幅
api.getGameBanner(gameId?: number)

// 获取帖子评论列表
api.getPostCommentList(postId: number, pageIndex?: number, pageSize?: number, isOnlyPublisher?: number)

// 创建评论
api.createComment(post: {...}, content: string)

// 创建回复
api.createReply(post: {...}, content: string)

// 点赞帖子
api.likePost(post: {...})

// 搜索帖子/主题/用户
api.searchPost(keyword: string, pageIndex: number, pageSize: number, gameId?: number, searchType?: number)
api.searchTopic(keyword: string, pageIndex: number, pageSize?: number, gameId?: number)
api.searchUser(keyword: string, pageIndex: number, pageSize: number)

// 签到
api.haveSignIn()
api.signCalendar()
api.gameSign(dayAwardId: number, period: number)
api.bbsSign()

// 管理员功能
api.adminAdjustScore(postId: number, gameForumId: number, weight: string)
api.adminDelete(post: {...}, content: string, reasonCode: number)
api.adminMovePost(post: {...}, newGameId: number, newForumId: number, newTopicIdStr: string)
api.adminRefreshTime(post: {...}, refresh: number)
```

### ProfileAPI 模块

个人中心相关的 API 方法。

```typescript
// 获取个人信息
api.getMine()
api.getOtherMine(userId?: string)

// 获取角色列表
api.getRoleList()

// 默认角色
api.profile.defaultRole(otherUserId?: string, type?: number)

// 粉丝/关注
api.profile.fans(otherUserId: string, pageNo: number, pageSize: number, type: number)
api.profile.follow(otherUserId: string, pageNo: number, pageSize: number, type: number)

// 获取草稿列表
api.profile.getDraftList(pageIndex: number, pageSize: number)

// 删除角色
api.profile.deleteRole(roleBoundId: string)

// 黑名单用户
api.profile.blackUser(toUserId: string, type: number)

// 重置默认角色
api.profile.resetDefault(roleBoundId: string)
```

### SettingAPI 模块

设置相关的 API 方法。

```typescript
// 地址管理
api.addAddress(receiverName: string, receiverMobile: string, receiverAddress: string)
api.editAddress(addressId: number, receiverName: string, receiverMobile: string, receiverAddress: string)
api.deleteAddress(addressId: number)
api.getUserAddress(userId: number, type: number)
api.setDefaultAddress(addressId: number)

// 反馈
api.feedback(listPic: string, proDesc: string, mobile: string, isLogin: number)

// 黑名单
api.getUserBlackList(pageIndex: number, pageSize: number)

// 通知设置
api.setNotifySwitch(operateType: number, switchType: number)
api.setting.getNotifySwitch()

// 隐私设置
api.privateSet(operateType: number, option: number)
api.setting.getPrivateSet()
```

### TrendAPI 模块

动态和帖子发布相关的 API 方法。

```typescript
// 发布帖子
api.trend.postPublish(content: string, draftId: string, gameForumId: number, gameId: number, h5Content: string, postTitle: string, postType: number, topics: string)

// 编辑帖子
api.trend.postEdit(content: string, gameForumId: number, h5Content: string, postId: string, postTitle: string, topics: string, postType: number, videoReUpload: number)

// 保存草稿
api.trend.draftSave(content: string, draftId: string, h5Content: string, postTitle: string, postType: number, gameId: number, videoReUpload: number)

// 获取发布页面信息
api.trend.getPostPublishPage()

// 获取话题列表
api.trend.getConfigTopicByGameId(name: string, showType: number)

// 解析链接
api.trend.parseLink(link: string)

// 上传图片
api.trend.uploadImage(t: string, parts: FormData, type: string)

// 获取视频上传令牌
api.trend.getVodToken(fileName: string, title: string)

// 安全检查
api.trend.safeCheck(url: string)
```

### UserAPI 模块

用户认证和设置相关的 API 方法。

```typescript
// 用户登录
api.user.login(loginType: number, sdkToken: string, code: string, gameList: string, mobile: string)

// 用户注册
api.user.register(code: string, devCode: string, gameList: string, mobile: string, password: string)

// 获取验证码
api.user.sendSms(mobile: string, vJson: string, isCaptcha: number | null)

// 刷新令牌
api.user.refreshToken(refreshToken: string)

// 用户信息管理
api.user.editNickName(userName: string)
api.user.canEditNickName()
api.user.editGender(gender: number)
api.user.saveUserInfo(gender: number | null, headCode: string, headUrl: string, userName: string)

// 头像管理
api.user.updateHeadCode(headCode: string)
api.user.updateHeadUrl(headUrl: string)
api.user.uploadImage(t: string, part: FormData)

// 个人签名
api.user.signature(newSignature: string)

// 获取配置
api.user.getConfig()
api.user.getCommonConfig()
api.user.getConfigSwitch()
api.user.getOpenScreen()

// 获取表情包
api.user.getEmoji()

// 获取游戏配置
api.user.getGameConfig()
api.user.getGameHeadCode()
```

### UserGrowingAPI 模块

用户成长和奖励相关的 API 方法。

```typescript
// 创作者申请
api.userGrowing.apply(type: number, id: number | null, concatWay: string, otherPlatform: string, otherPlatformUrl: string, otherPlatformFans: string, materialUrl: string, gameId: number | null)

// 抽奖
api.userGrowing.list(pageIndex: number, pageSize: number, queryType: number | null, gameId: number | null)
api.userGrowing.drawDetail(drawId: number)
api.userGrowing.buyGold(drawId: number, count: number)
api.userGrowing.awardList(drawId: number)
api.userGrowing.awardWin(drawId: number, fullName: string, mobile: string, address: string)

// 商城
api.userGrowing.getProductList(gameId: number | null, pageIndex: number, pageSize: number, storeType: number)
api.userGrowing.productDetail(productId: number)
api.userGrowing.buyProduct(address: string, fullName: string, mobile: string, productId: number)
api.userGrowing.getAliProductConfig()
api.userGrowing.getAliProductList(gameId: number | null, pageIndex: number, pageSize: number)

// 金币管理
api.userGrowing.getTotalGold(type?: number)
api.userGrowing.getGoldDetailList(pageIndex: number, pageSize: number, type: number, storeType: number)

// 等级和任务
api.userGrowing.getUserGameLevel(gameId: number | null, ifProcess: number, otherUserId: number | null)
api.userGrowing.getUserGameTaskProcess(gameId: number, userId: number)
api.userGrowing.getExpLogsList(gameId: number, pageIndex: number, pageSize: number)

// 创作者页面
api.userGrowing.page()
api.userGrowing.getApplyPage()
api.userGrowing.getGameCreator()
```

### H5API 模块

H5 游戏相关的 API 方法。

```typescript
// 地图相关
api.h5.getMapCategorizeList()
api.h5.getMapDetail(id: number)
api.h5.getMapSiteDetail(id: number)
api.h5.getMapMatterCategorizeOptions()

// 表情包
api.h5.getEmojiList()
```

## 类型定义

### TimeBasicResponse

API 响应的基础类。

```typescript
class TimeBasicResponse<T = any> {
    code: number // 响应码
    msg: string // 响应消息
    data?: T // 响应数据

    get is_success(): boolean // 是否成功
    get success(): boolean // 是否成功（别名）

    static err<T = undefined>(msg: string, code?: number): TimeBasicResponse<T>
}
```

### RespCode

响应码枚举。

```typescript
enum RespCode {
    ERROR = -999, // 错误
    OK_ZERO = 0, // 成功（0）
    OK_HTTP = 200, // 成功（200）
    BAD_REQUEST = 400, // 请求错误
    SERVER_ERROR = 500, // 服务器错误
}
```

### DNASubModule

所有 API 子模块的基类。

```typescript
abstract class DNASubModule {
    protected _base: DNABaseAPI

    get dev_code(): string
    get token(): string
    get fetchFn(): typeof fetch | undefined
    get is_h5(): boolean
    get RSA_PUBLIC_KEY(): string
    get BASE_URL(): string

    async _dna_request<T>(url: string, data?: any, options?: RequestOptions): Promise<TimeBasicResponse<T>>
    async _dna_request_h5<T>(url: string, data?: any, options?: RequestOptions): Promise<TimeBasicResponse<T>>
}
```

### RequestOptions

请求选项接口。

```typescript
interface RequestOptions {
    method?: "GET" | "POST" // HTTP 方法
    sign?: boolean // 是否签名
    file?: File // 文件
    tokenSig?: boolean // 是否使用 token 签名
    h5?: boolean // 是否为 H5 请求
    token?: boolean // 是否使用 token
    refer?: boolean // 是否添加 referer
    params?: Record<string, any> // 额外参数
    max_retries?: number // 最大重试次数（默认 3）
    retry_delay?: number // 重试延迟（默认 1 秒）
    timeout?: number // 超时时间（默认 10000 毫秒）
}
```

## 配置选项

### 初始化配置

```typescript
interface DNAAPIOptions {
    dev_code?: string // 开发者代码
    token?: string // 用户令牌
    fetchFn?: typeof fetch // 自定义 fetch 函数
    is_h5?: boolean // 是否为 H5 环境
    rsa_public_key?: string // 自定义 RSA 公钥
}
```

### 示例配置

```typescript
const api = new DNAAPI({
    dev_code: "your_dev_code",
    token: "your_token",
    is_h5: true, // H5 环境
    // fetchFn: customFetch,    // 自定义 fetch 函数
})
```
