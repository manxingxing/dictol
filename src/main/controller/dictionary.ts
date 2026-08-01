import { dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'

import type { DictionarySummary, ImportedDictionary, ReadyDictionary } from '../db-service'
import { invalidateDictionaryResources } from '../resource-protocol'
import { BaseController } from './base-controller'

export class DictionaryController extends BaseController {
  override mount(): void {
    ipcMain.handle('dictionaries:list-ready', this.listReady)
    ipcMain.handle('dictionaries:list', this.listDictionaries)
    ipcMain.handle('dictionaries:import', this.importDictionary)
    ipcMain.handle('dictionaries:delete', this.deleteDictionary)
    ipcMain.handle('dictionaries:reorder', this.reorderDictionaries)
    ipcMain.handle('dictionaries:update-name', this.updateDictionaryName)
    ipcMain.handle('dictionaries:update-custom-css', this.updateDictionaryCustomCss)
  }

  listReady = async (): Promise<ReadyDictionary[]> => {
    return this.db.listReadyDictionaries()
  }

  listDictionaries = async (): Promise<DictionarySummary[]> => {
    return this.db.listDictionaries()
  }

  importDictionary = async (): Promise<ImportedDictionary | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'MDX 词典', extensions: ['mdx'] }]
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return this.db.importDictionaryFromFile(result.filePaths[0])
  }

  deleteDictionary = async (_event: IpcMainInvokeEvent, dictionaryId: string): Promise<void> => {
    const numericId = Number(dictionaryId)
    if (Number.isSafeInteger(numericId) && numericId > 0) {
      invalidateDictionaryResources(numericId)
    }
    this.runtime.windowManager.dictionaryView?.hide()
    const dictionaryPath = await this.db.getDictionaryPath(dictionaryId)
    if (dictionaryPath) this.runtime.mdFileCache.invalidateMdictDirectory(dictionaryPath)
    await this.db.deleteDictionary(dictionaryId)
    if (Number.isSafeInteger(numericId) && numericId > 0) {
      await this.runtime.resourceCache.removeDictionary(numericId)
    }
  }

  reorderDictionaries = async (
    _event: IpcMainInvokeEvent,
    dictionaryIds: string[]
  ): Promise<void> => {
    await this.db.reorderDictionaries(dictionaryIds)
  }

  updateDictionaryName = async (
    _event: IpcMainInvokeEvent,
    dictionaryId: string,
    name: string
  ): Promise<void> => {
    await this.db.updateDictionaryName(dictionaryId, name)
  }

  updateDictionaryCustomCss = async (
    _event: IpcMainInvokeEvent,
    dictionaryId: string,
    customCss: string
  ): Promise<void> => {
    await this.db.updateDictionaryCustomCss(dictionaryId, customCss)

    const numericId = Number(dictionaryId)
    if (Number.isSafeInteger(numericId) && numericId > 0) {
      invalidateDictionaryResources(numericId)
    }

    const view = this.runtime.windowManager.dictionaryView
    if (
      view &&
      !view.isDestroyed &&
      view.getURL().startsWith(`dictol-entry://dictionary-${dictionaryId}/`)
    ) {
      view.reload()
    }
  }
}
