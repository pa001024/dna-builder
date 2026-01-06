/// <reference types="vite/client" />

declare module "*.vue" {
    import type { DefineComponent } from "vue"
    const component: DefineComponent<{}, {}, any>
    export default component
}

declare module "virtual:pwa-register" {
    export interface RegisterSWOptions {
        immediate?: boolean
        onRegistered?: (registration: ServiceWorkerRegistration) => void
        onRegisterError?: (error: Error) => void
    }

    export function registerSW(options?: RegisterSWOptions): (onUpdateReady: (registration: ServiceWorkerRegistration) => void) => void
}

declare global {
    interface Window {
        __TAURI__?: any
        __TAURI_INTERNALS__?: any
    }
}
