import type { LubanProject, RecentProject } from '@shared/types/project'
import type { AppSettings } from '@shared/types/settings'

declare global {
  interface Window {
    api: {
      project: {
        pickConf(): Promise<string | null>
        open(confPath: string): Promise<LubanProject>
        close(): Promise<void>
        recent(): Promise<RecentProject[]>
      }
      settings: {
        get(): Promise<AppSettings>
        patch(patch: Partial<AppSettings>): Promise<AppSettings>
      }
    }
  }
}

export {}
