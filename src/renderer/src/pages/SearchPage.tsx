import { Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function SearchPage(): React.JSX.Element {
  return (
    <section className="mx-auto flex max-w-3xl flex-col px-8 py-16">
      <div className="mb-8">
        <p className="mb-2 text-sm font-medium text-primary">开始使用 Dictol</p>
        <h1 className="text-3xl font-semibold tracking-tight">添加你的第一部词典</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          导入 MDX 文件及其配套 MDD 资源。词典完成索引后，即可从上方搜索框查询词条。
        </p>
      </div>

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
          <Button type="button">
            <Upload />
            选择 MDX 文件
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">
            当前仅完成项目初始化，导入功能将在后续阶段接入。
          </p>
        </CardContent>
      </Card>
    </section>
  )
}
