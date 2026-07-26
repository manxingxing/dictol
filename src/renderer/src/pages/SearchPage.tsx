import { useReadyDictionaries } from '@/hooks/use-dictionaries'
import { EmptyDictionaryState } from './EmptyDictionaryState'
import { SearchLayout } from '@/components/SearchLayout'

export function SearchPage(): React.JSX.Element {
  const { data: dictionaries = [], isLoading, isError } = useReadyDictionaries()

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        正在加载词典…
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        加载词典失败，请稍后重试。
      </div>
    )
  }

  if (dictionaries.length === 0) {
    return <EmptyDictionaryState />
  }

  return <SearchLayout />
}
