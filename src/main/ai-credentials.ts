import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CREDENTIALS_FILE_NAME = 'ai-credentials.json'

export class AiCredentialStore {
  constructor(
    private readonly credentialsPath = join(app.getPath('userData'), CREDENTIALS_FILE_NAME)
  ) {}

  getApiKey(): string {
    try {
      if (!existsSync(this.credentialsPath)) return ''
      const encoded = JSON.parse(readFileSync(this.credentialsPath, 'utf8')) as unknown
      if (typeof encoded !== 'string' || !encoded) return ''
      if (!safeStorage.isEncryptionAvailable()) return ''
      return safeStorage.decryptString(Buffer.from(encoded, 'base64'))
    } catch (error) {
      console.warn('Failed to read AI credentials', error)
      return ''
    }
  }

  saveApiKey(apiKey: string): void {
    if (!apiKey.trim()) {
      if (existsSync(this.credentialsPath)) unlinkSync(this.credentialsPath)
      return
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('当前系统无法安全保存 API Key，请先启用系统密钥存储。')
    }
    const encrypted = safeStorage.encryptString(apiKey.trim()).toString('base64')
    const directory = app.getPath('userData')
    const temporaryPath = `${this.credentialsPath}.tmp`
    mkdirSync(directory, { recursive: true })
    writeFileSync(temporaryPath, `${JSON.stringify(encrypted)}\n`, 'utf8')
    renameSync(temporaryPath, this.credentialsPath)
  }
}
