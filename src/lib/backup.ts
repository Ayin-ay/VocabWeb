import { ALL } from './lexicon'
import { KEYS } from './store'

/**
 * 备份文件是整份学习数据的 JSON 快照，跨设备、跨浏览器搬运走它。
 * 词库指纹必须一起写进去：词表重新解析过、条目顺序变过的旧文件如果直接覆盖，
 * 进度会被静默安到别的单词上，所以落盘前先认这把指纹。
 */

/** FNV-1a：只用来认词库版本，不承担安全职责 */
export function lexiconFingerprint(): string {
  let h = 0x811c9dc5
  for (const w of ALL) {
    for (let i = 0; i < w.id.length; i += 1) {
      h ^= w.id.charCodeAt(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
  }
  return h.toString(36)
}

export function wrapBackup(data: Record<string, unknown>): string {
  return JSON.stringify({ ...data, k: lexiconFingerprint() }, null, 2)
}

/** 校验并原样返回，不合格就抛错，让界面能把原因说清楚 */
export function unwrapBackup(text: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('这份文件读不出来，不是备份文件')
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('这份文件读不出来，不是备份文件')
  const p = parsed as Record<string, unknown>
  if (typeof p.k !== 'string') throw new Error('这份文件里没有词库指纹，不是「导出全部进度」生成的')
  if (p.k !== lexiconFingerprint()) throw new Error(`词库已换版，这份备份对不上当前 ${ALL.length} 条`)
  if (!Object.keys(KEYS).some((name) => name !== 'llm' && p[name] !== undefined)) {
    throw new Error('备份里没有任何可恢复的学习数据')
  }
  return p
}
