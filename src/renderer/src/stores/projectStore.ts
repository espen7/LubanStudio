import { create } from 'zustand'
import type { LubanProject, RecentProject } from '@shared/types/project'

interface ProjectState {
  project: LubanProject | null
  recent: RecentProject[]
  opening: boolean
  error: string
  loadRecent: () => Promise<void>
  openProject: (confPath?: string) => Promise<void>
  closeProject: () => Promise<void>
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null,
  recent: [],
  opening: false,
  error: '',

  loadRecent: async () => {
    if (!window.api) return
    try {
      set({ recent: await window.api.project.recent() })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  openProject: async (confPath?: string) => {
    if (!window.api) return
    const api = window.api
    if (get().opening) return
    set({ opening: true, error: '' })
    try {
      const path = confPath ?? (await api.project.pickConf())
      if (!path) {
        set({ opening: false })
        return
      }
      const project = await api.project.open(path)
      set({ project, recent: await api.project.recent(), opening: false })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), opening: false })
    }
  },

  closeProject: async () => {
    if (!window.api) return
    await window.api.project.close()
    set({ project: null })
  }
}))
