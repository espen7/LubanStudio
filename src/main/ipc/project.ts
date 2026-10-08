import { dialog, BrowserWindow } from 'electron'
import { readdirSync, statSync } from 'node:fs'
import { handle } from './register'
import { closeProject, openProject } from '@main/project/workspace'
import { getSettings } from '@main/settings/store'

const CONF_FILTERS = [{ name: 'Luban 配置文件', extensions: ['conf', 'json'] }]

/** 用户可能选中文件夹或 conf 文件；文件夹则自动定位 conf */
async function resolveConfSelection(selection: string): Promise<string | null> {
  if (!statSync(selection).isDirectory()) return selection
  const confs = readdirSync(selection)
    .filter((n) => n.toLowerCase().endsWith('.conf') || n.toLowerCase().endsWith('.json'))
    .filter((n) => !n.startsWith('.'))
    .sort()

  if (confs.length === 0) {
    dialog.showErrorBox(
      '不是 Luban 工程',
      `所选目录中没有找到 luban.conf（或任何 *.conf 配置文件）：\n${selection}\n\n请选择 Luban 配置目录，或直接双击 conf 文件。`
    )
    return null
  }
  const preferred = confs.find((n) => n.toLowerCase() === 'luban.conf')
  if (confs.length === 1 || preferred) return joinSafe(selection, preferred ?? confs[0])

  // 多个 conf 且无 luban.conf：让用户在原目录里选
  const win = BrowserWindow.getAllWindows()[0]
  const again = await dialog.showOpenDialog(win, {
    title: '该目录有多个配置文件，请选择一个',
    defaultPath: selection,
    buttonLabel: '选择 conf 文件',
    properties: ['openFile'],
    filters: CONF_FILTERS
  })
  return again.filePaths[0] ?? null
}

function joinSafe(dir: string, name: string): string {
  const sep = dir.endsWith('\\') || dir.endsWith('/') ? '' : '/'
  return `${dir}${sep}${name}`
}

export function registerProjectIpc(): void {
  handle('project:pick-conf', async (): Promise<string | null> => {
    const win = BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win, {
      title: '选择 Luban 工程目录或 luban.conf',
      buttonLabel: '打开',
      properties: ['openFile', 'openDirectory'],
      filters: CONF_FILTERS
    })
    const picked = result.filePaths[0]
    if (!picked) return null
    return resolveConfSelection(picked)
  })

  handle('project:open', ({ confPath }) => openProject(confPath))

  handle('project:close', () => {
    closeProject()
  })

  handle('project:recent', () => getSettings().recentProjects)
}
