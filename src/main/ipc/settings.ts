import { handle } from './register'
import { getSettings, patchSettings } from '@main/settings/store'

export function registerSettingsIpc(): void {
  handle('settings:get', () => getSettings())

  handle('settings:patch', (patch) => patchSettings(patch))
}
