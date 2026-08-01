import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type {
  DictionaryEntryContent,
  DictionaryEntryGroup,
  DictionarySearchResult
} from '../db-service'
import { decodeMdxRecord } from '../mdict-runtime'
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
    return this.db.lookupDictionaryEntryGroup(term)
  }

  get = async (
    _event: IpcMainInvokeEvent,
    entryId: string
  ): Promise<DictionaryEntryContent | null> => {
    const record = await this.db.getDictionaryEntryRecord(entryId)
    if (!record) return null

    const mdx = this.runtime.mdFileCache.fetch(record.filePath)
    const bytes = await mdx.readRecord(
      BigInt(record.recordStartOffset),
      BigInt(record.recordEndOffset)
    )
    return {
      id: record.id,
      dictionaryId: record.dictionaryId,
      dictionaryName: record.dictionaryName,
      word: record.word,
      html: decodeMdxRecord(bytes, mdx.metadata.encoding),
      customCss: record.customCss
    }
  }
}
