import { defineStore } from "pinia"
import {
    type DataPackInstallStatus,
    type DataPackSourceInfo,
    downloadDataPack,
    exportDataPackVersionFile,
    getDataPackInstallStatus,
    getDataPackSourceInfo,
    getInstalledDataPackVersions,
    getMergedDataPackVersions,
    importDataPackFile,
    removeInstalledDataPackVersion,
    setActiveDataPackVersion,
    setDataPackSourceBaseUrl,
    setDataPackSourceKind,
} from "@/data/data-pack"

export const useDataPackStore = defineStore("dataPack", {
    state: () => {
        return {
            status: null as DataPackInstallStatus | null,
            sourceInfo: null as DataPackSourceInfo | null,
            installedVersions: [] as string[],
            versionFiles: {} as Record<string, File>,
            isBootstrapping: false,
            isDownloading: false,
            downloadingVersion: "",
            downloadProgress: 0,
            isImporting: false,
            errorMessage: "",
        }
    },
    getters: {
        needsInstall(state): boolean {
            return Boolean(state.status && !state.status.ready)
        },
    },
    actions: {
        async refreshStatus(forceRefresh = false) {
            this.status = await getDataPackInstallStatus(forceRefresh)
            this.sourceInfo = await getDataPackSourceInfo()
            const versions = await getMergedDataPackVersions(this.status.versions)
            const installedVersions = await getInstalledDataPackVersions(this.status.versions)
            this.installedVersions = installedVersions.map(version => version.version)
            this.status.versions = versions
            this.versionFiles = {}
            await Promise.all(
                installedVersions.map(async version => {
                    const bytes = await exportDataPackVersionFile(version.version)
                    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
                    this.versionFiles[version.version] = new File([buffer], `${version.version}.zip`, { type: "application/zip" })
                })
            )
            return this.status
        },
        async bootstrap() {
            this.isBootstrapping = true
            try {
                await this.refreshStatus()
            } catch (error) {
                this.errorMessage = error instanceof Error ? error.message : String(error)
            } finally {
                this.isBootstrapping = false
            }
        },
        async download(version?: string) {
            this.isDownloading = true
            this.errorMessage = ""
            this.downloadingVersion = version || ""
            this.downloadProgress = 0
            try {
                this.status = await downloadDataPack(version, progress => {
                    this.downloadProgress = progress
                })
                await this.refreshStatus()
                return this.status
            } catch (error) {
                this.errorMessage = error instanceof Error ? error.message : String(error)
                throw error
            } finally {
                this.isDownloading = false
                this.downloadingVersion = ""
                this.downloadProgress = 0
            }
        },
        async downloadVersion(version: string) {
            return this.download(version)
        },
        async importFromFile(file: File) {
            this.isImporting = true
            this.errorMessage = ""
            try {
                this.status = await importDataPackFile(file)
                await this.refreshStatus()
                return this.status
            } catch (error) {
                this.errorMessage = error instanceof Error ? error.message : String(error)
                throw error
            } finally {
                this.isImporting = false
            }
        },
        async setSourceBaseUrl(sourceBaseUrl: string) {
            await setDataPackSourceBaseUrl(sourceBaseUrl)
            await this.refreshStatus(true)
        },
        async setSourceKind(sourceKind: "official" | "custom") {
            await setDataPackSourceKind(sourceKind)
            await this.refreshStatus(true)
        },
        async useVersion(version: string) {
            this.status = await setActiveDataPackVersion(version)
            await this.refreshStatus(true)
        },
        async uninstallVersion(version: string) {
            await removeInstalledDataPackVersion(version)
            await this.refreshStatus(true)
        },
    },
})
