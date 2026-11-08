import { useState } from 'react'
import { doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useShop, useUi, commit, deviceId } from '../store.jsx'
import { fmt, today, countTotal, denomsFor, expectedCash, timeOf, dayOf } from '../lib/calc.js'
import { CASH_REASONS } from '../lib/template.js'
import DaySelect from '../components/DaySelect.jsx'

export default function Cash() {
  const s = useShop()
  const ui = useUi()
  const [day, setDay] = useState(today())
  const [amt, setAmt] = useState('')
  const [reason, setReason] = useState(CASH_REASONS[0])
  const [note, setNote] = useState('')
  if (!s.eventId) return <div className="page"><div className="warn">請先建立展覽場次。</div></div>

  const open = s.cashCounts[`${day}_open`]
  const close = s.cashCounts[`${day}_close`]
  const openTotal = open ? countTotal(open.counts) : 0
  const e = expectedCash(s.orders, day, openTotal, s.cashMoves)
  const closeTotal = close ? countTotal(close.counts) : null
  const diff = closeTotal === null ? null : closeTotal - e.expected

  const saveCount = (kind, counts) => {
    commit(writeBatch(db).set(doc(db, s.eventPath, 'cashCounts', `${day}_${kind}`), { day, kind, counts, ts: Date.now(), device: deviceId }))
    ui.toast(kind === 'open' ? '已儲存開店零用金' : '已儲存收攤點算', { kind: 'ok' })
  }
  const addMove = () => {
    const a = Number(amt)
    if (!a) return
    const now = Date.now()
    commit(writeBatch(db).set(doc(db, s.eventPath, 'cashMoves', s.newId(`${s.eventPath}/cashMoves`)), { day, amount: a, reason, note, ts: now, device: deviceId }))
    setAmt(''); setNote('')
  }

  return (
    <div className="page">
      <div className="row gap toolbar"><DaySelect event={s.event} value={day} onChange={setDay} /></div>
      {s.settings.cashCount ? (
        <div className="grid2">
          <CountForm key={'o' + day + (open?.ts || '')} title="開店零用金" data={open} denoms={denomsFor(s.settings)} onSave={(c) => saveCount('open', c)} />
          <CountForm key={'c' + day + (close?.ts || '')} title="收攤點算" data={close} denoms={denomsFor(s.settings)} onSave={(c) => saveCount('close', c)} />
        </div>
      ) : <p className="muted">零錢數量管理已關閉，只計算現金總額。</p>}

      <div className="card recon">
        <h4>現金對帳</h4>
        {s.settings.cashCount && <div className="row between"><span>開店零用金</span><span>{fmt(openTotal)}</span></div>}
        <div className="row between"><span>現金收支（銷售、收尾款、退款）</span><span>{fmt(e.cashSales)}</span></div>
        <div className="row between"><span>現金調整</span><span>{fmt(e.adjustments)}</span></div>
        <div className="row between total"><span>應有現金</span><span>{fmt(e.expected)}</span></div>
        {s.settings.cashCount && closeTotal !== null && (
          <>
            <div className="row between"><span>收攤實點</span><span>{fmt(closeTotal)}</span></div>
            <div className={'row between total ' + (diff === 0 ? 'pos' : 'neg')}><span>差額</span><span>{diff === 0 ? '✓ 相符' : (diff > 0 ? '多 ' : '少 ') + fmt(Math.abs(diff))}</span></div>
          </>
        )}
      </div>

      <div className="card">
        <h4>現金調整（找錯錢、換零錢…）</h4>
        <div className="row gap wrap">
          <input className="num" inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d-]/g, ''))} placeholder="金額，少了填負數" />
          <select value={reason} onChange={(e) => setReason(e.target.value)}>{CASH_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="備註" />
          <button onClick={addMove}>新增</button>
        </div>
        {s.cashMoves.filter((c) => c.day === day).map((c) => (
          <div key={c.id} className="line"><span>{timeOf(c.ts)}</span><b className={c.amount < 0 ? 'neg' : 'pos'}>{fmt(c.amount)}</b><span>{c.reason}{c.note ? '・' + c.note : ''}</span></div>
        ))}
      </div>
      {day !== dayOf(Date.now()) && <p className="muted">正在檢視 {day} 的資料</p>}
    </div>
  )
}

function CountForm({ title, data, denoms, onSave }) {
  const [c, setC] = useState(() => ({ ...(data?.counts || {}) }))
  const total = countTotal(c)
  return (
    <div className="card count">
      <div className="row between"><h4>{title}</h4>{data && <span className="muted">已存 {timeOf(data.ts)}</span>}</div>
      {denoms.map((d) => (
        <div key={d} className="denom">
          <span className="dlabel">{d >= 100 ? `${d} 元鈔` : `${d} 元`}</span>
          <button onClick={() => setC({ ...c, [d]: Math.max(0, (Number(c[d]) || 0) - 1) })}>−</button>
          <input className="num" inputMode="numeric" value={c[d] ?? ''} placeholder="0" onChange={(e) => setC({ ...c, [d]: e.target.value.replace(/[^\d]/g, '') })} />
          <button onClick={() => setC({ ...c, [d]: (Number(c[d]) || 0) + 1 })}>＋</button>
          <span className="dsum">{fmt(d * (Number(c[d]) || 0))}</span>
        </div>
      ))}
      <div className="row between total"><span>合計</span><span>{fmt(total)}</span></div>
      <button className="primary" onClick={() => onSave(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v) || 0])))}>儲存</button>
    </div>
  )
}
