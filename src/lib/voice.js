// 語音點單解析：把聽寫出來的文字拆成「品項 + 數量」
// 純函式，不依賴 React，方便測試。

// 內建別名：說法 → 系統裡的名稱（使用者可在管理頁再補）
export const DEFAULT_ALIASES = {
  半磅: '1/2磅', 半榜: '1/2磅', 二分之一磅: '1/2磅', '1/2榜': '1/2磅',
  四分之一磅: '1/4磅', 四分之一榜: '1/4磅', '1/4榜': '1/4磅', 一盎司: '1/4磅',
  藝妓: '藝伎', 依妓: '藝伎', 藝技: '藝伎', 波本: '波旁', 鐵比卡: '鐵皮卡', 鐵畢卡: '鐵皮卡', 索納: '索恩娜',
  日晒: '日曬', 蜜處裡: '蜜處理', 金軒: '金萱', 金宣: '金萱', 烏隆: '烏龍',
  滴漏: '濾掛', 掛耳: '濾掛', 苦茶油: '苦茶油', 蜂密: '蜂蜜'
}

const CN = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
// 中文數字（到 99）→ 數字
export function cnNum(s) {
  if (/^\d+$/.test(s)) return Number(s)
  if (s === '十') return 10
  const m = s.match(/^([一二兩三四五六七八九])?十([一二三四五六七八九])?$/)
  if (m) return (m[1] ? CN[m[1]] : 1) * 10 + (m[2] ? CN[m[2]] : 0)
  if (s.length === 1 && s in CN) return CN[s]
  return null
}

const UNITS = '包|盒|瓶|杯|個|份|袋|罐|組|條|支|入'
const NUM = '\\d+|[一二兩两三四五六七八九十]+'
const QTY_RE = new RegExp(`(${NUM})\\s*(?:${UNITS})`, 'g')
const SEP_RE = /[，,。.、；;！!？?\n]|還有|另外|然後|再來|再加|以及|和|跟/g

const norm = (s) => String(s || '').toLowerCase().replace(/[\s　]/g, '').replace(/[－—–]/g, '-')
const fullToHalf = (s) => s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))

// 建立詞彙表：商品名稱、選項值、別名
// skus: [{ id, label, productName, opts: [], productId }]
export function buildVocab(skus, aliases = {}) {
  const terms = new Map() // 正規化字串 → 標準名稱
  const add = (say, canon) => { const k = norm(say); if (k && !terms.has(k)) terms.set(k, canon) }
  for (const k of skus) {
    add(k.productName, k.productName)
    for (const o of k.opts || []) {
      add(o, o)
      if (o.includes('-')) add(o.replace(/-/g, ''), o) // SL-34 → SL34
    }
  }
  for (const [say, canon] of Object.entries({ ...DEFAULT_ALIASES, ...aliases })) add(say, canon)
  // 長的先比對，避免「茶」吃掉「原生山茶」
  return [...terms.entries()].sort((a, b) => b[0].length - a[0].length)
}

// 把文字中的詞彙換成記號，避免「一盒」被當成數量
function tokenize(text, vocab) {
  let s = norm(fullToHalf(text))
  const found = []
  for (const [k, canon] of vocab) {
    let i
    while ((i = s.indexOf(k)) >= 0) {
      found.push(canon)
      s = s.slice(0, i) + `\u0001${found.length - 1}\u0002` + s.slice(i + k.length)
    }
  }
  return { s, found }
}

// 主函式：回傳 [{ text, qty, status: 'ok'|'pick'|'none', sku, candidates }]
export function parseOrder(text, skus, aliases = {}) {
  if (!String(text || '').trim()) return []
  const vocab = buildVocab(skus, aliases)
  const { s, found } = tokenize(text, vocab)
  // 在「數量＋單位」後面斷句，再依標點與連接詞斷句
  const parts = s.replace(QTY_RE, (m) => m + '|').split('|').flatMap((p) => p.split(SEP_RE)).map((p) => p.trim()).filter(Boolean)
  const restore = (p) => p.replace(/\u0001(\d+)\u0002/g, (_, i) => found[i])

  const out = []
  for (const p of parts) {
    const terms = [...p.matchAll(/\u0001(\d+)\u0002/g)].map((m) => found[m[1]])
    const rest = p.replace(/\u0001\d+\u0002/g, ' ')
    let qty = 1
    const qm = [...rest.matchAll(new RegExp(`(${NUM})\\s*(?:${UNITS})?`, 'g'))].map((m) => cnNum(m[1])).filter((n) => n && n > 0)
    if (qm.length) qty = Math.min(999, qm[qm.length - 1])
    const shown = restore(p)
    if (!terms.length) {
      // 只有數量沒有品項（例如「兩包」）就併到上一項
      if (qm.length && out.length && !out[out.length - 1].qtyGiven) { out[out.length - 1].qty = qty; out[out.length - 1].qtyGiven = true; continue }
      if (shown.replace(/[\s|]/g, '')) out.push({ text: shown, qty, status: 'none', candidates: [] })
      continue
    }
    out.push({ text: shown, qty, qtyGiven: qm.length > 0, ...matchSku(terms, skus) })
  }
  return out
}

function matchSku(terms, skus) {
  const set = new Set(terms.map(norm))
  const scored = skus.map((k) => {
    const opts = k.opts || []
    const hit = opts.filter((o) => set.has(norm(o))).length
    const nameHit = set.has(norm(k.productName))
    const complete = opts.length > 0 && hit === opts.length
    const score = hit * 2 + (nameHit ? 3 : 0) + (complete ? 2 : 0)
    return { k, score, hit, nameHit, complete }
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score)
  if (!scored.length) return { status: 'none', candidates: [] }
  const top = scored[0]
  const ties = scored.filter((x) => x.score === top.score)
  // 只說了商品名稱，而且這個商品只有一種組合
  const onlyOne = top.nameHit && skus.filter((k) => k.productId === top.k.productId).length === 1
  if (ties.length === 1 && (top.complete || onlyOne || (!(top.k.opts || []).length && top.nameHit))) {
    return { status: 'ok', sku: top.k, candidates: [] }
  }
  return { status: 'pick', sku: null, candidates: scored.filter((x) => x.score >= top.score - 1).slice(0, 6).map((x) => x.k) }
}

// 管理頁的別名文字（每行「說法=名稱」）↔ 物件
export const aliasesToText = (a = {}) => Object.entries(a).map(([k, v]) => `${k}=${v}`).join('\n')
export function textToAliases(t = '') {
  const o = {}
  for (const line of t.split('\n')) {
    const m = line.split(/[=＝]/)
    if (m.length === 2 && m[0].trim() && m[1].trim()) o[m[0].trim()] = m[1].trim()
  }
  return o
}
