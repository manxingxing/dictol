import { History } from 'lucide-react'

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function HistoryPage(): React.JSX.Element {
  return (
    <section className="mx-auto flex max-w-3xl flex-col px-8 py-16">
      <p className="mb-2 text-sm font-medium text-primary">查询历史</p>
      <h1 className="text-3xl font-semibold tracking-tight">最近查询</h1>
      <Card className="mt-8">
        <CardHeader>
          <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <History className="size-5" />
          </div>
          <CardTitle>暂无查询记录</CardTitle>
          <CardDescription>查询单词后，最近访问的词条会显示在这里。</CardDescription>
        </CardHeader>
      </Card>
    </section>
  )
}
