import raw from '../data/composition.json'
import type { CorpusCard, CorpusCat, CorpusUnit } from './types'

/** 数据由 scripts/build-corpus.mjs 从 scripts/corpus_src 合并生成，按 id 认条目 */
const units = (raw as { units: CorpusUnit[] }).units

export const CAT_ORDER: CorpusCat[] = ['word', 'term', 'phrase', 'advanced', 'sentence']

export const CAT_LABELS: Record<CorpusCat, string> = {
  word: '常用词汇',
  term: '专业词汇',
  phrase: '常用表达',
  advanced: '高级表达',
  sentence: '例句'
}

export const CORPUS_UNITS = units
export const CORPUS_TOTAL = units.reduce((n, u) => n + u.cards.length, 0)

export function cardsOf(unitId: string, cats: CorpusCat[]): CorpusCard[] {
  const u = units.find((x) => x.id === unitId)
  if (!u) return []
  return u.cards.filter((c) => cats.includes(c.cat))
}

/** 卡片 id 形如 B2U2-p07，单元部分可直接反查 */
export const unitOfCard = (id: string): string => id.slice(0, 4)
