import { useParams } from 'react-router-dom'

const previewResults = {
  abandon: {
    word: 'abandon',
    phonetic: '/əˈbændən/',
    definition: 'to leave somebody or something completely and finally'
  },
  ability: {
    word: 'ability',
    phonetic: '/əˈbɪləti/',
    definition: 'the skill or power to do something'
  },
  able: {
    word: 'able',
    phonetic: '/ˈeɪbl/',
    definition: 'having the skill, intelligence or opportunity to do something'
  },
  about: {
    word: 'about',
    phonetic: '/əˈbaʊt/',
    definition: 'on the subject of somebody or something'
  }
} as const

export function SearchResultPage(): React.JSX.Element {
  const { word } = useParams()
  const result = word ? previewResults[word as keyof typeof previewResults] : undefined

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        选择一个词条查看详情
      </div>
    )
  }

  return (
    <article className="h-full overflow-y-auto p-8">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-3xl font-semibold tracking-tight">{result.word}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{result.phonetic}</p>
        <div className="mt-8 border-t border-border pt-6">
          <p className="text-base leading-7">{result.definition}</p>
        </div>
      </div>
    </article>
  )
}
