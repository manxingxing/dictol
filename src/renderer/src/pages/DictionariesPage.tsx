import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useImportDictionary, useReadyDictionaries } from '@/hooks/use-dictionaries'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function DictionariesPage(): React.JSX.Element {
  const { data: dictionaries = [], isLoading, isError } = useReadyDictionaries()
  const importDictionary = useImportDictionary()

  return (
    <section className="mx-auto flex max-w-3xl flex-col px-8 py-16">
      <p className="mb-2 text-sm font-medium text-primary">词典库</p>
      <h1 className="text-3xl font-semibold tracking-tight">管理你的词典</h1>

      <Card className="mb-4 mt-4">
        <CardHeader>
          <CardTitle>已就绪词典</CardTitle>
          <CardDescription>只有完成解析和索引的词典会显示在这里。</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">正在加载…</p>}
          {isError && <p className="text-sm text-destructive">加载词典失败，请稍后重试。</p>}
          {!isLoading && !isError && dictionaries.length === 0 && (
            <p className="text-sm text-muted-foreground">暂无已就绪词典。</p>
          )}
          {!isLoading && !isError && dictionaries.length > 0 && (
            <ul className="space-y-2">
              {dictionaries.map((dictionary) => (
                <li key={dictionary.id} className="rounded-lg bg-muted px-3 py-2 text-sm">
                  {dictionary.name}
                </li>
              ))}
            </ul>
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
    </section>
  )
}
