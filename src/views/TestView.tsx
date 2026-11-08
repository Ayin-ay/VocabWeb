import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { UnitsPicker } from '../components/Bits'
import { ALL, WORD_BY_ID } from '../lib/lexicon'
import { KIND_LABELS, generate, sameSpelling, shuffle } from '../lib/quiz'
import type { QuizKind, Question } from '../lib/quiz'
import { isWrong, partition } from '../lib/srs'
import { speak, stopSpeak } from '../lib/tts'
import type { Word } from '../lib/types'
import type { App } from '../state'

interface Plan {
  units: string[]
  kinds: QuizKind[]
  count: number
  scope: 'all' | 'words' | 'words+phrases'
  source: 'normal' | 'exam' | 'wrong' | 'mastered'
}

const DEFAULT_PLAN: Plan = { units: ['B1U1'], kinds: ['en2cn'], count: 10, scope: 'all', source: 'normal' }

const KINDS: QuizKind[] = ['en2cn', 'cn2en', 'spelling', 'dictation', 'matching']
const SCOPES: { v: Plan['scope']; label: string }[] = [
  { v: 'all', label: '全部条目' },
  { v: 'words+phrases', label: '单词+词语' },
  { v: 'words', label: '仅单词' }
]
const SOURCES: { v: Plan['source']; label: string }[] = [
  { v: 'normal', label: '常规测' },
  { v: 'exam', label: '单元混合模考' },
  { v: 'wrong', label: '错题重练' },
  { v: 'mastered', label: '已掌握抽查' }
]

interface Result {
  id: string
  kind: QuizKind
  correct: boolean
  given: string
  answer: string
}

function pickPool(plan: Plan, progress: App['progress']): Word[] {
  const base = plan.units.length ? ALL.filter((w) => plan.units.includes(w.unitId)) : ALL
  const scoped = plan.scope === 'words' ? base.filter((w) => w.section === 'words') : plan.scope === 'words+phrases' ? base.filter((w) => w.section !== 'names') : base
  if (plan.source === 'mastered') return scoped.filter((w) => progress[w.id]?.known)
  if (plan.source === 'wrong') {
    const wrong = scoped.filter((w) => isWrong(progress[w.id]))
    return wrong.length ? wrong : scoped
  }
  return scoped
}

export function TestView({ app, plan, setPlan }: { app: App; plan: Plan; setPlan: (p: Plan) => void }) {
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [qi, setQi] = useState(0)
  const [answers, setAnswers] = useState<Result[][]>([])
  const [last, setLast] = useState<Result[]>([])
  const [phase, setPhase] = useState<'setup' | 'run' | 'result'>('setup')
  const pool = useMemo(() => pickPool(plan, app.progress), [plan, app.progress])
  const counts = partition(pool, app.progress)

  // 离开答题态就停掉还在播的听写音频
  useEffect(() => () => stopSpeak(), [phase])

  const start = () => {
    const kinds = plan.source === 'exam' ? KINDS.filter((k) => k !== 'dictation') : plan.kinds
    if (!kinds.length) return
    const qs = generate(pool, {
      kinds,
      count: plan.count,
      all: ALL,
      progress: plan.source === 'exam' || plan.source === 'wrong' ? app.progress : undefined
    })
    if (!qs.length) return
    setQuestions(qs)
    setQi(0)
    setAnswers([])
    setPhase('run')
  }

  const settle = (rows: Result[][]) => {
    const rs = rows.flat()
    app.addRecord({
      at: new Date().toISOString(),
      kind: plan.source === 'exam' ? '模考' : plan.source === 'wrong' ? '错题重练' : plan.source === 'mastered' ? '已掌握抽查' : plan.kinds.map((k) => KIND_LABELS[k]).join('+'),
      units: plan.units,
      total: rs.length,
      correct: rs.filter((r) => r.correct).length
    })
    setLast(rs)
    setPhase('result')
  }

  if (phase === 'result') {
    return (
      <div className="grid">
        <ResultPanel results={last} onBack={() => setPhase('setup')} />
      </div>
    )
  }

  if (phase === 'run' && questions) {
    const q = questions[Math.min(qi, questions.length - 1)]!
    const rows = answers[qi]
    const locked = Boolean(rows)
    const done = answers.filter(Boolean).length

    const commit = (rs: Result[]) => {
      setAnswers((prev) => {
        const next = prev.slice()
        next[qi] = rs
        return next
      })
      for (const r of rs) app.bump(r.id, r.correct ? 'good' : 'again')
    }

    const advance = () => {
      if (qi + 1 >= questions.length) settle(answers.slice(0, qi).concat([rows ?? []]))
      else setQi(qi + 1)
    }

    return (
      <div className="grid">
        <div className="row-between">
          <span className="muted mono">
            {qi + 1} / {questions.length} · 已答 {done} · 正确 {answers.flat().filter((r) => r.correct).length}
          </span>
          <button type="button" onClick={() => settle(answers.slice(0, qi).concat([rows ?? []]))}>
            交卷
          </button>
        </div>
        <div className="bar">
          <i style={{ width: `${(done / questions.length) * 100}%` }} />
        </div>
        {renderQuestion(q, locked, commit, advance, app)}
      </div>
    )
  }

  const wrongCount = pool.filter((w) => isWrong(app.progress[w.id])).length
  return (
    <div className="grid">
      <section className="panel">
        <h3>出题范围</h3>
        <UnitsPicker value={plan.units} onChange={(units) => setPlan({ ...plan, units })} />
        <div className="row" style={{ marginTop: 10 }}>
          {SCOPES.map((s) => (
            <button key={s.v} type="button" className="chip" data-on={plan.scope === s.v ? '1' : '0'} onClick={() => setPlan({ ...plan, scope: s.v })}>
              {s.label}
            </button>
          ))}
        </div>
        <p className="muted">
          当前范围 {pool.length} 条 · 错题 {wrongCount} 条 · 到期 {counts.due.length} 条
        </p>
      </section>

      <section className="panel">
        <h3>题型</h3>
        <div className="row">
          {KINDS.map((k) => (
            <button key={k} type="button" className="chip" data-on={plan.kinds.includes(k) ? '1' : '0'} onClick={() => setPlan({ ...plan, kinds: plan.kinds.includes(k) ? plan.kinds.filter((x) => x !== k) : [...plan.kinds, k] })}>
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          {SOURCES.map((s) => (
            <button key={s.v} type="button" className="chip" data-on={plan.source === s.v ? '1' : '0'} onClick={() => setPlan({ ...plan, source: s.v })}>
              {s.label}
            </button>
          ))}
          <div className="field">
            <label>题数</label>
            <select value={String(plan.count)} onChange={(e) => setPlan({ ...plan, count: Number(e.target.value) })}>
              {[10, 20, 30, 50, 80].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn-primary" onClick={start} disabled={!plan.kinds.length || !pool.length}>
            开始测试
          </button>
        </div>
        {!plan.kinds.length && <div className="notice" data-tone="warn" style={{ marginTop: 10 }}>至少选一种题型</div>}
      </section>

      <WrongBook app={app} onPractice={() => setPlan({ ...plan, source: 'wrong', units: [], scope: 'all', kinds: ['en2cn', 'cn2en'] })} />
      <PastRecords app={app} />
    </div>
  )
}

function renderQuestion(q: Question, locked: boolean, commit: (rs: Result[]) => void, next: () => void, app: App) {
  if (q.kind === 'matching') return <MatchQ q={q} locked={locked} commit={commit} next={next} />
  if (q.kind === 'spelling' || q.kind === 'dictation') return <SpellQ q={q} locked={locked} commit={commit} next={next} app={app} />
  return <ChoiceQ q={q} locked={locked} commit={commit} next={next} app={app} />
}

function Footer({ locked, next, verdict }: { locked: boolean; next: () => void; verdict: ReactNode }) {
  return (
    <div className="row">
      {verdict}
      {locked && (
        <button type="button" className="btn-primary" onClick={next}>
          下一题
        </button>
      )}
    </div>
  )
}

function ChoiceQ({ q, locked, commit, next, app }: { q: Question; locked: boolean; commit: (rs: Result[]) => void; next: () => void; app: App }) {
  const [given, setGiven] = useState<string | null>(null)
  const word = WORD_BY_ID.get(q.ids[0]!)
  const correct = given === q.answer

  useEffect(() => setGiven(null), [q])

  return (
    <article className="card">
      <div className="row-between">
        <span className="tag">{KIND_LABELS[q.kind]}</span>
        {q.audio && word && (
          <button type="button" onClick={() => speak(word.en, { rate: app.settings.ttsRate, voiceURI: app.settings.voiceURI })}>
            朗读题干
          </button>
        )}
      </div>
      <div className="en" style={{ fontSize: 24 }}>
        {q.prompt}
      </div>
      {q.hint && <div className="muted">{q.hint}</div>}
      <div style={{ marginTop: 8 }}>
        {(q.options ?? []).map((o) => (
          <button
            key={o}
            type="button"
            className="option"
            disabled={locked}
            data-state={locked ? (o === q.answer ? 'right' : o === given ? 'wrong' : undefined) : undefined}
            onClick={() => {
              setGiven(o)
              commit([{ id: q.ids[0]!, kind: q.kind, correct: o === q.answer, given: o, answer: q.answer! }])
            }}
          >
            {o}
          </button>
        ))}
      </div>
      <Footer
        locked={locked}
        next={next}
        verdict={locked ? <span className={correct ? 'tag' : 'tag'} data-tone={correct ? undefined : 'warn'}>{correct ? '答对' : `正确答案：${q.answer}`}</span> : null}
      />
    </article>
  )
}

function SpellQ({ q, locked, commit, next, app }: { q: Question; locked: boolean; commit: (rs: Result[]) => void; next: () => void; app: App }) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    setText('')
    if (q.kind === 'dictation') speak(q.audio ?? '', { rate: app.settings.ttsRate, voiceURI: app.settings.voiceURI })
    else inputRef.current?.focus()
  }, [q])
  const correct = sameSpelling(text, q.answer ?? '')

  return (
    <article className="card">
      <div className="row-between">
        <span className="tag">{KIND_LABELS[q.kind]}</span>
        {q.audio && (
          <button type="button" onClick={() => speak(q.audio!, { rate: app.settings.ttsRate, voiceURI: app.settings.voiceURI })}>
            再播放
          </button>
        )}
      </div>
      <div className="en" style={{ fontSize: q.kind === 'dictation' ? 20 : 22 }}>
        {q.kind === 'dictation' ? '听发音，写出完整拼写' : q.prompt}
      </div>
      {q.hint && <div className="muted">{q.hint}</div>}
      {locked ? (
        <div className="row">
          <span className="mono" style={{ fontSize: 18, color: correct ? 'var(--ok)' : 'var(--warn)' }}>{text || '（未作答）'}</span>
          {!correct && <span className="mono" style={{ fontSize: 18, color: 'var(--ok)' }}>{q.answer}</span>}
        </div>
      ) : (
        <div className="row">
          <input ref={inputRef} className="fill" value={text} placeholder={q.kind === 'dictation' ? '按听到的拼写输入' : '输入英文'} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && text) submit() }} />
          <button type="button" className="btn-primary" disabled={!text} onClick={submit}>
            提交
          </button>
        </div>
      )}
      <Footer locked={locked} next={next} verdict={locked ? <span className="tag" data-tone={correct ? undefined : 'warn'}>{correct ? '拼写正确' : '拼写有误'}</span> : null} />
    </article>
  )

  function submit() {
    const t = text.trim()
    if (!t) return
    commit([{ id: q.ids[0]!, kind: q.kind, correct: sameSpelling(t, q.answer ?? ''), given: t, answer: q.answer! }])
  }
}

function MatchQ({ q, locked, commit, next }: { q: Question; locked: boolean; commit: (rs: Result[]) => void; next: () => void }) {
  const pairs = q.pairs ?? []
  const rights = useMemo(() => shuffle(pairs.map((p) => ({ id: p.id, zh: p.zh }))), [q])
  const [left, setLeft] = useState<string | null>(null)
  const [done, setDone] = useState<Record<string, string>>({})
  useEffect(() => {
    setDone({})
    setLeft(null)
  }, [q])

  const used = new Set(Object.values(done))
  const finish = () => {
    commit(pairs.map((p) => ({ id: p.id, kind: 'matching' as QuizKind, correct: done[p.id] === p.id, given: pairs.find((x) => x.id === done[p.id])?.zh ?? '', answer: p.zh })))
  }

  return (
    <article className="card" style={{ minHeight: 160 }}>
      <div className="row-between">
        <span className="tag">{KIND_LABELS.matching}</span>
        <span className="muted">已配 {Object.keys(done).length}/{pairs.length}</span>
      </div>
      <div className="match-grid">
        <div className="grid" style={{ gap: 8 }}>
          {pairs.map((p) => (
            <button key={p.id} type="button" className="match-item" data-picked={left === p.id ? '1' : undefined} data-done={locked || done[p.id] ? '1' : undefined} disabled={locked || Boolean(done[p.id])} onClick={() => setLeft(p.id)}>
              {p.en}
            </button>
          ))}
        </div>
        <div className="grid" style={{ gap: 8 }}>
          {rights.map((r) => (
            <button
              key={r.id}
              type="button"
              className="match-item"
              data-done={locked || used.has(r.id) ? '1' : undefined}
              disabled={locked || used.has(r.id)}
              onClick={() => {
                if (!left) return
                setDone((d) => ({ ...d, [left]: r.id }))
                setLeft(null)
              }}
            >
              {r.zh}
            </button>
          ))}
        </div>
      </div>
      {locked && (
        <div className="grid" style={{ gap: 4, marginTop: 8 }}>
          {pairs.map((p) => (
            <div key={p.id} className="muted">
              {p.en} → {p.zh}
              {done[p.id] !== p.id ? `（你配：${pairs.find((x) => x.id === done[p.id])?.zh ?? '未配'}）` : ''}
            </div>
          ))}
        </div>
      )}
      <div className="row">
        {!locked ? (
          <button type="button" className="btn-primary" disabled={Object.keys(done).length < pairs.length} onClick={finish}>
            提交配对
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={next}>
            下一组
          </button>
        )}
      </div>
    </article>
  )
}

function ResultPanel({ results, onBack }: { results: Result[]; onBack: () => void }) {
  const correct = results.filter((r) => r.correct).length
  const percent = results.length ? Math.round((correct / results.length) * 100) : 0
  return (
    <section className="panel">
      <h3>成绩</h3>
      <div className="row">
        <span className="kpi">
          {correct}/{results.length}
          <small>{percent}%</small>
        </span>
        <button type="button" className="btn-primary" onClick={onBack}>
          返回设置
        </button>
      </div>
      <table style={{ marginTop: 10 }}>
        <thead>
          <tr>
            <th>词条</th>
            <th>题型</th>
            <th>你的答案</th>
            <th>正确</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={`${r.id}-${i}`}>
              <td>{WORD_BY_ID.get(r.id)?.en ?? r.id}</td>
              <td className="muted">{KIND_LABELS[r.kind]}</td>
              <td style={{ color: r.correct ? 'var(--ok)' : 'var(--warn)' }}>{r.given || '—'}</td>
              <td className="muted">{r.answer}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function WrongBook({ app, onPractice }: { app: App; onPractice: () => void }) {
  const wrong = ALL.filter((w) => isWrong(app.progress[w.id]))
  if (!wrong.length) return null
  return (
    <section className="panel">
      <h3>
        错题本 <small>连续答对两次自动移出</small>
      </h3>
      <div className="row">
        <span className="kpi">{wrong.length}<small>条待巩固</small></span>
        <button type="button" className="btn-primary" onClick={onPractice}>
          只测错题
        </button>
      </div>
      <div className="entry-list" style={{ marginTop: 10 }}>
        {wrong.slice(0, 20).map((w) => (
          <div key={w.id} className="entry">
            <span className="num mono">{w.num}</span>
            <div>
              <span className="en">{w.en}</span>
              <div className="zh">{w.zh}</div>
            </div>
            <span className="muted">{w.unitId}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function PastRecords({ app }: { app: App }) {
  if (!app.records.items.length) return null
  return (
    <section className="panel">
      <h3>最近成绩</h3>
      <table>
        <tbody>
          {app.records.items.slice(0, 8).map((r, i) => (
            <tr key={i}>
              <td className="muted">{new Date(r.at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
              <td>{r.kind}</td>
              <td className="muted">{r.units.join(' ') || '全部'}</td>
              <td>
                {r.correct}/{r.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export { DEFAULT_PLAN }
export type { Plan }
