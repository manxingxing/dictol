import { useCallback, useEffect, useState } from 'react'
import {
  CircleAlert,
  CheckCircle2,
  Keyboard,
  Palette,
  Settings,
  ShieldAlert,
  Sparkles,
  Trash2
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAiLookupConfig, useSaveAiLookupConfig } from '@/hooks/use-ai-lookup'
import { cn } from '@/lib/utils'
import { type ChromeTone, useAppStore } from '@/stores/app-store'

type WordCaptureStatus = Awaited<ReturnType<typeof window.dictol.wordCapture.getStatus>>
type AiLookupConfig = NonNullable<Awaited<ReturnType<typeof window.dictol.aiLookup.getConfig>>>

type AiLookupForm = Omit<AiLookupConfig, 'hasApiKey'> & {
  apiKey: string
}

export function SettingsPage(): React.JSX.Element {
  const chromeTone = useAppStore((state) => state.chromeTone)
  const setChromeTone = useAppStore((state) => state.setChromeTone)
  const [captureStatus, setCaptureStatus] = useState<WordCaptureStatus>(null)
  const [recordingShortcut, setRecordingShortcut] = useState(false)
  const [savingShortcut, setSavingShortcut] = useState(false)
  const [savingSelectionLookup, setSavingSelectionLookup] = useState(false)
  const [removingProgram, setRemovingProgram] = useState<string | null>(null)
  const [shortcutError, setShortcutError] = useState<string | null>(null)
  const [selectionLookupError, setSelectionLookupError] = useState<string | null>(null)
  const [excludedProgramsError, setExcludedProgramsError] = useState<string | null>(null)
  const [openingInputMonitoringSettings, setOpeningInputMonitoringSettings] = useState(false)
  const [inputMonitoringSettingsError, setInputMonitoringSettingsError] = useState<string | null>(
    null
  )
  const [aiDialogOpen, setAiDialogOpen] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const aiConfig = useAiLookupConfig()
  const saveAiConfig = useSaveAiLookupConfig()
  const [aiForm, setAiForm] = useState<AiLookupForm>(createAiForm)
  const refreshCaptureStatus = useCallback(() => {
    void window.dictol.wordCapture.getStatus().then(setCaptureStatus)
  }, [])

  useEffect(() => {
    refreshCaptureStatus()
    window.addEventListener('focus', refreshCaptureStatus)
    return () => window.removeEventListener('focus', refreshCaptureStatus)
  }, [refreshCaptureStatus])

  useEffect(() => {
    const config = aiConfig.data
    if (!config) return
    // Hydrate the editable form from the main-process source of truth.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAiForm((current) => ({
      enabled: config.enabled,
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      sidebarSystemPrompt: config.sidebarSystemPrompt,
      selectionToolbarSystemPrompt: config.selectionToolbarSystemPrompt,
      apiKey: current.apiKey
    }))
  }, [aiConfig.data])

  const updateAiConfig = (enabled: boolean): void => {
    const nextForm = { ...aiForm, enabled }
    setAiForm(nextForm)
    setAiError(null)
    saveAiConfig.mutate(nextForm, {
      onError: (error: Error) => setAiError(error.message)
    })
  }

  const saveAiForm = (): void => {
    setAiError(null)
    saveAiConfig.mutate(aiForm, {
      onSuccess: () => {
        setAiDialogOpen(false)
        setAiForm((current) => ({ ...current, apiKey: '' }))
      },
      onError: (error: Error) => setAiError(error.message)
    })
  }

  return (
    <section className="mx-auto flex max-w-3xl flex-col p-6 sm:p-8">
      <p className="mb-2 text-sm font-medium text-primary">设置</p>
      <h1 className="text-2xl font-semibold tracking-tight">应用设置</h1>
      <Card className="mt-8">
        <CardHeader>
          <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Palette className="size-5" />
          </div>
          <CardTitle>外观</CardTitle>
          <CardDescription>选择应用框架的色调。浅色和深色模式仍然跟随系统。</CardDescription>
        </CardHeader>
        <CardContent>
          <div aria-label="应用框架色调" className="grid gap-3 sm:grid-cols-2" role="group">
            {chromeToneOptions.map((option) => {
              const selected = chromeTone === option.value
              return (
                <Button
                  aria-pressed={selected}
                  className={cn(
                    'h-auto justify-start gap-3 p-3 text-left',
                    selected &&
                      'border-primary/45 bg-primary/8 text-foreground ring-1 ring-primary/20 hover:bg-primary/10'
                  )}
                  key={option.value}
                  onClick={() => setChromeTone(option.value)}
                  type="button"
                  variant="outline"
                >
                  <span
                    aria-hidden="true"
                    className="appearance-tone-preview size-10 shrink-0"
                    data-tone={option.value}
                  >
                    <span className="appearance-tone-preview__titlebar" />
                    <span className="appearance-tone-preview__rail" />
                    <span className="appearance-tone-preview__content">
                      <span className="appearance-tone-preview__toolbar" />
                      <span className="appearance-tone-preview__pill" />
                      <span className="appearance-tone-preview__message" />
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </Button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Keyboard className="size-5" />
          </div>
          <CardTitle>取词</CardTitle>
          <CardDescription>在其他软件中选择文字，在弹窗中获取词条解释。</CardDescription>
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
                      划词工具栏
                    </FieldLabel>
                    <FieldDescription
                      className="text-xs leading-5"
                      id="lookup-word-on-selection-description"
                    >
                      在其他软件中选中文字后弹出工具栏，使用查词等多项功能
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
                            在这些程序中选择文字时，不会显示划词工具栏。
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

              {window.dictol.platform === 'darwin' && (
                <div className="overflow-hidden rounded-lg border border-border">
                  <div className="border-b border-border bg-muted/30 px-4 py-3">
                    <p className="text-sm font-medium">macOS 权限</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Dictol 需要以下权限读取选区，并响应跨应用的划词和弹窗操作。
                    </p>
                  </div>

                  <div className="flex items-start justify-between gap-6 px-4 py-4">
                    <div className="flex min-w-0 gap-3">
                      {captureStatus.trusted ? (
                        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
                      ) : (
                        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                      )}
                      <div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="text-sm font-medium">辅助功能</p>
                          <span className="text-xs text-muted-foreground">
                            {captureStatus.trusted ? '已开启' : '尚未开启'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          用于获取其他应用中当前所选的文本。
                        </p>
                        {!captureStatus.trusted && (
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">
                            点击“开启辅助功能”，然后在系统设置中允许 Dictol。
                          </p>
                        )}
                      </div>
                    </div>
                    {!captureStatus.trusted && (
                      <Button
                        className="shrink-0"
                        onClick={() => {
                          void window.dictol.wordCapture.requestAccess().then(setCaptureStatus)
                        }}
                        size="sm"
                        variant="outline"
                      >
                        开启辅助功能
                      </Button>
                    )}
                  </div>

                  <div className="flex items-start justify-between gap-6 border-t border-border px-4 py-4">
                    <div className="flex min-w-0 gap-3">
                      <ShieldAlert className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">输入监控</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          用于感知划词结束和弹窗外点击，改善划词工具栏与解释弹窗体验。
                          <span className="mt-1 block">Dictol 不保存或上传键盘输入。</span>
                        </p>
                        <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-xs leading-5 text-muted-foreground">
                          <li>打开“输入监控”设置。</li>
                          <li>在应用列表中开启 Dictol。</li>
                          <li>退出并重新打开 Dictol。</li>
                        </ol>
                        {inputMonitoringSettingsError && (
                          <FieldError className="mt-2 text-xs leading-5">
                            {inputMonitoringSettingsError}
                          </FieldError>
                        )}
                      </div>
                    </div>
                    <Button
                      className="shrink-0"
                      disabled={openingInputMonitoringSettings}
                      onClick={() => {
                        setInputMonitoringSettingsError(null)
                        setOpeningInputMonitoringSettings(true)
                        void window.dictol.wordCapture
                          .openInputMonitoringSettings()
                          .then((result) => {
                            if (!result?.ok) {
                              setInputMonitoringSettingsError(
                                result?.error ?? '无法打开输入监控设置。'
                              )
                            }
                          })
                          .finally(() => setOpeningInputMonitoringSettings(false))
                      }}
                      size="sm"
                      variant="outline"
                    >
                      {openingInputMonitoringSettings ? '正在打开…' : '打开输入监控设置'}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Sparkles className="size-5" />
          </div>
          <CardTitle>AI 增强</CardTitle>
          <CardDescription>
            在词条解释区和划词工具栏中使用 AI 生成词语解释。你的 API Key 会使用系统安全存储保存。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
            <FieldContent>
              <FieldLabel className="cursor-pointer" htmlFor="ai-lookup-enabled">
                启用 AI 增强
              </FieldLabel>
              <FieldDescription className="text-xs leading-5" id="ai-lookup-enabled-description">
                开启后可在词条解释区打开聊天侧栏，也可从划词工具栏获取单次解释。
              </FieldDescription>
            </FieldContent>
            <div className="flex shrink-0 items-center gap-2">
              {aiConfig.data?.enabled && (
                <Dialog
                  onOpenChange={(open) => {
                    setAiDialogOpen(open)
                    if (open) setAiError(null)
                  }}
                  open={aiDialogOpen}
                >
                  <DialogTrigger asChild>
                    <Button size="sm" type="button" variant="outline">
                      配置
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-3xl">
                    <DialogHeader className="border-b border-border px-6 pb-5 pt-6 pr-14">
                      <DialogTitle>配置 AI 查词</DialogTitle>
                      <DialogDescription>
                        连接 OpenAI-compatible 服务，并分别设置两种查词场景使用的 Prompt
                      </DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 overflow-y-auto px-6 py-4">
                      <Tabs defaultValue="connection">
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger
                            className="focus-visible:ring-2 focus-visible:ring-ring"
                            value="connection"
                          >
                            连接配置
                          </TabsTrigger>
                          <TabsTrigger
                            className="focus-visible:ring-2 focus-visible:ring-ring"
                            value="prompt"
                          >
                            Prompt
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent className="min-h-[19rem] pt-2" value="connection">
                          <div className="mb-5 flex items-start justify-between gap-4">
                            <div>
                              <p className="text-sm font-medium">模型服务</p>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                使用兼容 OpenAI Chat Completions 的接口。
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full border border-primary/20 bg-primary/[0.06] px-2.5 py-1 text-xs font-medium text-primary">
                              OpenAI-compatible
                            </span>
                          </div>

                          <div className="grid gap-4 sm:grid-cols-[minmax(0,1.45fr)_minmax(11rem,0.75fr)]">
                            <label className="block space-y-1.5 text-sm">
                              <span className="font-medium">服务地址</span>
                              <Input
                                onChange={(event) =>
                                  setAiForm((current) => ({
                                    ...current,
                                    baseUrl: event.target.value
                                  }))
                                }
                                placeholder="https://api.openai.com/v1"
                                type="url"
                                value={aiForm.baseUrl}
                              />
                            </label>
                            <label className="block space-y-1.5 text-sm">
                              <span className="font-medium">模型</span>
                              <Input
                                onChange={(event) =>
                                  setAiForm((current) => ({
                                    ...current,
                                    model: event.target.value
                                  }))
                                }
                                placeholder="例如 gpt-4o-mini"
                                value={aiForm.model}
                              />
                            </label>
                            <label className="block space-y-1.5 text-sm sm:col-span-2">
                              <span className="font-medium">API Key</span>
                              <Input
                                autoComplete="off"
                                onChange={(event) =>
                                  setAiForm((current) => ({
                                    ...current,
                                    apiKey: event.target.value
                                  }))
                                }
                                placeholder={
                                  aiConfig.data?.hasApiKey ? '已配置，留空以保留' : '输入 API Key'
                                }
                                type="password"
                                value={aiForm.apiKey}
                              />
                              <span className="block text-xs leading-5 text-muted-foreground">
                                API Key 仅保存在主进程，并使用系统安全存储加密。
                              </span>
                            </label>
                          </div>
                        </TabsContent>

                        <TabsContent className="min-h-[19rem] pt-2" value="prompt">
                          <div className="mb-4 flex items-start justify-between gap-4">
                            <div>
                              <p className="text-sm font-medium">场景 Prompt</p>
                            </div>
                          </div>

                          <div className="grid gap-4 sm:grid-cols-2">
                            <label className="block min-w-0 space-y-1.5 text-sm">
                              <span className="font-medium">AI 查词侧边栏</span>
                              <textarea
                                className="h-48 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm leading-5 shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                                onChange={(event) =>
                                  setAiForm((current) => ({
                                    ...current,
                                    sidebarSystemPrompt: event.target.value
                                  }))
                                }
                                value={aiForm.sidebarSystemPrompt}
                              />
                              <span className="block text-xs leading-5 text-muted-foreground">
                                用于连续对话和后续追问。
                              </span>
                            </label>
                            <label className="block min-w-0 space-y-1.5 text-sm">
                              <span className="font-medium">划词工具栏</span>
                              <textarea
                                className="h-48 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm leading-5 shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                                onChange={(event) =>
                                  setAiForm((current) => ({
                                    ...current,
                                    selectionToolbarSystemPrompt: event.target.value
                                  }))
                                }
                                value={aiForm.selectionToolbarSystemPrompt}
                              />
                              <span className="block text-xs leading-5 text-muted-foreground">
                                用于一次性生成独立、完整的解释。
                              </span>
                            </label>
                          </div>
                        </TabsContent>
                      </Tabs>

                      {aiError && (
                        <FieldError className="mt-4 flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs leading-5">
                          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                          <span>{aiError}</span>
                        </FieldError>
                      )}
                    </div>
                    <DialogFooter className="border-t border-border bg-muted/20 px-6 py-4 sm:items-center justify-end">
                      <Button
                        onClick={() => setAiDialogOpen(false)}
                        type="button"
                        variant="outline"
                        size="sm"
                      >
                        取消
                      </Button>
                      <Button
                        disabled={saveAiConfig.isPending}
                        onClick={saveAiForm}
                        type="button"
                        size="sm"
                      >
                        {saveAiConfig.isPending ? '保存中…' : '保存配置'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
              <Switch
                aria-describedby="ai-lookup-enabled-description"
                checked={aiConfig.data?.enabled ?? aiForm.enabled}
                disabled={aiConfig.isLoading || saveAiConfig.isPending}
                id="ai-lookup-enabled"
                onCheckedChange={updateAiConfig}
              />
            </div>
          </div>
          {aiError && !aiDialogOpen && (
            <p className="mt-3 text-xs text-destructive" role="alert">
              {aiError}
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

const chromeToneOptions: Array<{
  value: ChromeTone
  label: string
  description: string
}> = [
  {
    value: 'neutral',
    label: '中性',
    description: '浅色为灰白，深色为纯黑框架'
  },
  {
    value: 'moss',
    label: '苔绿',
    description: '浅色淡绿，深色透出墨绿'
  }
]

function createAiForm(): AiLookupForm {
  return {
    enabled: false,
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: '',
    sidebarSystemPrompt: '',
    selectionToolbarSystemPrompt: '',
    apiKey: ''
  }
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
