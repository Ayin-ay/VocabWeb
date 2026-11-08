import type { CardState, Word } from './types'
import { isDue, isWrong } from './srs'

export type QuizKind = 'en2cn' | 'cn2en' | 'spelling' | 'dictation' | 'matching'

export const KIND_LABELS: Record<QuizKind, string> = {
  'en2cn': '英→中 选择',
  'cn2en': '中→英 选择',
  spelling: '拼写填空',
  dictation: '听写',
  matching: '短语配对'
}

export interface Question {
  kind: QuizKind
  /** 这道题涉及的词条：选择题 1 个，配对题若干 */
  ids: string[]
  prompt: string
  hint?: string
  /** 听力/发音按钮要念的文本 */
  audio?: string
  answer?: string
  options?: string[]
  pairs?: { id: string; en: string; zh: string }[]
}

export function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = out[i]!
    out[i] = out[j]!
    out[j] = a
  }
  return out
}

export const normalize = (s: string): string => s.toLowerCase().replace(/[·・–—―]/g, '-').replace(/\s+/g, ' ').trim()

/** 拼写判定：连字符可写可不写，breath-taking 与 breathtaking 都算对 */
export const sameSpelling = (a: string, b: string): boolean => {
  const x = normalize(a)
  const y = normalize(b)
  return x === y || x.replace(/-/g, '') === y.replace(/-/g, '')
}

/** 干扰项优先同单元同分节（词性、主题接近），不够再全库补 */
function distractors(target: Word, all: Word[], field: 'zh' | 'en', need: number): string[] {
  const layers = [
    all.filter((w) => w.unitId === target.unitId && w.section === target.section),
    all.filter((w) => w.book === target.book && w.section === target.section),
    all.filter((w) => w.section === target.section)
  ]
  const picked: string[] = []
  for (const layer of layers) {
    for (const w of shuffle(layer)) {
      if (picked.length >= need) break
      const text = w[field]
      if (w.id === target.id || !text || text === target[field] || picked.includes(text)) continue
      picked.push(text)
    }
    if (picked.length >= need) break
  }
  return picked
}

function choiceQuestion(target: Word, all: Word[], kind: QuizKind): Question | null {
  if (kind === 'en2cn' && !target.zh) return null
  if (kind === 'cn2en' && !target.en) return null
  const field = kind === 'en2cn' ? 'zh' : 'en'
  const other = kind === 'en2cn' ? 'en' : 'zh'
  const opts = distractors(target, all, field, 3)
  if (!opts.length) return null
  return {
    kind,
    ids: [target.id],
    prompt: target[other],
    hint: kind === 'en2cn' ? target.pos || undefined : undefined,
    audio: kind === 'en2cn' ? target.en : undefined,
    answer: target[field],
    options: shuffle([target[field], ...opts])
  }
}

function spellingQuestion(target: Word, kind: QuizKind): Question | null {
  if (!target.en || !target.zh) return null
  const words = target.en.split(/\s+/).length
  return {
    kind,
    ids: [target.id],
    prompt: kind === 'spelling' ? target.zh : '听发音，写出拼写',
    hint: kind === 'spelling' ? `${target.pos || ''} 首字母 ${target.en.slice(0, 1).toUpperCase()}，${words} 个词` : undefined,
    audio: target.en,
    answer: target.en
  }
}

function matchingQuestion(targets: Word[]): Question {
  const pairs = targets.map((w) => ({ id: w.id, en: w.en, zh: w.zh }))
  return { kind: 'matching', ids: pairs.map((p) => p.id), prompt: '把英文与释义配成对', pairs }
}

export interface GenOptions {
  kinds: QuizKind[]
  count: number
  all: Word[]
  /** 给了 progress 就按「越生疏越先考」取样 */
  progress?: Record<string, CardState>
}

/** 生疏度排序分：错题 > 到期 > 生词 > 其余 */
function weakness(w: Word, p?: Record<string, CardState>): number {
  if (!p) return Math.random()
  const s = p[w.id]
  if (isWrong(s)) return 0
  if (isDue(s)) return 1
  if (!s) return 2
  return 3 - Math.min(2, s.box / 3)
}

export function generate(candidates: Word[], opts: GenOptions): Question[] {
  const kinds: QuizKind[] = opts.kinds.length ? opts.kinds : ['en2cn']
  const choice = kinds.some((k) => k === 'en2cn' || k === 'cn2en' || k === 'matching')
  const pool = candidates.filter((w) => w.en && w.zh && (choice || w.section !== 'names'))

  const ranked = [...pool].sort((a, b) => weakness(a, opts.progress) - weakness(b, opts.progress))
  const head = ranked.slice(0, Math.ceil(ranked.length * 0.7))
  const tail = ranked.slice(head.length)
  const chosen = shuffle(head).concat(shuffle(tail)).slice(0, opts.count)

  const out: Question[] = []
  let i = 0
  while (out.length < opts.count && i < chosen.length) {
    const kind = kinds[out.length % kinds.length]!
    const w = chosen[i]!
    if (kind === 'matching') {
      const group = chosen.slice(i, i + 5).filter((g) => g.section !== 'names')
      if (group.length < 3) { i += 1; continue }
      out.push(matchingQuestion(group))
      i += group.length
      continue
    }
    const q = kind === 'en2cn' || kind === 'cn2en' ? choiceQuestion(w, opts.all, kind) : spellingQuestion(w, kind)
    i += 1
    if (q) out.push(q)
  }
  return out
}
