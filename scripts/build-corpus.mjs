import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 合并 scripts/corpus_src/B2U*.json -> src/data/composition.json
 * 源文件是作文语料卡片的唯一真相，改内容改源文件，不要直接改产物。
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, 'corpus_src')
const OUT = join(HERE, '..', 'src', 'data', 'composition.json')

const UNITS = ['B2U1', 'B2U2', 'B2U3', 'B2U4']
const CATS = [
  { cat: 'word', prefix: 'w', want: 18 },
  { cat: 'term', prefix: 't', want: 12 },
  { cat: 'phrase', prefix: 'p', want: 14 },
  { cat: 'advanced', prefix: 'a', want: 12 },
  { cat: 'sentence', prefix: 's', want: 12 }
]

const CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/
const NON_ASCII = /[^\x20-\x7e]/
const POS = /(?:^|[\s(](?:\u4e00-\u9fff]))((?:n|v|vt|vi|a|ad|adj|adv|prep|conj|pron|num|int|aux|abbr)\.)/i

const problems = []
const p = (msg) => problems.push(msg)

const seenEn = new Map()
const units = []

for (const uid of UNITS) {
  let raw
  try {
    raw = readFileSync(join(SRC, `${uid}.json`), 'utf8')
  } catch {
    p(`${uid}: missing source ${join(SRC, `${uid}.json`)}`)
    continue
  }
  if (raw.charCodeAt(0) === 0xfeff) p(`${uid}: source has a BOM`)

  let data
  try {
    data = JSON.parse(raw)
  } catch (err) {
    p(`${uid}: JSON parse failed: ${err.message}`)
    continue
  }

  if (data.unit !== uid) p(`${uid}: unit field is ${JSON.stringify(data.unit)}`)
  if (typeof data.theme !== 'string' || !data.theme.trim()) p(`${uid}: no theme`)
  if (!Array.isArray(data.cards)) {
    p(`${uid}: cards is not an array`)
    continue
  }

  const ids = new Set()
  const byCat = new Map(CATS.map((c) => [c.cat, []]))
  const cards = []

  for (const c of data.cards) {
    const spec = CATS.find((x) => x.cat === c.cat)
    if (!spec) {
      p(`${uid}/${c.id}: unknown category ${JSON.stringify(c.cat)}`)
      continue
    }
    if (typeof c.id !== 'string' || !c.id.startsWith(`${uid}-${spec.prefix}`)) {
      p(`${uid}/${c.id}: id does not match the ${spec.prefix} prefix`)
      continue
    }
    if (ids.has(c.id)) p(`${uid}: duplicate id ${c.id}`)
    ids.add(c.id)
    byCat.get(spec.cat).push(c.id)

    const seq = Number(c.id.slice(`${uid}-${spec.prefix}`.length))
    if (!Number.isInteger(seq) || seq < 1 || seq > 99) p(`${uid}/${c.id}: bad sequence number`)

    const zh = typeof c.zh === 'string' ? c.zh.trim() : ''
    const en = typeof c.en === 'string' ? c.en.trim() : ''
    const max = c.cat === 'sentence' ? 60 : 40

    if (!zh || !CJK.test(zh)) p(`${uid}/${c.id}: zh is not Chinese`)
    else if (zh.length > max) p(`${uid}/${c.id}: zh is ${zh.length} chars, over ${max}`)

    if (!en) p(`${uid}/${c.id}: empty en`)
    else if (NON_ASCII.test(en)) p(`${uid}/${c.id}: en has non-ASCII: ${en}`)
    else if (POS.test(en)) p(`${uid}/${c.id}: en still carries a part-of-speech tag: ${en}`)
    else if (/[\u00b7\u30fb]/.test(en)) p(`${uid}/${c.id}: en has a middle dot: ${en}`)

    if (c.cat === 'sentence') {
      if (c.eg) p(`${uid}/${c.id}: sentence cards must not carry eg`)
      if (en && !/[.!?]["']?$/.test(en)) p(`${uid}/${c.id}: sentence does not end with punctuation: ${en}`)
    } else if (c.cat !== 'advanced' && !(typeof c.eg === 'string' && c.eg.trim())) {
      p(`${uid}/${c.id}: ${c.cat} card carries no example sentence`)
    }

    const key = en.toLowerCase()
    const prev = seenEn.get(key)
    if (prev) p(`${uid}/${c.id}: en duplicates ${prev}: ${en}`)
    seenEn.set(key, uid)

    cards.push({
      id: c.id,
      cat: c.cat,
      zh,
      en,
      ...(typeof c.use === 'string' && c.use.trim() ? { use: c.use.trim() } : {}),
      ...(typeof c.eg === 'string' && c.eg.trim() ? { eg: c.eg.trim() } : {})
    })
  }

  for (const spec of CATS) {
    const got = byCat.get(spec.cat)
    if (got.length !== spec.want) p(`${uid}: ${spec.cat} has ${got.length} cards, expected ${spec.want}`)
    const want = Array.from({ length: spec.want }, (_, i) => `${uid}-${spec.prefix}${String(i + 1).padStart(2, '0')}`)
    const missing = want.filter((id) => !got.includes(id))
    if (missing.length) p(`${uid}: ${spec.cat} missing ids ${missing.join(', ')}`)
    const extra = got.filter((id) => !want.includes(id))
    if (extra.length) p(`${uid}: ${spec.cat} unexpected ids ${extra.join(', ')}`)
  }

  const order = (cat) => CATS.findIndex((c) => c.cat === cat)
  cards.sort((x, y) => order(x.cat) - order(y.cat) || x.id.localeCompare(y.id))
  units.push({ id: uid, label: `\u7b2c2\u518c Unit ${uid.slice(3)}`, theme: data.theme.trim(), cards })
}

if (problems.length) {
  console.log(`FAIL ${problems.length} problems`)
  console.log(problems.slice(0, 40).join('\n'))
  process.exitCode = 1
} else {
  const total = units.reduce((n, u) => n + u.cards.length, 0)
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify({ units, total }, null, 2) + '\n', 'utf8')
  const sha = createHash('md5').update(JSON.stringify({ units, total })).digest('hex').slice(0, 8)
  console.log(`corpus units=${units.length} cards=${total} md5=${sha}`)
  for (const u of units) console.log(`  ${u.id} ${u.theme}: ${u.cards.length}`)
}
