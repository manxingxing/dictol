import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Keyboard, Settings, ShieldAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type WordCaptureStatus = Awaited<ReturnType<typeof window.dictol.wordCapture.getStatus>>

export function SettingsPage(): React.JSX.Element {
  const [captureStatus, setCaptureStatus] = useState<WordCaptureStatus>(null)
  const [recordingShortcut, setRecordingShortcut] = useState(false)
  const [savingShortcut, setSavingShortcut] = useState(false)
  const [shortcutError, setShortcutError] = useState<string | null>(null)
  const refreshCaptureStatus = useCallback(() => {
    void window.dictol.wordCapture.getStatus().then(setCaptureStatus)
  }, [])

  useEffect(() => {
    refreshCaptureStatus()
    window.addEventListener('focus', refreshCaptureStatus)
    return () => window.removeEventListener('focus', refreshCaptureStatus)
  }, [refreshCaptureStatus])

  return (
    <section className="mx-auto flex max-w-3xl flex-col px-8 py-16">
      <p className="mb-2 text-sm font-medium text-primary">设置</p>
      <h1 className="text-3xl font-semibold tracking-tight">应用设置</h1>
      <Card className="mt-8">
        <CardHeader>
          <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Keyboard className="size-5" />
          </div>
          <CardTitle>快捷键取词</CardTitle>
          <CardDescription>
            在其他软件中选择文字，然后按下快捷键，Dictol 会打开对应词条。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!captureStatus ? (
            <p className="text-sm text-muted-foreground">正在检查取词状态…</p>
          ) : !captureStatus.supported ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Settings className="size-4" />
              当前平台暂不支持快捷键取词。
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-border px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">全局快捷键</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {recordingShortcut
                        ? '请直接按下新的组合键，按 Esc 取消'
                        : captureStatus.registered
                          ? '快捷键已启用'
                          : '快捷键被其他应用占用，请重新设置'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="min-w-24 rounded-md border border-border bg-muted px-3 py-1.5 text-center text-sm font-medium">
                      {recordingShortcut ? '等待输入…' : formatShortcut(captureStatus.shortcut)}
                    </kbd>
                    <Button
                      disabled={savingShortcut}
                      onClick={() => {
                        setShortcutError(null)
                        setRecordingShortcut(true)
                      }}
                      onKeyDown={(event) => {
                        if (!recordingShortcut) return
                        event.preventDefault()
                        event.stopPropagation()
                        if (event.key === 'Escape') {
                          setRecordingShortcut(false)
                          setShortcutError(null)
                          return
                        }

                        const shortcut = shortcutFromKeyboardEvent(event)
                        if (!shortcut) return
                        setRecordingShortcut(false)
                        setSavingShortcut(true)
                        void window.dictol.wordCapture
                          .setShortcut(shortcut)
                          .then((result) => {
                            if (!result) {
                              setShortcutError('无法更新快捷键设置。')
                              return
                            }
                            setCaptureStatus(result.status)
                            setShortcutError(result.error ?? null)
                          })
                          .finally(() => setSavingShortcut(false))
                      }}
                      size="sm"
                      variant="outline"
                    >
                      {recordingShortcut ? '按下组合键' : '修改'}
                    </Button>
                  </div>
                </div>
                {shortcutError && (
                  <p className="mt-3 text-xs text-destructive" role="alert">
                    {shortcutError}
                  </p>
                )}
              </div>
              <div className="flex items-start justify-between gap-6 rounded-lg border border-border px-4 py-3">
                <div className="flex gap-3">
                  {captureStatus.trusted ? (
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
                  ) : (
                    <ShieldAlert className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm font-medium">辅助功能权限</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {captureStatus.trusted
                        ? '权限已开启，可以读取其他软件当前选中的文字。'
                        : 'macOS 要求授权后才能读取其他软件中的选区。'}
                    </p>
                  </div>
                </div>
                {!captureStatus.trusted && (
                  <Button
                    className="shrink-0"
                    onClick={() => {
                      void window.dictol.wordCapture.requestAccess().then(setCaptureStatus)
                    }}
                    size="sm"
                  >
                    开启权限
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function shortcutFromKeyboardEvent(event: React.KeyboardEvent): string | null {
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

function formatShortcut(shortcut: string): string {
  const labels: Record<string, string> = {
    Command: '⌘',
    CommandOrControl: '⌘',
    Control: '⌃',
    Alt: '⌥',
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
