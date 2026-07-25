import { lazy, Suspense, useState } from 'react'
import {
  CircleAlert,
  CircleCheck,
  Clock3,
  Code2,
  GripVertical,
  LoaderCircle,
  Pencil,
  Trash2,
  Upload
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  useDeleteDictionary,
  useDictionaries,
  useImportDictionary,
  useReorderDictionaries,
  useUpdateDictionaryCustomCss,
  useUpdateDictionaryName
} from '@/hooks/use-dictionaries'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const CssCodeEditor = lazy(() => import('@/components/CssCodeEditor'))

export function DictionariesPage(): React.JSX.Element {
  const { data: dictionaries = [], isLoading, isError } = useDictionaries()
  const importDictionary = useImportDictionary()
  const deleteDictionary = useDeleteDictionary()
  const reorderDictionaries = useReorderDictionaries()
  const updateDictionaryName = useUpdateDictionaryName()
  const updateDictionaryCustomCss = useUpdateDictionaryCustomCss()
  const [nameEditor, setNameEditor] = useState<{
    id: string
    originalName: string
    value: string
  } | null>(null)
  const [cssEditor, setCssEditor] = useState<{
    id: string
    name: string
    value: string
  } | null>(null)
  const [draggedDictionaryId, setDraggedDictionaryId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{
    id: string
    position: 'before' | 'after'
  } | null>(null)

  const finishDragging = (): void => {
    setDraggedDictionaryId(null)
    setDropTarget(null)
  }

  return (
    <section className="mx-auto flex max-w-3xl flex-col px-8 py-16">
      <p className="mb-2 text-sm font-medium text-primary">词典库</p>
      <h1 className="text-3xl font-semibold tracking-tight">管理你的词典</h1>

      <Card className="mb-4 mt-4">
        <CardHeader>
          <CardTitle>全部词典</CardTitle>
          <CardDescription>
            拖动词典调整优先级；查词结果中的词典标签会使用相同顺序。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">正在加载…</p>}
          {isError && <p className="text-sm text-destructive">加载词典失败，请稍后重试。</p>}
          {!isLoading && !isError && dictionaries.length === 0 && (
            <p className="text-sm text-muted-foreground">暂无词典。</p>
          )}
          {!isLoading && !isError && dictionaries.length > 0 && (
            <ul className="space-y-2">
              {dictionaries.map((dictionary) => {
                const status = dictionaryStatus[dictionary.status]
                const StatusIcon = status.icon
                const isDeleting =
                  deleteDictionary.isPending && deleteDictionary.variables === dictionary.id

                return (
                  <li
                    key={dictionary.id}
                    className={`flex items-center gap-3 rounded-lg border border-border bg-muted/45 px-3 py-3 transition-[border-color,opacity] ${
                      draggedDictionaryId === dictionary.id ? 'opacity-45' : ''
                    } ${
                      dropTarget?.id === dictionary.id
                        ? dropTarget.position === 'before'
                          ? 'border-t-2 border-t-primary'
                          : 'border-b-2 border-b-primary'
                        : ''
                    }`}
                    onDragOver={(event) => {
                      if (!draggedDictionaryId || draggedDictionaryId === dictionary.id) return
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'move'
                      const bounds = event.currentTarget.getBoundingClientRect()
                      setDropTarget({
                        id: dictionary.id,
                        position:
                          event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
                      })
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      if (!draggedDictionaryId) return
                      const bounds = event.currentTarget.getBoundingClientRect()
                      const dropPosition =
                        event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
                      const nextOrder = dictionaries
                        .map((item) => item.id)
                        .filter((id) => id !== draggedDictionaryId)
                      let targetIndex = nextOrder.indexOf(dictionary.id)
                      if (targetIndex < 0) return
                      if (dropPosition === 'after') targetIndex += 1
                      nextOrder.splice(targetIndex, 0, draggedDictionaryId)
                      finishDragging()
                      reorderDictionaries.mutate(nextOrder)
                    }}
                  >
                    <button
                      aria-label={`拖动排序 ${dictionary.name}`}
                      className="flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
                      disabled={reorderDictionaries.isPending}
                      draggable={!reorderDictionaries.isPending}
                      onDragEnd={finishDragging}
                      onDragStart={(event) => {
                        setDraggedDictionaryId(dictionary.id)
                        setDropTarget(null)
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', dictionary.id)
                      }}
                      type="button"
                    >
                      <GripVertical className="size-4" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{dictionary.name}</p>
                        <span
                          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}
                        >
                          <StatusIcon
                            className={`size-3.5 ${dictionary.status === 'importing' ? 'animate-spin' : ''}`}
                          />
                          {status.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {dictionary.recordCount
                          ? `${formatRecordCount(dictionary.recordCount)} 个词条`
                          : dictionary.status === 'importing'
                            ? '正在复制文件并建立索引'
                            : '尚无词条统计'}
                      </p>
                    </div>
                    <Button
                      aria-label={`修改词典名称 ${dictionary.name}`}
                      className="shrink-0 text-muted-foreground"
                      disabled={updateDictionaryName.isPending}
                      onClick={() => {
                        updateDictionaryName.reset()
                        setNameEditor({
                          id: dictionary.id,
                          originalName: dictionary.name,
                          value: dictionary.name
                        })
                      }}
                      size="icon"
                      title="修改名称"
                      type="button"
                      variant="ghost"
                    >
                      <Pencil />
                    </Button>
                    <Button
                      aria-label={`编辑自定义 CSS ${dictionary.name}`}
                      className={`shrink-0 ${dictionary.customCss ? 'text-primary' : 'text-muted-foreground'}`}
                      disabled={updateDictionaryCustomCss.isPending}
                      onClick={() => {
                        updateDictionaryCustomCss.reset()
                        setCssEditor({
                          id: dictionary.id,
                          name: dictionary.name,
                          value: dictionary.customCss
                        })
                      }}
                      size="icon"
                      title="自定义 CSS"
                      type="button"
                      variant="ghost"
                    >
                      <Code2 />
                    </Button>
                    <Button
                      aria-label={`删除词典 ${dictionary.name}`}
                      className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      disabled={dictionary.status === 'importing' || deleteDictionary.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `确定删除“${dictionary.name}”吗？词典记录、索引和已复制文件都会被删除。`
                          )
                        ) {
                          deleteDictionary.mutate(dictionary.id)
                        }
                      }}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      {isDeleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
          {deleteDictionary.isError && (
            <p className="mt-3 text-xs text-destructive">
              删除失败：{deleteDictionary.error.message}
            </p>
          )}
          {reorderDictionaries.isError && (
            <p className="mt-3 text-xs text-destructive">
              排序保存失败：{reorderDictionaries.error.message}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Upload className="size-5" />
          </div>
          <CardTitle>导入本地词典</CardTitle>
          <CardDescription>
            选择一个 MDX 文件，Dictol 会自动发现同目录中的 MDD 分卷。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            disabled={importDictionary.isPending}
            onClick={() => importDictionary.mutate()}
            type="button"
          >
            <Upload />
            {importDictionary.isPending ? '正在复制并建立索引…' : '选择 MDX 文件'}
          </Button>
          {importDictionary.isError && (
            <p className="mt-3 text-xs text-destructive">导入失败，请检查文件后重试。</p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            选择 MDX 文件后，将复制同目录下的 MDD、CSS、JavaScript
            等配套资源并建立词条索引，原文件不会被修改。
          </p>
        </CardContent>
      </Card>

      <Dialog
        open={nameEditor !== null}
        onOpenChange={(open) => {
          if (!open && !updateDictionaryName.isPending) setNameEditor(null)
        }}
      >
        <DialogContent>
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault()
              if (!nameEditor) return
              void updateDictionaryName
                .mutateAsync({ dictionaryId: nameEditor.id, name: nameEditor.value })
                .then(() => setNameEditor(null))
                .catch(() => undefined)
            }}
          >
            <DialogHeader>
              <DialogTitle>修改词典名称</DialogTitle>
              <DialogDescription>新名称会显示在词典库以及查词结果的标签中。</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="dictionary-name">
                名称
              </label>
              <Input
                autoFocus
                id="dictionary-name"
                maxLength={100}
                onChange={(event) =>
                  setNameEditor((current) =>
                    current ? { ...current, value: event.target.value } : current
                  )
                }
                placeholder={nameEditor?.originalName}
                value={nameEditor?.value ?? ''}
              />
            </div>
            {updateDictionaryName.isError && (
              <p className="text-sm text-destructive">{updateDictionaryName.error.message}</p>
            )}
            <DialogFooter>
              <Button
                disabled={updateDictionaryName.isPending}
                onClick={() => setNameEditor(null)}
                type="button"
                variant="outline"
              >
                取消
              </Button>
              <Button
                disabled={!nameEditor?.value.trim() || updateDictionaryName.isPending}
                type="submit"
              >
                {updateDictionaryName.isPending ? '正在保存…' : '保存名称'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cssEditor !== null}
        onOpenChange={(open) => {
          if (!open && !updateDictionaryCustomCss.isPending) setCssEditor(null)
        }}
      >
        <DialogContent className="max-w-2xl">
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault()
              if (!cssEditor) return
              void updateDictionaryCustomCss
                .mutateAsync({ dictionaryId: cssEditor.id, customCss: cssEditor.value })
                .then(() => setCssEditor(null))
                .catch(() => undefined)
            }}
          >
            <DialogHeader>
              <DialogTitle>自定义 CSS</DialogTitle>
              <DialogDescription>
                CSS 将注入“{cssEditor?.name}”的每个词条页面，并覆盖在词典原有样式之后。
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-4">
                <label className="text-sm font-medium" htmlFor="dictionary-custom-css">
                  CSS 内容
                </label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {cssEditor?.value.length ?? 0} / 200,000
                </span>
              </div>
              {cssEditor && (
                <Suspense
                  fallback={
                    <div className="flex min-h-72 items-center justify-center rounded-lg border border-input bg-background text-sm text-muted-foreground">
                      <LoaderCircle className="mr-2 size-4 animate-spin" />
                      正在加载编辑器…
                    </div>
                  }
                >
                  <CssCodeEditor
                    ariaLabel="CSS 内容"
                    autoFocus
                    id="dictionary-custom-css"
                    maxLength={200_000}
                    onChange={(value) =>
                      setCssEditor((current) => (current ? { ...current, value } : current))
                    }
                    placeholder={'.entry {\n  color: #e5e7eb;\n}'}
                    value={cssEditor.value}
                  />
                </Suspense>
              )}
              <p className="text-xs text-muted-foreground">清空内容并保存即可移除自定义样式。</p>
            </div>
            {updateDictionaryCustomCss.isError && (
              <p className="text-sm text-destructive">{updateDictionaryCustomCss.error.message}</p>
            )}
            <DialogFooter>
              <Button
                disabled={updateDictionaryCustomCss.isPending}
                onClick={() => setCssEditor(null)}
                type="button"
                variant="outline"
              >
                取消
              </Button>
              <Button disabled={updateDictionaryCustomCss.isPending} type="submit">
                {updateDictionaryCustomCss.isPending ? '正在保存…' : '保存 CSS'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}

const dictionaryStatus = {
  pending: {
    label: '等待导入',
    icon: Clock3,
    className: 'bg-muted text-muted-foreground'
  },
  importing: {
    label: '导入中',
    icon: LoaderCircle,
    className: 'bg-blue-500/10 text-blue-700 dark:text-blue-300'
  },
  ready: {
    label: '已就绪',
    icon: CircleCheck,
    className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  },
  error: {
    label: '导入失败',
    icon: CircleAlert,
    className: 'bg-destructive/10 text-destructive'
  }
} as const

function formatRecordCount(value: string): string {
  try {
    return new Intl.NumberFormat('zh-CN').format(BigInt(value))
  } catch {
    return value
  }
}
