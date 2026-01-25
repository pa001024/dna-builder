export function imgRemoteToLocal(url: string) {
    let icon = url.match(/\/Head_(.+?).png/)?.[1] || ""
    // 特殊处理
    if (icon === "Bow_Lieyan") icon = "Bow_Shashi"
    else if (icon === "Bow_hugaung") icon = "Bow_Huguang"
    return icon ? `/imgs/webp/T_Head_${icon}.webp` : url
}
