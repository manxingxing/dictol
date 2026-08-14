import { lazy, Suspense, useState } from 'react'
import {
  CircleAlert,
  CircleCheck,
  Clock3,
  Code2,
  Files,
  GripVertical,
  LoaderCircle,
  Pencil,
  Trash2,
  Upload,
  Plus,
  Globe2
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
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import {
  useDeleteDictionary,
  useDictionaries,
  useImportDictionary,
  useReorderDictionaries,
  useUpdateDictionaryCustomCss,
  useUpdateDictionaryName
} from '@/hooks/use-dictionaries'
import {
  useAddOnlineDictionary,
  useOnlineDictionaries,
  useRemoveOnlineDictionary,
  useReorderOnlineDictionaries
} from '@/hooks/use-online-dictionaries'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const CssCodeEditor = lazy(() => import('@/components/CssCodeEditor'))
type DictionaryImportPreview = NonNullable<
  Awaited<ReturnType<Window['dictol']['dictionaries']['selectFile']>>
>

export function DictionariesPage(): React.JSX.Element {
  const { data: dictionaries = [], isLoading, isError } = useDictionaries()
  const importDictionary = useImportDictionary()
  const deleteDictionary = useDeleteDictionary()
  const reorderDictionaries = useReorderDictionaries()
  const updateDictionaryName = useUpdateDictionaryName()
  const updateDictionaryCustomCss = useUpdateDictionaryCustomCss()
  const {
    data: onlineDictionaries = [],
    isLoading: onlineLoading,
    isError: onlineError
  } = useOnlineDictionaries()
  const addOnlineDictionary = useAddOnlineDictionary()
  const removeOnlineDictionary = useRemoveOnlineDictionary()
  const reorderOnlineDictionaries = useReorderOnlineDictionaries()
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importDialogStep, setImportDialogStep] = useState<'select' | 'preview'>('select')
  const [importPreview, setImportPreview] = useState<DictionaryImportPreview | null>(null)
  const [selectedImportFiles, setSelectedImportFiles] = useState<Set<string>>(() => new Set())
  const [previewSelectionSnapshot, setPreviewSelectionSnapshot] = useState<Set<string>>(
    () => new Set()
  )
  const [selectingImportFile, setSelectingImportFile] = useState(false)
  const [importFileError, setImportFileError] = useState<string | null>(null)
  const [onlineEditor, setOnlineEditor] = useState<{
    name: string
    faviconUrl: string
    urlTemplate: string
    faviconAuto: boolean
  } | null>(null)
  const [loadedFaviconUrl, setLoadedFaviconUrl] = useState<string | null>(null)
  const [failedFaviconUrl, setFailedFaviconUrl] = useState<string | null>(null)
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
  const [draggedOnlineId, setDraggedOnlineId] = useState<string | null>(null)
  const [onlineDropTarget, setOnlineDropTarget] = useState<{
    id: string
    position: 'before' | 'after'
  } | null>(null)

  const finishDragging = (): void => {
    setDraggedDictionaryId(null)
    setDropTarget(null)
  }

  const finishOnlineDragging = (): void => {
    setDraggedOnlineId(null)
    setOnlineDropTarget(null)
  }

  const selectImportFile = async (): Promise<void> => {
    importDictionary.reset()
    setSelectingImportFile(true)
    setImportFileError(null)
    try {
      const preview = await window.dictol.dictionaries.selectFile()
      if (!preview) return
      setImportPreview(preview)
      setSelectedImportFiles(new Set(preview.files.map((file) => file.relativePath)))
    } catch (error) {
      console.error('Failed to select dictionary file', error)
      setImportFileError(error instanceof Error ? error.message : '无法读取词典文件。')
    } finally {
      setSelectingImportFile(false)
    }
  }

  const closeImportDialog = (): void => {
    setImportDialogOpen(false)
    setImportDialogStep('select')
    setImportPreview(null)
    setSelectedImportFiles(new Set())
    setPreviewSelectionSnapshot(new Set())
    setImportFileError(null)
  }

  const closeImportPreview = (applySelection: boolean): void => {
    if (!applySelection) setSelectedImportFiles(new Set(previewSelectionSnapshot))
    setImportDialogStep('select')
  }

  const openOnlineEditor = (): void => {
    addOnlineDictionary.reset()
    setLoadedFaviconUrl(null)
    setFailedFaviconUrl(null)
    setOnlineEditor({ name: '', faviconUrl: '', urlTemplate: '', faviconAuto: true })
  }

  const faviconPreviewUrl = onlineEditor?.faviconUrl.trim() ?? ''
  const isPreviewableFaviconUrl = isHttpUrl(faviconPreviewUrl)
  const faviconPreviewFailed = failedFaviconUrl === faviconPreviewUrl
  const faviconPreviewLoading =
    isPreviewableFaviconUrl && !faviconPreviewFailed && loadedFaviconUrl !== faviconPreviewUrl
  const faviconPreviewHasError =
    Boolean(faviconPreviewUrl) && (!isPreviewableFaviconUrl || faviconPreviewFailed)
  const selectedImportFileItems =
    importPreview?.files.filter((file) => selectedImportFiles.has(file.relativePath)) ?? []
  const selectedImportSize = selectedImportFileItems.reduce(
    (total, file) => total + file.fileSize,
    0
  )
  const optionalImportFiles = importPreview?.files.filter((file) => !file.required) ?? []
  const selectedOptionalImportFileCount = optionalImportFiles.filter((file) =>
    selectedImportFiles.has(file.relativePath)
  ).length
  const allOptionalImportFilesSelected =
    optionalImportFiles.length > 0 && selectedOptionalImportFileCount === optionalImportFiles.length

  return (
    <section className="mx-auto flex max-w-3xl flex-col p-6 sm:p-8">
      <p className="mb-2 text-sm font-medium text-primary">词典库</p>
      <h1 className="text-2xl font-semibold tracking-tight">管理你的词典</h1>

      <Card className="mb-4 mt-4">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle>全部词典</CardTitle>
            <CardDescription>
              拖动词典调整优先级；查词结果中的词典标签会使用相同顺序。
            </CardDescription>
          </div>
          <Button
            className="shrink-0"
            onClick={() => {
              importDictionary.reset()
              setImportDialogStep('select')
              setImportPreview(null)
              setSelectedImportFiles(new Set())
              setImportFileError(null)
              setImportDialogOpen(true)
            }}
            size="sm"
            type="button"
          >
            <Upload />
            导入
          </Button>
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

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle>在线词典</CardTitle>
            <CardDescription>配置常用网站，在查词结果旁并排查看在线词典内容。</CardDescription>
          </div>
          <Button
            aria-label="添加在线词典"
            className="shrink-0"
            onClick={openOnlineEditor}
            size="icon"
            title="添加在线词典"
            type="button"
            variant="ghost"
          >
            <Plus />
          </Button>
        </CardHeader>
        <CardContent>
          {onlineLoading && <p className="text-sm text-muted-foreground">正在加载…</p>}
          {onlineError && (
            <p className="text-sm text-destructive">加载在线词典失败，请稍后重试。</p>
          )}
          {!onlineLoading && !onlineError && onlineDictionaries.length === 0 && (
            <p className="text-sm text-muted-foreground">还没有配置在线词典。</p>
          )}
          {!onlineLoading && !onlineError && onlineDictionaries.length > 0 && (
            <ul className="space-y-2">
              {onlineDictionaries.map((dictionary) => {
                const isDeleting =
                  removeOnlineDictionary.isPending &&
                  removeOnlineDictionary.variables === dictionary.id
                return (
                  <li
                    className={`flex items-center gap-3 rounded-lg border border-border bg-muted/45 px-3 py-3 transition-[border-color,opacity] ${
                      draggedOnlineId === dictionary.id ? 'opacity-45' : ''
                    } ${
                      onlineDropTarget?.id === dictionary.id
                        ? onlineDropTarget.position === 'before'
                          ? 'border-t-2 border-t-primary'
                          : 'border-b-2 border-b-primary'
                        : ''
                    }`}
                    key={dictionary.id}
                    onDragOver={(event) => {
                      if (!draggedOnlineId || draggedOnlineId === dictionary.id) return
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'move'
                      const bounds = event.currentTarget.getBoundingClientRect()
                      setOnlineDropTarget({
                        id: dictionary.id,
                        position:
                          event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
                      })
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      if (!draggedOnlineId) return
                      const bounds = event.currentTarget.getBoundingClientRect()
                      const position =
                        event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
                      const nextOrder = onlineDictionaries
                        .map((item) => item.id)
                        .filter((id) => id !== draggedOnlineId)
                      let targetIndex = nextOrder.indexOf(dictionary.id)
                      if (targetIndex < 0) return
                      if (position === 'after') targetIndex += 1
                      nextOrder.splice(targetIndex, 0, draggedOnlineId)
                      finishOnlineDragging()
                      reorderOnlineDictionaries.mutate(nextOrder)
                    }}
                  >
                    <button
                      aria-label={`拖动排序 ${dictionary.name}`}
                      className="flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
                      disabled={reorderOnlineDictionaries.isPending}
                      draggable={!reorderOnlineDictionaries.isPending}
                      onDragEnd={finishOnlineDragging}
                      onDragStart={(event) => {
                        setDraggedOnlineId(dictionary.id)
                        setOnlineDropTarget(null)
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', dictionary.id)
                      }}
                      type="button"
                    >
                      <GripVertical className="size-4" />
                    </button>
                    <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background">
                      <img
                        alt=""
                        className="size-full rounded-full object-cover"
                        onError={(event) => {
                          event.currentTarget.style.display = 'none'
                          event.currentTarget.nextElementSibling?.classList.remove('hidden')
                        }}
                        src={dictionary.faviconUrl}
                      />
                      <Globe2 className="absolute hidden size-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{dictionary.name}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {dictionary.urlTemplate}
                      </p>
                    </div>
                    <Button
                      aria-label={`删除在线词典 ${dictionary.name}`}
                      className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      disabled={removeOnlineDictionary.isPending}
                      onClick={() => {
                        if (window.confirm(`确定删除“${dictionary.name}”吗？`)) {
                          removeOnlineDictionary.mutate(dictionary.id)
                        }
                      }}
                      size="icon"
                      title="删除在线词典"
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
          {reorderOnlineDictionaries.isError && (
            <p className="mt-3 text-xs text-destructive">
              排序保存失败：{reorderOnlineDictionaries.error.message}
            </p>
          )}
          {removeOnlineDictionary.isError && (
            <p className="mt-3 text-xs text-destructive">
              删除失败：{removeOnlineDictionary.error.message}
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={importDialogOpen}
        onOpenChange={(open) => {
          if (open || importDictionary.isPending || selectingImportFile) return
          if (importDialogStep === 'preview') closeImportPreview(false)
          else closeImportDialog()
        }}
      >
        <DialogContent
          className={
            importDialogStep === 'preview'
              ? 'max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-2xl'
              : undefined
          }
        >
          {importDialogStep === 'preview' && importPreview ? (
            <>
              <DialogHeader className="border-b border-border px-6 pb-5 pt-6 pr-14">
                <DialogTitle>预览复制文件</DialogTitle>
                <DialogDescription>
                  取消选择不需要复制的资源；MDX 主文件必须保留。
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 overflow-y-auto px-6 py-4">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      checked={allOptionalImportFilesSelected}
                      className="size-4 accent-primary"
                      disabled={optionalImportFiles.length === 0}
                      onChange={(event) => {
                        const checked = event.target.checked
                        setSelectedImportFiles(
                          new Set(
                            importPreview.files
                              .filter((file) => file.required || checked)
                              .map((file) => file.relativePath)
                          )
                        )
                      }}
                      ref={(node) => {
                        if (node) {
                          node.indeterminate =
                            selectedOptionalImportFileCount > 0 &&
                            selectedOptionalImportFileCount < optionalImportFiles.length
                        }
                      }}
                      type="checkbox"
                    />
                    选择全部资源文件
                  </label>
                  <span className="text-xs text-muted-foreground">按导入规则递归发现</span>
                </div>
                <div className="overflow-hidden rounded-xl border border-border">
                  {importPreview.files.map((file) => {
                    const extension = getFileExtension(file.relativePath)
                    return (
                      <label
                        className="grid min-h-14 grid-cols-[1.25rem_2.25rem_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-border/70 px-3 py-2 last:border-b-0 hover:bg-muted/35"
                        key={file.relativePath}
                      >
                        <input
                          checked={selectedImportFiles.has(file.relativePath)}
                          className="size-4 accent-primary disabled:cursor-not-allowed"
                          disabled={file.required}
                          onChange={(event) => {
                            setSelectedImportFiles((current) => {
                              const next = new Set(current)
                              if (event.target.checked) next.add(file.relativePath)
                              else next.delete(file.relativePath)
                              return next
                            })
                          }}
                          type="checkbox"
                        />
                        <span
                          className={`flex size-9 items-center justify-center rounded-lg font-mono text-[9px] font-semibold uppercase ${
                            file.required
                              ? 'bg-primary/10 text-primary'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {extension}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {getFileName(file.relativePath)}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {file.relativePath}
                            {file.required ? ' · 必需' : ''}
                          </span>
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {formatFileSize(file.fileSize)}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
              <DialogFooter className="border-t border-border bg-muted/20 px-6 py-4 sm:items-center sm:justify-between">
                <span className="text-xs text-muted-foreground">
                  已选择 {selectedImportFileItems.length} / {importPreview.files.length} 个文件，共{' '}
                  {formatFileSize(selectedImportSize)}
                </span>
                <div className="flex justify-end gap-2">
                  <Button onClick={() => closeImportPreview(false)} type="button" variant="outline">
                    取消
                  </Button>
                  <Button onClick={() => closeImportPreview(true)} type="button">
                    完成
                  </Button>
                </div>
              </DialogFooter>
            </>
          ) : (
            <form
              className="grid gap-5"
              onSubmit={(event) => {
                event.preventDefault()
                if (!importPreview) return
                void importDictionary
                  .mutateAsync({
                    mdxPath: importPreview.mdxPath,
                    selectedRelativePaths: importPreview.files
                      .filter((file) => selectedImportFiles.has(file.relativePath))
                      .map((file) => file.relativePath)
                  })
                  .then(closeImportDialog)
                  .catch(() => undefined)
              }}
            >
              <DialogHeader>
                <DialogTitle>导入本地词典</DialogTitle>
                <DialogDescription>
                  选择一个 MDX 文件，Dictol 会查找同目录中的相关资源。
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="dictionary-import-file">
                  MDX 文件
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    className="min-w-0 flex-1 h-9"
                    id="dictionary-import-file"
                    placeholder="尚未选择文件"
                    readOnly
                    value={importPreview?.mdxPath ?? ''}
                  />
                  <Button
                    disabled={importDictionary.isPending || selectingImportFile}
                    onClick={() => void selectImportFile()}
                    type="button"
                    variant="outline"
                  >
                    {selectingImportFile ? '正在读取…' : '选择文件'}
                  </Button>
                </div>
              </div>
              {importPreview && (
                <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/[0.035] p-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Files className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      共 {selectedImportFileItems.length} 个文件将被复制
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {getFileName(importPreview.mdxPath)} · {formatFileSize(selectedImportSize)}
                    </p>
                  </div>
                  <Button
                    className="shrink-0 text-primary"
                    onClick={() => {
                      setPreviewSelectionSnapshot(new Set(selectedImportFiles))
                      setImportDialogStep('preview')
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    预览
                  </Button>
                </div>
              )}
              {importFileError && <p className="text-sm text-destructive">{importFileError}</p>}
              {importDictionary.isError && (
                <p className="text-sm text-destructive">
                  导入失败：{importDictionary.error.message}
                </p>
              )}
              <DialogFooter>
                <Button
                  disabled={importDictionary.isPending || selectingImportFile}
                  onClick={closeImportDialog}
                  type="button"
                  variant="outline"
                >
                  取消
                </Button>
                <Button disabled={!importPreview || importDictionary.isPending} type="submit">
                  {importDictionary.isPending ? '正在导入…' : '导入'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={onlineEditor !== null}
        onOpenChange={(open) => {
          if (!open && !addOnlineDictionary.isPending) setOnlineEditor(null)
        }}
      >
        <DialogContent>
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault()
              if (!onlineEditor) return
              void addOnlineDictionary
                .mutateAsync({
                  name: onlineEditor.name,
                  faviconUrl: onlineEditor.faviconUrl,
                  urlTemplate: onlineEditor.urlTemplate
                })
                .then(() => setOnlineEditor(null))
                .catch(() => undefined)
            }}
          >
            <DialogHeader>
              <DialogTitle>添加在线词典</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="online-dictionary-name">
                  名称
                </label>
                <Input
                  autoFocus
                  id="online-dictionary-name"
                  maxLength={100}
                  onChange={(event) =>
                    setOnlineEditor((current) =>
                      current ? { ...current, name: event.target.value } : current
                    )
                  }
                  placeholder="例如：Google 翻译"
                  value={onlineEditor?.name ?? ''}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="online-dictionary-url">
                  URL 模板
                </label>
                <Input
                  id="online-dictionary-url"
                  maxLength={2_000}
                  onChange={(event) =>
                    setOnlineEditor((current) => {
                      if (!current) return current
                      const urlTemplate = event.target.value
                      const suggestedFavicon = inferFaviconUrl(urlTemplate)
                      return {
                        ...current,
                        urlTemplate,
                        faviconUrl: current.faviconAuto
                          ? (suggestedFavicon ?? current.faviconUrl)
                          : current.faviconUrl
                      }
                    })
                  }
                  placeholder="https://example.com/search?q=%s"
                  value={onlineEditor?.urlTemplate ?? ''}
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  {/* <DialogDescription> */}用 %s 代表当前查词条目，例如
                  https://example.com/search?q=%s。
                  {/* </DialogDescription> */}
                </p>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="online-dictionary-favicon">
                  favicon URL
                </label>
                <InputGroup aria-invalid={faviconPreviewHasError || undefined}>
                  <InputGroupInput
                    aria-invalid={faviconPreviewHasError || undefined}
                    className="pl-11"
                    id="online-dictionary-favicon"
                    maxLength={2_000}
                    onChange={(event) => {
                      setLoadedFaviconUrl(null)
                      setFailedFaviconUrl(null)
                      setOnlineEditor((current) =>
                        current
                          ? { ...current, faviconUrl: event.target.value, faviconAuto: false }
                          : current
                      )
                    }}
                    placeholder="自动使用网站 /favicon.ico"
                    value={onlineEditor?.faviconUrl ?? ''}
                  />
                  <InputGroupAddon align="inline-start">
                    <span className="relative flex size-5 items-center justify-center overflow-hidden rounded-full border border-border bg-background">
                      {isPreviewableFaviconUrl && !faviconPreviewFailed && (
                        <img
                          alt=""
                          className={
                            faviconPreviewLoading
                              ? 'size-full rounded-full object-cover opacity-0'
                              : 'size-full rounded-full object-cover'
                          }
                          key={faviconPreviewUrl}
                          onError={() => setFailedFaviconUrl(faviconPreviewUrl)}
                          onLoad={() => setLoadedFaviconUrl(faviconPreviewUrl)}
                          src={faviconPreviewUrl}
                        />
                      )}
                      {faviconPreviewLoading && (
                        <LoaderCircle className="absolute size-3 animate-spin text-muted-foreground" />
                      )}
                      {!faviconPreviewUrl && <Globe2 className="size-3 text-muted-foreground" />}
                      {faviconPreviewHasError && (
                        <CircleAlert className="size-3 text-destructive" />
                      )}
                    </span>
                  </InputGroupAddon>
                </InputGroup>
                <p
                  className={
                    faviconPreviewHasError
                      ? 'text-xs leading-5 text-destructive'
                      : 'text-xs leading-5 text-muted-foreground'
                  }
                >
                  {!faviconPreviewUrl
                    ? '输入 URL 模板后会自动推导 favicon 地址，也可以手动修改。'
                    : !isPreviewableFaviconUrl
                      ? '请输入有效的 HTTP 或 HTTPS 地址。'
                      : faviconPreviewFailed
                        ? '无法加载该图标，请检查 favicon URL。'
                        : faviconPreviewLoading
                          ? '正在加载图标…'
                          : '图标可加载'}
                </p>
              </div>
            </div>
            {addOnlineDictionary.isError && (
              <p className="text-sm text-destructive">
                保存失败：{addOnlineDictionary.error.message}
              </p>
            )}
            <DialogFooter>
              <Button
                disabled={addOnlineDictionary.isPending}
                onClick={() => setOnlineEditor(null)}
                type="button"
                variant="outline"
              >
                取消
              </Button>
              <Button
                disabled={
                  !onlineEditor?.name.trim() ||
                  !onlineEditor.urlTemplate.trim() ||
                  addOnlineDictionary.isPending
                }
                type="submit"
              >
                {addOnlineDictionary.isPending ? '正在保存…' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
              <DialogDescription>为「{nameEditor?.originalName}」输入新名称。</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
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

function getFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath
}

function getFileExtension(filePath: string): string {
  const fileName = getFileName(filePath)
  const separatorIndex = fileName.lastIndexOf('.')
  return separatorIndex >= 0 ? fileName.slice(separatorIndex + 1) : 'file'
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

function inferFaviconUrl(urlTemplate: string): string | null {
  try {
    const url = new URL(urlTemplate.replaceAll('%s', 'term'))
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return `${url.origin}/favicon.ico`
  } catch {
    return null
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
