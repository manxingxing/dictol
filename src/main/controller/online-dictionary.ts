import { ipcMain, type IpcMainInvokeEvent } from 'electron'

import type { OnlineDictionaryConfig } from '../db-service'
import { BaseController } from './base-controller'

export class OnlineDictionaryController extends BaseController {
  override mount(): void {
    ipcMain.handle('online-dictionaries:list', this.list)
    ipcMain.handle('online-dictionaries:add', this.add)
    ipcMain.handle('online-dictionaries:remove', this.remove)
    ipcMain.handle('online-dictionaries:reorder', this.reorder)
  }

  list = async (): Promise<OnlineDictionaryConfig[]> => {
    return this.db.listOnlineDictionaries()
  }

  add = async (
    _event: IpcMainInvokeEvent,
    input: Omit<OnlineDictionaryConfig, 'id'>
  ): Promise<OnlineDictionaryConfig> => {
    return this.db.addOnlineDictionary(input)
  }

  remove = async (_event: IpcMainInvokeEvent, id: string): Promise<void> => {
    await this.db.deleteOnlineDictionary(id)
  }

  reorder = async (_event: IpcMainInvokeEvent, ids: string[]): Promise<void> => {
    await this.db.reorderOnlineDictionaries(ids)
  }
}
