import { dialog, BrowserWindow } from 'electron'
import { handle } from './register'
import { closeProject, openProject } from '@main/project/workspace'
import { getSettings } from '@main/settings/store'

export function registerProjectIpc(): void {
  handle('project:pick-conf', async (): Promise<string | null> => {
    const win = BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win, {
      title: '选择 luban.conf',
      properties: ['openFile'],
      filters: [{ name: 'luban.conf', extensions: ['conf', 'json'] }]
    })
    return result.filePaths[0] ?? null
  })

  handle('project:open', ({ confPath }) => openProject(confPath))

  handle('project:close', () => {
    closeProject()
  })

  handle('project:recent', () => getSettings().recentProjects)
}
