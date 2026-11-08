import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useShop } from '../store.jsx'
import { fmt, summarize, daysBetween, timeOf } from '../lib/calc.js'
import { sortCats } from '../lib/template.js'
import BarChart from '../components/BarChart.jsx'
import CountUp from '../components/CountUp.jsx'
import Icon from '../components/Icon.jsx'

// 浩子總覽：各攤位的銷售統計（讀不到庫存與宅配收件資料）
const list = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }))
const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }) : '—')

export default function Hq() {
  const s = useShop()
  const [shops, setShops] = useState(null) // [{ id, name, ownerEmail, events, current, total, count }]
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [pick, setPick] = useState(null) // { shopId, eventId }

  const load = async () => {
    setLoading(true); setErr('')
    try {
      const raw = list(await getDocs(collection(db, 'shops')))
      const out = await Promise.all(raw.map(async (sh) => {
        const events = list(await getDocs(collection(db, 'shops', sh.id, 'events'))).sort((a, b) => (b.start || '').localeCompare(a.start || ''))
        const cur = events.find((e) => e.id === sh.currentEventId) || events[0] || null
        let orders = []
        if (cur) orders = list(await getDocs(collection(db, 'shops', sh.id, 'events', cur.id, 'orders')))
        const r = summarize(orders)
        return { ...sh, events, cur, orders, total: r.revenue.total, count: r.orderCount }
      }))
      out.sort((a, b) => b.total - a.total)
      setShops(out)
    } catch (e) {
      setErr(e.code === 'permission-denied' ? '沒有權限：請確認 Firestore 的 admins 集合有你的帳號，且安全規則已發布。' : (e.code || e.message))
    }
    setLoading(false)
  }
  useEffect(() => { if (s.isAdmin) load() }, [s.isAdmin])

  if (!s.isAdmin) {
    return (
      <div className="page">
        <div className="card">
          <h3>浩子總覽</h3>
          <p>這個頁面只有系統管理者看得到。</p>
          <p className="muted small">你的帳號 ID：<code>{s.user?.uid}</code></p>
        </div>
      </div>
    )
  }

  const all = shops || []
  const grand = all.reduce((a, x) => a + x.total, 0)
  const active = all.filter((x) => x.count > 0).length

  return (
    <div className="page hq">
      <div className="toolbar row between">
        <h3 style={{ margin: 0 }}>浩子總覽</h3>
        <button onClick={load} disabled={loading}>{loading ? '讀取中…' : '重新整理'}</button>
      </div>
      {err && <div className="warn">{err}</div>}
      <p className="muted small">只顯示各攤位目前場次的銷售統計；看不到庫存數據與宅配收件資料。</p>

      <div className="kpis">
        <div className="kpi main"><span>所有攤位營業額（目前場次）</span><b><CountUp value={grand} /></b></div>
        <div className="kpi"><span>攤位數</span><b><CountUp value={all.length} money={false} /></b></div>
        <div className="kpi"><span>有營業的攤位</span><b><CountUp value={active} money={false} /></b></div>
        <div className="kpi"><span>銷售筆數</span><b><CountUp value={all.reduce((a, x) => a + x.count, 0)} money={false} /></b></div>
      </div>

      <div className="card">
        <h4>各攤位</h4>
        <div className="table-wrap">
          <table className="hq-table">
            <thead><tr><th>攤位</th><th>帳號</th><th>目前場次</th><th>營業額</th><th>筆數</th><th>加入日期</th><th></th></tr></thead>
            <tbody>
              {all.map((x) => (
                <tr key={x.id} className={pick?.shopId === x.id ? 'on' : ''}>
                  <td><b>{x.name || '（未命名）'}</b>{x.id === s.shopId && <span className="badge">我</span>}</td>
                  <td className="muted small">{x.ownerEmail || '—'}</td>
                  <td>{x.cur ? `${x.cur.name}` : <span className="muted">尚未建立</span>}</td>
                  <td className="num big-cell">{fmt(x.total)}</td>
                  <td className="num">{x.count}</td>
                  <td className="muted small">{fmtDate(x.consentAt || x.createdAt)}</td>
                  <td><button className="small-btn" disabled={!x.cur} onClick={() => setPick({ shopId: x.id, eventId: x.cur?.id })}>看明細</button></td>
                </tr>
              ))}
              {!all.length && !loading && <tr><td colSpan={7} className="muted center">還沒有攤位</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {pick && <ShopDetail shop={all.find((x) => x.id === pick.shopId)} eventId={pick.eventId}
        onEvent={(eventId) => setPick({ ...pick, eventId })} onClose={() => setPick(null)} />}
    </div>
  )
}

function ShopDetail({ shop, eventId, onEvent, onClose }) {
  const [orders, setOrders] = useState(null)
  const [err, setErr] = useState('')
  const event = shop?.events.find((e) => e.id === eventId)
  useEffect(() => {
    if (!shop || !eventId) return
    if (shop.cur?.id === eventId) { setOrders(shop.orders); return }
    setOrders(null)
    getDocs(collection(db, 'shops', shop.id, 'events', eventId, 'orders'))
      .then((snap) => setOrders(list(snap))).catch((e) => setErr(e.code || e.message))
  }, [shop?.id, eventId])

  const r = useMemo(() => summarize(orders || []), [orders])
  const days = useMemo(() => {
    const d = daysBetween(event?.start, event?.end)
    for (const o of orders || []) if (o.day && !d.includes(o.day)) d.push(o.day)
    return d.sort()
  }, [event, orders])
  const daily = days.map((d) => ({ label: d.slice(5).replace('-', '/'), value: summarize(orders || [], d).revenue.total }))
  const rows = Object.values(r.perSku)
  const byCat = {}
  for (const x of rows) (byCat[x.category || '其他'] ||= { qty: 0, amount: 0, rows: [] }).rows.push(x)
  for (const c of Object.values(byCat)) {
    c.rows.sort((a, b) => b.amount - a.amount)
    c.qty = c.rows.reduce((a, x) => a + x.qty, 0); c.amount = c.rows.reduce((a, x) => a + x.amount, 0)
  }
  const last = [...(orders || [])].filter((o) => o.status !== 'void').sort((a, b) => b.ts - a.ts)[0]

  if (!shop) return null
  return (
    <div className="card hq-detail">
      <div className="row between wrap">
        <h3 style={{ margin: 0 }}>{shop.name}</h3>
        <div className="row gap">
          <select value={eventId} onChange={(e) => onEvent(e.target.value)}>
            {shop.events.map((e) => <option key={e.id} value={e.id}>{e.name}（{e.start}～{e.end}）</option>)}
          </select>
          <button className="icon" onClick={onClose} aria-label="關閉"><Icon name="close" size={20} /></button>
        </div>
      </div>
      {err && <div className="warn">讀取失敗：{err}</div>}
      {!orders ? <p className="muted">讀取中…</p> : (
        <>
          <div className="kpis">
            <div className="kpi main"><span>場次營業額</span><b><CountUp key={eventId} value={r.revenue.total} /></b></div>
            <div className="kpi"><span><Icon name="cash" size={18} />現金</span><b><CountUp key={eventId} value={r.revenue.cash || 0} /></b></div>
            <div className="kpi"><span><Icon name="phonepay" size={18} />LINE Pay</span><b><CountUp key={eventId} value={r.revenue.linepay || 0} /></b></div>
            <div className="kpi"><span>銷售筆數</span><b><CountUp key={eventId} value={r.orderCount} money={false} /></b></div>
          </div>
          <div className="grid2">
            <div className="card">
              <h4>每日營業額</h4>
              <BarChart key={'d' + eventId} data={daily} height={150} />
            </div>
            <div className="card">
              <h4>金額與其他</h4>
              <div className="row between"><span>原價總額</span><span>{fmt(r.listTotal)}</span></div>
              <div className="row between"><span>折扣與特價</span><span>-{fmt(r.discountTotal)}</span></div>
              <div className="row between"><span>退貨金額</span><span>-{fmt(r.refundTotal)}</span></div>
              <div className="row between"><span>客單價</span><span>{r.orderCount ? fmt(r.revenue.total / r.orderCount) : '—'}</span></div>
              <div className="row between"><span>預定&amp;宅配</span><span>{r.pre.orders} 筆・{r.pre.qty} 件</span></div>
              <div className="row between"><span>贈與</span><span>{r.gifts.count} 筆・價值 {fmt(r.gifts.value)}</span></div>
              <div className="row between"><span>沖泡耗用</span><span>{r.brew.qty} 包</span></div>
              <div className="row between muted small"><span>最後一筆</span><span>{last ? `${last.day} ${timeOf(last.ts)}` : '—'}</span></div>
            </div>
          </div>
          <div className="card">
            <h4>各品項銷售（整個場次）</h4>
            <div className="table-wrap">
              <table>
                <thead><tr><th>品項</th><th>銷售</th><th>預定</th><th>退回</th><th>贈與</th><th>金額</th></tr></thead>
                <tbody>
                  {sortCats(Object.keys(byCat)).map((cat) => [
                    <tr key={cat} className="cat-row"><td>{cat}</td><td>{byCat[cat].qty}</td><td colSpan={3}></td><td>{fmt(byCat[cat].amount)}</td></tr>,
                    ...byCat[cat].rows.map((x) => (
                      <tr key={x.skuId}><td>{x.name}</td><td>{x.qty || ''}</td><td>{x.preQty || ''}</td><td>{x.retQty || ''}</td><td>{x.giftQty || ''}</td><td>{x.amount ? fmt(x.amount) : ''}</td></tr>
                    ))
                  ])}
                  {!rows.length && <tr><td colSpan={6} className="muted center">這個場次還沒有銷售</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
