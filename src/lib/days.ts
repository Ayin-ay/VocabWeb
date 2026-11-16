/**
 * 按天学习计数：冲刺与沉淀的每一次作答都往「今天」这一格上加一笔。
 * 存档里原本只有累计对错，没有任何时间戳，今日榜和本周榜只能从今天开始记。
 * 日界与周界一律按北京时间（UTC+8）算，跨设备才不会各说各话。
 */

/** 一格一天的计数 */
export interface DayRow {
  /** 作答次数，对错都算，冲刺与沉淀合在一起 */
  answered: number
  right: number
  wrong: number
  /** 当天净新增的「已掌握」：拼错撤销再拼对不会重复计一次 */
  mastered: number
  /** 当天从沉淀名单里通关移出的词数 */
  deposited: number
  /** 当天见过的最高那局 2048 分数 */
  best: number
}

export type Days = Record<string, DayRow>

export const CN_OFFSET_MS = 8 * 60 * 60 * 1000
/** 只留最近这些天：够了算本周，也够榜上做趋势，不让存档无限涨 */
export const KEEP_DAYS = 120

export const blankDay = (): DayRow => ({ answered: 0, right: 0, wrong: 0, mastered: 0, deposited: 0, best: 0 })

const pad = (n: number): string => String(n).padStart(2, '0')

const fmt = (ms: number): string => {
  const d = new Date(ms + CN_OFFSET_MS)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** 北京时间的日历日，键形如 2026-11-16 */
export const dayKey = (ts: number = Date.now()): string => fmt(ts)

/** 昼夜交界按北京时间判：夜里十一点半答题，别算成明天 */
export const nowKey = (): string => dayKey(Date.now())

const parse = (key: string): number => {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

/** 这一周周一的日期键：D1 口径，周一 00:00（北京时间）归零 */
export function weekStart(key: string): string {
  const ms = parse(key)
  const shift = (new Date(ms).getUTCDay() + 6) % 7
  return fmt(ms - shift * 86400000)
}

/** 本周已经走过的七天键（含今天，未来的那几天不算进来） */
export function weekKeys(key: string = nowKey()): string[] {
  const start = parse(weekStart(key))
  const today = parse(key)
  const out: string[] = []
  for (let i = 0; i < 7 && start + i * 86400000 <= today; i += 1) out.push(fmt(start + i * 86400000))
  return out
}

/** 一条事件落到某一天：计数相加，最高分取峰值 */
export function add(days: Days, key: string, d: Partial<DayRow>): Days {
  const cur = days[key] ?? blankDay()
  return {
    ...days,
    [key]: {
      answered: cur.answered + (d.answered ?? 0),
      right: cur.right + (d.right ?? 0),
      wrong: cur.wrong + (d.wrong ?? 0),
      mastered: cur.mastered + (d.mastered ?? 0),
      deposited: cur.deposited + (d.deposited ?? 0),
      best: Math.max(cur.best, d.best ?? 0),
    },
  }
}

export function sum(days: Days, keys: string[]): DayRow {
  return keys.reduce<DayRow>((acc, k) => {
    const r = days[k]
    if (!r) return acc
    return {
      answered: acc.answered + r.answered,
      right: acc.right + r.right,
      wrong: acc.wrong + r.wrong,
      mastered: acc.mastered + r.mastered,
      deposited: acc.deposited + r.deposited,
      best: Math.max(acc.best, r.best),
    }
  }, blankDay())
}

export const todayRow = (days: Days, key: string = nowKey()): DayRow => sum(days, [key])

/** 本周行：mastered/deposited 用 max(0, …) 兜一下，避免哪天撤销多了显示成负数 */
export function weekRow(days: Days, key: string = nowKey()): DayRow {
  const r = sum(days, weekKeys(key))
  return { ...r, mastered: Math.max(0, r.mastered), deposited: Math.max(0, r.deposited) }
}

export const accuracy = (r: DayRow): number => (r.answered ? Math.round((r.right / r.answered) * 100) : 0)

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/** 存储里的东西一律先验一遍再用：坏格丢掉，别让它把榜算成 NaN */
export function normalize(raw: unknown): Days {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const cutoff = fmt(Date.now() - KEEP_DAYS * 86400000)
  const out: Days = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || key < cutoff) continue
    const r = value as Partial<DayRow> | null
    if (!r || typeof r !== 'object') continue
    out[key] = {
      answered: isNum(r.answered) ? Math.max(0, Math.trunc(r.answered)) : 0,
      right: isNum(r.right) ? Math.max(0, Math.trunc(r.right)) : 0,
      wrong: isNum(r.wrong) ? Math.max(0, Math.trunc(r.wrong)) : 0,
      mastered: isNum(r.mastered) ? Math.trunc(r.mastered) : 0,
      deposited: isNum(r.deposited) ? Math.trunc(r.deposited) : 0,
      best: isNum(r.best) ? Math.max(0, Math.trunc(r.best)) : 0,
    }
  }
  return out
}
