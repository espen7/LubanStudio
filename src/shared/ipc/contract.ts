import type {
  CellEdit,
  CellValue,
  DataCloseRequest,
  DataSaveResult,
  RowAddRequest,
  RowDeleteRequest,
  TableData
} from '../types/data'
import type { LubanProject, RecentProject } from '../types/project'
import type { AppSettings } from '../types/settings'
import type { SchemaModel } from '../types/schema'

export interface IpcContract {
  'project:pick-conf': { req: void; res: string | null }
  'project:open': { req: { confPath: string }; res: LubanProject }
  'project:close': { req: void; res: void }
  'project:recent': { req: void; res: RecentProject[] }
  'schema:get': { req: void; res: SchemaModel }
  'schema:reload': { req: void; res: SchemaModel }
  'data:open': { req: { tableId: string }; res: TableData }
  /** res.value = main 侧解析后的规范值，界面据此回填（bool 勾选框不能退化成文本） */
  'data:update-cell': { req: CellEdit; res: { applied: boolean; value: CellValue } }
  'data:add-row': { req: RowAddRequest; res: TableData }
  'data:delete-row': { req: RowDeleteRequest; res: TableData }
  'data:refresh': { req: { tableId: string }; res: TableData }
  'data:save': { req: { tableId: string }; res: DataSaveResult }
  'data:close': { req: DataCloseRequest; res: void }
  'settings:get': { req: void; res: AppSettings }
  'settings:patch': { req: Partial<AppSettings>; res: AppSettings }
}

export interface IpcEvents {}
