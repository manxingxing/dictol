export const SELECTION_TOOLBAR_WIDTH = 280
export const SELECTION_TOOLBAR_WIDTH_WITH_AI = 352
export const SELECTION_TOOLBAR_HEIGHT = 44
export const SELECTION_TOOLBAR_WINDOWS_SHADOW_MARGIN = 6

export function getSelectionToolbarWindowSize(
  aiEnabled: boolean,
  platform: string
): { width: number; height: number } {
  const width = aiEnabled ? SELECTION_TOOLBAR_WIDTH_WITH_AI : SELECTION_TOOLBAR_WIDTH
  if (platform !== 'win32') return { width, height: SELECTION_TOOLBAR_HEIGHT }

  const shadowSpace = SELECTION_TOOLBAR_WINDOWS_SHADOW_MARGIN * 2
  return {
    width: width + shadowSpace,
    height: SELECTION_TOOLBAR_HEIGHT + shadowSpace
  }
}

export type SelectionToolbarPayload = {
  requestId: number
  word: string
  programName: string
  canExclude: boolean
  aiEnabled: boolean
}
