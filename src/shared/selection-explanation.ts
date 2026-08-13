export const SELECTION_EXPLANATION_HEADER_HEIGHT = 44
export const SELECTION_EXPLANATION_DICTIONARY_SWITCHER_HEIGHT = 36

export type SelectionExplanationDictionary = {
  dictionaryId: string
  dictionaryName: string
}

export type SelectionExplanationPayload = {
  mode: 'dictionary' | 'ai'
  requestId: number
  word: string
  dictionaryName?: string
  dictionaries?: SelectionExplanationDictionary[]
  activeDictionaryId?: string
  state: 'loading' | 'refreshing' | 'empty' | 'content' | 'error'
  content?: string
  message?: string
}
