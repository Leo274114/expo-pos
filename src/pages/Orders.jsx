import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useShop, useCarts, commit } from '../store.jsx'
import { fmt, timeOf, today, returnedMap, refundUnit, TYPE_LABEL, METHOD_LABEL, PAY_TYPE_LABEL, enabledMethods } from '../lib/calc.js'
import DaySelect from '../components/DaySelect.jsx'
import Modal from '../components/Modal.jsx'

export default function Orders() {
  const s = useShop()
  const [day, setDay] = useState(today())
  const [filter, setFilter] = useState('all')
  const [retFor, setRetFor] = useState(null)
  const [voidFor, setVoidFor] = useState(null)
  const [payFor, setPayFor] = useState(null)
  const retMap = returnedMap(s.orders)
  const list = s.orders.filter((o) => o.day === day && (filter === 'all' || (filter === 'void' ? o.status === 'void' : o.type === filter)))
  const no = Object.fromEntries([...s.orders].sort((a, b) => a.ts - b.ts).map((o, i) => [o.id, i + 1]))

  const doVoid = (o) => {
    const b = writeBatch(db)
    b.set(doc(db, s.eventPath, 'orders', o.id), { status: 'void', voidAt: Date.now() }, { merge: true })
    commit(b)
    setVoidFor(null)
  }

  return (
    <div className="page">
      <div className="row gap wrap toolbar">
        <DaySelect event={s.event} value={day} onChange={setDay} />
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">全部</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          <option value="void">已作廢</option>
        </select>
        <span className="muted">{list.length} 筆</span>
      </div>
      <div className="cards">
        {list.map((o) => <OrderCard key={o.id} o={o} no={no[o.id]} refNo={no[o.refOrderId]} returned={retMap[o.id]}
          onVoid={() => setVoidFor(o)} onReturn={() => setRetFor(o)} onPay={() => setPayFor(o)} />)}
        {!list.length && <p className="muted center">這天沒有單據</p>}
      </div>
      {voidFor && (
        <Modal title={`作廢 #${no[voidFor.id]}？`} onClose={() => setVoidFor(null)}
          footer={<><button onClick={() => setVoidFor(null)}>取消</button><button className="danger" onClick={() => doVoid(voidFor)}>確定作廢</button></>}>
          <p>作廢後卡片保留（灰色），庫存自動回補，不計入營業額。</p>
          <p className="muted">客人退貨請用「退換貨」，不要用作廢。</p>
        </Modal>
      )}
      {payFor && <PayMethodModal o={payFor} no={no[payFor.id]} onClose={() => setPayFor(null)} />}
      {retFor && <ReturnModal o={retFor} returned={retMap[retFor.id] || {}} no={no[retFor.id]} onClose={() => setRetFor(null)} />}
    </div>
  )
}

// 改付款方式：結帳時按錯（例：LINE Pay 按成現金），改了之後現金對帳、總結、Excel 自動重算；留下修改紀錄
function PayMethodModal({ o, no, onClose }) {
  const s = useShop()
  const cur = o.money?.method
  const [to, setTo] = useState(cur)
  const [last5, setLast5] = useState(o.money?.last5 || '')
  const methods = [...new Set([...enabledMethods(s.settings), cur])].filter(Boolean)
  const save = () => {
    if (to === cur && (to !== 'transfer' || last5 === (o.money?.last5 || ''))) return onClose()
    const money = { method: to, amount: o.money.amount }
    // 改成現金：視為剛好收（不找零）；改成轉帳：可記帳號後五碼
    if (to === 'cash' && cur === 'cash') Object.assign(money, { received: o.money.received, change: o.money.change })
    if (to === 'transfer' && last5) money.last5 = last5
    const payLog = [...(o.payLog || []), ...(to !== cur ? [{ ts: Date.now(), from: cur, to }] : [])]
    commit(writeBatch(db).set(doc(db, s.eventPath, 'orders', o.id), { money, payLog }, { merge: true }))
    onClose()
  }
  return (
    <Modal title={`改付款方式 #${no}`} onClose={onClose}
      footer={<><button onClick={onClose}>取消</button><button className="primary" onClick={save}>確定</button></>}>
      <p>金額 <b>{fmt(o.money.amount)}</b>，目前記為「{METHOD_LABEL[cur]}」。改成：</p>
      <div className="seg">
        {methods.map((k) => <button key={k} className={to === k ? 'on' : ''} onClick={() => setTo(k)}>{METHOD_LABEL[k]}</button>)}
      </div>
      {to === 'transfer' && (
        <label>帳號後五碼（選填）<input className="num" inputMode="numeric" maxLength={5} value={last5} onChange={(e) => setLast5(e.target.value.replace(/[^\d]/g, '').slice(0, 5))} /></label>
      )}
      <p className="muted">改了之後現金對帳的「應有現金」、總結的各付款方式金額、Excel 都會自動重算，卡片上會留下修改紀錄。</p>
    </Modal>
  )
}

export function OrderCard({ o, no, refNo, returned, onVoid, onReturn, onPay }) {
  const isVoid = o.status === 'void'
  const outQty = (o.items || []).filter((i) => !i.pre).reduce((a, i) => a + i.qty, 0)
  const retQty = Object.values(returned || {}).reduce((a, b) => a + b, 0)
  const canReturn = !isVoid && (o.type === 'sale' || o.type === 'exchange') && outQty > retQty
  const m = o.money
  return (
    <div className={'card order t-' + o.type + (isVoid ? ' void' : '')}>
      <div className="row between">
        <div>
          <b>#{no}</b> <span className="muted">{timeOf(o.ts)}</span> <span className={'badge type-' + o.type}>{TYPE_LABEL[o.type]}</span>
          {isVoid && <span className="badge gray">已作廢</span>}
          {retQty > 0 && <span className="badge red">{retQty >= outQty ? '已退貨' : '部分退貨'}</span>}
          {(o.promos || []).map((p) => <span key={p.id || p.text} className="badge type-gift">{p.text}{p.count > 1 ? ` ×${p.count}` : ''}</span>)}
          {o.pre && <span className="badge blue">{o.pre.shipped ? '已出貨' : '含預購'}</span>}
          {refNo && <span className="muted">（原單 #{refNo}）</span>}
        </div>
        <b className="amount">{m ? fmt(m.amount) : ''}</b>
      </div>
      <div className="order-lines">
        {(o.rets || []).map((r, i) => <div key={'r' + i} className="row between ret"><span>【退回】{r.name} × {r.qty}{r.restock ? '' : '（瑕疵）'}</span><span>-{fmt(r.price * r.qty)}</span></div>)}
        {(o.items || []).map((it, i) => (
          <div key={i} className="row between">
            <span>{it.pre ? '【預購】' : ''}{it.name} × {it.qty}{it.reason ? `（${it.reason}）` : ''}</span>
            <span>{o.type === 'gift' || o.type === 'brew' ? <span className="muted">{fmt(it.listPrice * it.qty)}</span> : <>
              {it.price !== it.listPrice && <s className="muted">{fmt(it.listPrice * it.qty)}</s>} {fmt(it.price * it.qty)}</>}</span>
          </div>
        ))}
      </div>
      <div className="order-foot muted">
        {o.discountAmt > 0 && <span>整單折扣 -{fmt(o.discountAmt)}　</span>}
        {o.shippingFee > 0 && <span>運費 {fmt(o.shippingFee)}　</span>}
        {o.pre && <span>{PAY_TYPE_LABEL[o.pre.payType]}　</span>}
        {o.gift && <span>贈與：{o.gift.to}{o.gift.note ? '・' + o.gift.note : ''}　</span>}
        {m?.method && <span>{METHOD_LABEL[m.method]}{m.last5 ? `（後五碼 ${m.last5}）` : ''}</span>}
        {m?.method === 'cash' && m?.received != null && m.received !== m.amount && <span>　收 {fmt(m.received)}・找 {fmt(m.change)}</span>}
        {o.note && o.type !== 'gift' && <span>　{o.note}</span>}
      </div>
      {(o.payLog || []).map((x, i) => (
        <div key={i} className="muted small pay-log">{timeOf(x.ts)} 付款方式 {METHOD_LABEL[x.from] || '—'} → {METHOD_LABEL[x.to]}</div>
      ))}
      {!isVoid && (onVoid || onReturn) && (
        <div className="row gap end">
          {m?.method && m.amount > 0 && onPay && <button onClick={onPay}>改付款方式</button>}
          {canReturn && onReturn && <button onClick={onReturn}>退換貨</button>}
          {onVoid && <button className="danger-outline" onClick={onVoid}>作廢</button>}
        </div>
      )}
    </div>
  )
}

function ReturnModal({ o, returned, no, onClose }) {
  const cs = useCarts()
  const nav = useNavigate()
  const items = (o.items || []).filter((i) => !i.pre)
  // 同一品項可能出現多列，依列計算剩餘可退
  const left = (() => {
    const used = { ...returned }
    return items.map((it) => { const u = Math.min(used[it.skuId] || 0, it.qty); used[it.skuId] = (used[it.skuId] || 0) - u; return it.qty - u })
  })()
  const [qty, setQty] = useState(items.map(() => 0))
  const [restock, setRestock] = useState(items.map(() => true))
  const total = items.reduce((a, it, i) => a + refundUnit(o, it) * qty[i], 0)
  const go = () => {
    const lines = items.map((it, i) => qty[i] > 0 && {
      key: 'r' + i + Date.now(), skuId: it.skuId, name: it.name, category: it.category, qty: qty[i], maxQty: left[i],
      price: refundUnit(o, it), listPrice: it.listPrice, ret: true, restock: restock[i], ...(it.components ? { components: it.components } : {})
    }).filter(Boolean)
    if (!lines.length) return
    cs.add({ name: `退換#${no}`, lines, refOrderId: o.id })
    onClose()
    nav('/')
  }
  return (
    <Modal title={`退換貨：#${no}`} onClose={onClose}
      footer={<><button onClick={onClose}>取消</button><button className="primary" disabled={!total && !qty.some(Boolean)} onClick={go}>下一步（到收銀）</button></>}>
      <p className="muted">選擇要退回的數量。退款金額已按整單折扣比例分攤。下一步可直接退款，或再加入換出的品項。</p>
      {items.map((it, i) => (
        <div key={i} className="ret-row">
          <div>{it.name}<div className="muted">每件退 {fmt(refundUnit(o, it))}・可退 {left[i]}</div></div>
          <div className="cl-qty">
            <button onClick={() => setQty(qty.map((q, j) => (j === i ? Math.max(0, q - 1) : q)))}>−</button>
            <span>{qty[i]}</span>
            <button onClick={() => setQty(qty.map((q, j) => (j === i ? Math.min(left[i], q + 1) : q)))}>＋</button>
          </div>
          <label className="check small"><input type="checkbox" checked={restock[i]} onChange={(e) => setRestock(restock.map((r, j) => (j === i ? e.target.checked : r)))} />回庫存</label>
        </div>
      ))}
      <div className="row between total"><span>退回金額</span><span>{fmt(total)}</span></div>
    </Modal>
  )
}
