import { useState } from 'react'
import { doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useShop, useUi, commit, deviceId } from '../store.jsx'
import { fmt, timeOf, dayOf, preIndex, preTally, PAY_TYPE_LABEL, METHOD_LABEL, enabledMethods } from '../lib/calc.js'
import Modal from '../components/Modal.jsx'
import Help from '../components/Help.jsx'
import { HELP } from '../lib/help.js'
import { sortCats } from '../lib/template.js'

export default function Shipping() {
  const s = useShop()
  const ui = useUi()
  const [filter, setFilter] = useState('pending')
  const [tallyOpen, setTallyOpen] = useState(() => { try { return localStorage.getItem('pre-tally') !== '0' } catch { return true } })
  const toggleTally = () => { const v = !tallyOpen; setTallyOpen(v); try { localStorage.setItem('pre-tally', v ? '1' : '0') } catch {} }
  const [money, setMoney] = useState(null) // { o, kind: 'collect' | 'cancel', amount }
  const [edit, setEdit] = useState(null) // { o, name, phone, address, note }
  const saveShip = () => {
    const { o, ...f } = edit
    commit(writeBatch(db).set(doc(db, s.eventPath, 'shipping', o.id), { ...f, updatedAt: Date.now() }, { merge: true }))
    ui.toast('收件資料已更新', { kind: 'ok' })
    setEdit(null)
  }
  const preOf = preIndex(s.orders)
  const no = Object.fromEntries([...s.orders].sort((a, b) => a.ts - b.ts).map((o, i) => [o.id, i + 1]))
  const all = s.orders.filter((o) => o.pre && o.status !== 'void').map((o) => ({ o, ps: preOf(o) }))
  const list = all.filter(({ o, ps }) =>
    filter === 'all' ? true : filter === 'pending' ? !ps.cancelled && !o.pre.shipped : filter === 'shipped' ? o.pre.shipped && !ps.cancelled : ps.cancelled)

  // 預購品項統計：跟著上方分頁；「全部」不含已取消
  const pIdx = Object.fromEntries(s.products.map((p, i) => [p.id, i]))
  const skuOrder = Object.fromEntries(s.skus.map((k, i) => [k.id, (pIdx[k.productId] ?? 999) * 10000 + i]))
  const tallyOrders = list.filter(({ ps }) => filter === 'cancelled' || !ps.cancelled).map(({ o }) => o)
  const tally = preTally(tallyOrders, skuOrder)
  const tallyCats = {}
  for (const r of tally) (tallyCats[r.category] ||= { qty: 0, rows: [] }).rows.push(r), tallyCats[r.category].qty += r.qty
  const tallyLabel = { pending: '未出貨', shipped: '已出貨', cancelled: '已取消', all: '全部（不含已取消）' }[filter]

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
    ui.toast(kind === 'collect' ? `已收尾款 ${fmt(amount)}` : `已取消預購${amount ? `，退款 ${fmt(amount)}` : ''}`, { kind: 'ok' })
    setMoney(null)
  }

  return (
    <div className="page">
      <div className="toolbar">
        <div className="row between"><h3 style={{ margin: '0 0 8px' }}>預購單</h3><Help>{HELP.shipping}</Help></div>
        <div className="seg" style={{ margin: 0 }}>
        {[['pending', '未出貨'], ['shipped', '已出貨'], ['cancelled', '已取消'], ['all', '全部']].map(([k, v]) => (
          <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
            {v}{k === 'pending' ? `（${all.filter(({ o, ps }) => !ps.cancelled && !o.pre.shipped).length}）` : ''}
          </button>
        ))}
        </div>
      </div>
      {tally.length > 0 && (
        <div className="card pre-tally">
          <div className="row between">
            <h4 style={{ margin: 0 }}>預購品項統計 <span className="muted small">{tallyLabel}・{tallyOrders.length} 單</span></h4>
            <button className="small-btn" onClick={toggleTally}>{tallyOpen ? '收合' : '展開'}</button>
          </div>
          {tallyOpen && (
            <table>
              <thead><tr><th>品項</th><th className="num">數量</th><th className="num">單數</th></tr></thead>
              <tbody>
                {sortCats(Object.keys(tallyCats), s.settings.catOrder).map((cat) => [
                  <tr key={cat} className="cat-row"><td>{cat}</td><td className="num">{tallyCats[cat].qty}</td><td></td></tr>,
                  ...tallyCats[cat].rows.map((r) => (
                    <tr key={r.skuId || r.name}><td>{r.name}</td><td className="num"><b>{r.qty}</b></td><td className="num muted">{r.orders}</td></tr>
                  ))
                ])}
              </tbody>
            </table>
          )}
        </div>
      )}
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
                <div>👤 {sh.name || <span className="miss">未填收件人</span>}　📞 {sh.phone ? <a href={`tel:${sh.phone}`}>{sh.phone}</a> : <span className="miss">未填電話</span>}</div>
                <div>📍 {sh.address || <span className="miss">未填地址</span>}</div>
                {sh.note && <div className="muted">{sh.note}</div>}
                <button className="small-btn" onClick={() => setEdit({ o, name: sh.name || '', phone: sh.phone || '', address: sh.address || '', note: sh.note || '' })}>
                  {!sh.name || !sh.phone || !sh.address ? '補填收件資料' : '修改收件資料'}
                </button>
              </div>
              {!ps.cancelled && (
                <div className="row gap end">
                  {ps.left > 0 && <button onClick={() => setMoney({ o, kind: 'collect', amount: String(ps.left) })}>收尾款</button>}
                  <button onClick={() => toggleShipped(o)}>{o.pre.shipped ? '改回未出貨' : '✓ 已出貨'}</button>
                  {!o.pre.shipped && <button className="danger-outline" onClick={() => setMoney({ o, kind: 'cancel', amount: String(ps.paid) })}>取消預購</button>}
                </div>
              )}
            </div>
          )
        })}
        {!list.length && <p className="muted center">沒有資料</p>}
      </div>
      {edit && (
        <Modal title={`收件資料 #${no[edit.o.id]}`} onClose={() => setEdit(null)}
          footer={<><button onClick={() => setEdit(null)}>取消</button><button className="primary" onClick={saveShip}>儲存</button></>}>
          <div className="grid2">
            <label>收件人<input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
            <label>電話<input inputMode="tel" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></label>
          </div>
          <label>地址<input value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></label>
          <label>備註<input value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></label>
        </Modal>
      )}
      {money && (
        <Modal title={money.kind === 'collect' ? `收尾款 #${no[money.o.id]}` : `取消預購 #${no[money.o.id]}`} onClose={() => setMoney(null)}
          footer={<>
            <button onClick={() => setMoney(null)}>返回</button>
            {Number(money.amount) > 0
              ? enabledMethods(s.settings).map((k) => <button key={k} className="primary" onClick={() => submitMoney(k)}>{money.kind === 'collect' ? '收' : '退'} {METHOD_LABEL[k]}</button>)
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
