import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseOrder, cnNum, textToAliases } from '../src/lib/voice.js'

const S = (id, productName, opts, productId) => ({ id, productName, opts, productId: productId || productName })
const skus = [
  S('a', '咖啡豆', ['SL-34', '日曬', '1/2磅']),
  S('b', '咖啡豆', ['SL-34', '日曬', '1/4磅']),
  S('c', '咖啡豆', ['藝伎', '水洗', '1/2磅']),
  S('d', '濾掛', ['日曬', '一盒']),
  S('e', '濾掛', ['日曬', '單包']),
  S('f', '蜂蜜', ['700g']),
  S('g', '茶', ['紅茶', '75g']),
  S('h', '原生山茶', ['紅茶', '75g']),
  S('i', '手沖咖啡', [])
]
const ids = (r) => r.map((x) => (x.sku ? `${x.sku.id}×${x.qty}` : `${x.status}×${x.qty}`))

test('中文數字', () => {
  assert.equal(cnNum('兩'), 2); assert.equal(cnNum('十'), 10); assert.equal(cnNum('十二'), 12); assert.equal(cnNum('二十'), 20); assert.equal(cnNum('3'), 3)
})

test('基本點單與別名', () => {
  assert.deepEqual(ids(parseOrder('SL-34 日曬半磅兩包，蜂蜜一瓶', skus)), ['a×2', 'f×1'])
  assert.deepEqual(ids(parseOrder('sl34日曬四分之一磅三包', skus)), ['b×3'])
  assert.deepEqual(ids(parseOrder('藝妓水洗半磅一包', skus)), ['c×1'])
})

test('沒有標點也能斷句', () => {
  assert.deepEqual(ids(parseOrder('SL34日曬半磅兩包蜂蜜一瓶手沖咖啡兩杯', skus)), ['a×2', 'f×1', 'i×2'])
})

test('「一盒」是選項不是數量', () => {
  assert.deepEqual(ids(parseOrder('濾掛日曬一盒兩個', skus)), ['d×2'])
  assert.deepEqual(ids(parseOrder('濾掛日曬一盒', skus)), ['d×1'])
})

test('資訊不足時要選', () => {
  const r = parseOrder('SL-34 日曬兩包', skus)
  assert.equal(r[0].status, 'pick'); assert.equal(r[0].qty, 2)
  assert.deepEqual(r[0].candidates.map((k) => k.id).sort(), ['a', 'b'])
  const t = parseOrder('紅茶75g', skus)
  assert.equal(t[0].status, 'pick')
  assert.deepEqual(ids(parseOrder('原生山茶紅茶75g', skus)), ['h×1'])
})

test('聽不懂的片段', () => {
  const r = parseOrder('今天天氣很好', skus)
  assert.equal(r[0].status, 'none')
})

test('自訂別名', () => {
  assert.deepEqual(ids(parseOrder('招牌豆兩包', skus, { 招牌豆: 'SL-34' })).length, 1)
  assert.deepEqual(textToAliases('A=B\n壞行\nC＝D'), { A: 'B', C: 'D' })
})
