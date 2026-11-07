import { useState } from 'react'
import { doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useShop, useUi, commit, deviceId } from '../store.jsx'
import { fmt, timeOf, dayOf, preIndex, PAY_TYPE_LABEL, METHOD_LABEL } from '../lib/calc.js'
import Modal from '../components/Modal.jsx'

export default function Shipping() {
  const s = useShop()
  const ui = useUi()
  const [filter, setFilter] = useState('pending')
  const [money, setMoney] = useState(null) // { o, kind: 'collect' | 'cancel', amount }
  const preOf = preIndex(s.orders)
  const no = Object.fromEntries([...s.orders].sort((a, b) => a.ts - b.ts).map((o, i) => [o.id, i + 1]))
  const all = s.orders.filter((o) => o.pre && o.status !== 'void').map((o) => ({ o, ps: preOf(o) }))
  const list = all.filter(({ o, ps }) =>
    filter === 'all' ? true : filter === 'pending' ? !ps.cancelled && !o.pre.shipped : filter === 'shipped' ? o.pre.shipped && !ps.cancelled : ps.cancelled)

  const toggleShipped = (o) => commit(writeBatch(db).set(doc(db, s.eventPath, 'orders', o.id), { pre: { ...o.pre, shipped: !o.pre.shipped, shippedAt: Date.now() } }, { merge: true }))

  const submitMoney = (method) => {
    const { o, kind } = money
    const amount = Math.round(Number(money.amount) || 0)
    const now = Date.now()
    const b = writeBatch(db)
    b.set(doc(db, s.eventPath, 'orders', s.newId(`${s.eventPath}/orders`)), {
      type: kind === 'collect' ? 'collect' : 'cancelPre', ts: now, day: dayOf(now), device: deviceId, status: 'normal',
      items: [], rets: [], subtotal: 0, discountAmt: 0, shippingFee: 0, total: 0, refOrderId: o.id, note: `#${no[o.id]}`,
      money: amount ? { method, amount: kind === 'collect' ? amount : -amount } : { method: null, amount: 0 }
    })
    commit(b)
    ui.toast(kind === 'collect' ? `已收尾款 ${fmt(amount)}` : `已取消預定${amount ? `，退款 ${fmt(amount)}` : ''}`, { kind: 'ok' })
    setMoney(null)
  }

  return (
    <div className="page">
      <div className="seg">
        {[['pending', '未出貨'], ['shipped', '已出貨'], ['cancelled', '已取消'], ['all', '全部']].map(([k, v]) => (
          <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
            {v}{k === 'pending' ? `（${all.filter(({ o, ps }) => !ps.cancelled && !o.pre.shipped).length}）` : ''}
          </button>
        ))}
      </div>
      <div className="cards">
        {list.map(({ o, ps }) => {
          const sh = s.shipping[o.id] || {}
          return (
            <div key={o.id} className={'card' + (ps.cancelled ? ' void' : '')}>
              <div className="row between">
                <div><b>#{no[o.id]}</b> <span className="muted">{o.day.slice(5)} {timeOf(o.ts)}</span> <span className="badge blue">{PAY_TYPE_LABEL[o.pre.payType]}</span>
                  {o.pre.shipped && <span className="badge green">已出貨</span>}{ps.cancelled && <span className="badge gray">已取消</span>}</div>
                <div>已收 <b>{fmt(ps.paid)}</b>{ps.left > 0 && !ps.cancelled && <>・待收 <b className="neg">{fmt(ps.left)}</b></>}</div>
              </div>
              <div className="order-lines">
                {(o.items || []).filter((i) => i.pre).map((i, k) => <div key={k}>{i.name} × {i.qty}</div>)}
                {o.shippingFee > 0 && <div className="muted">運費 {fmt(o.shippingFee)}</div>}
              </div>
              <div className="ship-info">
                <div>👤 {sh.name}　📞 <a href={`tel:${sh.phone}`}>{sh.phone}</a></div>
                <div>📍 {sh.address}</div>
                {sh.note && <div className="muted">{sh.note}</div>}
              </div>
              {!ps.cancelled && (
                <div className="row gap end">
                  {ps.left > 0 && <button onClick={() => setMoney({ o, kind: 'collect', amount: String(ps.left) })}>收尾款</button>}
                  <button onClick={() => toggleShipped(o)}>{o.pre.shipped ? '改回未出貨' : '✓ 已出貨'}</button>
                  {!o.pre.shipped && <button className="danger-outline" onClick={() => setMoney({ o, kind: 'cancel', amount: String(ps.paid) })}>取消預定</button>}
                </div>
              )}
            </div>
          )
        })}
        {!list.length && <p className="muted center">沒有資料</p>}
      </div>
      {money && (
        <Modal title={money.kind === 'collect' ? `收尾款 #${no[money.o.id]}` : `取消預定 #${no[money.o.id]}`} onClose={() => setMoney(null)}
          footer={<>
            <button onClick={() => setMoney(null)}>返回</button>
            {Number(money.amount) > 0
              ? Object.entries(METHOD_LABEL).map(([k, v]) => <button key={k} className="primary" onClick={() => submitMoney(k)}>{money.kind === 'collect' ? '收' : '退'} {v}</button>)
              : <button className="primary" onClick={() => submitMoney(null)}>確定</button>}
          </>}>
          <label>{money.kind === 'collect' ? '收款金額' : '退款金額（已收的錢）'}
            <input className="num big" inputMode="numeric" value={money.amount} onChange={(e) => setMoney({ ...money, amount: e.target.value.replace(/[^\d]/g, '') })} />
          </label>
          {money.kind === 'cancel' && <p className="muted">LINE Pay 退款請到 LINE Pay 商家後台操作。</p>}
        </Modal>
      )}
    </div>
  )
}
