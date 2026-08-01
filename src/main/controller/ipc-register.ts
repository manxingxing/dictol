import { AppRuntime } from '../app-runtime'
import { DictionaryController } from './dictionary'
import { DictionaryEntryController } from './dictionary-entry'
import { DictionaryViewController } from './dictionary-view'
import { QueryHistoryController } from './query-history'
import { SearchPopoverController } from './search-popover'
import { SelectionToolbarController } from './selection-toolbar'
import { WordCaptureController } from './word-capture'
import { WordLookupController } from './word-lookup'

export const registerIPCHandlers = (appRuntime: AppRuntime): void => {
  const controllers = [
    new DictionaryEntryController(appRuntime),
    new DictionaryController(appRuntime),
    new DictionaryViewController(appRuntime),
    new QueryHistoryController(appRuntime),
    new SearchPopoverController(appRuntime),
    new SelectionToolbarController(appRuntime),
    new WordCaptureController(appRuntime),
    new WordLookupController(appRuntime)
  ]

  controllers.forEach((controller) => controller.mount())
}
