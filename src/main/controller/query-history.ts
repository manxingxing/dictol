import { ipcMain, type IpcMainInvokeEvent } from 'electron'

import type { QueryHistoryItem } from '../db-service'
import { BaseController } from './base-controller'

export class QueryHistoryController extends BaseController {
  override mount(): void {
    ipcMain.handle('query-history:list', this.list)
    ipcMain.handle('query-history:clear', this.clear)
    ipcMain.handle('query-history:record', this.record)
  }

  list = async (): Promise<QueryHistoryItem[]> => {
    return await this.db.listQueryHistory()
  }

  clear = async (): Promise<void> => {
    await this.db.clearQueryHistory()
  }

  record = async (_event: IpcMainInvokeEvent, term: string): Promise<void> => {
    await this.db.recordQueryHistory(term)
  }
}
