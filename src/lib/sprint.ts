import { LIBS, WORD_BY_ID, libOf } from './lexicon'
import { shuffle } from './quiz'
import { hasMoves, newGame, spawn } from './game2048'
import type { GameState } from './game2048'
import type { Word } from './types'

/** 第一次遇见之后插到这个位置，第二次遇见（拼写）很快轮到，又不至于立刻重复 */
export const SECOND_WINDOW = 8
/** 拼错插回靠前的位置，马上再考一次 */
export const FRONT = 3
/** 词组与专有名词连对几次选择题算掌握 */
export const MASTERY_STREAK = 2

/** 新开一轮时默认全库都在范围内，之后由玩家自己整库加减 */
export const ALL_LIBS = LIBS.map((l) => l.id)

export interface ItemState {
  stage: 'choice' | 'spell'
  mastered: boolean
  streak: number
  right: number
  wrong: number
}

export interface SprintState {
  queue: string[]
  items: Record<string, ItemState>
  /** 这一轮选中的词库（单元号）。词库换了只影响可选范围，不重开正在跑的这轮 */
  scope: string[]
  game: GameState
  /** 答对换来的一步：true 时玩家可以选方向移动 2048 */
  canMove: boolean
  startedAt: string
  finishedAt: string | null
}

const blank = (): ItemState => ({ stage: 'choice', mastered: false, streak: 0, right: 0, wrong: 0 })

/** 只有「单词」这一节会进到拼写关；词组和专有名词始终看英文选中文 */
export const stageFor = (w: Word): ItemState['stage'] => (w.section === 'words' ? 'spell' : 'choice')

/** 作用域内的词条：选了哪些词库，本轮的总数与掌握数就按哪些词库算 */
export const scopeIds = (state: Pick<SprintState, 'scope'>): string[] =>
  state.scope.flatMap((id) => LIBS.find((l) => l.id === id)?.ids ?? [])

export function initSprint(scope: string[] = ALL_LIBS, best = 0): SprintState {
  return {
    queue: shuffle(scopeIds({ scope })),
    items: {},
    scope: [...scope],
    game: newGame(best),
    canMove: false,
    startedAt: new Date().toISOString(),
    finishedAt: null
  }
}

export const front = (state: SprintState): Word | null => WORD_BY_ID.get(state.queue[0] ?? '') ?? null

export interface AnswerResult {
  state: SprintState
  /** 这次答题有没有换来一步 2048 */
  earnedMove: boolean
}

export function rewardOf(game: GameState, correct: boolean): { game: GameState; canMove: boolean } {
  if (correct) return { game, canMove: !game.over }
  const board = spawn(game.board)
  return { game: { ...game, board, over: !hasMoves(board) }, canMove: false }
}

export function answer(state: SprintState, id: string, correct: boolean): AnswerResult {
  const w = WORD_BY_ID.get(id)
  if (!w || state.queue[0] !== id) return { state, earnedMove: false }

  const queue = state.queue.slice(1)
  const items = { ...state.items }
  const item: ItemState = { ...(items[id] ?? blank()) }
  item.right += correct ? 1 : 0
  item.wrong += correct ? 0 : 1

  let insertAt: number
  if (item.stage === 'choice') {
    if (w.section === 'words') {
      // 失败无惩罚：不管对错，第二次遇见都改成拼写
      item.stage = 'spell'
      insertAt = Math.min(SECOND_WINDOW, queue.length)
    } else {
      item.streak = correct ? item.streak + 1 : 0
      item.mastered = item.streak >= MASTERY_STREAK
      insertAt = item.mastered ? queue.length : Math.min(SECOND_WINDOW, queue.length)
    }
  } else if (correct) {
    item.mastered = true
    item.streak += 1
    insertAt = queue.length
  } else {
    item.mastered = false
    item.streak = 0
    insertAt = Math.min(FRONT, queue.length)
  }

  queue.splice(insertAt, 0, id)
  items[id] = item

  // 沉淀模块共用这套奖惩：答对换一步可移动，答错立刻落新数字并锁住
  const reward = rewardOf(state.game, correct)

  const masteredAll = queue.every((qid) => items[qid]?.mastered)
  return {
    state: {
      ...state,
      queue,
      items,
      game: reward.game,
      canMove: reward.canMove,
      finishedAt: state.finishedAt ?? (masteredAll ? new Date().toISOString() : null)
    },
    earnedMove: reward.canMove
  }
}

/** 选中一个词库：没答过的词一律排到队尾，当前这道题和已答记录都不动 */
export function addLib(state: SprintState, libId: string): SprintState {
  const lib = LIBS.find((l) => l.id === libId)
  if (!lib || state.scope.includes(libId)) return state
  const queued = new Set(state.queue)
  const fresh = shuffle(lib.ids.filter((id) => !queued.has(id) && !state.items[id]?.mastered))
  return {
    ...state,
    scope: [...state.scope, libId],
    queue: [...state.queue, ...fresh],
    finishedAt: fresh.length ? null : state.finishedAt
  }
}

/** 取消一个词库：队列里还没轮到它的词全部撤掉，答过的记录留着（沉淀要按它收词） */
export function removeLib(state: SprintState, libId: string): SprintState {
  if (!state.scope.includes(libId)) return state
  const queue = state.queue.filter((id) => libOf(id) !== libId)
  const done = queue.every((id) => state.items[id]?.mastered)
  return {
    ...state,
    scope: state.scope.filter((id) => id !== libId),
    queue,
    finishedAt: done ? state.finishedAt ?? new Date().toISOString() : null
  }
}

export interface SprintStats {
  total: number
  mastered: number
  pending: number
  right: number
  wrong: number
  accuracy: number
  spelling: number
  /** 本轮作用域里拼写关过关的词数（报告用） */
  spellDone: number
}

export function stats(state: SprintState): SprintStats {
  let mastered = 0
  let right = 0
  let wrong = 0
  let spelling = 0
  const ids = scopeIds(state)
  for (const id of ids) {
    const s = state.items[id]
    if (!s) continue
    right += s.right
    wrong += s.wrong
    if (s.mastered) mastered += 1
    if (s.stage === 'spell') spelling += 1
  }
  const asked = right + wrong
  return {
    total: ids.length,
    mastered,
    pending: ids.length - mastered,
    right,
    wrong,
    accuracy: asked ? Math.round((right / asked) * 100) : 0,
    spelling,
    spellDone: ids.filter((id) => WORD_BY_ID.get(id)?.section === 'words' && state.items[id]?.mastered).length
  }
}

/**
 * 只修存档里认不出的部分，绝不重开一局：
 * 加词库、删词库、词表换版之后，正在跑的这轮必须接着跑，
 * 否则一次内容更新就把玩家攒的掌握记录清空了。
 */
export function normalize(state: SprintState | null | undefined, best = 0): SprintState {
  if (!state || !Array.isArray(state.queue) || !state.items || !state.game?.board) return initSprint(ALL_LIBS, best)
  const queue = state.queue.filter((id, i) => WORD_BY_ID.has(id) && state.queue.indexOf(id) === i)
  const isLib = (id: string) => LIBS.some((l) => l.id === id)
  const items: Record<string, ItemState> = {}
  for (const [id, s] of Object.entries(state.items)) {
    if (WORD_BY_ID.has(id) && s && typeof s === 'object') items[id] = { ...blank(), ...s }
  }
  // 老存档没有 scope 字段：按这一轮实际碰过的词反推词库。队列跑空的那一轮要退到已答记录里看，
  // 否则一轮练完之后作用域变成 0，报告就成了「本轮 0 词」。
  const saved = (Array.isArray(state.scope) ? state.scope : []).filter(isLib)
  const scope = saved.length ? saved : [...new Set((queue.length ? queue : Object.keys(items)).map(libOf))].filter(isLib)
  return {
    ...state,
    queue,
    items,
    scope,
    game: { ...state.game, best: state.game.best ?? best },
    startedAt: typeof state.startedAt === 'string' ? state.startedAt : new Date().toISOString()
  }
}
