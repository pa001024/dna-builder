use crate::spec::SpecInfo;

pub fn property_zh(name: &str) -> Option<&'static str> {
    match name {
        "volume" => Some("音量"),
        "mute-2" => Some("静音"),
        "mute-4" => Some("静音"),
        "playing-state" => Some("播放状态"),
        "text-content" => Some("文本内容"),
        "silent-execution" => Some("指令静默执行"),
        "sleep-mode" => Some("睡眠模式"),
        "audio-id" => Some("音频ID"),
        "download-speed" => Some("下载速度"),
        "upload-speed" => Some("上传速度"),
        "connected-device-number" => Some("连接设备数"),
        "network-connection-type" => Some("上网方式"),
        "ip-address" => Some("IP地址"),
        "status" => Some("工作状态"),
        "fault" => Some("故障"),
        "ppp-username" => Some("拨号上网用户名"),
        "ppp-encrypted-password" => Some("拨号上网加密密码"),
        "static-ip-address" => Some("静态IP上网IP地址"),
        "subnet-mask" => Some("子网掩码"),
        "gateway-ip-address" => Some("网关IP地址"),
        "dns-ip-address" => Some("DNS服务地址"),
        "dns-auto-mode" => Some("DNS自动配置"),
        "access-mode" => Some("接入方式"),
        "rssi" => Some("信号强度"),
        "wifi-band-combine" => Some("WiFi双频合一"),
        "online-time" => Some("在线时长"),
        "wifi-ssid-3" => Some("WiFi网络名称"),
        "wifi-encrypted-password-3" => Some("WiFi网络加密密码"),
        "on-3" => Some("开关"),
        "wifi-ssid-hidden" => Some("隐藏WiFi"),
        "encrypted-strength-3" => Some("加密强度"),
        "signal-strength-3" => Some("发射信号强度"),
        "wifi-channel-3" => Some("WiFi网络信道"),
        "wifi-bandwidth-3" => Some("WiFi信道带宽"),
        "on-4" => Some("开关"),
        "wifi-ssid-4" => Some("WiFi网络名称"),
        "wifi-encrypted-password-4" => Some("WiFi网络加密密码"),
        "encrypted-strength-4" => Some("加密强度"),
        "signal-strength-4" => Some("发射信号强度"),
        "wifi-channel-4" => Some("WiFi网络信道"),
        "wifi-bandwidth-4" => Some("WiFi信道带宽"),
        "speed-control" => Some("限速控制"),
        "max-upload-speed" => Some("最大上传速度"),
        "max-download-speed" => Some("最大下载速度"),
        "on-5" => Some("开关"),
        "mode" => Some("模式"),
        "brightness" => Some("亮度"),
        "color" => Some("颜色"),
        "color-temperature" => Some("色温"),
        "flow" => Some("流光功能"),
        "saturability" => Some("饱和度"),
        "on" => Some("开关"),
        "default-power-on-state" => Some("默认上电状态"),
        "save-state" => Some("恢复断电前灯光"),
        "delay-time" => Some("延时时间"),
        "delay-off-countdown" => Some("延时关灯倒计时"),
        "delay-off-enable" => Some("延时关灯功能开关"),
        "kid-mode" => Some("儿童模式控制开关"),
        "double-click-enable" => Some("自定义双击功能开关"),
        "double-click" => Some("定义双击触发的功能"),
        "scene-mode" => Some("切换灯上的模式"),
        "pomodoro-enable" => Some("专注模式开关"),
        "work-minutes" => Some("专注模式的工作时间"),
        "break-minutes" => Some("专注模式休息时间"),
        "work-countdown-sec" => Some("工作结束倒计时"),
        "break-countdown-sec" => Some("休息时间倒计时"),
        "mode-one-bright" => Some("模式1的亮度"),
        "mode-one-ct" => Some("模式1的色温"),
        "mode-two-bright" => Some("模式2亮度"),
        "mode-two-ct" => Some("模式2的色温"),
        "mode-three-bright" => Some("模式3的亮度"),
        "mode-three-ct" => Some("模式3的色温"),
        "mode-four-bright" => Some("模式4的亮度"),
        "mode-four-ct" => Some("模式4的色温"),
        "double-click-mode" => Some("双击启动的模式"),
        "eco" => Some("背光开关"),
        "off-delay" => Some("点动功能"),
        "toggle" => Some("切换"),
        "temperature" => Some("温度"),
        "relative-humidity" => Some("湿度"),
        "battery-level" => Some("电池电量"),
        "on-2" => Some("按键"),
        "on-10" => Some("开关"),
        "version" => Some("设备版本号"),
        "mode-2" => Some("模式"),
        "anti-flicker" => Some("防闪烁模式"),
        "wiring-method" => Some("接线方式"),
        "mode-3" => Some("模式"),
        "mode-4" => Some("模式"),
        "mode-5" => Some("模式"),
        "power-consumption" => Some("功耗参数"),
        "electric-power" => Some("电功率"),
        "power-consumption-accumulation-way" => Some("耗电量使用累加形式"),
        "on-7" => Some("开关"),
        _ => None,
    }
}

pub fn action_zh(name: &str) -> Option<&'static str> {
    match name {
        "play" => Some("播放"),
        "pause" => Some("暂停"),
        "next" => Some("下一首"),
        "previous" => Some("上一首"),
        "play-text" => Some("朗读文本"),
        "play-music" => Some("播放音乐"),
        "play-radio" => Some("播放电台"),
        "execute-text-directive" => Some("执行文本指令"),
        "stop-alarm" => Some("停止闹钟"),
        "wake-up" => Some("唤醒"),
        "toggle" => Some("切换"),
        "turn-on" => Some("开启"),
        "turn-off" => Some("关闭"),
        "reboot" => Some("重启"),
        "set-default" => Some("恢复默认"),
        "apply-scene" => Some("应用场景"),
        "bright-circle" => Some("亮度循环"),
        "bright-increase" => Some("调高亮度"),
        "bright-decrease" => Some("调低亮度"),
        "bright-on-circle" => Some("亮度循环开关"),
        "ct-circle" => Some("色温循环"),
        "ct-increase" => Some("调高色温"),
        "ct-decrease" => Some("调低色温"),
        "ct-on-circle" => Some("色温循环开关"),
        "delay-off" => Some("延时关灯"),
        "fan-speed-up" => Some("风速调高"),
        "fan-speed-down" => Some("风速调低"),
        "temperature-up" => Some("温度调高"),
        "temperature-down" => Some("温度调低"),
        _ => None,
    }
}

/// MIoT service class -> Chinese, for services whose spec entry has no
/// `comment` (Apple/Google-flavoured specs omit it). Verified against the
/// live instance documents of the devices this client ships for.
pub fn service_zh(class: &str) -> Option<&'static str> {
    match class {
        "light" => Some("灯光"),
        "fan" => Some("风扇"),
        "air-purifier" => Some("空气净化器"),
        "air-conditioner" => Some("空调"),
        "air-condition-outlet-matching" => Some("空调遥控匹配"),
        "fan-control" => Some("风速控制"),
        "environment" => Some("环境参数"),
        "filter" => Some("滤芯"),
        "filter-custom" => Some("滤芯高阶"),
        "screen" => Some("显示屏"),
        "alarm" => Some("提示音"),
        "battery" => Some("电池"),
        "clock" => Some("时钟"),
        "curtain" => Some("窗帘"),
        "window-opener" => Some("开窗器"),
        "switch" => Some("开关"),
        "switch-sensor" => Some("按键"),
        "switch-set" => Some("特色功能"),
        "indicator-light" => Some("指示灯"),
        "delay" => Some("延时"),
        "no-disturb" => Some("勿扰"),
        "remote-control-management" => Some("遥控器管理"),
        "intelligent-speaker" => Some("音箱"),
        "speaker" => Some("扬声器"),
        "play-control" => Some("播放控制"),
        "microphone" => Some("麦克风"),
        "induction-cooker" => Some("电磁炉"),
        "pressure-cooker" => Some("压力锅"),
        "water-dispenser" => Some("饮水机"),
        "water-purifier" => Some("净水器"),
        "water-puri-custom" => Some("净水器高阶"),
        "water-statistic" => Some("用水统计"),
        "tds-sensor" => Some("TDS 检测"),
        "temperature-humidity-sensor" => Some("温湿度传感器"),
        "power-consumption" => Some("功耗"),
        "power-replenishment" => Some("电量补充"),
        "physical-controls-locked" => Some("童锁"),
        "self-check" => Some("自检"),
        "status" => Some("状态"),
        "statistics" => Some("统计"),
        "setting" => Some("设置"),
        "config" => Some("配置"),
        "data" => Some("参数"),
        "debug" => Some("调试"),
        "factory" => Some("工厂模式"),
        "local-timing" => Some("本地定时"),
        "custom" | "custom-service" => Some("自定义"),
        _ => None,
    }
}

fn has_cjk(text: &str) -> bool {
    text.chars().any(|c| ('\u{4e00}'..='\u{9fff}').contains(&c))
}

/// Strip a trailing `-<digits>` suffix (`on-10` -> `on`).
fn strip_num_suffix(name: &str) -> &str {
    if let Some(idx) = name.rfind('-') {
        let (head, tail) = name.split_at(idx);
        if !head.is_empty() && tail[1..].chars().all(|c| c.is_ascii_digit()) && tail.len() > 1 {
            return head;
        }
    }
    name
}

fn lookup(name: &str, table: fn(&str) -> Option<&'static str>) -> Option<&'static str> {
    if let Some(zh) = table(name) {
        return Some(zh);
    }
    let stripped = strip_num_suffix(name);
    if stripped != name {
        return table(stripped);
    }
    None
}

fn backfill(name: &str, desc: &str, table: fn(&str) -> Option<&'static str>) -> String {
    if has_cjk(desc) {
        return desc.to_string();
    }
    match lookup(name, table) {
        None => desc.to_string(),
        Some(zh) if desc.is_empty() => zh.to_string(),
        Some(zh) => format!("{desc} / {zh}"),
    }
}

pub fn prop_desc_zh(name: &str, desc: &str) -> String {
    backfill(name, desc, property_zh)
}

pub fn action_desc_zh(name: &str, desc: &str) -> String {
    backfill(name, desc, action_zh)
}

pub fn apply_fallback(info: &mut SpecInfo) {
    for p in &mut info.properties {
        p.description = prop_desc_zh(&p.name, &p.description);
    }
    for a in &mut info.actions {
        a.description = action_desc_zh(&a.name, &a.description);
    }
    for s in &mut info.services {
        // Spec-supplied Chinese wins; the table only fills the gaps (Apple
        // flavoured specs carry no `comment` at all).
        if !has_cjk(&s.desc_zh) {
            if let Some(zh) = service_zh(&s.class) {
                s.desc_zh = zh.to_string();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_match_beats_suffix_strip() {
        assert_eq!(prop_desc_zh("on-2", "on"), "on / 按键");
        assert_eq!(prop_desc_zh("on-10", ""), "开关");
    }

    #[test]
    fn keeps_existing_chinese() {
        assert_eq!(prop_desc_zh("mode", "模式"), "模式");
    }
}
