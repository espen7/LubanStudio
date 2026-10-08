import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { IpcContract } from '@shared/ipc/contract'

type Handler<K extends keyof IpcContract> = IpcContract[K]['req'] extends void
  ? () => Promise<IpcContract[K]['res']> | IpcContract[K]['res']
  : (
      req: IpcContract[K]['req']
    ) => Promise<IpcContract[K]['res']> | IpcContract[K]['res']

export function handle<K extends keyof IpcContract & string>(channel: K, fn: Handler<K>): void {
  ipcMain.handle(channel, async (_event: IpcMainInvokeEvent, req?: IpcContract[K]['req']) => {
    try {
      return await (fn as (r?: unknown) => unknown)(req)
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  })
}
