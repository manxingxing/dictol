import { useEffect, useState } from 'react'

import { SettingsList, SettingsRow, SettingsSection } from '@/components/settings/SettingsSection'

export function AboutSettingsCard(): React.JSX.Element {
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    void window.dictol.app.getVersion().then(setVersion)
  }, [])

  return (
    <SettingsSection title="关于">
      <SettingsList>
        <SettingsRow
          label="版本"
          control={
            <span className="text-sm font-medium">{version ? `v${version}` : '读取中…'}</span>
          }
        />
      </SettingsList>
    </SettingsSection>
  )
}
