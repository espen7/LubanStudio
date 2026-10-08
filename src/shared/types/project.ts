export interface LubanConfSchemaFile {
  fileName: string
  type: '' | 'table' | 'bean' | 'enum'
}

export interface LubanConfTarget {
  name: string
  manager: string
  groups: string[]
  topModule?: string
}

export interface LubanConfGroup {
  names: string[]
  default: boolean
}

export interface LubanConf {
  /** luban.conf 所在目录，所有相对路径的基准 */
  root: string
  groups: LubanConfGroup[]
  schemaFiles: LubanConfSchemaFile[]
  dataDir: string
  targets: LubanConfTarget[]
  xargs: unknown[]
}

export interface LubanRuntime {
  dotnetCommand: string
  dotnetVersion?: string
  lubanDllPath: string
  lubanVersion?: string
  available: boolean
  problems: string[]
}

export interface LubanProject {
  confPath: string
  conf: LubanConf
  runtime: LubanRuntime
}

export interface RecentProject {
  confPath: string
  openedAt: number
}
