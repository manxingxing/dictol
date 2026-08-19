import { Button } from '@/components/ui/button'
import { SettingsList, SettingsRow, SettingsSection } from '@/components/settings/SettingsSection'
import { cn } from '@/lib/utils'
import { type ChromeTone, useAppStore } from '@/stores/app-store'

export function AppearanceSettingsCard(): React.JSX.Element {
  const chromeTone = useAppStore((state) => state.chromeTone)
  const setChromeTone = useAppStore((state) => state.setChromeTone)

  return (
    <SettingsSection title="外观" description="选择应用框架的色调">
      <SettingsList>
        <SettingsRow
          label="框架色调"
          description="浅色和深色模式仍然跟随系统"
          control={
            <div aria-label="应用框架色调" className="grid gap-2 sm:grid-cols-2" role="group">
              {chromeToneOptions.map((option) => {
                const selected = chromeTone === option.value
                return (
                  <Button
                    aria-pressed={selected}
                    className={cn(
                      'h-auto min-w-30 justify-start gap-2 p-2 text-left',
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
                    </span>
                  </Button>
                )
              })}
            </div>
          }
          className="items-start"
        />
      </SettingsList>
    </SettingsSection>
  )
}

const chromeToneOptions: Array<{
  value: ChromeTone
  label: string
}> = [
  {
    value: 'neutral',
    label: '中性'
  },
  {
    value: 'moss',
    label: '苔绿'
  }
]
