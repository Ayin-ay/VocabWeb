import { useMemo, useState } from 'react'
import { CAT_LABELS, CAT_ORDER, CORPUS_TOTAL, CORPUS_UNITS, cardsOf } from '../lib/composition'
import type { CorpusCat } from '../lib/types'

export function CompositionView() {
  const [unitId, setUnitId] = useState(CORPUS_UNITS[0]?.id ?? '')
  const [cats, setCats] = useState<CorpusCat[]>(CAT_ORDER)
  const [flipped, setFlipped] = useState<Record<string, boolean>>({})

  const unit = CORPUS_UNITS.find((u) => u.id === unitId) ?? CORPUS_UNITS[0]
  const list = useMemo(() => (unit ? cardsOf(unit.id, cats) : []), [unit?.id, cats])

  const groups = useMemo(
    () =>
      CAT_ORDER.filter((c) => cats.includes(c))
        .map((c) => ({ c, items: list.filter((x) => x.cat === c) }))
        .filter((g) => g.items.length),
    [list, cats]
  )

  const toggle = (id: string) => setFlipped((f) => ({ ...f, [id]: !f[id] }))

  const toggleCat = (c: CorpusCat) =>
    setCats((cur) => (cur.includes(c) ? (cur.length > 1 ? cur.filter((x) => x !== c) : cur) : CAT_ORDER.filter((x) => x === c || cur.includes(x))))

  if (!unit) return <section className="panel">语料还没准备好</section>

  return (
    <div className="corpus">
      <section className="panel corpus-filter">
        <div className="row">
          {CORPUS_UNITS.map((u) => (
            <button key={u.id} type="button" className="chip" data-on={u.id === unit.id ? '1' : '0'} onClick={() => setUnitId(u.id)}>
              {u.label.replace('第2册 ', '')} · {u.theme}
            </button>
          ))}
        </div>
        <div className="row">
          {CAT_ORDER.map((c) => (
            <button key={c} type="button" className="chip" data-on={cats.includes(c) ? '1' : '0'} onClick={() => toggleCat(c)}>
              {CAT_LABELS[c]}
            </button>
          ))}
          <span className="muted">{list.length} / {CORPUS_TOTAL}</span>
        </div>
      </section>

      {groups.map(({ c, items }) => (
        <section className="panel corpus-group" key={c}>
          <h3>
            {CAT_LABELS[c]} <small>{items.length}</small>
          </h3>
          <div className="corpus-list">
            {items.map((card) => (
              <button type="button" className="flip" data-f={flipped[card.id] ? '1' : '0'} key={card.id} onClick={() => toggle(card.id)}>
                <div className="flip-inner">
                  <div className="flip-face flip-front">
                    <span className="flip-zh">{card.zh}</span>
                  </div>
                  <div className="flip-face flip-back">
                    <div className="flip-en">{card.en}</div>
                    {card.use && <div className="flip-use">{card.use}</div>}
                    {card.eg && <div className="flip-eg">{card.eg}</div>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
