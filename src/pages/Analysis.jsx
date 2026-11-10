import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useShop } from '../store.jsx'
import { today, soldOutTimes } from '../lib/calc.js'
import { buildSeries, hoursFor, tsAt, hmOf, fmtAmount } from '../lib/analysis.js'
import { sortCats } from '../lib/template.js'
import DaySelect, { eventDays } from '../components/DaySelect.jsx'
import SalesCurve from '../components/SalesCurve.jsx'
import Help from '../components/Help.jsx'
import { HELP } from '../lib/help.js'

// 線條顏色：固定 8 色，每個品項依名稱固定一種顏色，切換時不會換色
const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#c98500', '#d55181', '#008300', '#6250d6', '#e34948']
const MAX_LINES = 8

export default function Analysis() {
  const s = useShop()
  const days = eventDays(s.event)
  const [day, setDay] = useState(days.includes(today()) ? today() : days[0])
  const [view, setView] = useState('E')
  const [mode, setMode] = useState('grams')
  const store = `analysisSel:${s.shopId}`
  const [sel, setSel] = useState(() => { try { return JSON.parse(localStorage.getItem(store)) || null } catch { return null } })
  const [msg, setMsg] = useState('')

  const h = hoursFor(s.event, day)
  const open = tsAt(day, h.open), close = tsAt(day, h.close)
  const soldOut = useMemo(() => soldOutTimes(s.stockInit, s.orders, s.adjustments), [s.stockInit, s.orders, s.adjustments])
  const series = useMemo(() => buildSeries({
    orders: s.orders, skus: s.skus, productById: s.productById, optionLists: s.optionLists,
    day, open, close, soldOut, stockInit: s.stockInit, mode
  }), [s.orders, s.skus, s.productById, s.optionLists, day, open, close, soldOut, s.stockInit, mode])

  const ranked = [...series].sort((a, b) => b.perHour - a.perHour)
  const topKeys = ranked.filter((x) => x.total > 0).slice(0, 5).map((x) => x.key)
  const selected = (sel || topKeys).filter((k) => series.some((x) => x.key === k))
  // 顏色：選進來時分配一個還沒被用的顏色，取消前都不變
  const colorMap = useRef({})
  const cm = colorMap.current
  for (const k of Object.keys(cm)) if (!selected.includes(k)) delete cm[k]
  for (const k of selected) if (!cm[k]) cm[k] = PALETTE.find((c) => !Object.values(cm).includes(c)) || PALETTE[0]
  const colorOf = (k) => cm[k] || '#b9c2bc'
  useEffect(() => { if (sel) try { localStorage.setItem(store, JSON.stringify(sel)) } catch { /* 忽略 */ } }, [sel])

  const toggle = (k) => {
    setMsg('')
    const cur = selected
    if (cur.includes(k)) return setSel(cur.filter((x) => x !== k))
    if (cur.length >= MAX_LINES) return setMsg(`最多同時比較 ${MAX_LINES} 個品項，請先取消一個`)
    setSel([...cur, k])
  }

  if (!s.eventId) return <div className="page"><div className="warn">請先建立展覽場次。</div></div>

  const byCat = {}
  for (const x of series) (byCat[x.category] ||= []).push(x)
  const cats = sortCats(Object.keys(byCat), s.settings.catOrder)
  const shownRows = ranked.filter((x) => selected.includes(x.key))
  const unitOf = (x) => (mode === 'grams' ? '' : x.unit)

  return (
    <div className="page analysis">
      <div className="row between wrap toolbar">
        <DaySelect event={s.event} value={day} onChange={setDay} />
        <div className="seg">
          <button className={view === 'E' ? 'on' : ''} onClick={() => setView('E')}>從開賣起算</button>
          <button className={view === 'C' ? 'on' : ''} onClick={() => setView('C')}>時鐘時間</button>
        </div>
        <div className="seg">
          <button className={mode === 'grams' ? 'on' : ''} onClick={() => setMode('grams')}>公克</button>
          <button className={mode === 'qty' ? 'on' : ''} onClick={() => setMode('qty')}>件數</button>
        </div>
      </div>

      <div className="card">
        <div className="row between wrap">
          <h3 style={{ margin: 0 }}>品項銷售曲線<Help>{HELP.analysis}</Help></h3>
          <span className="muted small">
            營業 {h.open}–{h.close}{h.custom ? '（當天另設）' : ''}
            {!h.set && <>・<Link to="/admin?tab=2">設定營業時間</Link></>}
          </span>
        </div>
        {series.length === 0 ? (
          <p className="muted">這一天還沒有可以比較的品項{mode === 'grams' ? '（「公克」只比較有重量選項的商品，可切換「件數」）' : ''}。</p>
        ) : (
          <>
            <div className="an-quick">
              <button className="small-btn" onClick={() => { setMsg(''); setSel(topKeys) }}>熱賣前 5</button>
              <button className="small-btn" onClick={() => { setMsg(''); setSel([]) }}>清除</button>
              {msg && <span className="warn small">{msg}</span>}
            </div>
            {cats.map((c) => (
              <div key={c} className="an-chips">
                <span className="chip-label">{c}</span>
                {byCat[c].map((x) => {
                  const on = selected.includes(x.key)
                  return (
                    <button key={x.key} className={'an-chip' + (on ? ' on' : '')} onClick={() => toggle(x.key)} aria-pressed={on}>
                      <i style={{ background: colorOf(x.key) }} />{x.name.replace(c + '・', '')}
                    </button>
                  )
                })}
              </div>
            ))}
            <SalesCurve series={series} selected={selected} view={view} mode={mode} open={open} close={close} colorOf={colorOf} resetKey={day + mode} />
            <p className="muted small an-note">
              縱軸：累計售出{mode === 'grams' ? '公克（1/4 磅＝113 g、1/2 磅＝227 g）' : '件數'}・只算銷售，不含贈與、沖泡與預購・套裝與盒裝拆成組成品項計算
              {view === 'C' ? '・還沒開賣的時段空白' : '・每條線都從各自開賣的時間起算'}
            </p>
            {shownRows.length > 0 && (
              <table className="an-rank">
                <thead><tr><th></th><th>品項</th><th>開賣</th><th>已售</th><th>每小時</th></tr></thead>
                <tbody>
                  {shownRows.map((x) => (
                    <tr key={x.key}>
                      <td><i className="an-sw" style={{ background: colorOf(x.key) }} /></td>
                      <td>{x.name}{x.soldOutTs && <span className="badge red">完售 {hmOf(x.soldOutTs)}</span>}</td>
                      <td className="muted">{hmOf(x.start)}</td>
                      <td className="num">{fmtAmount(x.total, mode)} {unitOf(x)}</td>
                      <td className="num strong">{fmtAmount(x.perHour, mode)} {unitOf(x)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  )
}
