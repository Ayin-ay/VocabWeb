import { ALL, WORD_BY_ID } from './lexicon'
import { hasMoves, newGame, spawn } from './game2048'
import type { GameState } from './game2048'
import type { Word } from './types'

/** 第一次遇见之后插到这个位置，第二次遇见（拼写）很快轮到，又不至于立刻重复 */
export const SECOND_WINDOW = 8
/** 拼错插回靠前的位置，马上再考一次 */
export const FRONT = 3
/** 词组与专有名词连对几次选择题算掌握 */
export const MASTERY_STREAK = 2

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
  game: GameState
  /** 答对换来的一步：true 时玩家可以选方向移动 2048 */
  canMove: boolean
  startedAt: string
  finishedAt: string | null
}

const blank = (): ItemState => ({ stage: 'choice', mastered: false, streak: 0, right: 0, wrong: 0 })

/** 只有「单词」这一节会进到拼写关；词组和专有名词始终看英文选中文 */
export const stageFor = (w: Word): ItemState['stage'] => (w.section === 'words' ? 'spell' : 'choice')

export function initSprint(best = 0): SprintState {
  const queue = ALL.map((w) => w.id)
  for (let i = queue.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = queue[i]!
    queue[i] = queue[j]!
    queue[j] = tmp
  }
  return { queue, items: {}, game: newGame(best), canMove: false, startedAt: new Date().toISOString(), finishedAt: null }
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
      queue,
      items,
      game: reward.game,
      canMove: reward.canMove,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt ?? (masteredAll ? new Date().toISOString() : null)
    },
    earnedMove: reward.canMove
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
}

export function stats(state: SprintState): SprintStats {
  let mastered = 0
  let right = 0
  let wrong = 0
  let spelling = 0
  for (const w of ALL) {
    const s = state.items[w.id]
    if (!s) continue
    right += s.right
    wrong += s.wrong
    if (s.mastered) mastered += 1
    if (s.stage === 'spell') spelling += 1
  }
  const asked = right + wrong
  return {
    total: ALL.length,
    mastered,
    pending: ALL.length - mastered,
    right,
    wrong,
    accuracy: asked ? Math.round((right / asked) * 100) : 0,
    spelling
  }
}

/** 词库或存档对不上（换过 lexicon、存档损坏）就重开一局，队列必须能遍历全库 */
export function normalize(state: SprintState | null | undefined, best = 0): SprintState {
  if (!state || !Array.isArray(state.queue) || !state.items || !state.game?.board) return initSprint(best)
  const ids = new Set(ALL.map((w) => w.id))
  const valid = state.queue.length === ids.size && state.queue.every((id) => ids.has(id)) && new Set(state.queue).size === ids.size
  return valid ? state : initSprint(state.game.best ?? best)
}
