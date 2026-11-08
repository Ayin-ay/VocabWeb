import { Bar } from '../components/Bits'
import { ALL, COUNT, LEX, wordsOf } from '../lib/lexicon'
import { partition, unitStats } from '../lib/srs'
import { stats as sprintStats } from '../lib/sprint'
import type { App } from '../state'

export function HomeView({ app, onGo }: { app: App; onGo: (tab: 'study' | 'review' | 'test' | 'sprint' | 'settings', unitId?: string) => void }) {
  const { fresh, due, wrong } = partition(ALL, app.progress)
  const lastRecord = app.records.items[0]

  return (
    <div className="grid">
      <section className="grid cols-4">
        <div className="panel">
          <h3>词库</h3>
          <div className="kpi">{COUNT.total}<small>条</small></div>
          <p className="muted">
            单词 {COUNT.words} · 词语 {COUNT.phrases} · 专名 {COUNT.names}
          </p>
        </div>
        <div className="panel">
          <h3>今日复习</h3>
          <div className="kpi">{due.length + wrong.length + fresh.length}<small>条可学</small></div>
          <p className="muted">
            到期 {due.length} · 错题 {wrong.length} · 生词 {fresh.length}
          </p>
        </div>
        <div className="panel">
          <h3>已掌握</h3>
          <div className="kpi">{ALL.filter((w) => app.progress[w.id]?.known).length}<small>条</small></div>
          <p className="muted">冲刺已掌握 {app.sprint ? sprintStats(app.sprint).mastered : 0} 条 · 词卡上也可手动标记</p>
        </div>
        <div className="panel">
          <h3>最近测试</h3>
          <div className="kpi">
            {lastRecord ? `${Math.round((lastRecord.correct / lastRecord.total) * 100)}%` : '—'}
            {lastRecord ? <small>{lastRecord.correct}/{lastRecord.total}</small> : null}
          </div>
          <p className="muted">
            {lastRecord ? `${lastRecord.kind} · ${new Date(lastRecord.at).toLocaleDateString('zh-CN')}` : '还没有测试记录'}
          </p>
        </div>
      </section>

      <section className="panel">
        <h3>单元</h3>
        <div className="grid cols-2">
          {LEX.units.map((u) => {
            const list = wordsOf(u.id)
            const { done } = unitStats(list, app.progress)
            return (
              <div key={u.id} className="row-between" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
                <div>
                  <button type="button" className="chip" onClick={() => onGo('study', u.id)}>
                    {u.id}
                  </button>
                  <span className="muted" style={{ marginLeft: 8 }}>{u.label}</span>
                </div>
                <div style={{ minWidth: 140 }}>
                  <div className="muted mono" style={{ textAlign: 'right' }}>
                    {done}/{list.length}
                  </div>
                  <Bar percent={(done / list.length) * 100} />
                </div>
              </div>
            )
          })}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button type="button" className="btn-primary" onClick={() => onGo('sprint')}>
            去冲刺
          </button>
          <button type="button" className="btn-primary" onClick={() => onGo('review')}>
            去复习
          </button>
          <button type="button" className="btn-primary" onClick={() => onGo('test')}>
            去测试
          </button>
          <button type="button" onClick={() => onGo('settings')}>
            模型通道与生成
          </button>
        </div>
      </section>
    </div>
  )
}
