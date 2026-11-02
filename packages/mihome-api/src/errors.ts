export function errorMessage(code: number): string {
    switch (code) {
        case -10000:
            return "未知错误"
        case -10001:
            return "服务不可用"
        case -10002:
            return "参数无效"
        case -10003:
            return "资源不足"
        case -10004:
            return "内部错误"
        case -10005:
            return "权限不足"
        case -10006:
            return "执行超时"
        case -10007:
            return "设备离线或者不存在"
        case -10020:
            return "未授权OAuth2"
        case -10030:
            return "无效的token（HTTP）"
        case -10040:
            return "无效的消息格式"
        case -10050:
            return "无效的证书"
        case -704000000:
            return "未知错误"
        case -704010000:
            return "未授权（设备可能被删除）"
        case -704014006:
            return "没找到设备描述"
        case -704030013:
            return "Property不可读"
        case -704030023:
            return "Property不可写"
        case -704030033:
            return "Property不可订阅"
        case -704040002:
            return "Service不存在"
        case -704040003:
            return "Property不存在"
        case -704040004:
            return "Event不存在"
        case -704040005:
            return "Action不存在"
        case -704040999:
            return "功能未上线"
        case -704042001:
            return "Device不存在"
        case -704042011:
            return "设备离线"
        case -704053036:
            return "设备操作超时"
        case -704053100:
            return "设备在当前状态下无法执行此操作"
        case -704083036:
            return "设备操作超时"
        case -704090001:
            return "Device不存在"
        case -704220008:
            return "无效的ID"
        case -704220025:
            return "Action参数个数不匹配"
        case -704220035:
            return "Action参数错误"
        case -704220043:
            return "Property值错误"
        case -704222034:
            return "Action返回值错误"
        case -705004000:
            return "未知错误"
        case -705004501:
            return "未知错误"
        case -705201013:
            return "Property不可读"
        case -705201015:
            return "Action执行错误"
        case -705201023:
            return "Property不可写"
        case -705201033:
            return "Property不可订阅"
        case -706012000:
            return "未知错误"
        case -706012013:
            return "Property不可读"
        case -706012015:
            return "Action执行错误"
        case -706012023:
            return "Property不可写"
        case -706012033:
            return "Property不可订阅"
        case -706012043:
            return "Property值错误"
        case -706014006:
            return "没找到设备描述"
        default:
            return "未知错误"
    }
}

export type MiHomeErrorKind =
    | "login"
    | "api"
    | "device-not-found"
    | "multiple-devices"
    | "device-get"
    | "device-set"
    | "device-action"
    | "get-device-info"
    | "missing-spec-type"
    | "http"
    | "json"
    | "crypto"
    | "invalid-param"

export class MiHomeError extends Error {
    readonly kind: MiHomeErrorKind
    readonly code: number

    constructor(kind: MiHomeErrorKind, message: string, code = -1) {
        super(message)
        this.name = "MiHomeError"
        this.kind = kind
        this.code = code
    }

    static login(code: number, message: string): MiHomeError {
        return new MiHomeError("login", `登录失败 code: ${code}, message: ${message}`, code)
    }

    static api(code: number, message: string): MiHomeError {
        return new MiHomeError("api", `接口失败 code: ${code}, message: ${message}`, code)
    }

    static deviceNotFound(did: string): MiHomeError {
        return new MiHomeError("device-not-found", `未找到 did 为 '${did}' 的设备，请检查 did 是否正确`)
    }

    static multipleDevicesFound(detail: string): MiHomeError {
        return new MiHomeError("multiple-devices", detail)
    }

    static deviceGet(dev: string, prop: string, code: number, message: string): MiHomeError {
        return new MiHomeError("device-get", `获取设备 '${dev}' 的属性 '${prop}' 时失败, code: ${code}, message: ${message}`, code)
    }

    static deviceSet(dev: string, prop: string, code: number, message: string): MiHomeError {
        return new MiHomeError("device-set", `设置设备 '${dev}' 的属性 '${prop}' 时失败, code: ${code}, message: ${message}`, code)
    }

    static deviceAction(dev: string, action: string, code: number, message: string): MiHomeError {
        return new MiHomeError("device-action", `执行设备 '${dev}' 的动作 '${action}' 时失败, code: ${code}, message: ${message}`, code)
    }

    static getDeviceInfo(specType: string): MiHomeError {
        return new MiHomeError("get-device-info", `获取设备规格 '${specType}' 的设备信息失败`)
    }

    static missingSpecType(): MiHomeError {
        return new MiHomeError("missing-spec-type", "必须提供 spec_type 参数（设备规格类型 URN），可从设备列表的 spec_type 字段获取")
    }

    static http(message: string): MiHomeError {
        return new MiHomeError("http", `HTTP 错误: ${message}`)
    }

    static json(message: string): MiHomeError {
        return new MiHomeError("json", `JSON 错误: ${message}`)
    }

    static crypto(message: string): MiHomeError {
        return new MiHomeError("crypto", `加密错误: ${message}`)
    }

    static invalidParam(message: string): MiHomeError {
        return new MiHomeError("invalid-param", `参数错误: ${message}`)
    }
}
