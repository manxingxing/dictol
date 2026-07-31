import { AppRuntime } from '../app-runtime'
import { DBService } from '../db-service'

export abstract class BaseController {
  protected readonly runtime: AppRuntime

  constructor(runtime: AppRuntime) {
    this.runtime = runtime
  }

  private requireDBService(): DBService {
    if (!this.runtime.dbService) throw new Error('注册 IPC 前必须初始化 DBService')
    return this.runtime.dbService
  }

  protected get db(): DBService {
    return this.requireDBService()
  }

  abstract mount(): void
}
