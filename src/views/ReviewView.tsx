import { useMemo, useState } from 'react'
import { Speak, UnitsPicker } from '../components/Bits'
import { ALL } from '../lib/lexicon'
import { partition, reviewQueue, INTERVALS } from '../lib/srs'
import type { Grade, Word } from '../lib/types'
import type { App } from '../state'

const GRADES: { g: Grade; label: string; note: string }[] = [
  { g: 'again', label: '忘记', note: '明天重看' },
  { g: 'hard', label: '模糊', note: '间隔减半' },
  { g: 'good', label: '记得', note: '间隔翻倍' }
]

export function ReviewView({ app }: { app: App }) {
  const [units, setUnits] = useState<string[]>([])
  const [size, setSize] = useState(20)
  const [queue, setQueue] = useState<Word[] | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [tally, setTally] = useState<Record<Grade, number>>({ again: 0, hard: 0, good: 0 })

  const scope = useMemo(() => (units.length ? ALL.filter((w) => units.includes(w.unitId)) : ALL), [units])
  const counts = useMemo(() => partition(scope, app.progress), [scope, app.progress])
  const w = queue?.[0]

  const start = () => setQueue(reviewQueue(scope, app.progress, size))

  const answer = (g: Grade) => {
    if (!w) return
    app.bump(w.id, g)
    setTally((t) => ({ ...t, [g]: (t[g] ?? 0) + 1 }))
    setRevealed(false)
    setQueue((q) => {
      if (!q) return q
      const rest = q.slice(1)
      // 忘记的词本轮内再出现一次，其余交回排期
      return g === 'again' ? [...rest, w] : rest
    })
  }

  if (queue && queue.length === 0) {
    return (
      <section className="panel">
        <h3>本轮完成</h3>
        <div className="row">
          {GRADES.map((x) => (
            <span key={x.g} className="tag" data-tone={x.g === 'again' ? 'warn' : undefined}>
              {x.label} {tally[x.g]}
            </span>
          ))}
          <button type="button" className="btn-primary" onClick={() => { setQueue(null); setTally({ again: 0, hard: 0, good: 0 }) }}>
            返回
          </button>
        </div>
      </section>
    )
  }

  return (
    <div className="grid">
      <section className="panel">
        <h3>
          复习计划 <small>间隔 {INTERVALS.join(' / ')} 天</small>
        </h3>
        <div className="row-between">
          <div className="row">
            <span className="kpi">
              {counts.due.length + counts.wrong.length + counts.fresh.length}
              <small>今日可学</small>
            </span>
            <span className="tag" data-tone="warn">错题 {counts.wrong.length}</span>
            <span className="tag">到期 {counts.due.length}</span>
            <span className="tag">生词 {counts.fresh.length}</span>
          </div>
          <div className="row">
            <div className="field">
              <label>每次抽取</label>
              <select value={String(size)} onChange={(e) => setSize(Number(e.target.value))} disabled={Boolean(queue)}>
                {[10, 20, 30, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="btn-primary" onClick={start} disabled={Boolean(queue) || counts.due.length + counts.wrong.length + counts.fresh.length === 0}>
              {queue ? '进行中' : '开始复习'}
            </button>
            {queue && (
              <button type="button" onClick={() => setQueue(null)}>
                结束
              </button>
            )}
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <UnitsPicker value={units} onChange={(next) => { if (!queue) setUnits(next) }} />
        </div>
        <p className="muted">{units.length ? `限定 ${units.join('、')}` : '全部 8 个单元'}</p>
      </section>

      {w && (
        <article className="card">
          <div className="row-between">
            <span className="muted mono">
              剩 {queue?.length ?? 0} 条 · {w.unitId}
            </span>
            <Speak text={w.en} settings={app.settings} />
          </div>
          <div className="en">{w.en}</div>
          {w.pos && <div className="pos">{w.pos}</div>}
          {revealed && (
            <>
              <div className="zh">{w.zh}</div>
              {app.ai[w.id]?.mnemonic && <div className="ai"><div>助记：{app.ai[w.id]?.mnemonic}</div></div>}
            </>
          )}
          <div className="row">
            {!revealed ? (
              <button type="button" className="btn-primary" onClick={() => setRevealed(true)}>
                显示释义
              </button>
            ) : (
              GRADES.map((x) => (
                <button key={x.g} type="button" className={x.g === 'good' ? 'btn-primary' : undefined} onClick={() => answer(x.g)}>
                  {x.label}
                </button>
              ))
            )}
          </div>
        </article>
      )}

      {!queue && counts.due.length + counts.wrong.length + counts.fresh.length > 0 && (
        <section className="panel">
          <h3>待复习清单 <small>错题优先</small></h3>
          <div className="entry-list">
            {[...counts.wrong, ...counts.due, ...counts.fresh].slice(0, 12).map((e) => (
              <div key={e.id} className="entry">
                <span className="num mono">{e.num}</span>
                <div>
                  <span className="en">{e.en}</span>
                  <div className="zh">{e.zh}</div>
                </div>
                <span className="tag" data-tone={app.progress[e.id] ? undefined : 'warn'}>
                  {app.progress[e.id] ? `第 ${(app.progress[e.id]?.box ?? 0) + 1} 档` : '生词'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
