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
  'settings:get': { req: void; res: AppSettings }
  'settings:patch': { req: Partial<AppSettings>; res: AppSettings }
}

export interface IpcEvents {}
