import test from 'node:test'
import assert from 'node:assert/strict'
import { noteFields } from '../src/lib/notes.js'

test('心得欄位：自訂欄位、排序、已刪欄位、舊版整體心得', () => {
  const custom = [{ k: 'c1', label: '主辦單位' }]
  const keys = (n, o) => noteFields(n, custom, o).map(([k]) => k)
  assert.deepEqual(keys({}), ['crowd', 'customers', 'sales', 'booth', 'weather', 'improve', 'c1'])
  assert.deepEqual(keys({}, ['c1', 'weather']).slice(0, 3), ['c1', 'weather', 'crowd'])
  const n = { fields: { c9: '舊欄位內容' }, labels: { c9: '交通' }, all: '舊心得' }
  const f = noteFields(n, custom)
  assert.deepEqual(f.at(-2).slice(0, 2), ['c9', '交通'])
  assert.equal(f.at(-1)[0], 'all')
})
