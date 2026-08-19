export const LANGUAGE_TASK_KINDS = [
  'english-lexical',
  'chinese-lexical',
  'english-to-chinese',
  'classical-to-modern'
] as const

export type LanguageTaskKind = (typeof LANGUAGE_TASK_KINDS)[number]

export const LANGUAGE_TASK_LABELS: Record<LanguageTaskKind, string> = {
  'english-lexical': '英文词汇',
  'chinese-lexical': '中文词语',
  'english-to-chinese': '英译中',
  'classical-to-modern': '文言文解释'
}

export type LanguageTaskUnknownReason =
  | 'empty-input'
  | 'unsupported-input'
  | 'ambiguous'
  | 'classifier-unavailable'
  | 'invalid-classifier-response'

export type LanguageTaskClassification =
  | {
      task: LanguageTaskKind
      source: 'local' | 'llm'
    }
  | {
      task: 'unknown'
      source: 'local' | 'llm' | 'fallback'
      reason: LanguageTaskUnknownReason
    }
