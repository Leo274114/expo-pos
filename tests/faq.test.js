import test from 'node:test'
import assert from 'node:assert/strict'
import { searchFaq, FAQ, FEATURES, DISCLAIMER } from '../src/lib/faq.js'
import { priceListRows } from '../src/lib/excel.js'

test('Q&A 搜尋：多關鍵字都要符合', () => {
  assert.equal(searchFaq(FAQ, '').length, FAQ.length)
  assert.ok(searchFaq(FAQ, '沒網路').length >= 1)
  assert.ok(searchFaq(FAQ, '價目表 列印').length >= 1)
  assert.equal(searchFaq(FAQ, 'zzz不存在').length, 0)
  assert.ok(FEATURES.length > 20)
  assert.ok(DISCLAIMER.some((d) => d.t.includes('不要登出')))
})

test('價目表依類別順序、只列上架品項', () => {
  const products = [
    { id: 'p1', name: '濾掛', category: '濾掛', unit: '包' },
    { id: 'p2', name: 'SL-34', category: '咖啡豆', unit: '包' },
    { id: 'p3', name: '下架', category: '其他', active: false }
  ]
  const skus = [
    { id: 'a', productId: 'p1', opts: ['水洗'], price: 50 },
    { id: 'b', productId: 'p2', opts: ['1/4磅'], price: 400, promoPrice: 350 },
    { id: 'c', productId: 'p2', opts: ['1/2磅'], price: 750, active: false },
    { id: 'd', productId: 'p3', price: 1 }
  ]
  const s = { products, skus, productById: Object.fromEntries(products.map((p) => [p.id, p])), settings: {} }
  const r = priceListRows(s)
  assert.deepEqual(r.map((x) => x.品項 + x.規格), ['SL-341/4磅', '濾掛水洗'])
  assert.equal(r[0].活動價, 350)
  assert.equal(r[1].活動價, '')
})
