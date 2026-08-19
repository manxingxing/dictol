import type { KeyboardEvent } from 'react'

export function shortcutFromKeyboardEvent(event: KeyboardEvent): string | null {
  const modifiers: string[] = []
  if (event.metaKey) modifiers.push('Command')
  if (event.ctrlKey) modifiers.push('Control')
  if (event.altKey) modifiers.push('Alt')
  if (event.shiftKey) modifiers.push('Shift')
  if (!event.metaKey && !event.ctrlKey && !event.altKey) return null

  let key: string | undefined
  if (/^Key[A-Z]$/.test(event.code)) key = event.code.slice(3)
  else if (/^Digit[0-9]$/.test(event.code)) key = event.code.slice(5)
  else if (/^F(?:[1-9]|1\d|2[0-4])$/.test(event.key)) key = event.key
  else {
    key = {
      ' ': 'Space',
      Tab: 'Tab',
      Enter: 'Enter',
      Backspace: 'Backspace',
      Delete: 'Delete',
      Insert: 'Insert',
      Home: 'Home',
      End: 'End',
      PageUp: 'PageUp',
      PageDown: 'PageDown',
      ArrowUp: 'Up',
      ArrowDown: 'Down',
      ArrowLeft: 'Left',
      ArrowRight: 'Right'
    }[event.key]
  }

  return key ? [...modifiers, key].join('+') : null
}

export function formatShortcut(shortcut: string, platform: NodeJS.Platform): string {
  const labels: Record<string, string> = {
    Command: '⌘',
    Control: platform === 'darwin' ? '⌃' : 'Ctrl',
    CommandOrControl: platform === 'darwin' ? '⌘' : 'Ctrl',
    Alt: platform === 'darwin' ? '⌥' : 'Alt',
    Option: '⌥',
    Shift: '⇧',
    Space: 'Space',
    Up: '↑',
    Down: '↓',
    Left: '←',
    Right: '→'
  }
  return shortcut
    .split('+')
    .map((part) => labels[part] ?? part)
    .join(' ')
}
