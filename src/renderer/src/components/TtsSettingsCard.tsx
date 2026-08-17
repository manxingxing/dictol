import { useEffect, useState } from 'react'
import { Volume2 } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
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
    <Card className="mt-4">
      <CardHeader>
        <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Volume2 className="size-5" />
        </div>
        <CardTitle>朗读</CardTitle>
        <CardDescription>选择 Edge TTS 使用的音色</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="block max-w-xl space-y-1.5 text-sm">
          <Select
            onValueChange={(edgeVoice) => saveTtsConfigValue({ edgeVoice })}
            value={selectedEdgeVoice?.value ?? ''}
            disabled={ttsConfig.isLoading || !ttsConfig.data || saveTtsConfig.isPending}
          >
            <SelectTrigger aria-label="Edge voice">
              <SelectValue placeholder="选择 Edge 音色" />
            </SelectTrigger>
            <SelectContent>
              {edgeTtsVoiceOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <span className="flex items-center gap-2">
                    <span>{option.label}</span>
                    <span className="text-xs text-muted-foreground">{option.description}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        {ttsError && (
          <p className="text-xs text-destructive" role="alert">
            {ttsError}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
