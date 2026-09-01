import { dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { extname, isAbsolute } from 'node:path'

import type {
  DictionaryImportPreview,
  DictionaryImportRequest
} from '../../shared/dictionary-import'
import type { DictionarySummary, ImportedDictionary, ReadyDictionary } from '../db-service'
import {
  createDictionaryImportPreview,
  resolveDictionaryImportSelection
} from '../dictionary-import-files'
import { invalidateDictionaryResources, suspendDictionaryResources } from '../resource-protocol'
import { BaseController } from './base-controller'

export class DictionaryController extends BaseController {
  override mount(): void {
    ipcMain.handle('dictionaries:list-ready', this.listReady)
    ipcMain.handle('dictionaries:list', this.listDictionaries)
    ipcMain.handle('dictionaries:select-file', this.selectImportFile)
    ipcMain.handle('dictionaries:import', this.importDictionary)
    ipcMain.handle('dictionaries:delete', this.deleteDictionary)
    ipcMain.handle('dictionaries:open-directory', this.openDirectory)
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

  selectImportFile = async (): Promise<DictionaryImportPreview | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'MDX 词典', extensions: ['mdx'] }]
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return createDictionaryImportPreview(result.filePaths[0])
  }

  importDictionary = async (
    _event: IpcMainInvokeEvent,
    request: unknown
  ): Promise<ImportedDictionary> => {
    if (!isDictionaryImportRequest(request)) {
      throw new Error('请选择有效的 MDX 文件')
    }
    const sourceFiles = await resolveDictionaryImportSelection(request)
    return this.db.importDictionaryFromFile(request.mdxPath, sourceFiles)
  }

  deleteDictionary = async (_event: IpcMainInvokeEvent, dictionaryId: string): Promise<void> => {
    const numericId = Number(dictionaryId)
    const validNumericId = Number.isSafeInteger(numericId) && numericId > 0
    this.runtime.windowManager.dictionaryView?.hide()
    const dictionaryPath = await this.db.getDictionaryPath(dictionaryId)
    const resumeResources = validNumericId ? await suspendDictionaryResources(numericId) : undefined

    try {
      if (dictionaryPath) await this.runtime.mdFileCache.closeMdictDirectory(dictionaryPath)
      await this.db.deleteDictionary(dictionaryId)
    } catch (error) {
      if (dictionaryPath) this.runtime.mdFileCache.allowMdictDirectory(dictionaryPath)
      resumeResources?.()
      throw error
    }
    if (validNumericId) await this.runtime.resourceCache.removeDictionary(numericId)
  }

  openDirectory = async (_event: IpcMainInvokeEvent, dictionaryId: string): Promise<void> => {
    const dictionaryPath = await this.db.getDictionaryPath(dictionaryId)
    if (!dictionaryPath) throw new Error('词典目录不存在')

    const error = await shell.openPath(dictionaryPath)
    if (error) throw new Error(error)
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

function isDictionaryImportRequest(value: unknown): value is DictionaryImportRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as DictionaryImportRequest
  return (
    typeof request.mdxPath === 'string' &&
    isAbsolute(request.mdxPath) &&
    extname(request.mdxPath).toLowerCase() === '.mdx' &&
    Array.isArray(request.selectedRelativePaths) &&
    request.selectedRelativePaths.length > 0 &&
    request.selectedRelativePaths.length <= 20_000 &&
    request.selectedRelativePaths.every(
      (relativePath) =>
        typeof relativePath === 'string' && relativePath.length > 0 && relativePath.length <= 1_000
    )
  )
}
