import { useEffect, useRef, useState } from 'react'
import { UnitsPicker } from '../components/Bits'
import { ALL, LEX, wordsOf } from '../lib/lexicon'
import { PROVIDER_PRESETS, DEFAULT_LLM, generateNotes, isConfigured, ping } from '../lib/llm'
import { canSpeak, englishVoices, speak } from '../lib/tts'
import { apkVersion, fetchRelease, inApp, isNewer, siteVersion } from '../lib/appshell'
import type { ReleaseInfo } from '../lib/appshell'
import type { AiNote } from '../lib/types'
import type { App } from '../state'

export function SettingsView({ app }: { app: App }) {
  const [units, setUnits] = useState<string[]>([LEX.units[0]?.id ?? ''])
  const [apk, setApk] = useState<string | null>(null)
  const [rel, setRel] = useState<ReleaseInfo | null>(null)
  const [regen, setRegen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [probe, setProbe] = useState('')
  const [code, setCode] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const backupRef = useRef<HTMLInputElement>(null)

  const wrapped = inApp()
  const speakable = canSpeak()
  const hasProgress = Object.keys(app.progress).length > 0

  useEffect(() => {
    if (!inApp()) return
    void apkVersion().then(setApk)
    void fetchRelease().then(setRel)
  }, [])

  const makeCode = async () => {
    setErr('')
    setNote('')
    try {
      const text = app.saveCode()
      setCode(text)
      try {
        await navigator.clipboard.writeText(text)
        setNote(`已复制 ${(text.length / 1024).toFixed(1)} KB`)
      } catch {
        setNote('剪贴板不可用，选中上面这串手动复制')
      }
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const applyCode = () => {
    setErr('')
    setNote('')
    try {
      app.restoreCode(code)
      setNote('已恢复到这份存档')
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const todo = ALL.filter((w) => (regen || !app.ai[w.id]) && (w.section !== 'names' || regen) && units.includes(w.unitId))
  const generated = ALL.filter((w) => app.ai[w.id]).length

  const run = async () => {
    if (!isConfigured(app.llm)) {
      setLog((l) => ['缺少 baseUrl / model / key，先填好模型通道', ...l])
      return
    }
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setBusy(true)
    setLog([`开始生成 ${todo.length} 条`])
    const res = await generateNotes(app.llm, todo, (chunk) => app.mergeAi(chunk), ctrl.signal)
    setLog((l) => [`完成 ${res.done} 条`, ...res.failed.map((f) => `失败 ${f}`), ...l])
    setBusy(false)
    abortRef.current = null
  }

  const download = (name: string, text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="grid">
      <section className="panel">
        <h3>存档码</h3>
        <div className="row">
          <button type="button" className="btn-primary" onClick={makeCode}>
            生成并复制
          </button>
          <button type="button" onClick={applyCode} disabled={!code.trim()}>
            用上面这串恢复
          </button>
          {note && <span className="muted">{note}</span>}
          {err && <span className="tag" data-tone="warn">{err}</span>}
          {!app.storageOk && <span className="tag" data-tone="warn">本机存储写不进去</span>}
        </div>
        {wrapped && !hasProgress && (
          <div className="notice" data-tone="warn" style={{ marginTop: 8 }}>
            App 和浏览器各存各的进度，装好包不会自动带过来。先在浏览器里「生成并复制」存档码，再回到这里贴进上面这格恢复。
          </div>
        )}
        <textarea
          className="code-box mono"
          rows={4}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
        />
      </section>

      <section className="panel">
        <h3>显示与发音</h3>
        <div className="row">
          <button type="button" className="chip" data-on={app.settings.showZh ? '1' : '0'} onClick={() => app.setSettings((s) => ({ ...s, showZh: !s.showZh }))}>
            词卡默认显示中文
          </button>
          <div className="field">
            <label>语速 {app.settings.ttsRate.toFixed(2)}</label>
            <input type="range" min={0.5} max={1.4} step={0.05} value={app.settings.ttsRate} onChange={(e) => app.setSettings((s) => ({ ...s, ttsRate: Number(e.target.value) }))} />
          </div>
          {!wrapped && (
            <div className="field">
              <label>音色</label>
              <select value={app.settings.voiceURI} onChange={(e) => app.setSettings((s) => ({ ...s, voiceURI: e.target.value }))}>
                <option value="">系统默认</option>
                {englishVoices().map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} · {v.lang}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button type="button" onClick={() => speak('ambitious', { rate: app.settings.ttsRate, voiceURI: app.settings.voiceURI })} disabled={!speakable}>
            试听
          </button>
        </div>
        {wrapped && (
          <div className="muted" style={{ marginTop: 8 }}>
            App 用系统语音引擎朗读，音色在手机的「设置 → 可访问性 → 文字转语音」里选；这里的语速照样生效。
          </div>
        )}
        {!speakable && <div className="notice" data-tone="warn" style={{ marginTop: 8 }}>这台设备读不出音，检查一下系统的文字转语音引擎</div>}
      </section>

      <section className="panel">
        <h3>模型通道 <small>key 只存本机 localStorage</small></h3>
        <div className="row">
          {PROVIDER_PRESETS.map((p) => (
            <button key={p.id} type="button" className="chip" data-on={app.llm.baseUrl.replace(/\/+$/, '') === p.baseUrl ? '1' : '0'} onClick={() => app.setLlm({ ...app.llm, baseUrl: p.baseUrl, model: p.model })}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid cols-2" style={{ marginTop: 10 }}>
          <div className="field">
            <label>baseUrl</label>
            <input value={app.llm.baseUrl} onChange={(e) => app.setLlm((c) => ({ ...c, baseUrl: e.target.value }))} />
          </div>
          <div className="field">
            <label>model</label>
            <input value={app.llm.model} onChange={(e) => app.setLlm((c) => ({ ...c, model: e.target.value }))} />
          </div>
          <div className="field">
            <label>apiKey</label>
            <input type="password" value={app.llm.apiKey} onChange={(e) => app.setLlm((c) => ({ ...c, apiKey: e.target.value }))} />
          </div>
          <div className="field">
            <label>temperature {app.llm.temperature.toFixed(1)}</label>
            <input type="range" min={0} max={1} step={0.1} value={app.llm.temperature} onChange={(e) => app.setLlm((c) => ({ ...c, temperature: Number(e.target.value) }))} />
          </div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button
            type="button"
            onClick={async () => {
              setProbe('测试中…')
              try {
                setProbe(await ping(app.llm))
              } catch (err) {
                setProbe(`失败：${(err as Error).message}`)
              }
            }}
          >
            连通自检
          </button>
          {probe && <span className="muted mono">{probe}</span>}
          <button type="button" onClick={() => app.setLlm({ ...DEFAULT_LLM, apiKey: '' })}>
            恢复默认
          </button>
        </div>
      </section>

      <section className="panel">
        <h3>
          AI 例句与助记 <small>已生成 {generated}/{ALL.length}</small>
        </h3>
        <UnitsPicker value={units} onChange={setUnits} />
        <div className="row" style={{ marginTop: 10 }}>
          <button type="button" className="chip" data-on={regen ? '1' : '0'} onClick={() => setRegen((r) => !r)}>
            重新生成已有条目
          </button>
          <button type="button" className="btn-primary" onClick={run} disabled={busy || !units.length || !todo.length}>
            {busy ? '生成中' : `生成 ${todo.length} 条`}
          </button>
          {busy && (
            <button type="button" onClick={() => abortRef.current?.abort()}>
              停止
            </button>
          )}
        </div>
        <div className="log" style={{ marginTop: 8 }}>
          {log.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button type="button" onClick={() => download(`vocab-ai-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(app.ai, null, 2))}>
            导出 AI 资料
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}>
            导入 AI 资料
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              app.setAi({ ...app.ai, ...(JSON.parse(await f.text()) as Record<string, AiNote>) })
              setLog((l) => [`已导入 ${f.name}`, ...l])
            }}
          />
        </div>
      </section>

      <section className="panel">
        <h3>学习数据</h3>
        <div className="row">
          <button type="button" onClick={() => download(`vocab-backup-${new Date().toISOString().slice(0, 10)}.json`, app.exportAll())}>
            导出全部进度
          </button>
          <button type="button" onClick={() => backupRef.current?.click()}>
            导入并覆盖
          </button>
          <input
            ref={backupRef}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) app.importAll(await f.text())
            }}
          />
          <button
            type="button"
            className="chip"
            data-on="0"
            onClick={() => {
              if (!confirm('清空进度、错题与测试记录？AI 资料保留。')) return
              app.setProgress({})
              app.setRecords({ items: [] })
            }}
          >
            清空学习进度
          </button>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          词库 {ALL.length} 条来自 {units.length ? units.map((u) => wordsOf(u).length).join(' + ') : '全部单元'}；数据只存在
          {wrapped ? '这台设备的 App 里，和浏览器那份各记各的' : '这台机器的浏览器里'}。
        </p>
        <div className="log" style={{ marginTop: 4 }}>
          {app.records.items.slice(0, 12).map((r, i) => (
            <div key={i}>
              {new Date(r.at).toLocaleString('zh-CN')} · {r.kind} · {r.correct}/{r.total}
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>版本</h3>
        <div className="row">
          <span className="muted mono">站点 {siteVersion}</span>
          {apk && <span className="muted mono">App {apk}</span>}
          {!wrapped && <span className="muted">这里是浏览器，不是装出来的 App</span>}
        </div>
        {wrapped && apk && rel && isNewer(rel.version, apk) && (
          <div className="notice" data-tone="warn" style={{ marginTop: 8 }}>
            <div className="row-between">
              <span>
                有新包 {rel.version}{rel.notes ? ` · ${rel.notes}` : ''}
              </span>
              {rel.download ? (
                <a className="link-btn btn-primary" href={rel.download} target="_blank" rel="noopener">
                  下载
                </a>
              ) : (
                <span className="muted">包地址还没填</span>
              )}
            </div>
            <div className="muted" style={{ marginTop: 4 }}>直接覆盖安装，进度不动；先卸载再装会清掉这台设备上的记录。</div>
          </div>
        )}
      </section>
    </div>
  )
}
