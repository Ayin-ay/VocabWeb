import type { CardState, Grade, Word } from './types'

/** 艾宾浩斯档位间隔（天）：box 越大下次复现越晚 */
export const INTERVALS = [1, 2, 4, 7, 15, 30, 60]

export const DAY = 86_400_000

export const today = (): number => Math.floor(Date.now() / DAY)

export const newCard = (): CardState => ({ box: 0, due: today(), known: false, lapses: 0, streak: 0 })

export function grade(state: CardState | undefined, g: Grade): CardState {
  const s = state ?? newCard()
  if (g === 'again') return { ...s, box: 0, due: today() + INTERVALS[0]!, lapses: s.lapses + 1, streak: 0 }
  if (g === 'hard') {
    const box = Math.max(0, s.box - 1)
    return { ...s, box, due: today() + Math.max(1, Math.ceil(INTERVALS[Math.min(box, INTERVALS.length - 1)]! / 2)), streak: 0 }
  }
  const box = Math.min(INTERVALS.length - 1, s.box + 1)
  return { ...s, box, due: today() + INTERVALS[box]!, streak: s.streak + 1, studiedAt: new Date().toISOString() }
}

/** 答错入错题本，连续答对两次才认定掌握 */
export const isWrong = (s: CardState | undefined): boolean => Boolean(s && s.lapses > 0 && s.streak < 2)

export const isDue = (s: CardState | undefined): boolean => Boolean(s && s.due <= today())

export const unseen = (s: CardState | undefined): boolean => !s || (!s.known && !s.studiedAt)

export function partition(words: Word[], progress: Record<string, CardState>) {
  const fresh: Word[] = []
  const due: Word[] = []
  const learned: Word[] = []
  const wrong: Word[] = []
  for (const w of words) {
    const s = progress[w.id]
    if (isWrong(s)) wrong.push(w)
    if (unseen(s)) fresh.push(w)
    else if (isDue(s)) due.push(w)
    else learned.push(w)
  }
  return { fresh, due, learned, wrong }
}

/** 单元掌握度：已学 = 标记认识 或 已被复习过 */
export function unitStats(unitWords: Word[], progress: Record<string, CardState>) {
  let done = 0
  let weak = 0
  for (const w of unitWords) {
    const s = progress[w.id]
    if (s?.known || s?.studiedAt) done += 1
    if (isWrong(s)) weak += 1
  }
  return { total: unitWords.length, done, weak, percent: unitWords.length ? Math.round((done / unitWords.length) * 100) : 0 }
}

/** 到期队列：错题优先，其次按档位低→高（越生疏越先看） */
export function reviewQueue(words: Word[], progress: Record<string, CardState>, limit: number): Word[] {
  const { fresh, due, wrong } = partition(words, progress)
  const head = [...wrong].sort((a, b) => (progress[a.id]?.box ?? 0) - (progress[b.id]?.box ?? 0))
  const rest = [...due].sort((a, b) => (progress[a.id]?.box ?? 0) - (progress[b.id]?.box ?? 0))
  return [...head, ...rest, ...fresh].slice(0, limit)
}
