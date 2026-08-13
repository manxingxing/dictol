import { useState } from 'react'
import { Star } from 'lucide-react'

export type StarRatingProps = {
  /** 当前星级 (0-5) */
  rating: number
  /** 点击星级时的回调，传入新星级（点击当前星级时不会触发） */
  onChange: (star: number) => void
}

/** 1‑5 星交互式评分组件，点击可修改星级 */
export function StarRating({
  rating,
  onChange,
}: StarRatingProps): React.JSX.Element {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const activeIndex = hoverIndex ?? rating

  return (
    <span
      className="inline-flex gap-0.5"
      aria-label={`${rating} 星，点击修改`}
      onMouseLeave={() => setHoverIndex(null)}
    >
      {Array.from({ length: 5 }, (_, i) => {
        const filled = i < activeIndex
        return (
          <button
            key={i}
            aria-label={`${i + 1} 星`}
            className="cursor-pointer border-none bg-transparent p-0 leading-none"
            onClick={() => {
              const newStar = i + 1
              if (newStar === rating) return
              onChange(newStar)
            }}
            onMouseEnter={() => setHoverIndex(i + 1)}
            type="button"
          >
            <Star
              className={`size-3.5 transition-colors ${
                filled
                  ? 'fill-amber-400 text-amber-400'
                  : 'text-muted-foreground/30'
              }`}
            />
          </button>
        )
      })}
    </span>
  )
}
