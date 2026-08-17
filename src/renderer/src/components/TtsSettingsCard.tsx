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

const ttsVoiceOptions = [
  { value: 'en-US-AndrewNeural', name: 'Andrew', description: '美式男声' },
  { value: 'en-US-BrianNeural', name: 'Brian', description: '美式男声' },
  { value: 'en-US-ChristopherNeural', name: 'Christopher', description: '美式男声' },
  { value: 'en-US-EricNeural', name: 'Eric', description: '美式男声' },
  { value: 'en-US-GuyNeural', name: 'Guy', description: '美式男声' },
  { value: 'en-US-RogerNeural', name: 'Roger', description: '美式男声' },
  { value: 'en-US-SteffanNeural', name: 'Steffan', description: '美式男声' },
  { value: 'en-US-AvaNeural', name: 'Ava', description: '美式女声' },
  { value: 'en-US-EmmaNeural', name: 'Emma', description: '美式女声' },
  { value: 'en-US-JennyNeural', name: 'Jenny', description: '美式女声' },
  { value: 'en-US-MichelleNeural', name: 'Michelle', description: '美式女声' },
  { value: 'en-US-AriaNeural', name: 'Aria', description: '美式女声' },
  { value: 'en-US-AnaNeural', name: 'Ana', description: '美式女声' },
  { value: 'en-GB-RyanNeural', name: 'Ryan', description: '英式男声' },
  { value: 'en-GB-ThomasNeural', name: 'Thomas', description: '英式男声' },
  { value: 'en-GB-LibbyNeural', name: 'Libby', description: '英式女声' },
  { value: 'en-GB-MaisieNeural', name: 'Maisie', description: '英式女声' },
  { value: 'en-GB-SoniaNeural', name: 'Sonia', description: '英式女声' }
] as const

export function TtsSettingsCard(): React.JSX.Element {
  const ttsConfig = useTtsConfig()
  const saveTtsConfig = useSaveTtsConfig()
  const [ttsVoice, setTtsVoice] = useState('')
  const [ttsError, setTtsError] = useState<string | null>(null)

  useEffect(() => {
    const config = ttsConfig.data
    if (!config) return
    // Hydrate the form from the main-process source of truth.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTtsVoice(config.voice)
  }, [ttsConfig.data])

  const saveTtsVoice = (voice: string): void => {
    setTtsVoice(voice)
    setTtsError(null)
    saveTtsConfig.mutate(
      { voice },
      {
        onError: (error: Error) => setTtsError(error.message)
      }
    )
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Volume2 className="size-5" />
        </div>
        <CardTitle>朗读</CardTitle>
        <CardDescription>配置朗读默认使用的语音</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select
          disabled={ttsConfig.isLoading || !ttsConfig.data || saveTtsConfig.isPending}
          onValueChange={saveTtsVoice}
          value={ttsVoice}
        >
          <SelectTrigger aria-label="默认 voice">
            <SelectValue placeholder="选择语音" />
          </SelectTrigger>
          <SelectContent>
            {ttsVoiceOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <span className="flex items-center gap-2">
                  <span>{option.name}</span>
                  <span className="text-xs text-muted-foreground">{option.description}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {ttsError && (
          <p className="text-xs text-destructive" role="alert">
            {ttsError}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
