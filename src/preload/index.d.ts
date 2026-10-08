import type { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    // api: LubanApi（M2 随 IPC 契约补全）
  }
}

export {}
