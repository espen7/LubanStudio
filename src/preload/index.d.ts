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

declare global {
  interface Window {
    api: {
      project: {
        pickConf(): Promise<string | null>
        open(confPath: string): Promise<LubanProject>
        close(): Promise<void>
        recent(): Promise<RecentProject[]>
      }
      schema: {
        get(): Promise<SchemaModel>
        reload(): Promise<SchemaModel>
      }
      data: {
        open(tableId: string): Promise<TableData>
        updateCell(edit: CellEdit): Promise<{ applied: boolean }>
        addRow(tableId: string): Promise<TableData>
        deleteRow(req: RowDeleteRequest): Promise<TableData>
        refresh(tableId: string): Promise<TableData>
        save(tableId: string): Promise<DataSaveResult>
        close(req: DataCloseRequest): Promise<void>
      }
      settings: {
        get(): Promise<AppSettings>
        patch(patch: Partial<AppSettings>): Promise<AppSettings>
      }
    }
  }
}

export {}
