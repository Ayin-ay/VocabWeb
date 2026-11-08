import raw from '../data/lexicon.json'
import type { LexEntry, Lexicon, SectionKey, Word } from './types'

export const LEX = raw as unknown as Lexicon

export const SECTION_LABELS: Record<SectionKey, string> = {
  words: '单词',
  phrases: '词语',
  names: '专有名词'
}

/** 词性缩写 → 中文，卡片上只在小标签里出现一次 */
export const POS_LABELS: Record<string, string> = {
  'n.': '名',
  'v.': '动',
  'vt.': '及物',
  'vi.': '不及物',
  'a.': '形',
  'ad.': '副',
  'prep.': '介'
}

function attach(unitId: string, unitLabel: string, book: number, section: SectionKey, e: LexEntry): Word {
  return { ...e, unitId, unitLabel, book, section, sectionLabel: SECTION_LABELS[section] }
}

export const ALL: Word[] = LEX.units.flatMap((u) =>
  u.sections.flatMap((s) => s.entries.map((e) => attach(u.id, u.label, u.book, s.key, e)))
)

export const WORD_BY_ID = new Map<string, Word>(ALL.map((w) => [w.id, w]))

export function wordsOf(unitId: string, section?: SectionKey): Word[] {
  return ALL.filter((w) => w.unitId === unitId && (!section || w.section === section))
}

export const COUNT = {
  total: ALL.length,
  words: ALL.filter((w) => w.section === 'words').length,
  phrases: ALL.filter((w) => w.section === 'phrases').length,
  names: ALL.filter((w) => w.section === 'names').length,
  units: LEX.units.length
}
