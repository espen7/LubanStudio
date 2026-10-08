import { contextBridge, ipcRenderer } from 'electron'
import type { LubanProject } from '@shared/types/project'
import type { RecentProject } from '@shared/types/project'
import type { AppSettings } from '@shared/types/settings'

const api = {
  project: {
    pickConf: (): Promise<string | null> => ipcRenderer.invoke('project:pick-conf'),
    open: (confPath: string): Promise<LubanProject> =>
      ipcRenderer.invoke('project:open', { confPath }),
    close: (): Promise<void> => ipcRenderer.invoke('project:close'),
    recent: (): Promise<RecentProject[]> => ipcRenderer.invoke('project:recent')
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    patch: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke('settings:patch', patch)
  }
}

export type LubanApi = typeof api

contextBridge.exposeInMainWorld('api', api)
