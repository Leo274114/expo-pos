// 心得分項：各自一張卡片
export const NOTE_FIELDS = [
  ['crowd', '人潮', '哪幾天、哪些時段人多？走道人流如何？'],
  ['customers', '客群', '年齡層、外國客、同業、回頭客…'],
  ['sales', '好賣與不好賣的', '哪些一下就賣完、哪些沒人問、試喝後的反應'],
  ['booth', '攤位位置', '位置、動線、鄰攤、燈光、電源…'],
  ['weather', '天氣', '晴雨、冷熱，對人潮的影響'],
  ['improve', '下次要改進的', '備貨量、人手、零錢、陳列、價格…']
]
// 攤主自己加的欄位：存在攤位設定 noteCustom [{ k, label }]，所有場次共用
// 欄位名稱也會寫進每份心得的 labels，之後刪掉或改名，舊場次寫過的內容照樣顯示
// 舊版只有一欄「整體心得」：有寫的話顯示成「其他」
export const noteFields = (n, custom = []) => {
  const list = [...NOTE_FIELDS, ...custom.map((c) => [c.k, c.label, '', true])]
  const has = new Set(list.map(([k]) => k))
  for (const [k, t] of Object.entries(n?.fields || {})) {
    if (t && !has.has(k)) list.push([k, n.labels?.[k] || '自訂欄位', '', false, true])
  }
  if (n?.all) list.push(['all', '其他', ''])
  return list
}
export const newNoteKey = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
export const noteText = (n, k) => (k === 'all' ? n?.all : n?.fields?.[k]) || ''
export const hasNote = (n) => !!n && (!!n.all || Object.values(n.fields || {}).some(Boolean) || Object.values(n.days || {}).some(Boolean))

