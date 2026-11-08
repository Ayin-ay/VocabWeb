export type SectionKey = 'words' | 'phrases' | 'names'

export interface LexEntry {
  id: string
  num: number
  en: string
  pos: string
  zh: string
}

export interface LexSection {
  key: SectionKey
  label: string
  title: string
  entries: LexEntry[]
}

export interface LexUnit {
  id: string
  book: number
  unit: number
  label: string
  sections: LexSection[]
}

export interface Lexicon {
  source: string
  builtAt: string
  total: number
  units: LexUnit[]
}

/** 词表条目 + 定位信息，站内一切交互都按 id 认，不依赖数组下标 */
export interface Word extends LexEntry {
  unitId: string
  unitLabel: string
  book: number
  section: SectionKey
  sectionLabel: string
}

export type Grade = 'again' | 'hard' | 'good'

/** 一个词的复习档案：box 是记忆强度档位，due 是到期的「第几天」 */
export interface CardState {
  box: number
  due: number
  known: boolean
  lapses: number
  streak: number
  studiedAt?: string
}

export interface Settings {
  showZh: boolean
  ttsRate: number
  voiceURI: string
}

export interface LlmConfig {
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
}

export interface AiNote {
  sentence: string
  translation: string
  collocations: string
  mnemonic: string
}

export interface QuizRecord {
  at: string
  kind: string
  units: string[]
  total: number
  correct: number
}

export type CorpusCat = 'word' | 'term' | 'phrase' | 'advanced' | 'sentence'

/** 作文语料卡片：正面中文，背面英文表达 */
export interface CorpusCard {
  id: string
  cat: CorpusCat
  zh: string
  en: string
  use?: string
  eg?: string
}

export interface CorpusUnit {
  id: string
  label: string
  theme: string
  cards: CorpusCard[]
}
