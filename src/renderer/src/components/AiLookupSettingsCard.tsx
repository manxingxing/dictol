import { useEffect, useState } from 'react'
import { CircleAlert, Sparkles } from 'lucide-react'

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
import { FieldContent, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAiLookupConfig, useSaveAiLookupConfig } from '@/hooks/use-ai-lookup'

type AiLookupConfig = NonNullable<Awaited<ReturnType<typeof window.dictol.aiLookup.getConfig>>>

type AiLookupForm = Omit<AiLookupConfig, 'hasApiKey'> & {
  apiKey: string
}

export function AiLookupSettingsCard(): React.JSX.Element {
  const [aiDialogOpen, setAiDialogOpen] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const aiConfig = useAiLookupConfig()
  const saveAiConfig = useSaveAiLookupConfig()
  const [aiForm, setAiForm] = useState<AiLookupForm>(createAiForm)

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
  )
}

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
