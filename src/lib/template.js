// 內建品項範本
export const TEMPLATE_LISTS = [
  { key: 'variety', name: '品種', values: ['SL-34', '波旁', '鐵皮卡', '索恩娜', '藝伎'] },
  { key: 'process', name: '處理法', values: ['水洗', '蜜處理', '日曬'] },
  { key: 'weight', name: '重量', values: ['1/4磅', '1/2磅'] },
  { key: 'pack', name: '包裝', values: ['單包', '一盒'] },
  { key: 'tea', name: '茶種', values: ['烏龍', '金萱', '紅茶'] },
  { key: 'native', name: '原生山茶', values: ['白茶', '紅茶'] }
]

// 類別顯示順序；「周邊產品」預設是空的，讓攤主自由新增
export const CATEGORY_ORDER = ['咖啡豆', '濾掛', '茶葉', '咖啡周邊茶', '其他', '周邊產品', '套裝組合', '現場飲品']
export const sortCats = (cats) => [...cats].sort((a, b) => {
  const i = CATEGORY_ORDER.indexOf(a), j = CATEGORY_ORDER.indexOf(b)
  return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || a.localeCompare(b)
})

export const TEMPLATE_PRODUCTS = [
  { name: '咖啡豆', category: '咖啡豆', unit: '包', levels: ['variety', 'process', 'weight'], trackStock: true },
  { name: '濾掛', category: '濾掛', unit: '包', levels: ['process', 'pack'], trackStock: true },
  { name: '茶葉', category: '茶葉', unit: '包', levels: ['tea', 'weight'], trackStock: true },
  { name: '原生山茶', category: '茶葉', unit: '包', levels: ['native', 'weight'], trackStock: true },
  { name: '咖啡花', category: '咖啡周邊茶', unit: '包', levels: ['weight'], trackStock: true },
  { name: '咖啡果皮茶', category: '咖啡周邊茶', unit: '包', levels: ['weight'], trackStock: true },
  { name: '咖啡葉茶', category: '咖啡周邊茶', unit: '包', levels: ['weight'], trackStock: true },
  { name: '苦茶油', category: '其他', unit: '瓶', levels: ['weight'], trackStock: true },
  { name: '蜂蜜', category: '其他', unit: '瓶', levels: ['weight'], trackStock: true },
  { name: '手沖咖啡', category: '現場飲品', unit: '杯', levels: [], trackStock: false }
]

export const ADJUST_REASONS = ['盤點差異', '破損', '瑕疵', '補貨', '其他']
export const CASH_REASONS = ['找錯錢', '換零錢', '其他']

// 類別顏色：收銀畫面用來快速辨識品項
export const CATEGORY_COLOR = {
  咖啡豆: '#6f4a2f', 濾掛: '#b7791f', 茶葉: '#2f6b4f', 茶: '#2f6b4f', 套裝組合: '#8b4f8f', 咖啡周邊茶: '#b4343f',
  其他: '#c79a1b', 周邊產品: '#4a5f7a', 現場飲品: '#2b6c8f'
}
export const catColor = (c) => (c === '熱賣' ? '#b4343f' : CATEGORY_COLOR[c] || '#5b6b62')

// 各類別空白時的說明
export const CATEGORY_HINT = {
  周邊產品: '自由新增周邊產品，例如杯子、濾杯、帆布袋。',
  套裝組合: '優惠組合（例：A＋B＋C 特價）：新增商品後，在組合表格的「組成」選擇內含的品項，賣出時自動扣各品項庫存。'
}

// 畫面上方的顏色：預設幾種，也可以自己調
export const THEME_PRESETS = [
  { name: '茶園綠', color: '#183d2e' },
  { name: '琥珀橘', color: '#F58220' },
  { name: '咖啡棕', color: '#4a3022' },
  { name: '海鹽藍', color: '#1f4e6b' },
  { name: '櫻桃紅', color: '#8e2a33' },
  { name: '墨黑', color: '#1d2721' }
]
// 依背景亮度決定上方文字用深色或白色，確保看得清楚
export function textOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return (1.05) / (L + 0.05) >= (L + 0.05) / 0.05 ? '#ffffff' : '#1d2721'
}
