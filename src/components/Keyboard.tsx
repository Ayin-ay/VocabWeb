const ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['-', 'z', 'x', 'c', 'v', 'b', 'n', 'm', "'"]
]

export interface KeyboardProps {
  onKey: (ch: string) => void
  onBack: () => void
  onSubmit: () => void
  onSkip: () => void
  canSubmit?: boolean
  disabled?: boolean
}

/** 页面内键盘：不走系统输入法，避免联想把答案提示出来 */
export function Keyboard({ onKey, onBack, onSubmit, onSkip, canSubmit = true, disabled }: KeyboardProps) {
  return (
    <div className="kb" data-disabled={disabled ? '1' : '0'}>
      {ROWS.map((row, i) => (
        <div className="kb-row" key={i}>
          {i === 2 && (
            <button type="button" className="kb-key kb-wide" onClick={onBack} disabled={disabled}>
              删除
            </button>
          )}
          {row.map((ch) => (
            <button type="button" className="kb-key" key={ch} onClick={() => onKey(ch)} disabled={disabled}>
              {ch}
            </button>
          ))}
        </div>
      ))}
      <div className="kb-row">
        <button type="button" className="kb-key kb-space" onClick={() => onKey(' ')} disabled={disabled}>
          空格
        </button>
        <button type="button" className="kb-key kb-skip" onClick={onSkip} disabled={disabled}>
          不会
        </button>
        <button type="button" className="kb-key kb-submit" onClick={onSubmit} disabled={disabled || !canSubmit}>
          提交
        </button>
      </div>
    </div>
  )
}
