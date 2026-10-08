import { contextBridge, ipcRenderer } from 'electron'
import type {
  CellEdit,
  DataCloseRequest,
  DataSaveResult,
  RowDeleteRequest,
  TableData
} from '@shared/types/data'
import type { LubanProject, RecentProject } from '@shared/types/project'
import type { AppSettings } from '@shared/types/settings'
import type { SchemaModel } from '@shared/types/schema'

const api = {
  project: {
    pickConf: (): Promise<string | null> => ipcRenderer.invoke('project:pick-conf'),
    open: (confPath: string): Promise<LubanProject> =>
      ipcRenderer.invoke('project:open', { confPath }),
    close: (): Promise<void> => ipcRenderer.invoke('project:close'),
    recent: (): Promise<RecentProject[]> => ipcRenderer.invoke('project:recent')
  },
  schema: {
    get: (): Promise<SchemaModel> => ipcRenderer.invoke('schema:get'),
    reload: (): Promise<SchemaModel> => ipcRenderer.invoke('schema:reload')
  },
  data: {
    open: (tableId: string): Promise<TableData> => ipcRenderer.invoke('data:open', { tableId }),
    updateCell: (edit: CellEdit): Promise<{ applied: boolean }> =>
      ipcRenderer.invoke('data:update-cell', edit),
    addRow: (tableId: string): Promise<TableData> => ipcRenderer.invoke('data:add-row', { tableId }),
    deleteRow: (req: RowDeleteRequest): Promise<TableData> =>
      ipcRenderer.invoke('data:delete-row', req),
    refresh: (tableId: string): Promise<TableData> =>
      ipcRenderer.invoke('data:refresh', { tableId }),
    save: (tableId: string): Promise<DataSaveResult> => ipcRenderer.invoke('data:save', { tableId }),
    close: (req: DataCloseRequest): Promise<void> => ipcRenderer.invoke('data:close', req)
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    patch: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke('settings:patch', patch)
  }
}

export type LubanApi = typeof api

contextBridge.exposeInMainWorld('api', api)
