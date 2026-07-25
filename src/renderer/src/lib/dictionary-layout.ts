export const dictionaryLayoutChangedEvent = 'dictol:dictionary-layout-changed'

export function notifyDictionaryLayoutChanged(): void {
  window.dispatchEvent(new Event(dictionaryLayoutChangedEvent))
}
