export const TOAST_TYPES = ['success', 'info', 'warning', 'error'] as const

export type ToastType = (typeof TOAST_TYPES)[number]

export type ToastPayload = {
  type: ToastType
  message: string
}
