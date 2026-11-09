import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cartTotals, computeStock, changeBreakdown, refundUnit, returnedMap, summarize, expectedCash,
  lowStockCrossings, preIndex, dayOf, hourOf, discountAmount
} from '../src/lib/calc.js'

const L = (o) => ({ key: Math.random(), qty: 1, price: 100, listPrice: 100, ...o })

test('台灣時區日期與小時', () => {
  const ts = Date.UTC(2026, 10, 12, 17, 30) // 台灣 11/13 01:30
  assert.equal(dayOf(ts), '2026-11-13')
  assert.equal(hourOf(ts), 1)
})

test('折扣：金額與折數', () => {
  assert.equal(discountAmount(1000, { type: 'amount', value: 50 }), 50)
  assert.equal(discountAmount(1000, { type: 'percent', value: 9 }), 100)
  assert.equal(discountAmount(1000, { type: 'percent', value: 8.5 }), 150)
  assert.equal(discountAmount(100, { type: 'amount', value: 500 }), 100)
})

test('一般購物車', () => {
  const t = cartTotals({ lines: [L({ qty: 2, price: 450, listPrice: 500 }), L({ price: 300, listPrice: 300 })], discount: { type: 'amount', value: 100 } })
  assert.equal(t.subtotal, 1200)
  assert.equal(t.listTotal, 1300)
  assert.equal(t.total, 1100)
  assert.equal(t.dueNow, 1100)
})

test('預定：全額、訂金、貨到付款', () => {
  const cart = { lines: [L({ price: 500 }), L({ price: 1000, pre: true })], discount: null }
  const full = cartTotals(cart, { shippingFee: 100, payType: 'full' })
  assert.equal(full.total, 1600); assert.equal(full.dueNow, 1600); assert.equal(full.due, 0)
  const dep = cartTotals(cart, { shippingFee: 100, payType: 'deposit', deposit: 300 })
  assert.equal(dep.dueNow, 800); assert.equal(dep.due, 800)
  const cod = cartTotals(cart, { shippingFee: 100, payType: 'cod' })
  assert.equal(cod.dueNow, 500); assert.equal(cod.due, 1100)
})

test('退換貨購物車：退款為負', () => {
  const t = cartTotals({ lines: [L({ ret: true, price: 450, qty: 2 }), L({ price: 500 })] })
  assert.equal(t.total, -400)
  assert.equal(t.dueNow, -400)
})

test('退款單價按整單折扣分攤', () => {
  const o = { subtotal: 1000, discountAmt: 100 }
  assert.equal(refundUnit(o, { price: 500 }), 450)
})

test('庫存計算：銷售、贈與、沖泡、退貨、作廢、預定、調整', () => {
  const init = { a: { initial: 10 }, b: { initial: 5 } }
  const orders = [
    { type: 'sale', items: [{ skuId: 'a', qty: 2 }, { skuId: 'b', qty: 1, pre: true }] },
    { type: 'gift', items: [{ skuId: 'a', qty: 1 }] },
    { type: 'brew', items: [{ skuId: 'b', qty: 1 }] },
    { type: 'return', rets: [{ skuId: 'a', qty: 1, restock: true }, { skuId: 'b', qty: 1, restock: false }] },
    { type: 'sale', status: 'void', items: [{ skuId: 'a', qty: 5 }] },
    { type: 'exchange', items: [{ skuId: 'b', qty: 1 }], rets: [{ skuId: 'a', qty: 1, restock: true }] }
  ]
  const s = computeStock(init, orders, [{ skuId: 'a', delta: -1 }])
  assert.equal(s.a, 10 - 2 - 1 + 1 + 1 - 1)
  assert.equal(s.b, 5 - 1 - 1)
})

test('找零建議', () => {
  assert.deepEqual(changeBreakdown(650, [1000, 500, 100, 50, 10, 5]).parts, [[500, 1], [100, 1], [50, 1]])
  assert.deepEqual(changeBreakdown(16, [10, 5]).rest, 1)
})

test('已退數量', () => {
  const m = returnedMap([{ type: 'return', refOrderId: 'x', rets: [{ skuId: 'a', qty: 1 }] }, { type: 'exchange', refOrderId: 'x', rets: [{ skuId: 'a', qty: 2 }] }, { type: 'return', status: 'void', refOrderId: 'x', rets: [{ skuId: 'a', qty: 9 }] }])
  assert.equal(m.x.a, 3)
})

test('低庫存通知', () => {
  const st = { lowStock: { 5: true, 3: true, 1: true } }
  assert.deepEqual(lowStockCrossings({ a: 6 }, { a: 5 }, st), [{ skuId: 'a', left: 5 }])
  assert.deepEqual(lowStockCrossings({ a: 5 }, { a: 4 }, st), [])
  assert.deepEqual(lowStockCrossings({ a: 2 }, { a: 0 }, st), [{ skuId: 'a', left: 0 }])
  assert.deepEqual(lowStockCrossings({ a: 9 }, { a: 2 }, { lowStock: { 5: false, 3: true, 1: true } }), [{ skuId: 'a', left: 2 }])
})

test('預定狀態與報表、現金對帳', () => {
  const d = '2026-11-13'
  const ts = Date.UTC(2026, 10, 13, 3) // 台灣 11 點
  const orders = [
    { id: 'o1', type: 'sale', day: d, ts, items: [{ skuId: 'a', name: 'A', qty: 1, listPrice: 500, price: 500 }, { skuId: 'b', name: 'B', qty: 1, listPrice: 1000, price: 1000, pre: true }],
      subtotal: 1500, discountAmt: 0, shippingFee: 100, money: { method: 'cash', amount: 800, received: 1000, change: 200 },
      pre: { payType: 'deposit', preTotal: 1100, paidNow: 300, due: 800, shipped: false } },
    { id: 'o2', type: 'collect', day: d, ts, refOrderId: 'o1', money: { method: 'linepay', amount: 500 } },
    { id: 'o3', type: 'gift', day: d, ts, gift: { to: '長官' }, items: [{ skuId: 'a', name: 'A', qty: 2, listPrice: 500, price: 500 }], money: null },
    { id: 'o4', type: 'sale', day: d, ts, status: 'void', items: [{ skuId: 'a', name: 'A', qty: 1, listPrice: 500, price: 500 }], money: { method: 'cash', amount: 500 } }
  ]
  const ps = preIndex(orders)(orders[0])
  assert.equal(ps.left, 300); assert.equal(ps.paid, 800); assert.equal(ps.cancelled, false)
  const r = summarize(orders, d)
  assert.equal(r.revenue.total, 1300); assert.equal(r.revenue.cash, 800); assert.equal(r.revenue.linepay, 500)
  assert.equal(r.hourly[11], 1300)
  assert.equal(r.pre.due, 300)
  assert.equal(r.gifts.byTo['長官'].value, 1000)
  assert.equal(r.shipTotal, 100)
  const e = expectedCash(orders, d, 3000, [{ day: d, amount: -50 }])
  assert.equal(e.expected, 3750)
  const cancelled = preIndex([...orders, { type: 'cancelPre', refOrderId: 'o1', money: { method: 'cash', amount: -800 } }])(orders[0])
  assert.equal(cancelled.cancelled, true)
})

test('組成：套裝與盒裝扣單包庫存', async () => {
  const { componentAvail } = await import('../src/lib/calc.js')
  const init = { pack: { initial: 25 }, a: { initial: 4 }, b: { initial: 9 } }
  const orders = [
    { type: 'sale', items: [{ skuId: 'box', name: '一盒', qty: 2, components: [{ skuId: 'pack', qty: 10 }] }] },
    { type: 'sale', items: [{ skuId: 'set', name: '套裝', qty: 1, components: [{ skuId: 'a', qty: 1 }, { skuId: 'b', qty: 2 }] }] },
    { type: 'return', rets: [{ skuId: 'set', name: '套裝', qty: 1, restock: true, components: [{ skuId: 'a', qty: 1 }, { skuId: 'b', qty: 2 }] }] }
  ]
  const s = computeStock(init, orders, [])
  assert.equal(s.pack, 5); assert.equal(s.a, 4); assert.equal(s.b, 9)
  assert.equal(componentAvail([{ skuId: 'pack', qty: 10 }], (id) => s[id]), 0)
  assert.equal(componentAvail([{ skuId: 'a', qty: 1 }, { skuId: 'b', qty: 2 }], (id) => s[id]), 4)
  assert.equal(componentAvail([{ skuId: 'x', qty: 1 }], () => Infinity), Infinity)
})

import { promoHits, promoNext } from '../src/lib/calc.js'
test('滿額活動', () => {
  const ps = [{ id: 'a', threshold: 2500, text: '套餐兌換券' }, { id: 'b', threshold: 1500, text: '扭蛋', repeat: true }]
  assert.deepEqual(promoHits(2400, ps).map((x) => [x.id, x.count]), [['b', 1]])
  assert.deepEqual(promoHits(3100, ps).map((x) => [x.id, x.count]), [['a', 1], ['b', 2]])
  assert.deepEqual(promoHits(9999, [{ ...ps[0], on: false }]), [])
  assert.equal(promoNext(2200, [ps[0]]).gap, 300)
  assert.equal(promoNext(500, [ps[0]]), null)
  assert.equal(promoNext(2800, [ps[1]]).gap, 200)
})

import { soldOutTimes } from '../src/lib/calc.js'
test('完售紀錄', () => {
  const init = { a: { initial: 3 }, b: { initial: 5 } }
  const orders = [
    { type: 'sale', ts: 1000, items: [{ skuId: 'a', qty: 2 }] },
    { type: 'sale', ts: 2000, status: 'void', items: [{ skuId: 'a', qty: 1 }] },
    { type: 'gift', ts: 3000, items: [{ skuId: 'a', qty: 1 }] },
    { type: 'sale', ts: 4000, items: [{ skuId: 'b', qty: 1 }] }
  ]
  const r = soldOutTimes(init, orders, [{ skuId: 'a', delta: 2, ts: 5000 }])
  assert.deepEqual(r.map((x) => [x.skuId, x.ts, x.sold]), [['a', 3000, 2]])
})

import { supplyRows } from '../src/lib/calc.js'
test('耗材：用量 = 準備 − 剩餘，未填不算；已移除的耗材仍列出', () => {
  const items = [{ id: 'cup', name: '試飲杯', unit: '條' }, { id: 'bag', name: '手提袋', unit: '個' }]
  const rec = { cup: { prep: 10, left: 3 }, bag: { prep: 50 }, old: { name: '攪拌棒', unit: '包', prep: 2, left: 0 } }
  const r = supplyRows(items, rec)
  assert.equal(r.length, 3)
  assert.deepEqual(r[0], { id: 'cup', name: '試飲杯', unit: '條', prep: 10, left: 3, used: 7 })
  assert.equal(r[1].used, null)
  assert.equal(r[2].name, '攪拌棒'); assert.equal(r[2].used, 2)
  assert.deepEqual(supplyRows(items, {}).map((x) => x.used), [null, null])
})
