import type { Plugin } from "vite"

export function i18nHmrPlugin(): Plugin {
    let publicDir = ""

    return {
        name: "dna-builder-i18n-hmr",
        apply: "serve",
        configResolved(config) {
            publicDir = config.publicDir
        },
        hotUpdate({ file, type }) {
            if (this.environment.name !== "client" || type === "delete") return
            if (!publicDir || !file.startsWith(`${publicDir}/i18n/`) || !file.endsWith(".json")) return

            const [lng, nsFile] = file.slice(publicDir.length + "/i18n/".length).split("/")
            if (!lng || !nsFile) return

            this.environment.hot.send({
                type: "custom",
                event: "i18n-update",
                data: { lng, ns: nsFile.replace(/\.json$/, "") },
            })
        },
    }
}
