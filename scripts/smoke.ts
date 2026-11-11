import { ALL, COUNT, LIBS, SHARED_COUNT, WORD_BY_ID, libOf, libsOf, wordsOf } from '../src/lib/lexicon'
import { generate } from '../src/lib/quiz'
import type { QuizKind } from '../src/lib/quiz'
import { emptyBoard, hasMoves, move, newGame, spawn } from '../src/lib/game2048'
import { FRONT, addLib, answer, front, initSprint, normalize, removeLib, scopeIds, stats } from '../src/lib/sprint'
import type { ItemState, SprintState } from '../src/lib/sprint'
import { DriftError, lexiconFingerprint, libFingerprints, unwrapBackup, wrapBackup } from '../src/lib/backup'
import { answer as depositAnswer, newDeposit, normalize as normalizeDeposit, requeue, rosterOf, stats as depositStats } from '../src/lib/deposit'
import { CAT_ORDER, CORPUS_TOTAL, CORPUS_UNITS, cardsOf, unitOfCard } from '../src/lib/composition'
import { KEYS } from '../src/lib/store'
import { inApp, isNewer, siteVersion } from '../src/lib/appshell'
import { backConsumed, registerBack } from '../src/lib/backstack'
import { INTERVALS, grade, isWrong, newCard, partition, reviewQueue, today, unitStats } from '../src/lib/srs'
import type { CardState } from '../src/lib/types'

const fails: string[] = []
const ok = (cond: boolean, msg: string) => {
  if (!cond) fails.push(msg)
}

// 教材八单元是拍照录进来的基准，条数一动就说明解析出过问题；四级这类新词库只要求成库
const TEXTBOOK = ALL.filter((w) => w.unitId !== 'CET4')
ok(TEXTBOOK.length === 679, `拍照录入的教材词条 ${TEXTBOOK.length} 条，应为 679`)
ok(COUNT.total === ALL.length && COUNT.units === LIBS.length, '词条总数或词库数与词表不一致')
ok(new Set(ALL.map((w) => w.id)).size === ALL.length, '存在重复 id')
ok(ALL.every((w) => w.en && w.zh), '有空字段')

const KINDS: QuizKind[] = ['en2cn', 'cn2en', 'spelling', 'dictation', 'matching']
const progress: Record<string, CardState> = {}

for (const kind of KINDS) {
  for (const unit of ['B1U1', 'B1U3', 'B2U2', 'B2U4']) {
    for (let round = 0; round < 40; round += 1) {
      const qs = generate(wordsOf(unit), { kinds: [kind], count: 10, all: ALL, progress: round % 2 ? progress : undefined })
      ok(qs.length > 0, `${unit}/${kind} 出不了题`)
      for (const q of qs) {
        ok(q.ids.every((id) => WORD_BY_ID.has(id)), `${kind} 出了库外的 id`)
        if (q.options) {
          ok(new Set(q.options).size === q.options.length, `${kind} 选项重复`)
          ok(q.options.length >= 2 && q.options.length <= 4, `${kind} 选项数 ${q.options.length}`)
          ok(q.options.includes(q.answer ?? ''), `${kind} 正确项不在选项里`)
          ok(q.options.every((o) => o && o !== q.prompt), `${kind} 干扰项与题干同文`)
        }
        if (q.kind === 'spelling' || q.kind === 'dictation') {
          ok(WORD_BY_ID.get(q.ids[0]!)?.section !== 'names', '专有名词进了拼写/听写题')
          ok(Boolean(q.audio), '拼写题没有朗读文本')
        }
        if (q.kind === 'matching') {
          ok((q.pairs?.length ?? 0) >= 3, `配对题只有 ${q.pairs?.length} 组`)
          ok(new Set(q.pairs?.map((p) => p.id)).size === q.pairs?.length, '配对题词条重复')
        }
      }
    }
  }
}

// ---- 词库切分与单词本归属 ----
const libIds = LIBS.flatMap((l) => l.ids)
ok(new Set(libIds).size === libIds.length && libIds.length === ALL.length, '词库必须把全库不重不漏地切一遍')
ok(ALL.every((w) => libOf(w.id) === w.unitId), `id 反查词库跟单元号对不上：${ALL.find((w) => libOf(w.id) !== w.unitId)?.id}`)
ok(LIBS.every((l) => l.ids.length > 0 && l.label), '有词库是空的或缺名字')
ok(wordsOf('CET4', 'words').length >= 4000, `四级单词只有 ${wordsOf('CET4', 'words').length} 条`)
ok(wordsOf('CET4', 'names').length >= 1, '四级专名要单独成节，跟教材一样走选择题')
// 四级单词和教材单词一样要能用页面内键盘敲出来（字母 / 撇号 / 连字符 / 空格，上限 40 字符）
const TYPABLE = /^[A-Za-z' -]{1,40}$/
const untypable = ALL.filter((w) => w.section === 'words' && !TYPABLE.test(w.en))
ok(untypable.length === 0, `拼写关卡敲不出来：${untypable.slice(0, 5).map((w) => w.id + ' ' + w.en).join(' | ')}`)

const sharedRows = ALL.filter((w) => libsOf(w).length > 1)
ok(SHARED_COUNT > 0 && sharedRows.length > 0, '教材单元与四级没有判出任何共有词，单词本的「共有」筛选会空')
const sharedProbe = sharedRows.find((w) => w.unitId === 'CET4') ?? sharedRows[0]!
ok(
  Boolean(sharedProbe) && libsOf(sharedProbe).includes(sharedProbe.unitId) && libsOf(sharedProbe).some((id) => id !== sharedProbe.unitId),
  '共有词必须在两边筛选里都查得到'
)
// 单词本按词形归库：一个词形被判成共有时，教材和四级各自那条都要带上两份归属
const formRows = new Map<string, number>()
for (const w of ALL) {
  const key = w.en.toLowerCase()
  formRows.set(key, (formRows.get(key) ?? 0) + 1)
}
ok(
  sharedRows.every((w) => (formRows.get(w.en.toLowerCase()) ?? 0) >= 2),
  '共有词形底下不足两条条目，归属算漏了'
)

// 只有拼写类题型时，纯专名池应出不了题而不是崩掉
ok(generate(wordsOf('B1U4', 'names'), { kinds: ['spelling'], count: 10, all: ALL }).length === 0, '纯专名池不该出拼写题')
ok(generate([], { kinds: ['en2cn'], count: 10, all: ALL }).length === 0, '空池应返回空题集')

// 间隔复习数学
let s = newCard()
const d0 = today()
s = grade(s, 'good')
ok(s.box === 1 && s.due === d0 + INTERVALS[1], `首答记得：box=${s.box} due=${s.due}`)
s = grade(s, 'again')
ok(s.box === 0 && s.lapses === 1 && s.streak === 0, `答错应归零并计一次 lapse：${JSON.stringify(s)}`)
ok(isWrong(s), 'lapses=1 且 streak=0 时必须在错题本')
s = grade(s, 'good')
s = grade(s, 'good')
ok(s.streak === 2 && !isWrong(s), `连续答对两次要移出错题本：${JSON.stringify(s)}`)
for (let i = 0; i < 10; i += 1) s = grade(s, 'good')
ok(s.box === INTERVALS.length - 1 && s.due <= d0 + INTERVALS[INTERVALS.length - 1] + 1, `档位封顶：${JSON.stringify(s)}`)

const p2: Record<string, CardState> = {}
for (const w of wordsOf('B1U1')) p2[w.id] = newCard()
p2['B1U1-words-1'] = { box: 3, due: today() - 1, known: false, lapses: 2, streak: 0, studiedAt: 'x' }
const parts = partition(wordsOf('B1U1'), p2)
ok(parts.wrong[0]?.id === 'B1U1-words-1', '错题必须进 wrong 组')
ok(reviewQueue(wordsOf('B1U1'), p2, 5)[0]?.id === 'B1U1-words-1', '复习队列首位应是错题')
ok(unitStats(wordsOf('B1U1'), p2).total === wordsOf('B1U1').length, '单元统计分母不对')

// ---- 2048 ----
const g0 = newGame(0)
ok(g0.board.filter((v) => v !== 0).length === 2, `新开局应有 2 个数字，实际 ${g0.board.filter((v) => v !== 0).length}`)
ok(g0.board.every((v) => v === 0 || v === 2 || v === 4), '新开局只该出现 2 和 4')
const seeded = spawn(emptyBoard(), () => 0)
ok(seeded.filter((v) => v === 2).length === 1, 'spawn 应落一个 2')
const row = [2, 2, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
const mv = move({ board: row, score: 0, best: 0, over: false }, 'left', () => 0.99)
ok(mv.moved && mv.state.board[0] === 4 && mv.state.board[1] === 4, `向左合并应得 4,4：${mv.state.board.slice(0, 4)}`)
ok(mv.gained === 4 && mv.state.score === 4, `合并得分应是 4，实际 ${mv.gained}`)
ok(mv.state.board.filter((v) => v !== 0).length === 3, '移动后应补一个新数字')
const stuck = move({ board: row, score: 0, best: 0, over: false }, 'left', () => 0)
ok(move({ board: [2, 4, 8, 16, 32, 64, 128, 256, 2, 4, 8, 16, 32, 64, 128, 256], score: 0, best: 0, over: false }, 'left').moved === false, '没有可合并的满盘不该移动')
ok(!hasMoves([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2]), '棋盘死局判定失败')
ok(stuck.moved, '对照：可移动的盘必须报 moved')

// ---- 冲刺队列 ----
/** 长局只跑两个单元：全库五千条在 node 里从头点一遍太慢，全库口径由下面两条单独钉住 */
const SCOPE = ['B1U1', 'B2U2']
const TOTAL = scopeIds({ scope: SCOPE }).length
ok(TOTAL > 100 && TOTAL < ALL.length, `作用域词条数 ${TOTAL} 不对劲`)

const freshAll = initSprint()
ok(freshAll.queue.length === ALL.length && new Set(freshAll.queue).size === ALL.length, `默认开局队列应装下全库 ${ALL.length} 条`)
ok(freshAll.scope.length === LIBS.length, '默认开局应把所有词库都选上')

const nonWordsNeverSpell = (items: Record<string, ItemState>) =>
  scopeIds({ scope: SCOPE }).every((id) => WORD_BY_ID.get(id)!.section === 'words' || items[id]?.stage !== 'spell')

// 全对：必须走到完成，且每个词都经过拼写关
let perfect = initSprint(SCOPE)
let guard = 0
while (!perfect.finishedAt && guard < 200000) {
  const w = front(perfect)!
  perfect = answer(perfect, w.id, true).state
  guard += 1
}
ok(Boolean(perfect.finishedAt), `全对局没走到完成（${guard} 步）`)
ok(stats(perfect).mastered === TOTAL, `全对局掌握数 ${stats(perfect).mastered}，应为 ${TOTAL}`)
ok(perfect.queue.length === TOTAL && new Set(perfect.queue).size === TOTAL, '全对局队列长度/去重被破坏')
ok(scopeIds(perfect).filter((id) => WORD_BY_ID.get(id)!.section === 'words').every((id) => perfect.items[id]?.right >= 2), '单词至少要被考两次（选择 + 拼写）')
ok(nonWordsNeverSpell(perfect.items), '词组或专名不该进拼写关')
ok(stats(perfect).spellDone === scopeIds(perfect).filter((id) => WORD_BY_ID.get(id)!.section === 'words').length, '报告里的拼写过关数应等于作用域内单词数')
ok(perfect.canMove, '答对后应拿到一步 2048')

// 全错：永远不完成，队列不丢条目，2048 被锁死
let wrongRun = initSprint(SCOPE)
const boardBefore = wrongRun.game.board.filter((v) => v !== 0).length
for (let i = 0; i < 500; i += 1) {
  const w = front(wrongRun)!
  const res = answer(wrongRun, w.id, false)
  wrongRun = res.state
  ok(!res.earnedMove, '答错不该给移动机会')
}
ok(!wrongRun.finishedAt, '全错局不该完成')
ok(stats(wrongRun).mastered === 0, '全错局不该有任何掌握')
ok(wrongRun.queue.length === TOTAL && new Set(wrongRun.queue).size === TOTAL, '全错局队列被破坏')
ok(!wrongRun.canMove, '答错后应禁止移动')
ok(wrongRun.game.board.filter((v) => v !== 0).length > boardBefore, '答错应生成新数字')

// 随机局：不变量始终成立
let random = initSprint(SCOPE)
for (let i = 0; i < 5000; i += 1) {
  const w = front(random)!
  random = answer(random, w.id, Math.random() < 0.7).state
  if (random.queue.length !== TOTAL || new Set(random.queue).size !== TOTAL) {
    fails.push(`随机局第 ${i} 步队列不合法`)
    break
  }
  if (!nonWordsNeverSpell(random.items)) {
    fails.push(`随机局第 ${i} 步有词组进了拼写关`)
    break
  }
}

// 拼错插前、拼对插尾
const seededRun = (() => {
  let st = initSprint(SCOPE)
  const target = ALL.find((w) => w.section === 'words')!
  st = { ...st, queue: [target.id, ...st.queue.filter((x) => x !== target.id)], items: { [target.id]: { stage: 'spell', mastered: false, streak: 0, right: 1, wrong: 0 } } }
  const afterWrong = answer(st, target.id, false).state
  const wrongIdx = afterWrong.queue.indexOf(target.id)
  const afterRight = answer({ ...afterWrong, queue: [target.id, ...afterWrong.queue.filter((x) => x !== target.id)], items: { ...afterWrong.items, [target.id]: { ...afterWrong.items[target.id]!, stage: 'spell' } } }, target.id, true).state
  return { wrongIdx, rightIdx: afterRight.queue.indexOf(target.id), len: afterRight.queue.length, mastered: afterRight.items[target.id]?.mastered }
})()
ok(seededRun.wrongIdx <= FRONT, `拼错应插到靠前位置，实际第 ${seededRun.wrongIdx} 位`)
ok(seededRun.rightIdx === seededRun.len - 1, `拼对应放到队尾，实际第 ${seededRun.rightIdx}/${seededRun.len}`)
ok(seededRun.mastered === true, '拼对应标记已掌握')

// 已掌握后再答错要撤销掌握
const revoke = (() => {
  const target = ALL.find((w) => w.section === 'words')!
  let st = initSprint(SCOPE)
  st = { ...st, queue: [target.id, ...st.queue.filter((x) => x !== target.id)], items: { [target.id]: { stage: 'spell', mastered: true, streak: 1, right: 2, wrong: 0 } } }
  return answer(st, target.id, false).state.items[target.id]?.mastered
})()
ok(revoke === false, '已掌握的词再答错必须撤销掌握')

// ---- 冲刺中途整库加减：当前这题不许被换掉，答过的记录不许丢 ----
const libOps = (() => {
  let st = initSprint(['B1U1'])
  for (let i = 0; i < 20; i += 1) st = answer(st, st.queue[0]!, i % 2 === 0).state
  const head = st.queue[0]!
  const answered = Object.keys(st.items).length
  const before = st.queue.join()
  const withCet = addLib(st, 'CET4')
  const tail = st.queue.length
  const dropped = removeLib(withCet, 'CET4')
  const emptyScope = removeLib(st, 'B1U1')
  return {
    headKept: withCet.queue[0] === head,
    appended: withCet.queue.slice(0, tail).join() === before,
    added: withCet.queue.length - tail,
    tailIsCet: withCet.queue.slice(tail).every((id) => libOf(id) === 'CET4'),
    scopeGrew: withCet.scope.join() === 'B1U1,CET4',
    restored: dropped.queue.join() === before,
    itemsKept: Object.keys(dropped.items).length === answered,
    scopeShrank: dropped.scope.join() === 'B1U1',
    statsScoped: stats(withCet).total === wordsOf('B1U1').length + wordsOf('CET4').length && stats(dropped).total === wordsOf('B1U1').length,
    clearedAll: emptyScope.queue.length === 0 && emptyScope.scope.length === 0
  }
})()
ok(libOps.headKept && libOps.appended && libOps.added > 0 && libOps.tailIsCet && libOps.scopeGrew, '添加词库要整批接在现有队列后面，不能动当前这题')
ok(libOps.restored && libOps.itemsKept && libOps.scopeShrank, '移除词库只撤掉还没轮到它的词，已答记录保留')
ok(libOps.statsScoped, '本轮总数的口径应当跟着选中的词库走')
ok(libOps.clearedAll, '把唯一选中的词库撤掉后队列应清空，而不是偷偷塞回全库')

// normalize 只修认不出的部分：一次词库更新绝不能把正在跑的这轮重开
ok(normalize(null).queue.length === ALL.length, '没有存档时该按全库开新一轮')
const truncated = normalize({ ...perfect, queue: perfect.queue.slice(0, 10) })
ok(
  truncated.queue.length === 10 && JSON.stringify(truncated.queue) === JSON.stringify(perfect.queue.slice(0, 10)),
  '存档被截断也只是截断，normalize 不许重排或补满队列'
)
const { scope: _legacyScope, ...legacyBase } = perfect
// 老存档没有 scope 字段：按这一轮实际碰过的词反推，跑空的那一轮要退到已答记录
const legacy = normalize({ ...legacyBase, queue: perfect.queue.slice(0, 10) } as SprintState)
ok(legacy.scope.length > 0 && legacy.scope.every((id) => SCOPE.includes(id)), `老存档应按队列反推出词库：${legacy.scope}`)
const legacyDone = normalize({ ...legacyBase, queue: [] } as SprintState)
ok(
  [...legacyDone.scope].sort().join() === [...SCOPE].sort().join() && stats(legacyDone).total === TOTAL,
  `跑空的一轮也要认得出原来选了哪些词库：${legacyDone.scope}`
)
const dirty = normalize({ ...perfect, queue: ['不存在-words-1', ...perfect.queue] } as unknown as SprintState)
ok(dirty.queue[0] === perfect.queue[0] && !dirty.queue.includes('不存在-words-1'), '库外 id 要剔掉，其余顺序不动')
ok(JSON.stringify(normalize(truncated).queue) === JSON.stringify(truncated.queue), 'normalize 反复跑要稳定')

// 词头里不许残留词性或间隔号，否则拼写关卡要敲进中文才能过
const HEAD_POS = /(?:^|[\s(（])(?:modal v|nan|abbr|prep|conj|pron|aux|adv|adj|num|int|vt|vi|a|ad|n|v)\./i
ok(ALL.every((w) => !HEAD_POS.test(w.en)), `词头残留词性：${ALL.filter((w) => HEAD_POS.test(w.en)).map((w) => w.id).join(',')}`)
ok(ALL.every((w) => !/[·・]/.test(w.en)), `词头残留间隔号：${ALL.filter((w) => /[·]/.test(w.en)).map((w) => w.id).join(',')}`)
ok(ALL.every((w) => w.section !== 'words' || w.pos), '有单词没有词性')

// 备份文件：指纹必须认，坏文件必须拒（放在沉淀数据齐了之后一起测）
const settings = { showZh: true, ttsRate: 0.9, voiceURI: 'Google US English' }

// 半程局跨教材单元与四级：备份与沉淀都要在混合词库下跑一遍
const midway = (() => {
  let st = initSprint([...SCOPE, 'CET4'], 7)
  for (let i = 0; i < 120; i += 1) st = answer(st, st.queue[0]!, i % 3 !== 0).state
  return st
})()
ok(Object.keys(midway.items).some((id) => libOf(id) === 'CET4'), '混合词库的半程局里一个四级词都没碰到')

// ---- 沉淀名单 ----
const missedIds = rosterOf(midway)
ok(missedIds.length > 0, '每三题错一次的半程局必然留下错过的词')
ok(missedIds.every((id) => (midway.items[id]?.wrong ?? 0) > 0), '名单里混进了没答错过的词')
ok(new Set(missedIds).size === missedIds.length, '名单里有重复条目')

// 单元素名单把「连对一次就出名单」的节奏钉死
const soloId = ALL.find((w) => w.section === 'words')!.id
const solo1 = newDeposit([soloId])
const solo2 = depositAnswer(solo1, soloId, false)
ok(solo2.queue[0] === soloId && solo2.items[soloId]!.wrong === 1, '答错要留在队首马上重考')
const solo3 = depositAnswer(solo2, soloId, true)
ok(solo3.queue.length === 0 && Boolean(solo3.finishedAt), '连对一次应移出并记完成')
ok(solo3.items[soloId]!.streak === 1 && solo3.items[soloId]!.right === 1, '移出后这条词的计数要留下')
const solo5 = requeue(solo3)
ok(solo5.round === 2 && solo5.queue.length === 1 && !solo5.finishedAt, '再练一轮要重新排队')
ok(solo5.items[soloId]!.streak === 0 && solo5.items[soloId]!.right === 1, '新一轮清连对、留累计')

// 整批全对：每个词恰好一题，队列必须练空
const firstPass = (() => {
  let d = newDeposit(missedIds)
  let steps = 0
  while (d.queue.length && steps < 20000) {
    d = depositAnswer(d, d.queue[0]!, true)
    steps += 1
  }
  return { d, steps }
})()
ok(firstPass.d.queue.length === 0, `全对应该把名单练空，还剩 ${firstPass.d.queue.length}`)
ok(firstPass.steps === missedIds.length, `全对局每词恰好一题，实际 ${firstPass.steps} / ${missedIds.length}`)
const fs = depositStats(firstPass.d)
ok(fs.done === missedIds.length && fs.pending === 0 && fs.total === missedIds.length, `沉淀统计口径不对：${JSON.stringify(fs)}`)

// 答错的词要插回靠前，且总题量随错误次数上升
const partial = (() => {
  let d = newDeposit(missedIds)
  for (let i = 0; i < 30; i += 1) d = depositAnswer(d, d.queue[0]!, i % 4 === 0)
  return d
})()
const ps = depositStats(partial)
ok(ps.right + ps.wrong === 30, `沉淀计数应等于出题数：${ps.right}+${ps.wrong}`)
ok(partial.queue.length + ps.done === partial.roster.length, '待过 + 已完成必须等于名单总数')
ok(partial.queue.every((id) => partial.roster.includes(id)), '沉淀队列跑出了名单')
ok(new Set(partial.queue).size === partial.queue.length, '沉淀队列出现重复')

const backup = wrapBackup({ sprint: midway, settings, deposit: partial })
const restored = unwrapBackup(backup)
ok(JSON.stringify(restored.sprint) === JSON.stringify(midway), '备份往返后冲刺进度变了样')
ok(JSON.stringify(restored.deposit) === JSON.stringify(partial), '备份往返后沉淀进度变了样')
ok(JSON.stringify(restored.settings) === JSON.stringify(settings), '备份往返后设置变了样')
ok((JSON.parse(backup) as { k: string }).k === lexiconFingerprint(), '备份里要带上当前词库指纹')

ok(normalizeDeposit(null) === null, '没名单时不该凭空造一份')
ok(normalizeDeposit({ roster: ['不存在'], queue: ['不存在'], items: {}, round: 1, startedAt: 'x', finishedAt: null }) === null, '库外名单应判空')
const repaired = normalizeDeposit({ roster: [missedIds[0]!, missedIds[1]!], queue: [], items: {}, round: 0, startedAt: 'x', finishedAt: 'y' })
ok(repaired?.queue.length === 2 && repaired.round === 1 && !repaired.finishedAt, '队列丢了要把没完成的重新排上')

// normalize 是每次渲染都跑的，绝不能换题，也绝不能把已经移出的词捞回来
const two = newDeposit([missedIds[0]!, missedIds[1]!])
const goneId = two.queue[0]!
const oneOut = depositAnswer(two, goneId, true)
ok(oneOut.queue.length === 1 && oneOut.queue[0] !== goneId, '移出后队列要少一个，且队首换成别的词')
ok(depositStats(oneOut).done === 1, '移出之后「已沉淀」计数要跟上')
const steady = normalizeDeposit(oneOut)
ok(steady?.queue.length === 1 && !steady?.queue.includes(goneId), 'normalize 把已沉淀的词又捞回队列了')
ok(JSON.stringify(steady?.queue) === JSON.stringify(oneOut.queue), 'normalize 重排了队列，等于换掉当前这道题')
ok(JSON.stringify(normalizeDeposit(steady)?.queue) === JSON.stringify(oneOut.queue), 'normalize 反复跑要稳定')
ok(normalizeDeposit(firstPass.d)?.queue.length === 0, '练空的名单 normalize 之后不该再冒出词')

const rejects: Array<[string, () => void]> = [
  ['不是备份文件', () => unwrapBackup('hello world')],
  ['空对象', () => unwrapBackup('{}')],
  ['被截断', () => unwrapBackup(backup.slice(0, backup.length - 20))],
  ['中间多出一个字符', () => unwrapBackup(backup.replace('{', '{,'))],
  ['词库换版', () => unwrapBackup(JSON.stringify({ ...(JSON.parse(backup) as object), k: 'zzzzzz' }))],
  ['有指纹但没学习数据', () => unwrapBackup(JSON.stringify({ k: lexiconFingerprint() }))],
  ['没有指纹的 AI 资料', () => unwrapBackup(JSON.stringify({ [ALL[0]!.id]: { eg: 'x', note: 'y' } }))]
]
for (const [label, fn] of rejects) {
  let threw = false
  try {
    fn()
  } catch {
    threw = true
  }
  ok(threw, `备份文件「${label}」应该被拒收`)
}

// 词库换版分两档：有认不出的词条就硬拒，只是版本不同则让玩家确认一次再收
ok(Object.keys(libFingerprints()).length === LIBS.length, '逐库指纹要一个词库一条')
const ghostId = 'B9U9-words-1'
const ghostBackup = JSON.stringify({ settings, ai: { [ghostId]: { eg: 'x' } }, k: 'stale', libs: libFingerprints() })
let ghostErr: unknown = null
try {
  unwrapBackup(ghostBackup)
} catch (e) {
  ghostErr = e
}
ok(
  ghostErr instanceof Error && !(ghostErr instanceof DriftError) && ghostErr.message.includes('1 个词条'),
  `备份里混进库外词条时必须硬拒，不许只是问一句：${ghostErr}`
)
const movedBackup = JSON.stringify({ ...(JSON.parse(backup) as object), k: 'stale', libs: { ...libFingerprints(), B1U1: 'old' } })
let drift: unknown = null
try {
  unwrapBackup(movedBackup)
} catch (e) {
  drift = e
}
ok(drift instanceof DriftError, '词条都认得、只是词库换过版：应是确认一次就能放行的 DriftError')
ok(
  drift instanceof DriftError && drift.message.includes('第1册 Unit 1'),
  `换版提示要点名是哪个词库动的：${drift instanceof Error ? drift.message : String(drift)}`
)
ok(unwrapBackup(movedBackup, true).settings !== undefined, '确认之后要原样收下这份备份')

// ---- App 壳：版本比较、返回键、桥缺失时的退化，以及存储 key 不许漂 ----
ok(siteVersion === 'dev' || /^\d+\.\d+\.\d+$/.test(siteVersion), `站点版本号不像版本号：${siteVersion}`)
ok(isNewer('1.10.0', '1.9.0') && !isNewer('1.0.1', '1.0.10'), '版本按点位比，不该按字符串比')
ok(!isNewer('1.0.0', '1.0.0') && !isNewer('1.0.0', '1.0.1'), '同版本或更旧都不该提醒有新包')
ok(isNewer('2', '1.9.9'), '缺位数的版本也要比得出来')
ok(inApp() === false, 'node 里没有 Capacitor 桥，inApp 必须为 false')

const order: string[] = []
const offA = registerBack(() => (order.push('a'), false))
const offB = registerBack(() => (order.push('b'), false))
backConsumed()
ok(order.join('') === 'ba', '返回键要先问最后注册的那个处理者')
offB()
order.length = 0
backConsumed()
ok(order.join('') === 'a', '注销掉的处理者不该再被调用')
offA()
order.length = 0
ok(!backConsumed(), '全部注销后返回键该交还给 App')

ok(
  JSON.stringify(KEYS) ===
    JSON.stringify({
      progress: 'vocab.progress.v1',
      settings: 'vocab.settings.v1',
      llm: 'vocab.llm.v1',
      ai: 'vocab.ai.v1',
      records: 'vocab.records.v1',
      sprint: 'vocab.sprint.v1',
      deposit: 'vocab.deposit.v1'
    }),
  `存储 key 漂了，旧存档会被当成空档：${JSON.stringify(KEYS)}`
)

// ---- 作文语料 ----
ok(CORPUS_UNITS.length === 4 && CORPUS_TOTAL === 272, `语料单元 ${CORPUS_UNITS.length} / 卡片 ${CORPUS_TOTAL}，应为 4 / 272`)
ok(CORPUS_UNITS.every((u) => u.cards.length === 68), '每个单元应有 68 张卡')
const corpusIds = CORPUS_UNITS.flatMap((u) => u.cards.map((c) => c.id))
ok(new Set(corpusIds).size === corpusIds.length, '语料卡片有重复 id')
ok(CORPUS_UNITS.every((u) => u.cards.every((c) => c.id.startsWith(u.id))), '卡片 id 对不上所在单元')
ok(CORPUS_UNITS.every((u) => u.theme && unitOfCard(u.cards[0]!.id) === u.id), '单元主题缺失或反查失败')

const CJK = /[\u4e00-\u9fff]/
const CARD_POS = /(?:^|[\s(])(?:abbr|prep|conj|pron|aux|adv|adj|int|vt|vi|a|ad|n|v)\./i
for (const c of CORPUS_UNITS.flatMap((u) => u.cards)) {
  ok(CJK.test(c.zh), `中文面不是中文：${c.id} ${c.zh}`)
  ok(c.en && !/[^\x20-\x7e]/.test(c.en), `英文面混进非 ASCII：${c.id} ${c.en}`)
  ok(!CARD_POS.test(c.en), `英文面带词性：${c.id} ${c.en}`)
  if (c.cat === 'sentence') ok(/[.!?]["']?$/.test(c.en) && !c.eg, `例句面不是一句话：${c.id} ${c.en}`)
}
ok(new Set(CORPUS_UNITS.flatMap((u) => u.cards.map((c) => c.en.toLowerCase()))).size === CORPUS_TOTAL, '语料里有同文卡片')

// 五类都在时按类分组排列，筛掉一类后剩下的顺序不乱
const full = cardsOf('B2U2', CAT_ORDER)
ok(full.length === 68, `全类筛选应得 68 张，实际 ${full.length}`)
const catSeq = full.map((c) => CAT_ORDER.indexOf(c.cat))
ok(catSeq.every((v, i) => i === 0 || v >= catSeq[i - 1]!), '语料列表没有按类聚拢')
const noSent = cardsOf('B2U2', CAT_ORDER.filter((c) => c !== 'sentence'))
ok(noSent.length === 56 && noSent.every((c) => c.cat !== 'sentence'), '筛掉例句类没生效')
ok(cardsOf('不存在', CAT_ORDER).length === 0, '库外单元应返回空列表')

console.log(fails.length ? `FAIL ${fails.length}\n${fails.slice(0, 12).join('\n')}` : `PASS 词条 ${ALL.length} · 词库 ${LIBS.length}（共有词形 ${SHARED_COUNT}）· 题型 ${KINDS.length} · 单元 ${new Set(ALL.map((w) => w.unitId)).size} · 冲刺全对 ${guard} 步完成 · 沉淀 ${missedIds.length} 词 ${firstPass.steps} 题 · 语料 ${CORPUS_UNITS.length} 单元 ${CORPUS_TOTAL} 卡 · 备份文件 ${(backup.length / 1024).toFixed(1)} KB`)
process.exitCode = fails.length ? 1 : 0
