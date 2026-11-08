import { ALL, WORD_BY_ID } from './lexicon'
import { shuffle } from './quiz'
import { stageFor } from './sprint'
import type { SprintState } from './sprint'
import type { Word } from './types'

/** 答错插回靠前的位置，马上重考一次 */
export const DEPOSIT_FRONT = 3
/** 连对一次算沉淀完成，移出队列 */
export const DEPOSIT_STREAK = 1

export interface DepositItem {
  right: number
  wrong: number
  streak: number
}

export interface DepositState {
  /** 这批收进来的全部词条，本轮练完再练一轮时用 */
  roster: string[]
  queue: string[]
  items: Record<string, DepositItem>
  round: number
  startedAt: string
  finishedAt: string | null
}

const blank = (): DepositItem => ({ right: 0, wrong: 0, streak: 0 })

/** 沉淀名单 = 这一轮冲刺里答错过至少一次的词 */
export function rosterOf(sprint: SprintState): string[] {
  const ids: string[] = []
  for (const w of ALL) {
    if ((sprint.items[w.id]?.wrong ?? 0) > 0) ids.push(w.id)
  }
  return ids
}

export function newDeposit(ids: string[], round = 1): DepositState {
  return {
    roster: ids,
    queue: shuffle(ids),
    items: Object.fromEntries(ids.map((id) => [id, blank()])),
    round,
    startedAt: new Date().toISOString(),
    finishedAt: null
  }
}

/** 本轮练完后重洗一遍再练：计数留着做对比，连对清零，每个词都要重新连对到位 */
export function requeue(state: DepositState): DepositState {
  const items: Record<string, DepositItem> = {}
  for (const [id, s] of Object.entries(state.items)) items[id] = { ...s, streak: 0 }
  return {
    roster: state.roster,
    queue: shuffle(state.roster),
    items,
    round: state.round + 1,
    startedAt: new Date().toISOString(),
    finishedAt: null
  }
}

export const front = (state: DepositState): Word | null => WORD_BY_ID.get(state.queue[0] ?? '') ?? null

export function answer(state: DepositState, id: string, correct: boolean): DepositState {
  if (!WORD_BY_ID.has(id) || state.queue[0] !== id) return state

  const queue = state.queue.slice(1)
  const items = { ...state.items }
  const item: DepositItem = { ...(items[id] ?? blank()) }
  item.right += correct ? 1 : 0
  item.wrong += correct ? 0 : 1
  item.streak = correct ? item.streak + 1 : 0

  // 连对没到两次就继续排队：答错马上重考，答对排到队尾换点间隔
  if (item.streak < DEPOSIT_STREAK) {
    const insertAt = correct ? queue.length : Math.min(DEPOSIT_FRONT, queue.length)
    queue.splice(insertAt, 0, id)
  }
  items[id] = item

  return {
    ...state,
    queue,
    items,
    finishedAt: state.finishedAt ?? (queue.length ? null : new Date().toISOString())
  }
}

/** 题型沿用冲刺：单词拼写，词组与专有名词看英文选中文 */
export const stageOf = (w: Word): 'choice' | 'spell' => stageFor(w)

export interface DepositStats {
  total: number
  pending: number
  done: number
  right: number
  wrong: number
  accuracy: number
}

export function stats(state: DepositState): DepositStats {
  let right = 0
  let wrong = 0
  for (const s of Object.values(state.items)) {
    right += s.right
    wrong += s.wrong
  }
  const asked = right + wrong
  return {
    total: state.roster.length,
    pending: state.queue.length,
    done: state.roster.length - state.queue.length,
    right,
    wrong,
    accuracy: asked ? Math.round((right / asked) * 100) : 0
  }
}

const isCount = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0

/** 名单必须全在当前词库里，否则队列会卡在一个认不出的 id 上 */
export function normalize(state: DepositState | null | undefined): DepositState | null {
  if (!state || !Array.isArray(state.roster) || !Array.isArray(state.queue) || !state.items) return null
  const roster = state.roster.filter((id, i) => WORD_BY_ID.has(id) && state.roster.indexOf(id) === i)
  if (!roster.length) return null
  const items: Record<string, DepositItem> = {}
  for (const id of roster) {
    const s = state.items[id]
    items[id] = s && isCount(s.right) && isCount(s.wrong) && isCount(s.streak)
      ? { right: s.right, wrong: s.wrong, streak: s.streak }
      : blank()
  }
  // 队列 = 还没沉淀到位的那些词，顺序照存档原样保留。
  // 两处都不能想当然：重排等于把正在做的题换掉（点一下 2048 就跳题），
  // 把连对到位的词当丢失补回来则等于永远练不完。
  const pending = roster.filter((id) => (items[id]?.streak ?? 0) < DEPOSIT_STREAK)
  const todo = new Set(pending)
  const kept: string[] = []
  const seen = new Set<string>()
  for (const id of state.queue) {
    if (!todo.has(id) || seen.has(id)) continue
    seen.add(id)
    kept.push(id)
  }
  const queue = [...kept, ...shuffle(pending.filter((id) => !seen.has(id)))]
  return {
    roster,
    queue,
    items,
    round: Number.isInteger(state.round) && state.round > 0 ? state.round : 1,
    startedAt: typeof state.startedAt === 'string' ? state.startedAt : new Date().toISOString(),
    finishedAt: queue.length ? null : typeof state.finishedAt === 'string' ? state.finishedAt : new Date().toISOString()
  }
}
