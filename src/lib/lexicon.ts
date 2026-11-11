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

/**
 * 一个可选词库 = 一个单元：拍照传进来的 8 个教材单元各自成库，四级整体成一库。
 * 冲刺按词库整取整放，所以切分口径以导入源为准，不在站内再拆。
 */
export interface Library {
  id: string
  label: string
  ids: string[]
}

export const LIBS: Library[] = LEX.units.map((u) => ({
  id: u.id,
  label: u.label,
  ids: u.sections.flatMap((s) => s.entries.map((e) => e.id))
}))

export const LIB_BY_ID = new Map<string, Library>(LIBS.map((l) => [l.id, l]))

/** 词条属于哪个词库：id 是「单元号-分节-序号」，单元号本身不含连字符 */
export const libOf = (id: string): string => id.slice(0, id.indexOf('-'))

/**
 * 词形 → 出现过的词库。同一个词既在教材单元又在四级里时，
 * 两边筛选都要查得到它，所以归属按词形算而不是按那一条 id 算。
 */
const FORM_KEY = (en: string) => en.toLowerCase().replace(/[^a-z'-]/g, '')
const FORM_LIBS = new Map<string, Set<string>>()
for (const w of ALL) {
  const key = FORM_KEY(w.en)
  if (!key) continue
  const set = FORM_LIBS.get(key)
  if (set) set.add(w.unitId)
  else FORM_LIBS.set(key, new Set([w.unitId]))
}

/** 这个词形在哪些词库里出现（含同名异写的其它条目） */
export const libsOf = (w: Word): string[] => [...(FORM_LIBS.get(FORM_KEY(w.en)) ?? [w.unitId])]

/** 教材单元与四级都收了的词形，单词本里单独可筛 */
export const SHARED_COUNT = [...FORM_LIBS.values()].filter((s) => s.size > 1).length
