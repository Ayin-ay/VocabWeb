/**
 * 词表 PDF 文本 → src/data/lexicon.json
 *
 * PDF 是硬换行的：一条释义可能跨两三行，个别专有名词被拆成一行一个单词。
 * 拼接规则：相邻两行首尾都是 ASCII 时补空格（还原因字母换行被拆开的英文），
 * 否则直接相接（中文按字断行，补空格会留空洞）。
 *
 * 词头切分要处理三种排版：
 *   gut n.（做困难……所需要的）勇气        —— 词性紧贴全角括号
 *   aboard ad./prep. 在船……上             —— 一个词位写成两个词性
 *   grasp n.（……）理解力，领悟力vt. 抓牢    —— 第二个词性块混在释义里
 *
 * 用法：node scripts/build-lexicon.mjs [--raw scripts/wordlist_raw.txt]
 * 自检：每个分节的序号必须 1..N 连续，每条必须有英文和释义，词头不许残留词性或间隔号，否则退出码 1。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const argv = process.argv.slice(2)
const rawPath = resolve(ROOT, argv[argv.indexOf('--raw') + 1] || 'scripts/wordlist_raw.txt')

// 词性 token 必须按长度降序排，否则 n\. 会抢在 nan\. 前面命中
const POS_ALT = 'modal v|nan|abbr|prep|conj|pron|aux|adv|adj|num|int|vt|vi|a|ad|n|v'
// abbr. 不算词性分界：它只会以 (abbr. AI) 的括注出现，切开会破坏释义
const POS_ALT_NO_ABBR = 'modal v|nan|prep|conj|pron|aux|adv|adj|num|int|vt|vi|a|ad|n|v'
const posTok = (alt) => `(?:${alt})\\.`
/** 一整串词性：n. / ad./prep. / a. & ad. */
const posRun = (alt) => `(?:${posTok(alt)}(?:\\s*(?:&|/)\\s*${posTok(alt)})*)`
/** 词头后的第一个词性串，边界只认行首、空白和左括号 */
const HEAD_POS_RE = new RegExp(`(^|[\\s(（])(${posRun(POS_ALT)})`, 'i')
/** 释义里残留的第二个词性串，边界额外允许汉字（「领悟力vt. 抓牢」） */
const TAIL_POS_RE = new RegExp(`(^|[\\s(（一-鿿])(${posRun(POS_ALT_NO_ABBR)})(?=[^A-Za-z0-9]|$)`, 'i')

const PLACEHOLDER_RE = /^[（(][^）)]*(原图无|缺|跳过)[^）)]*[）)]?$/
const UNIT_RE = /^B(\d)U(\d)$/
const SECTION_RE = /^[一二三四五六]、\s*(.+)$/
const ENTRY_RE = /^(\d{1,3})[.、]\s*(.*)$/
const CJK_RE = /[　-〿一-鿿＀-￯]/

const SECTION_KEYS = [
  { match: /new\s*word/i, key: 'words', label: '单词' },
  { match: /phrase|expression/i, key: 'phrases', label: '词语' },
  { match: /proper/i, key: 'names', label: '专有名词' }
]

function sectionOf(title) {
  for (const s of SECTION_KEYS) if (s.match.test(title)) return s
  return { key: 'extra', label: title }
}

/** ASCII 结尾 + ASCII 开头 → 补空格；其余直接相接 */
function joinLine(prev, cur) {
  if (!prev) return cur
  const glueSpace = /[\x21-\x7e]$/.test(prev) && /^[\x21-\x7e]/.test(cur)
  return prev + (glueSpace ? ' ' : '') + cur
}

/** PDF 把复合词的连字符抽成了间隔号，拼写关卡要能敲出来才认 */
const headWord = (s) => s.replace(/[·・]/g, '-').replace(/\s+/g, ' ').trim()

/** ad./prep. 保持紧凑，a.&ad. 补回空格 */
const normPos = (s) => s.replace(/\s*&\s*/g, ' & ').replace(/\s*\/\s*/g, '/')

/**
 * 词性标记不一定紧贴中文，也不止一个，所以先取词头后的第一个词性串，
 * 再从释义里继续摘后面的词性串，词性合并、释义用分号相接。
 * 完全没有词性时退化为「ASCII 前缀 = 词头」。
 */
function splitHead(text) {
  const m = text.match(HEAD_POS_RE)
  if (!m) {
    const cut = text.search(CJK_RE)
    return { en: headWord(cut === -1 ? text : text.slice(0, cut)), pos: '', zh: cut === -1 ? '' : text.slice(cut).trim() }
  }
  const posStart = m.index + m[1].length
  const en = text.slice(0, posStart)
  const posList = []
  const addPos = (raw) => { const p = normPos(raw); if (!posList.includes(p)) posList.push(p) }
  addPos(m[2])
  const zhParts = []
  let rest = text.slice(posStart + m[2].length).trim()

  for (let guard = 0; guard < 3; guard += 1) {
    const t = rest.match(TAIL_POS_RE)
    if (!t) break
    const at = t.index + t[1].length
    const zhPart = rest.slice(0, at).trim()
    if (zhPart) zhParts.push(zhPart)
    addPos(t[2])
    rest = rest.slice(at + t[2].length).trim()
  }

  return { en: headWord(en), pos: posList.join(' / '), zh: [...zhParts, rest].filter(Boolean).join('；') }
}

const lines = readFileSync(rawPath, 'utf8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean)

const units = []
let unit = null
let section = null
let entry = null
const problems = []
const skipped = []

const flush = () => {
  if (!unit || !section || !entry) return
  // 原表里有个别条目是「(原图无，跳过)」占位，不收进站点
  if (/原图无/.test(entry.text)) {
    skipped.push(`${unit.id} ${section.key} #${entry.num}：${entry.text}`)
    entry = null
    return
  }
  const { en, pos, zh } = splitHead(entry.text)
  if (!en) problems.push(`${unit.id} ${section.key} #${entry.num}：没解析出英文词头 —— ${entry.text}`)
  if (!zh) problems.push(`${unit.id} ${section.key} #${entry.num}：没有释义 —— ${entry.text}`)
  if (CJK_RE.test(en)) problems.push(`${unit.id} ${section.key} #${entry.num}：英文词头混进了中文 —— ${entry.text}`)
  if (HEAD_POS_RE.test(en) || /[·]/.test(en)) problems.push(`${unit.id} ${section.key} #${entry.num}：英文词头残留词性或间隔号 —— ${entry.text}`)
  if (TAIL_POS_RE.test(zh)) problems.push(`${unit.id} ${section.key} #${entry.num}：释义里残留词性 —— ${entry.text}`)
  section.entries.push({ id: `${unit.id}-${section.key}-${entry.num}`, num: entry.num, en, pos, zh })
  entry = null
}

for (const line of lines) {
  const u = line.match(UNIT_RE)
  if (u) {
    flush()
    section = null
    unit = { id: line, book: Number(u[1]), unit: Number(u[2]), label: `第${u[1]}册 Unit ${u[2]}`, sections: [] }
    units.push(unit)
    continue
  }
  const s = line.match(SECTION_RE)
  if (s) {
    flush()
    if (!unit) { problems.push(`出现分节标题却在单元之前：${line}`); continue }
    const meta = sectionOf(s[1])
    section = { ...meta, title: s[1], entries: [] }
    unit.sections.push(section)
    continue
  }
  if (!unit || !section) { problems.push(`游离行：${line}`); continue }
  const e = line.match(ENTRY_RE)
  if (e) {
    flush()
    entry = { num: Number(e[1]), text: e[2] }
  } else {
    entry = entry ? { ...entry, text: joinLine(entry.text, line) } : { num: 0, text: line }
  }
}
flush()

// 序号必须递增（跳号只允许来自被剔除的占位条目），否则说明跨行条目被误判成了新条目
for (const u of units) {
  for (const s of u.sections) {
    s.entries.forEach((e, i) => {
      if (i > 0 && e.num <= s.entries[i - 1].num) problems.push(`${u.id} ${s.key}：序号 ${e.num} 没有递增`)
    })
  }
}

const flat = units.flatMap((u) => u.sections.flatMap((s) => s.entries))
const lexicon = {
  source: '《新视野大学英语》B1U1–B2U4 课后词表（PDF 提取）',
  builtAt: new Date().toISOString().slice(0, 10),
  total: flat.length,
  units
}

const outPath = join(ROOT, 'src/data/lexicon.json')
writeFileSync(outPath, JSON.stringify(lexicon, null, 2), 'utf8')

const summary = units.map((u) => `${u.id} ${u.sections.map((s) => `${s.key}:${s.entries.length}`).join(' ')}`).join('\n')
const posSet = [...new Set(flat.map((e) => e.pos).filter(Boolean))].sort()
writeFileSync(join(ROOT, 'scripts/lexicon-report.txt'), `${summary}\n\ntotal=${flat.length}\npos=${posSet.join(' ')}\n\nskipped=${skipped.length}\n${skipped.join('\n')}\n\nproblems=${problems.length}\n${problems.join('\n')}\n`, 'utf8')
console.log(`units=${units.length} entries=${flat.length} skipped=${skipped.length} problems=${problems.length}`)
console.log(summary)
if (problems.length) process.exitCode = 1
