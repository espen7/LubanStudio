import { dialog, BrowserWindow } from 'electron'
import { handle } from './register'
import { closeProject, openProject } from '@main/project/workspace'
import { getSettings } from '@main/settings/store'

export function registerProjectIpc(): void {
  handle('project:pick-conf', async (): Promise<string | null> => {
    const win = BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win, {
      title: '选择 luban.conf（双击打开文件，选中文件夹无效）',
      buttonLabel: '选择 conf 文件',
      properties: ['openFile'],
      filters: [{ name: 'Luban 配置文件', extensions: ['conf', 'json'] }]
    })
    return result.filePaths[0] ?? null
  })

  handle('project:open', ({ confPath }) => openProject(confPath))

  handle('project:close', () => {
    closeProject()
  })

  handle('project:recent', () => getSettings().recentProjects)
}
