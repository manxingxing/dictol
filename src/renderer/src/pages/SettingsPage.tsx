import { Settings } from 'lucide-react'

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function SettingsPage(): React.JSX.Element {
  return (
    <section className="mx-auto flex max-w-3xl flex-col px-8 py-16">
      <p className="mb-2 text-sm font-medium text-primary">设置</p>
      <h1 className="text-3xl font-semibold tracking-tight">应用设置</h1>
      <Card className="mt-8">
        <CardHeader>
          <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Settings className="size-5" />
          </div>
          <CardTitle>设置页面即将开放</CardTitle>
          <CardDescription>词典显示、索引位置和网络权限将在后续版本中提供。</CardDescription>
        </CardHeader>
      </Card>
    </section>
  )
}
