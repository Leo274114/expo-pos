import { useEffect, useRef, useState } from 'react'
import { doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useShop, useUi, commit, deviceId, leaveGuard } from '../store.jsx'
import { fmt, today, countTotal, denomsFor, expectedCash, timeOf, dayOf, enabledMethods, METHOD_LABEL, methodDay, TYPE_LABEL } from '../lib/calc.js'
import { CASH_REASONS } from '../lib/template.js'
import DaySelect from '../components/DaySelect.jsx'
import Help from '../components/Help.jsx'
import Icon from '../components/Icon.jsx'
import Modal from '../components/Modal.jsx'
import { HELP } from '../lib/help.js'
import { SupplyLeftReminder, DailyUsage } from '../components/Supplies.jsx'
import DriveBackup from '../components/DriveBackup.jsx'
import { hasDriveToken, uploadEventToDrive } from '../lib/gdrive.js'

export default function Cash() {
  const sRef = useRef(null)
  const s = useShop()
  sRef.current = s
  const ui = useUi()
  const [day, setDay] = useState(today())
  const [amt, setAmt] = useState('')
  const [reason, setReason] = useState(CASH_REASONS[0])
  const [note, setNote] = useState('')
  // 點了數量還沒按儲存：按鈕變亮、寫「尚未儲存」；換頁或換日期前先提醒
  const [dirty, setDirty] = useState({})
  const anyDirty = dirty.open || dirty.close
  useEffect(() => {
    leaveGuard.msg = anyDirty ? `零錢${dirty.open ? '「開店零用金」' : ''}${dirty.close ? '「收攤點算」' : ''}改過還沒儲存，要離開嗎？` : null
  }, [anyDirty, dirty.open, dirty.close])
  useEffect(() => () => { leaveGuard.msg = null }, [])
  useEffect(() => {
    if (!anyDirty) return
    const h = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [anyDirty])
  const [dayAsk, setDayAsk] = useState(null)
  const changeDay = (d) => { if (anyDirty) setDayAsk(d); else setDay(d) }
  if (!s.eventId) return <div className="page"><div className="warn">請先建立展覽場次。</div></div>

  const open = s.cashCounts[`${day}_open`]
  // 今天還沒點開店零用金：先帶入最近一次的點算（前一天收攤優先），確認後按儲存
  const prev = !open && Object.values(s.cashCounts).filter((x) => x.day < day).sort((a, b) => (a.day + (a.kind === 'close' ? 1 : 0)).localeCompare(b.day + (b.kind === 'close' ? 1 : 0)) || a.ts - b.ts).pop()
  const close = s.cashCounts[`${day}_close`]
  const openTotal = open ? countTotal(open.counts) : 0
  const e = expectedCash(s.orders, day, openTotal, s.cashMoves)
  const closeTotal = close ? countTotal(close.counts) : null
  const diff = closeTotal === null ? null : closeTotal - e.expected

  const saveCount = (kind, counts) => {
    commit(writeBatch(db).set(doc(db, s.eventPath, 'cashCounts', `${day}_${kind}`), { day, kind, counts, ts: Date.now(), device: deviceId }))
    ui.toast(kind === 'open' ? '已儲存開店零用金' : (s.event?.end && day >= s.event.end ? '已儲存收攤點算。最後一天了，別忘了點耗材剩多少' : '已儲存收攤點算'), { kind: 'ok', ms: 5000 })
    // 收攤後自動更新 Google 雲端：授權還有效才自動傳，否則下方顯示按鈕讓攤商自己按
    if (kind === 'close' && navigator.onLine && hasDriveToken()) {
      setTimeout(() => {
        uploadEventToDrive(sRef.current)
          .then(() => ui.toast('已自動更新 Google 雲端備份', { kind: 'ok' }))
          .catch((e) => ui.toast('自動備份沒成功：' + e.message + '，請按「更新 Google 雲端」', { kind: 'error', ms: 7000 }))
      }, 1500)
    }
  }
  const delMove = (c) => {
    const { id, ...data } = c
    commit(writeBatch(db).delete(doc(db, s.eventPath, 'cashMoves', id)))
    ui.toast(`已刪除現金調整 ${fmt(c.amount)}`, { ms: 6000, action: { label: '復原', onClick: () => commit(writeBatch(db).set(doc(db, s.eventPath, 'cashMoves', id), data)) } })
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
      <div className="row gap toolbar"><DaySelect event={s.event} value={day} onChange={changeDay} /></div>
      {s.settings.cashCount ? (
        <div className="grid2">
          <CountForm key={'o' + day + (open?.ts || '') + (prev?.ts || '')} title="開店零用金" data={open} prefill={prev}
            denoms={denomsFor(s.settings)} onSave={(c) => saveCount('open', c)} onDirty={(v) => setDirty((d) => (d.open === v ? d : { ...d, open: v }))} />
          <CountForm key={'c' + day + (close?.ts || '')} title="收攤點算" data={close} denoms={denomsFor(s.settings)} onSave={(c) => saveCount('close', c)} onDirty={(v) => setDirty((d) => (d.close === v ? d : { ...d, close: v }))}>
            <DailyUsage day={day} inline />
          </CountForm>
        </div>
      ) : <p className="muted">零錢數量管理已關閉，只計算現金總額。</p>}

      {!s.settings.cashCount && <DailyUsage day={day} />}
      {s.settings.cashCount && close && <SupplyLeftReminder day={day} />}
      {(close || !s.settings.cashCount) && (
        <div className="card">
          <h4 style={{ marginTop: 0 }}>備份到 Google 雲端</h4>
          <DriveBackup compact note="收攤了，更新一下雲端備份，資料就存在你自己的 Google 雲端硬碟。" />
        </div>
      )}
      {!s.settings.cashCount && <SupplyLeftReminder day={day} />}

      {dayAsk && (
        <Modal title="還沒儲存" onClose={() => setDayAsk(null)}
          footer={<>
            <button onClick={() => { setDirty({}); setDay(dayAsk); setDayAsk(null) }}>不存，換日期</button>
            <button className="primary" onClick={() => setDayAsk(null)}>留下來儲存</button>
          </>}>
          <p className="big-text">{leaveGuard.msg?.replace('要離開嗎？', '要換到其他日期嗎？')}</p>
        </Modal>
      )}
      {enabledMethods(s.settings).filter((m) => m !== 'cash').map((m) => <PayCheck key={m + day} method={m} day={day} />)}
      <div className="card recon">
        <h4>現金對帳<Help>{HELP.cashRecon}</Help></h4>
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
          <div key={c.id} className="line"><span>{timeOf(c.ts)}</span><b className={c.amount < 0 ? 'neg' : 'pos'}>{fmt(c.amount)}</b><span>{c.reason}{c.note ? '・' + c.note : ''}</span>
            <button className="icon trash" aria-label="刪除" onClick={() => delMove(c)}><Icon name="trash" size={18} /></button></div>
        ))}
      </div>
      {day !== dayOf(Date.now()) && <p className="muted">正在檢視 {day} 的資料</p>}
    </div>
  )
}

// LINE Pay（轉帳、刷卡）對帳：App 登記的金額／筆數 vs 後台查到的金額／筆數
function PayCheck({ method, day }) {
  const s = useShop()
  const ui = useUi()
  const rec = methodDay(s.orders, day, method)
  const id = `${day}_${method}`
  const saved = s.payChecks[id]
  const [amt, setAmt] = useState(saved?.amount != null ? String(saved.amount) : '')
  const [cnt, setCnt] = useState(saved?.count != null ? String(saved.count) : '')
  const [open, setOpen] = useState(false)
  const name = METHOD_LABEL[method]
  const save = () => {
    commit(writeBatch(db).set(doc(db, s.eventPath, 'payChecks', id), {
      day, method, amount: amt === '' ? null : Number(amt), count: cnt === '' ? null : Number(cnt), ts: Date.now(), device: deviceId
    }))
    ui.toast(`已儲存 ${name} 對帳`, { kind: 'ok' })
  }
  const dirty = (amt === '' ? null : Number(amt)) !== (saved?.amount ?? null) || (cnt === '' ? null : Number(cnt)) !== (saved?.count ?? null)
  const bAmt = saved?.amount, bCnt = saved?.count
  const dA = bAmt == null ? null : bAmt - rec.total
  const dC = bCnt == null ? null : bCnt - rec.count
  if (!rec.count && !saved && method !== 'linepay') return null
  return (
    <div className="card recon paycheck">
      <h4>{name} 對帳<Help>{`把「${name}」後台（商家 App）這一天的收款總額與筆數填進來，跟好攤登記的比對。不一樣時，到「銷售」頁看是不是有單按錯付款方式（可以「改付款方式」修正），或漏記、重複記。`}</Help></h4>
      <div className="row between"><span>好攤登記</span><span><b>{fmt(rec.total)}</b>・{rec.count} 筆</span></div>
      <div className="paycheck-inputs">
        <label>後台金額<input className="num" inputMode="numeric" value={amt} placeholder="例：13380" onChange={(e) => setAmt(e.target.value.replace(/[^\d-]/g, ''))} /></label>
        <label>後台筆數<input className="num" inputMode="numeric" value={cnt} placeholder="選填" onChange={(e) => setCnt(e.target.value.replace(/[^\d]/g, ''))} /></label>
        <button className={'primary' + (dirty ? ' unsaved' : '')} onClick={save} disabled={!dirty}>儲存</button>
      </div>
      {dA != null && (
        <div className={'row between total ' + (dA === 0 && (dC == null || dC === 0) ? 'pos' : 'neg')}>
          <span>差額</span>
          <span>{dA === 0 ? '✓ 金額相符' : (dA > 0 ? '後台多 ' : '後台少 ') + fmt(Math.abs(dA))}{dC != null && dC !== 0 ? `・筆數${dC > 0 ? '多' : '少'} ${Math.abs(dC)} 筆` : dC === 0 ? '・筆數相符' : ''}</span>
        </div>
      )}
      {dA != null && dA !== 0 && <p className="muted small">{dA > 0 ? `可能有 ${name} 的單被記成現金或其他方式（到「銷售」按「改付款方式」），或漏記。` : `可能有單被誤記成 ${name}，或重複記了一筆。`}</p>}
      <button className="link small" onClick={() => setOpen(!open)}>{open ? '收起' : `看這天的 ${name} 明細（${rec.count} 筆）`}</button>
      {open && (
        <div className="paycheck-list">
          {rec.list.map((o) => (
            <div key={o.id} className="row between"><span className="muted">{timeOf(o.ts)}</span><span>{(o.items || []).map((i) => i.name).join('、').slice(0, 24) || TYPE_LABEL[o.type]}</span><b className={o.money.amount < 0 ? 'neg' : ''}>{fmt(o.money.amount)}</b></div>
          ))}
          {!rec.list.length && <p className="muted">這天沒有 {name} 的紀錄</p>}
        </div>
      )}
    </div>
  )
}

function CountForm({ title, data, prefill, denoms, onSave, onDirty, children }) {
  const [c, setC] = useState(() => ({ ...(data?.counts || prefill?.counts || {}) }))
  const total = countTotal(c)
  // 跟已儲存的數量不一樣（帶入的前次數量也算還沒存）
  const norm = (x) => JSON.stringify(denoms.map((d) => Number(x?.[d]) || 0))
  const dirty = data ? norm(c) !== norm(data.counts) : total > 0
  useEffect(() => { onDirty?.(dirty) }, [dirty])
  useEffect(() => () => onDirty?.(false), [])
  return (
    <div className="card count">
      <div className="row between"><h4>{title}</h4>{data ? <span className="muted">已存 {timeOf(data.ts)}</span>
        : prefill && <span className="hint small">已帶入 {prefill.day.slice(5).replace('-', '/')} {prefill.kind === 'close' ? '收攤' : '開店'}的數量，確認後按儲存</span>}</div>
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
      <div className="row gap save-row">
        <button className={'primary' + (dirty ? ' unsaved' : '')} onClick={() => onSave(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v) || 0])))}>儲存</button>
        {dirty && <span className="unsaved-note">尚未儲存</span>}
      </div>
      {children}
    </div>
  )
}
