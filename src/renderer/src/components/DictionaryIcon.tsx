import { useState } from 'react'

type DictionaryIconProps = {
  name: string
  iconUrl: string | null | undefined
}

export function DictionaryTabIcon({ name, iconUrl }: DictionaryIconProps): React.JSX.Element {
  const [failedIconUrl, setFailedIconUrl] = useState<string | null>(null)
  const hasIcon = Boolean(iconUrl && failedIconUrl !== iconUrl)
  const initial = Array.from(name.trim())[0] ?? '?'

  return (
    <span className="dictionary-source-icon flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-background bg-background text-[11px] font-semibold text-muted-foreground group-data-[state=active]:text-primary">
      {hasIcon ? (
        <img
          alt=""
          className="size-full object-cover bg-white"
          onError={() => setFailedIconUrl(iconUrl ?? null)}
          src={iconUrl ?? undefined}
        />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </span>
  )
}

export function DictionaryAvatar({ name, iconUrl }: DictionaryIconProps): React.JSX.Element {
  const [failedIconUrl, setFailedIconUrl] = useState<string | null>(null)
  const hasIcon = Boolean(iconUrl && failedIconUrl !== iconUrl)
  const initial = Array.from(name.trim())[0] ?? '?'

  return (
    <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background">
      {hasIcon ? (
        <img
          alt=""
          className="size-full object-cover"
          onError={() => setFailedIconUrl(iconUrl ?? null)}
          src={iconUrl ?? undefined}
        />
      ) : (
        <span aria-hidden="true" className="text-sm font-medium text-muted-foreground">
          {initial}
        </span>
      )}
    </span>
  )
}
