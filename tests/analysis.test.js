import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseGrams, groupOf, onAt, buildSeries, hoursFor, tsAt, spreadLabels, withLog } from '../src/lib/analysis.js'

test('重量換算公克', () => {
  assert.equal(Math.round(parseGrams('1/4磅')), 113)
  assert.equal(Math.round(parseGrams('1/2磅')), 227)
  assert.equal(parseGrams('1公斤'), 1000)
  assert.equal(parseGrams('75g'), 75)
  assert.equal(Math.round(parseGrams('半磅')), 227)
  assert.equal(parseGrams('單包'), null)
})

const lists = [{ id: 'variety', name: '品種' }, { id: 'process', name: '處理法' }, { id: 'weight', name: '重量' }]
const bean = { id: 'p1', name: '咖啡豆', category: '咖啡豆', unit: '包', levels: ['variety', 'process', 'weight'] }

test('品種＋處理法合併成一個比較品項', () => {
  const a = groupOf({ productId: 'p1', opts: ['SL-34', '日曬', '1/4磅'] }, bean, lists)
  const b = groupOf({ productId: 'p1', opts: ['SL-34', '日曬', '1/2磅'] }, bean, lists)
  assert.equal(a.key, b.key)
  assert.equal(a.name, '咖啡豆・SL-34・日曬')
})

test('開關紀錄判斷某時刻是否啟用', () => {
  const k = { active: true, activeLog: [{ ts: 100, on: false }, { ts: 200, on: true }] }
  assert.equal(onAt(k, 50), true)
  assert.equal(onAt(k, 150), false)
  assert.equal(onAt(k, 250), true)
  assert.equal(onAt({ active: false }, 1), false)
  assert.deepEqual(withLog({}, true, 9).activeLog, [{ ts: 9, on: true }])
})

test('營業時間：預設與單日覆寫（null 代表同預設）', () => {
  const ev = { hours: { open: '10:00', close: '18:00', days: { '2026-11-16': { open: '10:00', close: '17:00' }, '2026-11-14': null } } }
  assert.equal(hoursFor(ev, '2026-11-13').close, '18:00')
  assert.equal(hoursFor(ev, '2026-11-14').close, '18:00')
  assert.equal(hoursFor(ev, '2026-11-16').close, '17:00')
  assert.equal(hoursFor({}, '2026-11-13').open, '10:00')
})

test('曲線：晚開賣的品項從開啟時間開始，公克累計、完售停止', () => {
  const day = '2026-11-13', open = tsAt(day, '10:00'), close = tsAt(day, '18:00')
  const skus = [
    { id: 'a1', productId: 'p1', opts: ['SL-34', '日曬', '1/4磅'] },
    { id: 'a2', productId: 'p1', opts: ['SL-34', '日曬', '1/2磅'] },
    { id: 'b1', productId: 'p1', opts: ['藝伎', '水洗', '1/4磅'], active: true, activeLog: [{ ts: open - 1000, on: false }, { ts: tsAt(day, '13:00'), on: true }] }
  ]
  const sale = (ts, skuId, qty) => ({ type: 'sale', day, ts, items: [{ skuId, qty }] })
  const orders = [sale(tsAt(day, '11:00'), 'a1', 2), sale(tsAt(day, '12:00'), 'a2', 1), sale(tsAt(day, '14:00'), 'b1', 1), { ...sale(tsAt(day, '15:00'), 'a1', 5), status: 'void' }]
  const out = buildSeries({ orders, skus, productById: { p1: bean }, optionLists: lists, day, open, close, now: close + 1,
    soldOut: [{ skuId: 'b1', ts: tsAt(day, '14:00'), day }], stockInit: { b1: { initial: 1 } } })
  const sl = out.find((x) => x.name.includes('SL-34'))
  const gs = out.find((x) => x.name.includes('藝伎'))
  assert.equal(sl.start, open)
  assert.equal(Math.round(sl.total), Math.round(113.4 * 2 + 226.8))
  assert.equal(gs.start, tsAt(day, '13:00'))
  assert.equal(gs.soldOutTs, tsAt(day, '14:00'))
  assert.equal(gs.end, tsAt(day, '14:00'))
  assert.equal(Math.round(gs.perHour), 113)
})

test('完售標籤錯開不重疊', () => {
  const out = spreadLabels([{ y: 50 }, { y: 52 }, { y: 54 }], 15, 0, 300)
  for (let i = 1; i < out.length; i++) assert.ok(out[i].y - out[i - 1].y >= 15)
})

test('得獎的和一般的分成兩個比較品項', () => {
  const a = groupOf({ productId: 'p1', opts: ['SL-34', '日曬', '1/4磅'], award: '金質獎' }, bean, lists)
  const b = groupOf({ productId: 'p1', opts: ['SL-34', '日曬', '1/2磅'], award: '金質獎' }, bean, lists)
  const c = groupOf({ productId: 'p1', opts: ['SL-34', '日曬', '1/4磅'] }, bean, lists)
  assert.equal(a.key, b.key)
  assert.notEqual(a.key, c.key)
  assert.equal(a.name, '咖啡豆・金質獎・SL-34・日曬')
})
