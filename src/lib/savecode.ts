import { ALL } from './lexicon'
import type { DepositState } from './deposit'
import type { SprintState } from './sprint'
import type { Settings } from './types'

/**
 * 存档码：把冲刺进度压成一串文本，用户自己复制保存。
 * 浏览器清空站点数据（无痕、退出即清、微信内置浏览器）时，本地 localStorage 会整份消失，
 * 只有这串码能把进度带回来，所以词库指纹必须一起编码进去——
 * 词表重新解析过、条目顺序变过的旧码必须拒收，否则会静默地把进度安到别的单词上。
 */
export const MAGIC = 'VSW1.'

const IDX = new Map(ALL.map((w, i) => [w.id, i]))
const ID_BY_IDX = ALL.map((w) => w.id)

/** FNV-1a：只用来认词库版本，不承担安全职责 */
function lexiconFingerprint(): string {
  let h = 0x811c9dc5
  for (const w of ALL) {
    for (let i = 0; i < w.id.length; i += 1) {
      h ^= w.id.charCodeAt(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
  }
  return h.toString(36)
}

const b64encode = (text: string): string => {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

const b64decode = (code: string): string => {
  const bin = atob(code)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export interface SaveBundle {
  sprint: SprintState
  settings: Settings
  /** 旧存档码没有这一段，解出来就是 undefined，恢复时保持本机现状 */
  deposit?: DepositState
}

export function encodeSave(sprint: SprintState, settings: Settings, deposit?: DepositState | null): string {
  const payload = {
    v: 1,
    k: lexiconFingerprint(),
    n: ALL.length,
    q: sprint.queue.map((id) => IDX.get(id) ?? -1),
    i: Object.entries(sprint.items).map(([id, s]) => [
      IDX.get(id) ?? -1,
      s.stage === 'spell' ? 1 : 0,
      s.mastered ? 1 : 0,
      s.streak,
      s.right,
      s.wrong
    ]),
    b: sprint.game.board,
    c: sprint.game.score,
    e: sprint.game.best,
    o: sprint.game.over ? 1 : 0,
    m: sprint.canMove ? 1 : 0,
    s: sprint.startedAt,
    f: sprint.finishedAt,
    z: [settings.showZh ? 1 : 0, settings.ttsRate, settings.voiceURI],
    d: deposit
      ? {
          r: deposit.roster.map((id) => IDX.get(id) ?? -1),
          q: deposit.queue.map((id) => IDX.get(id) ?? -1),
          i: Object.entries(deposit.items).map(([id, s]) => [IDX.get(id) ?? -1, s.right, s.wrong, s.streak]),
          o: deposit.round,
          s: deposit.startedAt,
          f: deposit.finishedAt
        }
      : null
  }
  if (payload.q.includes(-1) || payload.i.some((r) => r[0] === -1)) {
    throw new Error('存档里有词库认不出的条目')
  }
  if (payload.d && (payload.d.r.includes(-1) || payload.d.q.includes(-1) || payload.d.i.some((r) => r[0] === -1))) {
    throw new Error('沉淀名单里有词库认不出的条目')
  }
  return MAGIC + b64encode(JSON.stringify(payload))
}

const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x)

/** 解析并校验；不合法就抛错，让界面能把原因说清楚 */
export function decodeSave(code: string): SaveBundle {
  const trimmed = code.trim().replace(/\s+/g, '')
  if (!trimmed.startsWith(MAGIC)) throw new Error('这不是词汇站的存档码')

  let parsed: unknown
  try {
    parsed = JSON.parse(b64decode(trimmed.slice(MAGIC.length)))
  } catch {
    throw new Error('存档码不完整或被打断')
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('存档码不完整或被打断')
  const p = parsed as Record<string, unknown>
  if (p.v !== 1) throw new Error('存档码版本不认识')
  if (p.k !== lexiconFingerprint()) throw new Error('词库已换版，这份存档码对不上当前 679 条')
  if (!Array.isArray(p.q) || p.q.length !== ALL.length) throw new Error('存档码里的队列长度不对')

  const seen = new Set<number>()
  const queue: string[] = []
  for (const x of p.q) {
    if (!isInt(x) || x < 0 || x >= ALL.length || seen.has(x)) throw new Error('存档码里的队列有重复或越界')
    seen.add(x)
    queue.push(ID_BY_IDX[x]!)
  }

  if (!Array.isArray(p.i)) throw new Error('存档码里没有条目状态')
  const items: SprintState['items'] = {}
  for (const row of p.i as unknown[]) {
    if (!Array.isArray(row) || row.length < 6 || !row.every(isInt)) throw new Error('存档码里的条目状态读不出')
    const [idx, stage, mastered, streak, right, wrong] = row as [number, number, number, number, number, number]
    if (idx < 0 || idx >= ALL.length || stage < 0 || stage > 1 || mastered < 0 || mastered > 1) {
      throw new Error('存档码里的条目状态越界')
    }
    items[ID_BY_IDX[idx]!] = {
      stage: stage === 1 ? 'spell' : 'choice',
      mastered: mastered === 1,
      streak: Math.max(0, streak),
      right: Math.max(0, right),
      wrong: Math.max(0, wrong)
    }
  }

  if (!Array.isArray(p.b) || p.b.length !== 16 || !p.b.every(isInt)) throw new Error('存档码里的棋盘不对')

  const sprint: SprintState = {
    queue,
    items,
    game: {
      board: [...p.b as number[]],
      score: isInt(p.c) ? p.c : 0,
      best: isInt(p.e) ? p.e : 0,
      over: p.o === 1
    },
    canMove: p.m === 1,
    startedAt: typeof p.s === 'string' ? p.s : new Date().toISOString(),
    finishedAt: typeof p.f === 'string' ? p.f : null
  }

  const z = Array.isArray(p.z) ? p.z : []
  const settings: Settings = {
    showZh: z[0] !== 0,
    ttsRate: typeof z[1] === 'number' && z[1] >= 0.5 && z[1] <= 1.4 ? z[1] : 0.9,
    voiceURI: typeof z[2] === 'string' ? z[2] : ''
  }

  // 这一段是后来加的，老码没有就跳过，不能因此把整份码判废
  let deposit: DepositState | undefined
  if (p.d && typeof p.d === 'object') {
    const d = p.d as Record<string, unknown>
    if (!Array.isArray(d.r) || !d.r.length || !Array.isArray(d.q) || !Array.isArray(d.i)) {
      throw new Error('存档码里的沉淀名单读不出')
    }
    const roster: string[] = []
    const seenR = new Set<number>()
    for (const x of d.r) {
      if (!isInt(x) || x < 0 || x >= ALL.length || seenR.has(x)) throw new Error('存档码里的沉淀名单越界或重复')
      seenR.add(x)
      roster.push(ID_BY_IDX[x]!)
    }
    const inRoster = new Set(roster)
    const seenQ = new Set<number>()
    const queue: string[] = []
    for (const x of d.q) {
      if (!isInt(x) || x < 0 || x >= ALL.length || !inRoster.has(ID_BY_IDX[x]!) || seenQ.has(x)) {
        throw new Error('存档码里的沉淀队列对不上名单')
      }
      seenQ.add(x)
      queue.push(ID_BY_IDX[x]!)
    }
    const items: Record<string, DepositState['items'][string]> = {}
    for (const row of d.i as unknown[]) {
      if (!Array.isArray(row) || row.length < 4 || !row.every(isInt)) throw new Error('存档码里的沉淀计数读不出')
      const [idx, right, wrong, streak] = row as [number, number, number, number]
      if (idx < 0 || idx >= ALL.length || !inRoster.has(ID_BY_IDX[idx]!)) throw new Error('存档码里的沉淀计数越界')
      items[ID_BY_IDX[idx]!] = { right: Math.max(0, right), wrong: Math.max(0, wrong), streak: Math.max(0, streak) }
    }
    deposit = {
      roster,
      queue,
      items,
      round: isInt(d.o) && d.o > 0 ? d.o : 1,
      startedAt: typeof d.s === 'string' ? d.s : new Date().toISOString(),
      finishedAt: typeof d.f === 'string' ? d.f : null
    }
  }

  return { sprint, settings, deposit }
}
