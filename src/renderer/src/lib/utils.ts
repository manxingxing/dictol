import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

const sameDayTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit'
})
const otherDayTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
})

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function isVisible(element: HTMLElement): boolean {
  if (
    !element.checkVisibility({
      checkOpacity: true,
      checkVisibilityCSS: true,
      contentVisibilityAuto: true
    })
  ) {
    return false
  }

  const bounds = element.getBoundingClientRect()
  return (
    bounds.width > 0 &&
    bounds.height > 0 &&
    bounds.right > 0 &&
    bounds.bottom > 0 &&
    bounds.left < window.innerWidth &&
    bounds.top < window.innerHeight
  )
}

export function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const today = new Date()
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  return (sameDay ? sameDayTimeFormatter : otherDayTimeFormatter).format(date)
}
