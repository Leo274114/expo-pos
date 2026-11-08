import { soldOutTimes, preIndex, TYPE_LABEL, METHOD_LABEL, PAY_TYPE_LABEL, timeOf, orderMoves, summarize, countTotal, expectedCash, daysBetween, skuLabel } from './calc.js'

// 下載整個場次的 Excel
export async function exportEventExcel(s) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const add = (name, rows) => {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 說明: '無資料' }])
    const keys = Object.keys(rows[0] || { 說明: '' })
    ws['!cols'] = keys.map((k) => ({ wch: Math.max(8, Math.min(40, Math.max(k.length * 2, ...rows.map((r) => String(r[k] ?? '').length * 1.6)))) }))
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  const orders = [...s.orders].sort((a, b) => a.ts - b.ts)
  const no = Object.fromEntries(orders.map((o, i) => [o.id, i + 1]))
  const status = (o) => (o.status === 'void' ? '已作廢' : '')

  // 1. 銷售明細（每個品項一列）
  const detail = []
  for (const o of orders) {
    const base = {
      單號: no[o.id], 日期: o.day, 時間: timeOf(o.ts), 類型: TYPE_LABEL[o.type] || o.type, 狀態: status(o),
      付款方式: METHOD_LABEL[o.money?.method] || '', 本次收付: o.money?.amount || 0, 收款: o.money?.received ?? '', 找零: o.money?.change ?? '',
      整單折扣: o.discountAmt || 0, 運費: o.shippingFee || 0, 單據合計: o.total ?? '', 贈與對象: o.gift?.to || '', 滿額活動: (o.promos || []).map((p) => p.text + (p.count > 1 ? '×' + p.count : '')).join('、'), 備註: o.note || o.gift?.note || '',
      原單號: o.refOrderId ? no[o.refOrderId] || '' : ''
    }
    const lines = [
      ...(o.items || []).map((i) => ({ 品項: i.name, 數量: i.qty, 定價: i.listPrice, 實售價: i.price, 小計: i.price * i.qty, 預定: i.pre ? '是' : '', 改價原因: i.reason || '' })),
      ...(o.rets || []).map((r) => ({ 品項: '【退回】' + r.name, 數量: -r.qty, 定價: '', 實售價: r.price, 小計: -r.price * r.qty, 預定: '', 改價原因: r.restock ? '回庫存' : '瑕疵不回庫存' }))
    ]
    if (!lines.length) detail.push({ ...base, 品項: '', 數量: '', 定價: '', 實售價: '', 小計: '', 預定: '', 改價原因: '' })
    lines.forEach((l, idx) => detail.push(idx === 0 ? { ...base, ...l } : { 單號: base.單號, 日期: base.日期, 時間: base.時間, 類型: base.類型, 狀態: base.狀態, ...l }))
  }
  add('銷售明細', detail)

  // 2. 品項統計（全展期）
  const sum = summarize(orders)
  add('品項統計', Object.values(sum.perSku).map((x) => ({
    品項: x.name, 銷售數量: x.qty, 預定數量: x.preQty, 退回數量: x.retQty, 贈與數量: x.giftQty, 沖泡耗用: x.brewQty, 銷售金額: x.amount
  })))

  // 3. 每日營業額
  const days = daysBetween(s.event?.start, s.event?.end)
  const extra = [...new Set(orders.map((o) => o.day))].filter((d) => !days.includes(d))
  add('每日營業額', [...days, ...extra].sort().map((d) => {
    const r = summarize(orders, d)
    return { 日期: d, 現金: r.revenue.cash || 0, 'LINE Pay': r.revenue.linepay || 0, 合計: r.revenue.total, 原價總額: r.listTotal, 折扣總額: r.discountTotal, 退貨金額: r.refundTotal, 運費收入: r.shipTotal, 銷售筆數: r.orderCount }
  }))

  // 4. 庫存
  const stockRows = s.skus.filter((k) => s.productById[k.productId]?.trackStock !== false).map((k) => ({
    品項: skuLabel(k, s.productById[k.productId]), 初始庫存: s.stockInit[k.id]?.initial ?? 0, 目前庫存: s.stock[k.id] ?? 0, 定價: k.price, 活動價: k.promoPrice ?? ''
  }))
  add('庫存', stockRows)

  // 5. 庫存異動
  const moves = []
  for (const o of orders) for (const m of orderMoves(o)) moves.push({ 日期: o.day, 時間: timeOf(o.ts), 品項: s.labelOf(m.skuId), 異動: m.delta, 原因: m.reason, 單號: no[o.id] })
  for (const a of s.adjustments) moves.push({ 日期: a.day, 時間: timeOf(a.ts), 品項: a.name || s.labelOf(a.skuId), 異動: a.delta, 原因: '手動調整：' + a.reason + (a.note ? '・' + a.note : ''), 單號: '' })
  moves.sort((a, b) => (a.日期 + a.時間).localeCompare(b.日期 + b.時間))
  add('庫存異動', moves)

  // 完售紀錄
  add('完售紀錄', soldOutTimes(s.stockInit, orders, s.adjustments).map((x) => ({ 品項: s.labelOf(x.skuId), 完售日期: x.day, 完售時間: timeOf(x.ts), 賣出數量: x.sold })))

  // 6. 零錢對帳
  const cashRows = []
  for (const d of [...days, ...extra].sort()) {
    const open = s.cashCounts[`${d}_open`], close = s.cashCounts[`${d}_close`]
    const openTotal = open ? countTotal(open.counts) : 0
    const e = expectedCash(orders, d, openTotal, s.cashMoves)
    if (!open && !close && !e.cashSales) continue
    cashRows.push({
      日期: d, 開店零用金: openTotal, 現金收支: e.cashSales, 現金調整: e.adjustments, 應有現金: e.expected,
      收攤實點: close ? countTotal(close.counts) : '', 差額: close ? countTotal(close.counts) - e.expected : '',
      開店面額: open ? fmtCounts(open.counts) : '', 收攤面額: close ? fmtCounts(close.counts) : ''
    })
  }
  for (const c of s.cashMoves) cashRows.push({ 日期: c.day, 開店零用金: '', 現金收支: '', 現金調整: c.amount, 應有現金: '', 收攤實點: '', 差額: '', 開店面額: '調整原因：' + c.reason + (c.note ? '・' + c.note : ''), 收攤面額: '' })
  add('零錢對帳', cashRows)

  // 7. 退換貨
  add('退換貨', orders.filter((o) => o.type === 'return' || o.type === 'exchange' || o.type === 'cancelPre').map((o) => ({
    單號: no[o.id], 日期: o.day, 時間: timeOf(o.ts), 類型: TYPE_LABEL[o.type], 狀態: status(o), 原單號: no[o.refOrderId] || '',
    退回品項: (o.rets || []).map((r) => `${r.name}×${r.qty}${r.restock ? '' : '（瑕疵）'}`).join('、'),
    換出品項: (o.items || []).map((i) => `${i.name}×${i.qty}`).join('、'),
    收付金額: o.money?.amount || 0, 方式: METHOD_LABEL[o.money?.method] || ''
  })))

  // 8. 待出貨（含收件資料）
  const preOf = preIndex(orders)
  add('待出貨', orders.filter((o) => o.pre && o.status !== 'void').map((o) => {
    const sh = s.shipping[o.id] || {}
    const ps = preOf(o)
    return {
      單號: no[o.id], 日期: o.day, 狀態: ps.cancelled ? '已取消' : o.pre.shipped ? '已出貨' : '未出貨',
      品項: (o.items || []).filter((i) => i.pre).map((i) => `${i.name}×${i.qty}`).join('、'),
      付款方式: PAY_TYPE_LABEL[o.pre.payType] || '', 預定金額含運: o.pre.preTotal, 運費: o.shippingFee || 0, 已收: ps.paid,
      待收: ps.cancelled ? 0 : ps.left, 收件人: sh.name || '', 電話: sh.phone || '', 地址: sh.address || '', 備註: sh.note || ''
    }
  }))

  const name = `${s.shop?.name || '出攤記帳'}_${s.event?.name || ''}_${new Date().toISOString().slice(0, 10)}.xlsx`.replace(/[\\/:*?"<>|]/g, '_')
  XLSX.writeFile(wb, name)
}

const fmtCounts = (c = {}) => Object.entries(c).filter(([, n]) => Number(n)).sort((a, b) => b[0] - a[0]).map(([d, n]) => `${d}×${n}`).join(' ')
