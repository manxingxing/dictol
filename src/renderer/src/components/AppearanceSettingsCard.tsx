import { Palette } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { type ChromeTone, useAppStore } from '@/stores/app-store'

export function AppearanceSettingsCard(): React.JSX.Element {
  const chromeTone = useAppStore((state) => state.chromeTone)
  const setChromeTone = useAppStore((state) => state.setChromeTone)

  return (
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
