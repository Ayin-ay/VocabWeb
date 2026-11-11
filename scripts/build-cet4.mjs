/**
 * 四级大纲词表（CET4_edited.txt）→ scripts/cet4_raw.txt
 *
 * 用法：node scripts/build-cet4.mjs [源文件]
 * 源在 GitHub mahavivo/english-wordlists，一行一条「单词 [音标] 词性.释义」，按字母排。
 *
 * 四级整体当一个可选词库（单元号 CET4），不再切假单元：教材那 8 个单元是他拍照分批传进来的，
 * 分组以他那侧为准。
 *
 * 清洗掉的源表毛病：音标里夹 PDF 私用区乱码、音标后漏空格（lightning]n.）、
 * 词性漏句号（prep 在…之中）、拼错的词性（ini.）、词性前的括注（(缩作 OK)）、
 * 词头括注变体（systematic(al) / toward(s)）、同形重复词头（合并释义）。
 * a.m / B.C. / i.e. 这类靠点号构成的条目页面键盘敲不出来，直接不收。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = resolve(ROOT, process.argv[2] || 'out/CET4_edited.txt')

/** 音标里混进的 PDF 私用区乱码 */
const PUA = /[\uE000-\uF8FF]/g
const BRACKET = /[（(）)]/g
const POS_TOKENS = ['modal v', 'abbr', 'prep', 'conj', 'pron', 'aux', 'art', 'adv', 'adj', 'num', 'int', 'vt', 'vi', 'ad', 'a', 'n', 'v']
const POS_START = new RegExp(`^(${POS_TOKENS.join('|')})\\.?`, 'i')

/** 把 vt.&vi.&n. / aux.v. / prep 在…之中 这类串拆成去重后的词性列表 */
function readPos(input) {
  const notes = []
  let rest = input.replace(/^[,，]\s*/, '').replace(/^ini\./, 'int.')
  // 词性前面夹着括注：(缩作 OK)；只有摘掉它之后紧跟词性才摘，否则它是释义的一部分
  for (;;) {
    const p = rest.match(/^[（(][^）)]*[）)]\s*/)
    if (!p || !POS_START.test(rest.slice(p[0].length))) break
    notes.push(p[0].replace(BRACKET, '').trim())
    rest = rest.slice(p[0].length)
  }
  const found = []
  for (;;) {
    const m = rest.match(POS_START)
    if (!m) break
    if (!found.includes(m[1].toLowerCase())) found.push(m[1].toLowerCase())
    rest = rest.slice(m[0].length).replace(/^(?:\s*(?:&|\/|\.)\s*)/, '')
  }
  return { pos: found.map((p) => `${p}.`).join(' & '), zh: `${rest.trim()}${notes.length ? `（${notes.join('，')}）` : ''}` }
}

const raw = readFileSync(SRC, 'utf8').replace(/^\uFEFF/, '')
const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

const entries = new Map()
const odd = []
for (const line of lines) {
  if (/^[A-Z]$/.test(line) || /^(大学英语|\(共)/.test(line)) continue
  const s = line
    .replace(PUA, '')
    .replace(/[[［][^\]］]*[\]］]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^oˈclock/i, "o'clock")
  const sp = s.indexOf(' ')
  let head = sp === -1 ? s : s.slice(0, sp)
  const rest = sp === -1 ? '' : s.slice(sp + 1).trim()

  // 词头里的括注变体：systematic(al)、toward(s)
  const variant = head.match(/^(.*?)[（(]([a-z]+)[）)]$/)
  const note = variant ? `（亦作 ${variant[1]}${variant[2]}）` : ''
  if (variant) head = variant[1]
  if (!/^[A-Za-z][A-Za-z'.\- ]*$/.test(head)) odd.push(`词头可疑：${line}`)

  const { pos, zh } = readPos(rest)
  if (!zh) odd.push(`没有释义：${line}`)

  const key = head.toLowerCase()
  const prev = entries.get(key)
  if (prev) {
    const posAll = [...new Set([...prev.pos.split(' & '), ...pos.split(' & ')].filter(Boolean))].join(' & ')
    const zhAll = [...new Set([prev.zh, `${zh}${note}`].filter(Boolean))].join('；')
    entries.set(key, { head: prev.head, pos: posAll, zh: zhAll })
  } else {
    entries.set(key, { head, pos, zh: `${zh}${note}` })
  }
}

// 缩写行没有词性也没有正规词头（a.m / B.C. / i.e.），拼写关卡打不出点号，直接不收
const ABBR = ['a.m', 'p.m', 'b.c.', 'a.d.', 'i.e.']
const dropped = [...entries.values()].filter((e) => ABBR.includes(e.head.toLowerCase()) || !e.pos)
const kept = [...entries.values()].filter((e) => !ABBR.includes(e.head.toLowerCase()) && e.pos)
const isName = (e) => /^[A-Z]/.test(e.head)
const words = kept.filter((e) => !isName(e))
const names = kept.filter(isName)

const out = ['CET4', '一、单词(New Words)']
words.forEach((e, i) => out.push(`${i + 1}. ${e.head} ${e.pos} ${e.zh}`.trim()))
if (names.length) {
  out.push('二、专有名词(Proper names)')
  names.forEach((e, i) => out.push(`${i + 1}. ${e.head} ${e.pos} ${e.zh}`.trim()))
}

writeFileSync(resolve(ROOT, 'scripts/cet4_raw.txt'), out.join('\n') + '\n', 'utf8')
console.log(`源 ${lines.length} 行 → 去重 ${entries.size} 条 = 单词 ${words.length} + 专名 ${names.length}（丢掉 ${dropped.map((d) => d.head).join(' ')}）`)
if (odd.length) console.log(`可疑 ${odd.length}:\n${odd.slice(0, 20).join('\n')}`)
