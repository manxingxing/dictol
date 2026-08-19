import { useEffect, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { SettingsList, SettingsRow, SettingsSection } from '@/components/settings/SettingsSection'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useSaveTtsConfig, useTtsConfig } from '@/hooks/use-tts'
import { type TtsConfig } from '../../../shared/tts'

type VoiceOption = {
  value: string
  label: string
  description: string
}

const edgeTtsVoiceOptions: VoiceOption[] = [
  { value: 'en-US-AndrewNeural', label: 'Andrew', description: '美式男声' },
  { value: 'en-US-BrianNeural', label: 'Brian', description: '美式男声' },
  { value: 'en-US-ChristopherNeural', label: 'Christopher', description: '美式男声' },
  { value: 'en-US-EricNeural', label: 'Eric', description: '美式男声' },
  { value: 'en-US-GuyNeural', label: 'Guy', description: '美式男声' },
  { value: 'en-US-RogerNeural', label: 'Roger', description: '美式男声' },
  { value: 'en-US-SteffanNeural', label: 'Steffan', description: '美式男声' },
  { value: 'en-US-AvaNeural', label: 'Ava', description: '美式女声' },
  { value: 'en-US-EmmaNeural', label: 'Emma', description: '美式女声' },
  { value: 'en-US-JennyNeural', label: 'Jenny', description: '美式女声' },
  { value: 'en-US-MichelleNeural', label: 'Michelle', description: '美式女声' },
  { value: 'en-US-AriaNeural', label: 'Aria', description: '美式女声' },
  { value: 'en-US-AnaNeural', label: 'Ana', description: '美式女声' },
  { value: 'en-GB-RyanNeural', label: 'Ryan', description: '英式男声' },
  { value: 'en-GB-ThomasNeural', label: 'Thomas', description: '英式男声' },
  { value: 'en-GB-LibbyNeural', label: 'Libby', description: '英式女声' },
  { value: 'en-GB-MaisieNeural', label: 'Maisie', description: '英式女声' },
  { value: 'en-GB-SoniaNeural', label: 'Sonia', description: '英式女声' },
  { value: 'de-DE-ConradNeural', label: 'Conrad', description: '德式男声' },
  { value: 'de-DE-KatjaNeural', label: 'Katja', description: '德式女声' },
  { value: 'ja-JP-KeitaNeural', label: 'Keita', description: '日式男声' },
  { value: 'ja-JP-NanamiNeural', label: 'Nanami', description: '日式女声' },
  { value: 'fr-FR-HenriNeural', label: 'Henri', description: '法式男声' },
  { value: 'fr-FR-DeniseNeural', label: 'Denise', description: '法式女声' },
  { value: 'it-IT-DiegoNeural', label: 'Diego', description: '意式男声' },
  { value: 'it-IT-IsabellaNeural', label: 'Isabella', description: '意式女声' },
  { value: 'ko-KR-InJoonNeural', label: 'InJoon', description: '韩式男声' },
  { value: 'ko-KR-SunHiNeural', label: 'SunHi', description: '韩式女声' }
]

export function TtsSettingsCard(): React.JSX.Element {
  const ttsConfig = useTtsConfig()
  const saveTtsConfig = useSaveTtsConfig()
  const [ttsForm, setTtsForm] = useState<TtsConfig | null>(null)
  const [ttsError, setTtsError] = useState<string | null>(null)
  const [voicePickerOpen, setVoicePickerOpen] = useState(false)

  useEffect(() => {
    const config = ttsConfig.data
    if (!config) return
    // Hydrate the form from the main-process source of truth.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTtsForm(config)
  }, [ttsConfig.data])

  const saveTtsConfigValue = (patch: Partial<TtsConfig>): void => {
    const current = ttsForm ?? ttsConfig.data
    if (!current) return

    const nextConfig: TtsConfig = { ...current, ...patch }
    setTtsForm(nextConfig)
    setTtsError(null)
    saveTtsConfig.mutate(nextConfig, {
      onError: (error: Error) => setTtsError(error.message)
    })
  }

  const selectedEdgeVoice = edgeTtsVoiceOptions.find(
    (voice) => voice.value === (ttsForm?.edgeVoice ?? ttsConfig.data?.edgeVoice ?? '')
  )

  return (
    <SettingsSection title="朗读" description="选择 Edge TTS 使用的音色。">
      <SettingsList>
        <SettingsRow
          label="Edge 音色"
          description="朗读词条和例句时使用。"
          className="items-start"
          control={
            <Popover open={voicePickerOpen} onOpenChange={setVoicePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  aria-expanded={voicePickerOpen}
                  aria-label="Edge voice"
                  className="w-[min(26rem,42vw)] min-w-64 justify-between border border-input bg-background font-normal shadow-xs hover:bg-background"
                  disabled={ttsConfig.isLoading || !ttsConfig.data || saveTtsConfig.isPending}
                  role="combobox"
                  variant="outline"
                >
                  {selectedEdgeVoice ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{selectedEdgeVoice.label}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {selectedEdgeVoice.description}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">选择 Edge 音色</span>
                  )}
                  <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
                <Command>
                  <CommandInput placeholder="搜索音色..." />
                  <CommandList>
                    <CommandEmpty>没有找到匹配的音色。</CommandEmpty>
                    <CommandGroup>
                      {edgeTtsVoiceOptions.map((option) => (
                        <CommandItem
                          key={option.value}
                          keywords={[option.label, option.description]}
                          value={option.value}
                          onSelect={() => {
                            saveTtsConfigValue({ edgeVoice: option.value })
                            setVoicePickerOpen(false)
                          }}
                        >
                          <Check
                            className={
                              selectedEdgeVoice?.value === option.value
                                ? 'size-4 opacity-100'
                                : 'size-4 opacity-0'
                            }
                          />
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate">{option.label}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              {option.description}
                            </span>
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          }
        />
      </SettingsList>
      {ttsError && (
        <p className="mt-3 text-xs text-destructive" role="alert">
          {ttsError}
        </p>
      )}
    </SettingsSection>
  )
}
