import { useState } from 'react'
import { useShop, useUi } from '../store.jsx'
import { fmt, today, summarize, countTotal, expectedCash, skuLabel, soldOutTimes, timeOf } from '../lib/calc.js'
import { exportEventExcel } from '../lib/excel.js'
import DaySelect, { eventDays } from '../components/DaySelect.jsx'
import BarChart from '../components/BarChart.jsx'
import LineChart from '../components/LineChart.jsx'
import InView from '../components/InView.jsx'
import CountUp from '../components/CountUp.jsx'
import Icon from '../components/Icon.jsx'
import { sortCats } from '../lib/template.js'
import Help from '../components/Help.jsx'
import { HELP } from '../lib/help.js'
import { supplyRows } from '../components/Supplies.jsx'

export default function Summary() {
  const s = useShop()
  const ui = useUi()
  const [day, setDay] = useState(today())
  const [scope, setScope] = useState('day')
  if (!s.eventId) return <div className="page"><div className="warn">請先建立展覽場次。</div></div>
  const r = summarize(s.orders, day)

  // 每小時：取有營業的時段，至少 10–18 點
  const hours = Object.keys(r.hourly).map(Number)
  const h0 = Math.min(10, ...hours), h1 = Math.max(18, ...hours)
  const hourly = []
  for (let h = h0; h <= h1; h++) hourly.push({ label: `${h}`, value: r.hourly[h] || 0 })

  const daily = eventDays(s.event).map((d) => ({ label: d.slice(5).replace('-', '/'), value: summarize(s.orders, d).revenue.total }))

  // 各品項銷售數量：可切換「當天」或「整個展期」
  const itemSum = scope === 'event' ? summarize(s.orders) : r
  const rows = Object.values(itemSum.perSku).sort((a, b) => b.amount - a.amount)
  const byCatRaw = {}
  for (const x of rows) {
    const c = (byCatRaw[x.category || '其他'] ||= { qty: 0, amount: 0, rows: [] })
    c.rows.push(x); c.qty += x.qty; c.amount += x.amount
  }
  const byCat = Object.fromEntries(sortCats(Object.keys(byCatRaw), s.settings.catOrder).map((k) => [k, byCatRaw[k]]))

  const soldOut = soldOutTimes(s.stockInit, s.orders, s.adjustments)
  const startTs = Object.fromEntries(eventDays(s.event).map((d) => [d, null]))
  for (const o of s.orders) if (o.status !== 'void' && (startTs[o.day] == null || o.ts < startTs[o.day])) startTs[o.day] = o.ts
  const low = s.skus
    .filter((k) => k.active !== false && !(k.components || []).length && s.productById[k.productId]?.trackStock !== false && s.productById[k.productId]?.active !== false)
    .map((k) => ({ k, n: s.stock[k.id] ?? 0 }))
    .filter((x) => x.n <= 5)
    .sort((a, b) => a.n - b.n)

  const open = s.cashCounts[`${day}_open`], close = s.cashCounts[`${day}_close`]
  const exp = expectedCash(s.orders, day, open ? countTotal(open.counts) : 0, s.cashMoves)
  const diff = close ? countTotal(close.counts) - exp.expected : null

  return (
    <div className="page summary">
      <div className="row between wrap toolbar">
        <DaySelect event={s.event} value={day} onChange={setDay} />
        <button onClick={() => exportEventExcel(s).catch((e) => ui.toast('下載失敗：' + e.message, { kind: 'error' }))}>下載 Excel</button>
      </div>

      <div className="kpis">
        <div className="kpi main"><span>今日營業額</span><b><CountUp key={day} value={r.revenue.total} /></b></div>
        <div className="kpi"><span><Icon name="cash" size={18} />現金</span><b><CountUp key={day} value={r.revenue.cash || 0} /></b></div>
        <div className="kpi"><span><Icon name="phonepay" size={18} />LINE Pay</span><b><CountUp key={day} value={r.revenue.linepay || 0} /></b></div>
        <div className="kpi"><span>銷售筆數</span><b><CountUp key={day} value={r.orderCount} money={false} /></b></div>
      </div>

      <div className="card">
        <h4>每小時營業額</h4>
        <BarChart key={'h' + day} data={hourly} />
      </div>

      <div className="grid2">
        <div className="card">
          <h4>金額明細<Help>{HELP.revenue}</Help></h4>
          <div className="row between"><span>原價總額</span><span>{fmt(r.listTotal)}</span></div>
          <div className="row between"><span>折扣與特價</span><span>-{fmt(r.discountTotal)}</span></div>
          <div className="row between"><span>退貨金額</span><span>-{fmt(r.refundTotal)}</span></div>
          <div className="row between"><span>運費收入</span><span>{fmt(r.shipTotal)}</span></div>
          <div className="row between total"><span>實收</span><span>{fmt(r.revenue.total)}</span></div>
          <p className="muted small">實收以當天實際收到的錢計算（預購的訂金、尾款依收款日計入）。</p>
        </div>
        <div className="card">
          <h4>預購、贈與、沖泡</h4>
          <div className="row between"><span>預購&amp;宅配</span><span>{r.pre.orders} 筆・{r.pre.qty} 件</span></div>
          <div className="row between"><span>　已收／待收</span><span>{fmt(r.pre.paid)}／{fmt(r.pre.due)}</span></div>
          <div className="row between"><span>贈與</span><span>{r.gifts.count} 筆・價值 {fmt(r.gifts.value)}</span></div>
          {Object.entries(r.gifts.byTo).map(([k, v]) => <div key={k} className="row between muted"><span>　{k}</span><span>{v.count} 筆・{fmt(v.value)}</span></div>)}
          <div className="row between"><span>沖泡耗用</span><span>{r.brew.qty} 包</span></div>
          {Object.entries(r.promos).map(([k, n]) => <div key={k} className="row between"><span>滿額活動：{k}</span><span>{n} 份</span></div>)}
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

      <InView className="card">
        <div className="row between wrap">
          <h4>熱賣排行（前 10 名）</h4>
          <span className="muted small">{scope === 'event' ? '整個展期' : day === today() ? '今天' : day.slice(5).replace('-', '/')}・依銷售數量</span>
        </div>
        <HotRank rows={rows} />
      </InView>

      <div className="card">
        <div className="row between wrap">
          <h4>各品項銷售數量</h4>
          <div className="seg small-seg">
            <button className={scope === 'day' ? 'on' : ''} onClick={() => setScope('day')}>{day === today() ? '今天' : day.slice(5).replace('-', '/')}</button>
            <button className={scope === 'event' ? 'on' : ''} onClick={() => setScope('event')}>整個展期</button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>品項</th><th>銷售</th><th>預購</th><th>退回</th><th>贈與</th><th>沖泡</th><th>金額</th></tr></thead>
            <tbody>
              {Object.entries(byCat).map(([cat, c]) => [
                <tr key={cat} className="cat-row"><td>{cat}</td><td>{c.qty}</td><td colSpan={4}></td><td>{fmt(c.amount)}</td></tr>,
                ...c.rows.map((x) => (
                  <tr key={x.skuId}><td>{x.name}</td><td>{x.qty || ''}</td><td>{x.preQty || ''}</td><td>{x.retQty || ''}</td><td>{x.giftQty || ''}</td><td>{x.brewQty || ''}</td><td>{x.amount ? fmt(x.amount) : ''}</td></tr>
                ))
              ])}
              {!rows.length && <tr><td colSpan={7} className="muted center">{scope === 'event' ? '展期內還沒有銷售' : '這天還沒有銷售'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid2">
        <InView className="card">
          <h4>展期每日營業額</h4>
          <LineChart data={daily} height={150} />
        </InView>
        <div className="card">
          <h4>低庫存（≤ 5）</h4>
          {low.map(({ k, n }) => (
            <div key={k.id} className="row between"><span>{skuLabel(k, s.productById[k.productId])}</span><b className={n <= 0 ? 'neg' : ''}>{n <= 0 ? '售完' : n}</b></div>
          ))}
          {!low.length && <p className="muted">庫存充足</p>}
        </div>
      </div>

      <div className="card">
        <h4>完售紀錄<Help>{HELP.soldOut}</Help></h4>
        <div className="table-wrap">
          <table className="soldout-table">
            <thead><tr><th>品項</th><th>完售日期</th><th>完售時間</th><th>當天第一筆後</th><th>賣出</th></tr></thead>
            <tbody>
              {soldOut.map((x) => {
                const st = startTs[x.day]
                const mins = st ? Math.round((x.ts - st) / 60000) : null
                return (
                  <tr key={x.skuId} className={x.day === day ? 'on' : ''}>
                    <td>{s.labelOf(x.skuId)}</td>
                    <td>{x.day.slice(5).replace('-', '/')}</td>
                    <td className="num big-cell">{timeOf(x.ts)}</td>
                    <td className="muted">{mins == null ? '' : mins >= 60 ? `${Math.floor(mins / 60)} 小時 ${mins % 60} 分` : `${mins} 分`}</td>
                    <td>{x.sold}</td>
                  </tr>
                )
              })}
              {!soldOut.length && <tr><td colSpan={5} className="muted center">這個場次還沒有品項賣完</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h4>耗材（整個場次）<Help>{HELP.supplies}</Help></h4>
        <div className="table-wrap">
          <table className="supply-table">
            <thead><tr><th>耗材</th><th>展前準備</th><th>展後剩餘</th><th>本次用量</th></tr></thead>
            <tbody>
              {supplyRows(s).map((x) => (
                <tr key={x.id}>
                  <td>{x.name}</td>
                  <td>{x.prep == null ? '—' : `${x.prep} ${x.unit}`}</td>
                  <td>{x.left == null ? '—' : `${x.left} ${x.unit}`}</td>
                  <td className={'used ' + (x.used < 0 ? 'neg' : '')}>{x.used == null ? '—' : `${x.used} ${x.unit}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">在「管理 → 耗材」填寫；非必填。</p>
      </div>
    </div>
  )
}

// 熱賣排行：橫條長度代表銷售數量，進場時由左往右長出
function HotRank({ rows }) {
  const top = [...rows].filter((x) => x.qty > 0).sort((a, b) => b.qty - a.qty || b.amount - a.amount).slice(0, 10)
  if (!top.length) return <p className="muted">還沒有銷售</p>
  const max = top[0].qty
  return (
    <div className="hot-rank-list">
      {top.map((x, i) => (
        <div key={x.skuId} className="hr-row">
          <span className={'hr-no' + (i < 3 ? ' top' : '')}>{i + 1}</span>
          <span className="hr-name">{x.name}</span>
          <span className="hr-bar"><i style={{ width: `${(x.qty / max) * 100}%`, animationDelay: `${i * 50}ms` }} /></span>
          <span className="hr-qty num">{x.qty}</span>
          <span className="hr-amt num">{fmt(x.amount)}</span>
        </div>
      ))}
    </div>
  )
}
