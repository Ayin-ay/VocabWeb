import { LEX, wordsOf } from '../lib/lexicon'
import { speak } from '../lib/tts'
import type { SectionKey, Settings } from '../lib/types'

export function Speak({ text, settings, label }: { text: string; settings: Settings; label?: string }) {
  return (
    <button type="button" onClick={() => speak(text, { rate: settings.ttsRate, voiceURI: settings.voiceURI })}>
      {label ?? '朗读'}
    </button>
  )
}

export function Bar({ percent }: { percent: number }) {
  return (
    <div className="bar">
      <i style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  )
}

export function UnitsPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  return (
    <div className="row">
      {LEX.units.map((u) => (
        <button key={u.id} type="button" className="chip" data-on={value.includes(u.id) ? '1' : '0'} onClick={() => toggle(u.id)}>
          {u.id} · {wordsOf(u.id).length}
        </button>
      ))}
      <button type="button" onClick={() => onChange(LEX.units.map((u) => u.id))}>
        全选
      </button>
      <button type="button" onClick={() => onChange([])}>
        清空
      </button>
    </div>
  )
}

export function SectionChips({ unitId, value, onChange }: { unitId: string; value: SectionKey[]; onChange: (next: SectionKey[]) => void }) {
  const unit = LEX.units.find((u) => u.id === unitId)
  if (!unit) return null
  return (
    <div className="row">
      {unit.sections.map((s) => (
        <button key={s.key} type="button" className="chip" data-on={value.includes(s.key) ? '1' : '0'} onClick={() => onChange(value.includes(s.key) ? value.filter((x) => x !== s.key) : [...value, s.key])}>
          {s.label} {s.entries.length}
        </button>
      ))}
    </div>
  )
}
