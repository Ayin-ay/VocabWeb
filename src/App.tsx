import { useEffect, useRef, useState } from 'react'
import { CompositionView } from './views/CompositionView'
import { DepositView } from './views/DepositView'
import { SettingsView } from './views/SettingsView'
import { SprintView } from './views/SprintView'
import { useAppState } from './state'
import { COUNT } from './lib/lexicon'
import { CORPUS_TOTAL } from './lib/composition'
import { backConsumed } from './lib/backstack'
import { onBackPress } from './lib/appshell'

export default function App() {
  const app = useAppState()
  const [tab, setTab] = useState<'sprint' | 'deposit' | 'composition' | 'settings'>('sprint')
  const tabRef = useRef(tab)
  tabRef.current = tab

  /** APK 里按返回：判定卡先关掉，再退回冲刺页，冲刺页上才退出应用 */
  useEffect(
    () =>
      onBackPress(() => {
        if (backConsumed()) return true
        if (tabRef.current === 'sprint') return false
        setTab('sprint')
        return true
      }),
    []
  )

  return (
    <>
      <header className="topbar" data-tab={tab}>
        <div className="brand">
          词汇冲刺<small>{COUNT.total} 条 · B1U1–B2U4</small>
        </div>
        <nav className="tabs">
          <button type="button" data-on={tab === 'sprint' ? '1' : '0'} onClick={() => setTab('sprint')}>
            冲刺
          </button>
          <button type="button" data-on={tab === 'deposit' ? '1' : '0'} onClick={() => setTab('deposit')}>
            {app.deposit ? `沉淀 ${app.deposit.queue.length}` : '沉淀'}
          </button>
          <button type="button" data-on={tab === 'composition' ? '1' : '0'} onClick={() => setTab('composition')}>
            作文 {CORPUS_TOTAL}
          </button>
          <button type="button" data-on={tab === 'settings' ? '1' : '0'} onClick={() => setTab('settings')}>
            设置
          </button>
        </nav>
      </header>
      <main data-tab={tab}>
        {tab === 'settings' ? (
          <SettingsView app={app} />
        ) : tab === 'deposit' ? (
          <DepositView app={app} />
        ) : tab === 'composition' ? (
          <CompositionView />
        ) : (
          <SprintView app={app} />
        )}
      </main>
    </>
  )
}
