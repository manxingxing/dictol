import { Library } from 'lucide-react'

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function DictionariesPage(): React.JSX.Element {
  return (
    <section className="mx-auto flex max-w-3xl flex-col px-8 py-16">
      <p className="mb-2 text-sm font-medium text-primary">词典库</p>
      <h1 className="text-3xl font-semibold tracking-tight">管理你的词典</h1>
      <Card className="mt-8">
        <CardHeader>
          <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Library className="size-5" />
          </div>
          <CardTitle>还没有导入词典</CardTitle>
          <CardDescription>导入 MDX 文件后，词典及其 MDD 资源会显示在这里。</CardDescription>
        </CardHeader>
      </Card>
    </section>
  )
}
