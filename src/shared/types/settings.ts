import type { RecentProject } from './project'

export interface AppSettings {
  recentProjects: RecentProject[]
  dotnetCommandOverride: string
  lubanDllOverride: string
  backupOnSave: boolean
  lastExportDir: string
  lastValidateTarget: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  recentProjects: [],
  dotnetCommandOverride: '',
  lubanDllOverride: '',
  backupOnSave: true,
  lastExportDir: '',
  lastValidateTarget: ''
}
