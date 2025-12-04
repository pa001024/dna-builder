import { invoke } from "@tauri-apps/api/core"

export const MATERIALS = ["None", "Blur", "Acrylic", "Mica", "Mica_Dark", "Mica_Tabbed", "Mica_Tabbed_Dark"] as const
export async function applyMaterial(material: (typeof MATERIALS)[number]) {
    return (await invoke("apply_material", { material })) as string
}

export async function getOSVersion() {
    return (await invoke("get_os_version")) as string
}
