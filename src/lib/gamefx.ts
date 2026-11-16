import { maxValue } from './game2048'
import type { MoveResult } from './game2048'

/**
 * 动效的判定层：把「这一步发生了什么」算成一个可以驱动 CSS 与音效的结果。
 * 全是纯函数、不进存档，所以刷新页面只会丢掉连击计数，盘面与已答记录一个字节都不动。
 */

/** 合成到多少以上才算里程碑（2048 之后的 4096 一样算） */
export const MILESTONE_MIN = 128
/** C1：一次滑动合并到几对算连击 */
export const COMBO_MERGES = 2
/** C3：连续多少步都发生合并算连击 */
export const COMBO_STREAK = 3

export interface GameFx {
  /** 每发生一次就 +1，用来让动画重新起播（元素按它换 key） */
  seq: number
  /** 这一步新合成出来的格子下标（A1 弹一下） */
  pop: number[]
  /** 补的新数字落在哪一格（A2 淡入），满盘时 null */
  spawn: number | null
  /** 这一步合并了几对 */
  combo: number
  /** 连续发生合并的步数 */
  streak: number
  /** 这一步第一次摸到的大数（A4），没有就 null */
  milestone: number | null
  gained: number
  /** 这次是满格警示（整盘泛红抖一下） */
  warned: boolean
}

export interface FxMemory {
  seq: number
  streak: number
  /** 这一轮已经摸过的最大值，里程碑只报第一次 */
  seenMax: number
}

export const emptyFx = (): FxMemory => ({ seq: 0, streak: 0, seenMax: 0 })

/** 读档时按当前盘面初始化，免得一进页面就把盘上的 256 当成刚合成的里程碑重播一遍 */
export const fxMemory = (board: number[]): FxMemory => ({ ...emptyFx(), seenMax: maxValue(board) })

export function fxMove(mem: FxMemory, r: MoveResult): { fx: GameFx; mem: FxMemory } {
  const combo = r.fx.merged.length
  const streak = combo ? mem.streak + 1 : 0
  const milestone = r.fx.merged.map((m) => m.value).filter((v) => v >= MILESTONE_MIN && v > mem.seenMax).sort((a, b) => b - a)[0] ?? null
  const seq = mem.seq + 1
  return {
    fx: { seq, pop: r.fx.merged.map((m) => m.at), spawn: r.fx.spawnAt, combo, streak, milestone, gained: r.gained, warned: false },
    mem: { seq, streak, seenMax: Math.max(mem.seenMax, maxValue(r.state.board)) }
  }
}

/** 答错那一下：只可能落一个新数字或记一次警示，不动连击计数 */
export function fxPenalty(mem: FxMemory, spawned: number | null, warned: boolean): { fx: GameFx; mem: FxMemory } {
  const seq = mem.seq + 1
  return {
    fx: { seq, pop: [], spawn: spawned, combo: 0, streak: mem.streak, milestone: null, gained: 0, warned },
    mem: { ...mem, seq }
  }
}
