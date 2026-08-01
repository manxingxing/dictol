import { useCallback, useEffect, useState } from 'react'
import { CircleAlert, CheckCircle2, Keyboard, Settings, ShieldAlert, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel
} from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'

type WordCaptureStatus = Awaited<ReturnType<typeof window.dictol.wordCapture.getStatus>>

export function SettingsPage(): React.JSX.Element {
  const [captureStatus, setCaptureStatus] = useState<WordCaptureStatus>(null)
  const [recordingShortcut, setRecordingShortcut] = useState(false)
  const [savingShortcut, setSavingShortcut] = useState(false)
  const [savingSelectionLookup, setSavingSelectionLookup] = useState(false)
  const [removingProgram, setRemovingProgram] = useState<string | null>(null)
  const [shortcutError, setShortcutError] = useState<string | null>(null)
  const [selectionLookupError, setSelectionLookupError] = useState<string | null>(null)
  const [excludedProgramsError, setExcludedProgramsError] = useState<string | null>(null)
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
              {captureStatus.limitation ?? '当前平台暂不支持快捷键取词。'}
            </div>
          ) : (
            <>
              {captureStatus.limitation && (
                <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-xs leading-5 text-muted-foreground">
                  {captureStatus.limitation}
                </div>
              )}
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

              <div
                className="rounded-lg border border-border px-4 py-3 transition-colors data-[enabled=true]:border-primary/25 data-[enabled=true]:bg-primary/[0.025]"
                data-enabled={captureStatus.lookupWordOnSelection}
              >
                <Field className="items-start gap-4" orientation="horizontal">
                  <FieldContent>
                    <FieldLabel className="cursor-pointer" htmlFor="lookup-word-on-selection">
                      实时划选取词
                    </FieldLabel>
                    <FieldDescription
                      className="text-xs leading-5"
                      id="lookup-word-on-selection-description"
                    >
                      在其他软件中选中文字后立即查询，无需再按全局快捷键。
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    aria-describedby={
                      selectionLookupError
                        ? 'lookup-word-on-selection-description lookup-word-on-selection-error'
                        : 'lookup-word-on-selection-description'
                    }
                    aria-invalid={Boolean(selectionLookupError)}
                    checked={captureStatus.lookupWordOnSelection}
                    className="mt-0.5"
                    disabled={savingSelectionLookup}
                    id="lookup-word-on-selection"
                    onCheckedChange={(checked) => {
                      setSelectionLookupError(null)
                      setSavingSelectionLookup(true)
                      void window.dictol.wordCapture
                        .setSelectionEnabled(checked)
                        .then((result) => {
                          if (!result) {
                            setSelectionLookupError('无法更新实时取词设置。')
                            return
                          }
                          setCaptureStatus(result.status)
                          setSelectionLookupError(result.error ?? null)
                        })
                        .finally(() => setSavingSelectionLookup(false))
                    }}
                  />
                </Field>

                {selectionLookupError && (
                  <FieldError
                    className="mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-5  bg-red-50  border-red-400"
                    id="lookup-word-on-selection-error"
                  >
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                    <span>{selectionLookupError}selectionLookupError</span>
                  </FieldError>
                )}

                {captureStatus.lookupWordOnSelection && (
                  <div className="mt-2 flex justify-end border-t border-border/60 pt-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          className="h-7 px-2 text-xs text-muted-foreground"
                          onClick={() => setExcludedProgramsError(null)}
                          type="button"
                          variant="ghost"
                        >
                          管理已排除的程序
                          {captureStatus.excludedPrograms.length > 0 &&
                            `（${captureStatus.excludedPrograms.length}）`}
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>已排除的程序</DialogTitle>
                          <DialogDescription>
                            在这些程序中选择文字时，不会显示划词操作条。
                          </DialogDescription>
                        </DialogHeader>

                        {captureStatus.excludedPrograms.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                            暂无被排除的程序
                          </div>
                        ) : (
                          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                            {captureStatus.excludedPrograms.map((programName) => (
                              <div
                                className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2"
                                key={programName}
                              >
                                <span className="min-w-0 truncate text-sm" title={programName}>
                                  {programName}
                                </span>
                                <Button
                                  aria-label={`从排除列表删除 ${programName}`}
                                  className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                                  disabled={removingProgram !== null}
                                  onClick={() => {
                                    setExcludedProgramsError(null)
                                    setRemovingProgram(programName)
                                    void window.dictol.wordCapture
                                      .removeExcludedProgram(programName)
                                      .then((result) => {
                                        if (!result) {
                                          setExcludedProgramsError('无法更新程序排除列表。')
                                          return
                                        }
                                        setCaptureStatus(result.status)
                                        setExcludedProgramsError(result.error ?? null)
                                      })
                                      .finally(() => setRemovingProgram(null))
                                  }}
                                  size="icon"
                                  title="删除"
                                  type="button"
                                  variant="ghost"
                                >
                                  <Trash2 />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}

                        {excludedProgramsError && (
                          <FieldError className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs leading-5">
                            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                            <span>{excludedProgramsError}</span>
                          </FieldError>
                        )}

                        {window.dictol.platform === 'linux' && (
                          <p className="text-xs leading-5 text-muted-foreground">
                            Linux Wayland 无法提供来源程序名，因此程序排除列表仅在 X11 会话中生效。
                          </p>
                        )}
                      </DialogContent>
                    </Dialog>
                  </div>
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
