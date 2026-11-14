import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useShop, useUi } from '../store.jsx'
import { fmt, summarize, daysBetween, timeOf, today, dayOf, preIndex } from '../lib/calc.js'
import { sortCats } from '../lib/template.js'
import BarChart from '../components/BarChart.jsx'
import CountUp from '../components/CountUp.jsx'
import Icon from '../components/Icon.jsx'
import Help from '../components/Help.jsx'
import useStickTop from '../components/useStickTop.js'
import { HELP } from '../lib/help.js'

// 浩子總覽：各攤位的銷售統計（讀不到庫存與宅配收件資料）
const list = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }))
const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }) : '—')

export default function Hq() {
  const s = useShop()
  const [shops, setShops] = useState(null) // [{ id, name, ownerEmail, events, current, total, count }]
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [pick, setPick] = useState(null) // { shopId, eventId }
  const [scope, setScope] = useState('event') // 累積客人數：day / event / all

  const load = async () => {
    setLoading(true); setErr('')
    try {
      const raw = list(await getDocs(collection(db, 'shops')))
      const out = await Promise.all(raw.map(async (sh) => {
        const events = list(await getDocs(collection(db, 'shops', sh.id, 'events'))).sort((a, b) => (b.start || '').localeCompare(a.start || ''))
        const cur = events.find((e) => e.id === sh.currentEventId) || events[0] || null
        // 每個場次的銷售單（用來算累積客人數、最後活動、逾期場次的未出貨預購）
        const byEvent = {}
        await Promise.all(events.map(async (e) => { byEvent[e.id] = list(await getDocs(collection(db, 'shops', sh.id, 'events', e.id, 'orders'))) }))
        const all = Object.values(byEvent).flat()
        const orders = cur ? byEvent[cur.id] : []
        const r = summarize(orders)
        const lastOrder = all.filter((o) => o.status !== 'void').reduce((m, o) => Math.max(m, o.ts || 0), 0)
        return {
          ...sh, events, cur, orders, byEvent, total: r.revenue.total, count: r.orderCount, lastOrder,
          lastActive: Math.max(lastOrder, sh.lastSeenAt || 0),
          customers: { day: summarize(all, today()).orderCount, event: r.orderCount, all: summarize(all).orderCount }
        }
      }))
      out.sort((a, b) => b.lastActive - a.lastActive)
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
        <div className="row between wrap">
          <h4>各攤位<Help>{HELP.hq}</Help><Help>{HELP.hqActivity}</Help></h4>
          <div className="seg small-seg">
            {[['day', '今天'], ['event', '本場次'], ['all', '全部']].map(([k, l]) => (
              <button key={k} className={scope === k ? 'on' : ''} onClick={() => setScope(k)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="table-wrap scroll-head">
          <table className="hq-table">
            <thead><tr><th>攤位</th><th>最後活動</th><th>開店清單</th><th>目前場次</th><th>營業額</th><th>客人數<div className="muted small">{{ day: '今天', event: '本場次', all: '全部' }[scope]}</div></th><th>帳號</th><th></th></tr></thead>
            <tbody>
              {all.map((x) => {
                const lamp = lampOf(x.lastOrder)
                const ob = x.onboard
                return (
                  <tr key={x.id} className={pick?.shopId === x.id ? 'on' : ''}>
                    <td><i className={'lamp ' + lamp.cls} title={lamp.text} />{x.logo && <img className="hq-logo" src={x.logo} alt="" />}<b>{x.name || '（未命名）'}</b>{x.id === s.shopId && <span className="badge">我</span>}</td>
                    <td className="small">{ago(x.lastActive)}</td>
                    <td className="small">{ob ? (
                      <><span className="ob-mini"><i style={{ width: `${(ob.done / ob.total) * 100}%` }} /></span>{ob.done}／{ob.total}{ob.next && <div className="muted">卡在：{ob.next}</div>}</>
                    ) : <span className="muted">—</span>}</td>
                    <td>{x.cur ? <>{x.cur.name}<div className="muted small">{x.cur.start}～{x.cur.end}</div></> : <span className="muted">尚未建立</span>}</td>
                    <td className="num big-cell">{fmt(x.total)}</td>
                    <td className="num">{x.customers[scope]}</td>
                    <td className="muted small">{x.ownerEmail || '—'}<div>加入 {fmtDate(x.consentAt || x.createdAt)}</div></td>
                    <td><button className="small-btn" disabled={!x.events.length} title={x.events.length ? '' : '這個攤位還沒建立場次'}
                      onClick={() => setPick({ shopId: x.id, eventId: x.cur?.id || [...x.events].sort((a, b) => (b.start || '').localeCompare(a.start || ''))[0].id })}>看明細</button></td>
                  </tr>
                )
              })}
              {!all.length && !loading && <tr><td colSpan={8} className="muted center">還沒有攤位</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="muted small"><i className="lamp green" />今天有單　<i className="lamp yellow" />7 天內有單　<i className="lamp" />超過 7 天或還沒開賣</p>
      </div>

      {pick && <ShopDetail shop={all.find((x) => x.id === pick.shopId)} eventId={pick.eventId}
        onEvent={(eventId) => setPick({ ...pick, eventId })} onClose={() => setPick(null)} />}

      <ExpoGroups shops={all} />

      <PurgeExpired shops={all} onDone={load} />

    </div>
  )
}

// 狀態燈：看最後一筆單據
function lampOf(ts) {
  if (!ts) return { cls: '', text: '還沒開賣' }
  if (dayOf(ts) === today()) return { cls: 'green', text: '今天有單' }
  if (Date.now() - ts < 7 * 86400000) return { cls: 'yellow', text: '7 天內有單' }
  return { cls: '', text: '超過 7 天沒有單' }
}

function ago(ts) {
  if (!ts) return <span className="muted">—</span>
  const m = Math.floor((Date.now() - ts) / 60000)
  const text = m < 1 ? '剛剛' : m < 60 ? `${m} 分鐘前` : m < 1440 ? `${Math.floor(m / 60)} 小時前` : `${Math.floor(m / 1440)} 天前`
  return <span title={new Date(ts).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}>{text}</span>
}

// 逾期：結束日 + 14 天（與安全規則相同，以 UTC 午夜計）
export const expiredAt = (end) => {
  const [y, m, d] = (end || '').split('-').map(Number)
  return y ? Date.UTC(y, m - 1, d) + 14 * 86400000 : Infinity
}

// 清除逾期資料：勾選後一次刪除（攤位與商品設定保留）
function PurgeExpired({ shops, onDone }) {
  const { toast } = useUi()
  const rows = useMemo(() => {
    const out = []
    for (const sh of shops) {
      for (const e of sh.events) {
        const at = expiredAt(e.end)
        if (Date.now() <= at) continue
        const orders = sh.byEvent?.[e.id] || []
        const preOf = preIndex(orders)
        const pending = orders.filter((o) => o.pre && o.status !== 'void' && !o.pre.shipped && !preOf(o).cancelled).length
        out.push({ key: `${sh.id}/${e.id}`, sh, e, orders, pending, days: Math.floor((Date.now() - at) / 86400000) })
      }
    }
    return out
  }, [shops])
  const [sel, setSel] = useState({})
  const [busy, setBusy] = useState('')
  useEffect(() => { setSel(Object.fromEntries(rows.map((r) => [r.key, r.pending === 0 && !!r.e.downloadedAt]))) }, [rows])

  const picked = rows.filter((r) => sel[r.key])
  const toggleShop = (shId, v) => setSel((x) => ({ ...x, ...Object.fromEntries(rows.filter((r) => r.sh.id === shId).map((r) => [r.key, v])) }))

  const run = async () => {
    if (!picked.length) return
    const shopsN = new Set(picked.map((r) => r.sh.id)).size
    const notDl = picked.filter((r) => !r.e.downloadedAt).length
    if (notDl && !confirm(`其中 ${notDl} 個場次攤商還沒下載 Excel，刪除後就找不回來了。確定要一起刪除？`)) return
    if (prompt(`將永久刪除 ${shopsN} 個攤位、${picked.length} 個逾期場次的銷售、庫存、零錢、收件資料與耗材紀錄（攤位與商品設定保留）。\n確定刪除請輸入：刪除`) !== '刪除') return
    let n = 0
    try {
      for (const r of picked) {
        setBusy(`刪除中：${r.sh.name}・${r.e.name}`)
        const base = ['shops', r.sh.id, 'events', r.e.id]
        const refs = r.orders.map((o) => doc(db, ...base, 'orders', o.id))
        // 收件資料讀不到，按訂單 ID 刪除
        for (const o of r.orders) if (o.pre) refs.push(doc(db, ...base, 'shipping', o.id))
        for (const c of ['stock', 'adjustments', 'supplies', 'cashCounts', 'cashMoves']) {
          const snap = await getDocs(collection(db, ...base, c))
          snap.docs.forEach((d) => refs.push(d.ref))
        }
        for (let i = 0; i < refs.length; i += 400) {
          const b = writeBatch(db)
          refs.slice(i, i + 400).forEach((x) => b.delete(x))
          await b.commit()
        }
        n += refs.length
        const b = writeBatch(db)
        b.delete(doc(db, ...base))
        if (r.sh.currentEventId === r.e.id) b.update(doc(db, 'shops', r.sh.id), { currentEventId: null })
        await b.commit()
      }
      toast(`已清除 ${picked.length} 個場次、${n} 筆資料`, { kind: 'ok' })
    } catch (e) {
      toast('刪除失敗：' + (e.code === 'permission-denied' ? '沒有權限，請確認已發布新版安全規則' : (e.code || e.message)), { kind: 'error', ms: 8000 })
    }
    setBusy('')
    onDone()
  }

  return (
    <div className="card">
      <h4>清除逾期資料<Help>{HELP.hqPurge}</Help></h4>
      {!rows.length ? <p className="muted">目前沒有逾期的場次（展覽結束 14 天後才會出現在這裡）。</p> : (
        <>
          <div className="table-wrap scroll-head">
            <table>
              <thead><tr><th></th><th>攤位</th><th>場次</th><th>結束日</th><th>逾期</th><th>單據</th><th>攤商已下載</th><th>未出貨預購</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.key} className={'expired-row' + (r.pending || !r.e.downloadedAt ? ' has-pending' : '')}>
                    <td><input type="checkbox" checked={!!sel[r.key]} onChange={(e) => setSel({ ...sel, [r.key]: e.target.checked })} /></td>
                    <td>{(i === 0 || rows[i - 1].sh.id !== r.sh.id) ? (
                      <label className="check"><input type="checkbox" checked={rows.filter((x) => x.sh.id === r.sh.id).every((x) => sel[x.key])}
                        onChange={(e) => toggleShop(r.sh.id, e.target.checked)} /><b>{r.sh.name || '（未命名）'}</b></label>
                    ) : ''}</td>
                    <td>{r.e.name}</td>
                    <td>{r.e.end}</td>
                    <td>{r.days} 天</td>
                    <td className="num">{r.orders.length}</td>
                    <td className="small">{r.e.downloadedAt ? <><i className="lamp green" />{fmtDate(r.e.downloadedAt)}</> : <><i className="lamp red" />還沒下載</>}</td>
                    <td className={r.pending ? 'neg' : 'muted'}>{r.pending ? `還有 ${r.pending} 筆` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row between wrap" style={{ marginTop: 10 }}>
            <span className="muted small">已勾選 {picked.length} 個場次{busy && `・${busy}`}<br /><i className="lamp green" />攤商已下載 Excel，可以放心刪除　<i className="lamp red" />還沒下載，預設不勾選</span>
            <button className="danger" disabled={!picked.length || !!busy} onClick={run}>刪除勾選項目</button>
          </div>
        </>
      )}
    </div>
  )
}

function ShopDetail({ shop, eventId, onEvent, onClose }) {
  useStickTop()
  const box = useRef(null)
  // 打開或換攤位時捲到明細，不然在畫面外看起來像沒反應
  useEffect(() => { setTimeout(() => box.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }, [shop?.id])
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
    <div className="card hq-detail" ref={box} style={{ scrollMarginTop: 60 }}>
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
        {r.revenue.transfer > 0 && <div className="kpi"><span>轉帳</span><b><CountUp key={eventId} value={r.revenue.transfer} /></b></div>}
        {r.revenue.card > 0 && <div className="kpi"><span>刷卡</span><b><CountUp key={eventId} value={r.revenue.card} /></b></div>}
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
              <div className="row between"><span>預購&amp;宅配</span><span>{r.pre.orders} 筆・{r.pre.qty} 件</span></div>
              <div className="row between"><span>贈與</span><span>{r.gifts.count} 筆・價值 {fmt(r.gifts.value)}</span></div>
              <div className="row between"><span>沖泡耗用</span><span>{r.brew.qty} 包</span></div>
              <div className="row between muted small"><span>最後一筆</span><span>{last ? `${last.day} ${timeOf(last.ts)}` : '—'}</span></div>
            </div>
          </div>
          <div className="card">
            <h4>各品項銷售（整個場次）</h4>
            <div className="sticky-head">
              <table>
                <thead><tr><th>品項</th><th>銷售</th><th>預購</th><th>退回</th><th>贈與</th><th>金額</th></tr></thead>
                <tbody>
                  {sortCats(Object.keys(byCat), shop.settings?.catOrder).map((cat) => [
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

// 同一個展覽（從展覽清單建立或分享的場次）的所有攤位放在一起看
function ExpoGroups({ shops }) {
  const groups = {}
  shops.forEach((sh) => sh.events.forEach((e) => {
    if (!e.expoId) return
    const g = groups[e.expoId] || (groups[e.expoId] = { name: e.name, start: e.start, end: e.end, rows: [] })
    const n = summarize(sh.byEvent[e.id] || []).orderCount
    g.rows.push({ id: sh.id, name: sh.name || '（未命名）', n })
  }))
  const list = Object.entries(groups).sort((a, b) => (b[1].start || '').localeCompare(a[1].start || ''))
  if (!list.length) return null
  return (
    <div className="card">
      <h4>各展覽的攤位</h4>
      {list.map(([id, g]) => {
        const rows = g.rows.sort((a, b) => b.n - a.n)
        return (
          <div key={id} className="expo-group">
            <div className="row between wrap">
              <b>{g.name}<span className="muted small">　{g.start}～{g.end}</span></b>
              <span className="small">{rows.length} 攤在用・有營業 {rows.filter((r) => r.n > 0).length} 攤・客人共 {rows.reduce((a, r) => a + r.n, 0)} 位</span>
            </div>
            <div className="chips">
              {rows.map((r) => <span key={r.id} className="chip">{r.name}　{r.n} 位</span>)}
            </div>
          </div>
        )
      })}
      <p className="muted small">客人數＝該場次的銷售單筆數（不含作廢、退換貨）。</p>
    </div>
  )
}
