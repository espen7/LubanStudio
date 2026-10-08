import type { LubanProject } from '@shared/types/project'
import { parseLubanConf } from './conf-parser'
import { detectRuntime } from './discovery'
import { getSettings, patchSettings } from '@main/settings/store'

let current: LubanProject | null = null

export function getCurrentProject(): LubanProject | null {
  return current
}

export async function openProject(confPath: string): Promise<LubanProject> {
  const conf = parseLubanConf(confPath)
  const runtime = await detectRuntime(conf.root, getSettings())
  current = { confPath, conf, runtime }

  const recent = getSettings().recentProjects.filter((r) => r.confPath !== confPath)
  recent.unshift({ confPath, openedAt: Date.now() })
  patchSettings({ recentProjects: recent.slice(0, 10) })

  return current
}

export function closeProject(): void {
  current = null
}
