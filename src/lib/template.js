// 內建品項範本
export const TEMPLATE_LISTS = [
  { key: 'variety', name: '品種', values: ['SL-34', '波旁', '鐵皮卡', '索恩娜', '藝伎'] },
  { key: 'process', name: '處理法', values: ['水洗', '蜜處理', '日曬'] },
  { key: 'weight', name: '重量', values: ['1/4磅', '1/2磅'] },
  { key: 'pack', name: '包裝', values: ['單包', '一盒'] },
  { key: 'tea', name: '茶種', values: ['烏龍', '金萱', '紅茶'] }
]

export const TEMPLATE_PRODUCTS = [
  { name: '咖啡豆', category: '咖啡豆', unit: '包', levels: ['variety', 'process', 'weight'], trackStock: true },
  { name: '濾掛', category: '濾掛', unit: '包', levels: ['process', 'pack'], trackStock: true },
  { name: '茶', category: '茶', unit: '包', levels: ['tea'], trackStock: true },
  { name: '咖啡花', category: '咖啡周邊茶', unit: '包', levels: [], trackStock: true },
  { name: '咖啡果皮茶', category: '咖啡周邊茶', unit: '包', levels: [], trackStock: true },
  { name: '咖啡葉茶', category: '咖啡周邊茶', unit: '包', levels: [], trackStock: true },
  { name: '苦茶油', category: '其他', unit: '瓶', levels: [], trackStock: true },
  { name: '蜂蜜', category: '其他', unit: '瓶', levels: [], trackStock: true },
  { name: '手沖咖啡', category: '現場飲品', unit: '杯', levels: [], trackStock: false }
]

export const ADJUST_REASONS = ['盤點差異', '破損', '瑕疵', '補貨', '其他']
export const CASH_REASONS = ['找錯錢', '換零錢', '其他']
