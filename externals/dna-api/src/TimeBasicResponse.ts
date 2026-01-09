export enum RespCode {
    ERROR = -999,
    OK_ZERO = 0,
    OK_HTTP = 200,
    BAD_REQUEST = 400,
    SERVER_ERROR = 500,
}

export class TimeBasicResponse<T = any> {
    code: number = 0
    msg: string = ""
    data?: T

    constructor(raw_data: any) {
        this.code = raw_data.code || 0
        this.msg = raw_data.msg || ""
        this.data = raw_data.data
    }

    get is_success(): boolean {
        return this.code === RespCode.OK_HTTP || this.code === RespCode.OK_ZERO
    }

    get success(): boolean {
        return this.is_success
    }

    static err<T = undefined>(msg: string, code: number = RespCode.ERROR): TimeBasicResponse<T> {
        return new TimeBasicResponse<T>({ code, msg, data: undefined })
    }
}
