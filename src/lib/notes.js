// 心得分項：各自一張卡片
export const NOTE_FIELDS = [
  ['crowd', '人潮', '哪幾天、哪些時段人多？走道人流如何？'],
  ['customers', '客群', '年齡層、外國客、同業、回頭客…'],
  ['sales', '好賣與不好賣的', '哪些一下就賣完、哪些沒人問、試喝後的反應'],
  ['booth', '攤位位置', '位置、動線、鄰攤、燈光、電源…'],
  ['weather', '天氣', '晴雨、冷熱，對人潮的影響'],
  ['improve', '下次要改進的', '備貨量、人手、零錢、陳列、價格…']
]
// 舊版只有一欄「整體心得」：有寫的話顯示成「其他」
export const noteFields = (n) => [...NOTE_FIELDS, ...(n?.all ? [['all', '其他', '']] : [])]
export const noteText = (n, k) => (k === 'all' ? n?.all : n?.fields?.[k]) || ''
export const hasNote = (n) => !!n && (!!n.all || Object.values(n.fields || {}).some(Boolean) || Object.values(n.days || {}).some(Boolean))

