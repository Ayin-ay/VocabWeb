import { ALL, LIBS, WORD_BY_ID } from './lexicon'
import { KEYS } from './store'

/**
 * 备份文件是整份学习数据的 JSON 快照，跨设备、跨浏览器搬运走它。
 *
 * 词库指纹必须一起写进去：进度全按词条 id 存，词表重新解析过、序号挪了位的话，
 * 旧文件直接覆盖会把进度静默安到别的单词上。但加一个新词库不该让老备份作废，
 * 所以指纹不合只是先细查，真正拦下来的是这两条：
 *   1. 备份里出现了当前词库没有的词条 —— 位置对不上，硬拒；
 *   2. 某个词库自己的指纹变了（序号挪过）—— 要玩家点一次确认才收。
 */

/** FNV-1a：只用来认词库版本，不承担安全职责 */
function fnv(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

const libKey = (ids: string[]) => fnv(ids.join('\u0001'))

export function lexiconFingerprint(): string {
  return libKey(ALL.map((w) => w.id))
}

/** 逐库指纹：整库指纹变了时，用它分辨到底是哪个词库动过 */
export function libFingerprints(): Record<string, string> {
  return Object.fromEntries(LIBS.map((l) => [l.id, libKey(l.ids)]))
}

export function wrapBackup(data: Record<string, unknown>): string {
  return JSON.stringify({ ...data, k: lexiconFingerprint(), libs: libFingerprints() }, null, 2)
}

/** 词库 id 长什么样就照什么样扫：备份里凡是长成 id 形状的字符串都要能落到当前词库上 */
const ENTRY_ID = /^[A-Za-z0-9]+-(words|phrases|names|extra)-\d+$/

function collectIds(node: unknown, out = new Set<string>()): Set<string> {
  if (typeof node === 'string') {
    if (ENTRY_ID.test(node)) out.add(node)
  } else if (Array.isArray(node)) {
    for (const v of node) collectIds(v, out)
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (ENTRY_ID.test(key)) out.add(key)
      collectIds(value, out)
    }
  }
  return out
}

/** 词库换过版但不确定是不是挪了位：界面拿这个 code 弹一次确认 */
export class DriftError extends Error {
  readonly drifted = true

  constructor(tip: string) {
    super(tip)
  }
}

/** 校验并原样返回，不合格就抛错，让界面能把原因说清楚 */
export function unwrapBackup(text: string, force = false): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('这份文件读不出来，不是备份文件')
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('这份文件读不出来，不是备份文件')
  const p = parsed as Record<string, unknown>
  if (typeof p.k !== 'string') throw new Error('这份文件里没有词库指纹，不是「导出全部进度」生成的')
  if (!Object.keys(KEYS).some((name) => name !== 'llm' && p[name] !== undefined)) {
    throw new Error('备份里没有任何可恢复的学习数据')
  }

  if (p.k !== lexiconFingerprint()) {
    const unknown = [...collectIds(p)].filter((id) => !WORD_BY_ID.has(id))
    if (unknown.length) {
      throw new Error(`这份备份里有 ${unknown.length} 个词条在当前 ${ALL.length} 条里找不到，导入会错位`)
    }
    if (!force) {
      const saved = (p.libs && typeof p.libs === 'object' ? p.libs : {}) as Record<string, unknown>
      const now = libFingerprints()
      const moved = LIBS.filter((l) => typeof saved[l.id] === 'string' && saved[l.id] !== now[l.id]).map((l) => l.label)
      throw new DriftError(
        moved.length
          ? `词库里的「${moved.join('、')}」跟这份备份不是同一版，确认按词条序号对得上再导入`
          : '词库比这份备份新，确认序号没挪过位再导入'
      )
    }
  }
  return p
}
