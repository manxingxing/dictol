import { NavLink } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const EmptyDictionariesState = (): React.JSX.Element => {
  return (
    <section className="mx-auto flex max-w-3xl flex-col px-8 py-16">
      <p className="mb-2 text-sm font-medium text-primary">开始使用 Dictol</p>
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>还没有导入词典</CardTitle>
          <CardDescription>
            <NavLink to="/dictionaries">
              <Button className="mt-3 tracking-tight">导入词典</Button>
            </NavLink>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              导入 MDX 文件及其配套 MDD 资源。词典完成索引后，即可开始查询词条。
            </p>
          </CardDescription>
        </CardHeader>
      </Card>
    </section>
  )
}
