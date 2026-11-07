import { useState } from 'react'
import { useShop, useUi } from '../store.jsx'
import { fmt, today, summarize, countTotal, expectedCash, skuLabel } from '../lib/calc.js'
import { exportEventExcel } from '../lib/excel.js'
import DaySelect, { eventDays } from '../components/DaySelect.jsx'
import BarChart from '../components/BarChart.jsx'

export default function Summary() {
  const s = useShop()
  const ui = useUi()
  const [day, setDay] = useState(today())
  if (!s.eventId) return <div className="page"><div className="warn">請先建立展覽場次。</div></div>
  const r = summarize(s.orders, day)

  // 每小時：取有營業的時段，至少 10–18 點
  const hours = Object.keys(r.hourly).map(Number)
  const h0 = Math.min(10, ...hours), h1 = Math.max(18, ...hours)
  const hourly = []
  for (let h = h0; h <= h1; h++) hourly.push({ label: `${h}`, value: r.hourly[h] || 0 })

  const daily = eventDays(s.event).map((d) => ({ label: d.slice(5).replace('-', '/'), value: summarize(s.orders, d).revenue.total }))

  const rows = Object.values(r.perSku).sort((a, b) => (a.category || '').localeCompare(b.category || '') || b.amount - a.amount)
  const byCat = {}
  for (const x of rows) {
    const c = (byCat[x.category || '其他'] ||= { qty: 0, amount: 0, rows: [] })
    c.rows.push(x); c.qty += x.qty; c.amount += x.amount
  }

  const low = s.skus
    .filter((k) => k.active !== false && s.productById[k.productId]?.trackStock !== false && s.productById[k.productId]?.active !== false)
    .map((k) => ({ k, n: s.stock[k.id] ?? 0 }))
    .filter((x) => x.n <= 5)
    .sort((a, b) => a.n - b.n)

  const open = s.cashCounts[`${day}_open`], close = s.cashCounts[`${day}_close`]
  const exp = expectedCash(s.orders, day, open ? countTotal(open.counts) : 0, s.cashMoves)
  const diff = close ? countTotal(close.counts) - exp.expected : null

  return (
    <div className="page summary">
      <div className="row between wrap">
        <DaySelect event={s.event} value={day} onChange={setDay} />
        <button onClick={() => exportEventExcel(s).catch((e) => ui.toast('下載失敗：' + e.message, { kind: 'error' }))}>下載 Excel</button>
      </div>

      <div className="kpis">
        <div className="kpi main"><span>今日營業額</span><b>{fmt(r.revenue.total)}</b></div>
        <div className="kpi"><span>💵 現金</span><b>{fmt(r.revenue.cash)}</b></div>
        <div className="kpi"><span>LINE Pay</span><b>{fmt(r.revenue.linepay)}</b></div>
        <div className="kpi"><span>銷售筆數</span><b>{r.orderCount}</b></div>
      </div>

      <div className="card">
        <h4>每小時營業額</h4>
        <BarChart data={hourly} />
      </div>

      <div className="grid2">
        <div className="card">
          <h4>金額明細</h4>
          <div className="row between"><span>原價總額</span><span>{fmt(r.listTotal)}</span></div>
          <div className="row between"><span>折扣與特價</span><span>-{fmt(r.discountTotal)}</span></div>
          <div className="row between"><span>退貨金額</span><span>-{fmt(r.refundTotal)}</span></div>
          <div className="row between"><span>運費收入</span><span>{fmt(r.shipTotal)}</span></div>
          <div className="row between total"><span>實收</span><span>{fmt(r.revenue.total)}</span></div>
          <p className="muted small">實收以當天實際收到的錢計算（預定的訂金、尾款依收款日計入）。</p>
        </div>
        <div className="card">
          <h4>預定、贈與、沖泡</h4>
          <div className="row between"><span>預定&amp;宅配</span><span>{r.pre.orders} 筆・{r.pre.qty} 件</span></div>
          <div className="row between"><span>　已收／待收</span><span>{fmt(r.pre.paid)}／{fmt(r.pre.due)}</span></div>
          <div className="row between"><span>贈與</span><span>{r.gifts.count} 筆・價值 {fmt(r.gifts.value)}</span></div>
          {Object.entries(r.gifts.byTo).map(([k, v]) => <div key={k} className="row between muted"><span>　{k}</span><span>{v.count} 筆・{fmt(v.value)}</span></div>)}
          <div className="row between"><span>沖泡耗用</span><span>{r.brew.qty} 包</span></div>
          {s.settings.cashCount && (
            <>
              <h4>零錢對帳</h4>
              <div className="row between"><span>應有現金</span><span>{fmt(exp.expected)}</span></div>
              <div className="row between"><span>收攤實點</span><span>{close ? fmt(countTotal(close.counts)) : '尚未點算'}</span></div>
              {diff !== null && <div className={'row between ' + (diff === 0 ? 'pos' : 'neg')}><span>差額</span><span>{diff === 0 ? '✓ 相符' : fmt(diff)}</span></div>}
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h4>各品項銷售數量</h4>
        <div className="table-wrap">
          <table>
            <thead><tr><th>品項</th><th>銷售</th><th>預定</th><th>退回</th><th>贈與</th><th>沖泡</th><th>金額</th></tr></thead>
            <tbody>
              {Object.entries(byCat).map(([cat, c]) => [
                <tr key={cat} className="cat-row"><td>{cat}</td><td>{c.qty}</td><td colSpan={4}></td><td>{fmt(c.amount)}</td></tr>,
                ...c.rows.map((x) => (
                  <tr key={x.skuId}><td>{x.name}</td><td>{x.qty || ''}</td><td>{x.preQty || ''}</td><td>{x.retQty || ''}</td><td>{x.giftQty || ''}</td><td>{x.brewQty || ''}</td><td>{x.amount ? fmt(x.amount) : ''}</td></tr>
                ))
              ])}
              {!rows.length && <tr><td colSpan={7} className="muted center">這天還沒有銷售</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h4>展期每日營業額</h4>
          <BarChart data={daily} height={150} />
        </div>
        <div className="card">
          <h4>低庫存（≤ 5）</h4>
          {low.map(({ k, n }) => (
            <div key={k.id} className="row between"><span>{skuLabel(k, s.productById[k.productId])}</span><b className={n <= 0 ? 'neg' : ''}>{n <= 0 ? '售完' : n}</b></div>
          ))}
          {!low.length && <p className="muted">庫存充足</p>}
        </div>
      </div>
    </div>
  )
}
