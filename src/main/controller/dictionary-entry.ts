import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type {
  DictionaryEntryContent,
  DictionaryEntryGroup,
  DictionarySearchResult
} from '../db-service'
import { readDictionaryEntryText } from '../dictionary-entry-content'
import { BaseController } from './base-controller'

export class DictionaryEntryController extends BaseController {
  override mount(): void {
    ipcMain.handle('dictionary-entries:search', this.search)
    ipcMain.handle('dictionary-entries:lookup', this.lookup)
    ipcMain.handle('dictionary-entries:get', this.get)
  }

  search = async (
    _event: IpcMainInvokeEvent,
    prefix: string,
    limit?: number
  ): Promise<DictionarySearchResult[]> => {
    return this.db.searchDictionaryEntries(prefix, limit)
  }

  lookup = async (
    _event: IpcMainInvokeEvent,
    term: string
  ): Promise<DictionaryEntryGroup | null> => {
    const startedAt = performance.now()
    try {
      const group = await this.db.lookupDictionaryEntryGroup(term)
      console.debug('[DictionaryLookup] main window', {
        term,
        takeMs: performance.now() - startedAt,
        matched: Boolean(group)
      })
      return group
    } catch (error) {
      console.debug('[DictionaryLookup] main window', {
        term,
        takeMs: performance.now() - startedAt,
        matched: false,
        failed: true
      })
      throw error
    }
  }

  get = async (
    _event: IpcMainInvokeEvent,
    entryId: string
  ): Promise<DictionaryEntryContent | null> => {
    const records = await this.db.getDictionaryEntryRecords(entryId)
    const record = records[0]
    if (!record) return null

    const html = await readDictionaryEntryText(this.runtime, records)
    return {
      id: record.id,
      dictionaryId: record.dictionaryId,
      dictionaryName: record.dictionaryName,
      word: record.word,
      html,
      customCss: record.customCss
    }
  }
}
