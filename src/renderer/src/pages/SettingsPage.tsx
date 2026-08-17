import { AiLookupSettingsCard } from '@/components/AiLookupSettingsCard'
import { AppearanceSettingsCard } from '@/components/AppearanceSettingsCard'
import { TtsSettingsCard } from '@/components/TtsSettingsCard'
import { WordCaptureSettingsCard } from '@/components/WordCaptureSettingsCard'

export function SettingsPage(): React.JSX.Element {
  return (
    <section className="mx-auto flex max-w-3xl flex-col p-6 sm:p-8">
      <p className="mb-2 text-sm font-medium text-primary">设置</p>
      <h1 className="text-xl font-semibold tracking-tight">应用设置</h1>
      <AppearanceSettingsCard />
      <WordCaptureSettingsCard />
      <AiLookupSettingsCard />
      <TtsSettingsCard />
    </section>
  )
}
