import { useMemo, useState } from 'react'
import { collection, getDocs, doc, writeBatch } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { auth, db } from '../firebase.js'
import { useShop, useUi, commit, deviceId } from '../store.jsx'
import { TEMPLATE_LISTS, TEMPLATE_PRODUCTS, ADJUST_REASONS, CATEGORY_ORDER, sortCats } from '../lib/template.js'
import { preIndex, PAY_TYPE_LABEL, skuLabel, today, dayOf, timeOf } from '../lib/calc.js'
import { exportEventExcel } from '../lib/excel.js'
import Modal from '../components/Modal.jsx'

const TABS = ['商品與價格', '選項清單', '展覽場次', '庫存調整', '功能設定', '資料下載']

export default function Admin() {
  const [tab, setTab] = useState(0)
  return (
    <div className="page admin">
      <div className="tabs">
        {TABS.map((t, i) => (
          <button key={t} className={i === tab ? 'on' : ''} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>
      {tab === 0 && <ProductsTab />}
      {tab === 1 && <ListsTab />}
      {tab === 2 && <EventsTab />}
      {tab === 3 && <AdjustTab />}
      {tab === 4 && <SettingsTab />}
      {tab === 5 && <DataTab />}
    </div>
  )
}

// 上下移動順序：把清單重新編號後寫回 order
function reorder(shopPath, coll, list, item, dir) {
  const i = list.findIndex((x) => x.id === item.id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  const b = writeBatch(db)
  next.forEach((x, k) => { if (x.order !== (k + 1) * 10) b.set(doc(db, shopPath, coll, x.id), { order: (k + 1) * 10 }, { merge: true }) })
  commit(b)
}

function MoveBtns({ onUp, onDown, first, last }) {
  return (
    <span className="move" onClick={(e) => e.stopPropagation()}>
      <button className="mv" disabled={first} onClick={onUp} aria-label="上移">▲</button>
      <button className="mv" disabled={last} onClick={onDown} aria-label="下移">▼</button>
    </span>
  )
}

// ---------------- 商品與價格 ----------------
function ProductsTab() {
  const s = useShop()
  const { toast } = useUi()
  const [adding, setAdding] = useState(null) // 預設類別
  const [open, setOpen] = useState(null)

  const seedTemplate = () => {
    const b = writeBatch(db)
    TEMPLATE_LISTS.forEach((l, i) => {
      if (!s.optionLists.find((x) => x.id === l.key))
        b.set(doc(db, s.shopPath, 'optionLists', l.key), { name: l.name, values: l.values, disabled: [], order: i })
    })
    TEMPLATE_PRODUCTS.forEach((p, i) => {
      if (s.products.find((x) => x.name === p.name)) return
      const pid = s.newId(`${s.shopPath}/products`)
      b.set(doc(db, s.shopPath, 'products', pid), { ...p, active: true, order: 100 + i })
      if (!p.levels.length) {
        const sid = s.newId(`${s.shopPath}/skus`)
        b.set(doc(db, s.shopPath, 'skus', sid), { productId: pid, opts: [], price: 0, promoPrice: null, active: true, order: 100 + i })
      }
    })
    commit(b)
    toast('已載入內建範本，請設定組合與價格')
  }

  // 開賣前用：清空所有商品、組合、選項清單與初始庫存，再重新載入範本
  const resetAll = async () => {
    if (prompt('將刪除所有商品、組合、選項清單與目前場次的初始庫存（已完成的銷售單不受影響），並重新載入內建範本。\n確定請輸入：重設') !== '重設') return
    const refs = [
      ...s.products.map((p) => doc(db, s.shopPath, 'products', p.id)),
      ...s.skus.map((k) => doc(db, s.shopPath, 'skus', k.id)),
      ...s.optionLists.map((l) => doc(db, s.shopPath, 'optionLists', l.id)),
      ...(s.eventPath ? Object.keys(s.stockInit).map((id) => doc(db, s.eventPath, 'stock', id)) : [])
    ]
    for (let i = 0; i < refs.length; i += 400) {
      const b = writeBatch(db)
      refs.slice(i, i + 400).forEach((r) => b.delete(r))
      await b.commit()
    }
    const b = writeBatch(db)
    TEMPLATE_LISTS.forEach((l, i) => b.set(doc(db, s.shopPath, 'optionLists', l.key), { name: l.name, values: l.values, disabled: [], order: i }))
    TEMPLATE_PRODUCTS.forEach((p, i) => {
      const pid = s.newId(`${s.shopPath}/products`)
      b.set(doc(db, s.shopPath, 'products', pid), { ...p, active: true, order: 100 + i })
      if (!p.levels.length) b.set(doc(db, s.shopPath, 'skus', s.newId(`${s.shopPath}/skus`)), { productId: pid, opts: [], price: 0, promoPrice: null, active: true, order: 100 + i })
    })
    await b.commit()
    toast('已重設為內建範本')
  }

  const grouped = useMemo(() => {
    const g = {}
    if (s.products.length) for (const c of CATEGORY_ORDER) g[c] = []
    for (const p of s.products) (g[p.category || '未分類'] ||= []).push(p)
    return sortCats(Object.keys(g)).map((c) => [c, g[c]])
  }, [s.products])

  return (
    <div>
      {!s.eventId && <div className="warn">尚未選擇展覽場次，請先到「展覽場次」建立並設為目前場次，才能填初始庫存。</div>}
      <div className="row gap">
        <button className="primary" onClick={() => setAdding('')}>＋ 新增商品</button>
        <button onClick={seedTemplate}>載入內建範本</button>
        {s.products.length > 0 && <button className="danger-outline" onClick={resetAll}>重設為內建範本</button>}
      </div>
      {grouped.map(([cat, ps]) => (
        <section key={cat}>
          <h3 className="cat row between">{cat}<button className="small-btn" onClick={() => setAdding(cat)}>＋ 新增到{cat}</button></h3>
          {!ps.length && <p className="muted">{cat === '周邊產品' ? '自由新增周邊產品，例如杯子、濾杯、帆布袋。' : '此類別沒有商品'}</p>}
          {ps.map((p, i) => (
            <ProductCard key={p.id} p={p} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)}
              move={<MoveBtns first={i === 0} last={i === ps.length - 1}
                onUp={() => reorder(s.shopPath, 'products', ps, p, -1)} onDown={() => reorder(s.shopPath, 'products', ps, p, 1)} />} />
          ))}
        </section>
      ))}
      {!s.products.length && <p className="muted">還沒有商品。可以先「載入內建範本」，再修改。</p>}
      {adding !== null && <ProductForm initialCategory={adding} onClose={() => setAdding(null)} />}
    </div>
  )
}

function ProductForm({ product, onClose, initialCategory = '' }) {
  const s = useShop()
  const [f, setF] = useState(product || { name: '', category: initialCategory, unit: initialCategory === '周邊產品' ? '個' : '包', levels: [], trackStock: true, active: true })
  const mySkus = product ? s.skus.filter((k) => k.productId === product.id) : []
  const hasCombos = mySkus.some((k) => (k.opts || []).length)
  const cats = sortCats([...new Set([...s.products.map((p) => p.category), ...CATEGORY_ORDER])].filter(Boolean))
  const levelsNow = f.levels.filter(Boolean)
  const levelsChanged = product && levelsNow.join('|') !== (product.levels || []).filter(Boolean).join('|')
  const save = () => {
    if (!f.name.trim()) return
    if (levelsChanged && hasCombos && !confirm(`修改選項層會刪除「${product.name}」現有的 ${mySkus.length} 個組合（含價格與初始庫存），已完成的銷售單不受影響。確定？`)) return
    const b = writeBatch(db)
    const levels = levelsNow
    const pid = product ? product.id : s.newId(`${s.shopPath}/products`)
    if (product) {
      b.set(doc(db, s.shopPath, 'products', pid), { ...f, levels }, { merge: true })
      if (levelsChanged) {
        mySkus.forEach((k) => {
          b.delete(doc(db, s.shopPath, 'skus', k.id))
          if (s.eventPath) b.delete(doc(db, s.eventPath, 'stock', k.id))
        })
      }
    } else {
      b.set(doc(db, s.shopPath, 'products', pid), { ...f, levels, order: Date.now() })
    }
    if (!levels.length && (!product || levelsChanged)) {
      b.set(doc(db, s.shopPath, 'skus', s.newId(`${s.shopPath}/skus`)), { productId: pid, opts: [], price: 0, promoPrice: null, active: true, order: Date.now() })
    }
    commit(b)
    onClose()
  }
  const setLevel = (i, v) => { const l = [...f.levels]; l[i] = v; setF({ ...f, levels: l }) }
  return (
    <Modal title={product ? '編輯商品' : '新增商品'} onClose={onClose}
      footer={<><button onClick={onClose}>取消</button><button className="primary" onClick={save}>儲存</button></>}>
      <label>名稱<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="例：咖啡豆" /></label>
      <label>類別<input list="cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="例：咖啡豆" /></label>
      <datalist id="cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
      <label>單位<input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="包、盒、瓶、杯" /></label>
      <label className="check"><input type="checkbox" checked={f.trackStock} onChange={(e) => setF({ ...f, trackStock: e.target.checked })} />計算庫存（現場飲品可取消）</label>
      <fieldset>
        <legend>選項層（最多三層）</legend>
        {levelsChanged && mySkus.length > 0 && <p className="warn">修改選項層會刪除現有的 {mySkus.length} 個組合，儲存後請重新產生組合並填價格。</p>}
        {[0, 1, 2].map((i) => (
          <select key={i} value={f.levels[i] || ''} onChange={(e) => setLevel(i, e.target.value)}>
            <option value="">— 第 {i + 1} 層：不使用 —</option>
            {s.optionLists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        ))}
        {!s.optionLists.length && <p className="muted">沒有選項清單，請先到「選項清單」建立，或載入內建範本。</p>}
      </fieldset>
    </Modal>
  )
}

function ProductCard({ p, open, onToggle, move }) {
  const s = useShop()
  const [edit, setEdit] = useState(false)
  const skus = s.skus.filter((k) => k.productId === p.id)
  const levels = (p.levels || []).map((id) => s.optionLists.find((l) => l.id === id)).filter(Boolean)
  const [pick, setPick] = useState(() => levels.map(() => []))

  const togglePick = (i, v) => setPick((pk) => {
    const n = pk.map((a) => [...a])
    while (n.length < levels.length) n.push([])
    n[i] = n[i].includes(v) ? n[i].filter((x) => x !== v) : [...n[i], v]
    return n
  })
  const combos = () => {
    let out = [[]]
    for (let i = 0; i < levels.length; i++) {
      const vals = pick[i] || []
      if (!vals.length) return []
      out = out.flatMap((c) => vals.map((v) => [...c, v]))
    }
    return out
  }
  const generate = () => {
    const exists = new Set(skus.map((k) => (k.opts || []).join('|')))
    const b = writeBatch(db)
    let n = 0
    combos().forEach((c, i) => {
      if (exists.has(c.join('|'))) return
      b.set(doc(db, s.shopPath, 'skus', s.newId(`${s.shopPath}/skus`)), { productId: p.id, opts: c, price: 0, promoPrice: null, active: true, order: Date.now() + i })
      n++
    })
    if (n) commit(b)
    setPick(levels.map(() => []))
  }
  const removeProduct = () => {
    if (!confirm(`刪除「${p.name}」與所有組合？已完成的銷售單不受影響。`)) return
    const b = writeBatch(db)
    skus.forEach((k) => b.delete(doc(db, s.shopPath, 'skus', k.id)))
    b.delete(doc(db, s.shopPath, 'products', p.id))
    commit(b)
  }

  return (
    <div className={'card product' + (p.active === false ? ' off' : '')}>
      <div className="row between" onClick={onToggle} style={{ cursor: 'pointer' }}>
        <div className="row gap">{move}<b>{p.name}</b> <span className="muted">｜{p.unit}｜{skus.length} 個組合{p.trackStock === false ? '｜不計庫存' : ''}</span></div>
        <span>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="product-body">
          <div className="row gap">
            <button onClick={() => setEdit(true)}>編輯商品</button>
            <button onClick={() => commit(writeBatch(db).set(doc(db, s.shopPath, 'products', p.id), { active: p.active === false }, { merge: true }))}>
              {p.active === false ? '啟用' : '停用'}
            </button>
            <button className="danger" onClick={removeProduct}>刪除</button>
          </div>
          {levels.length > 0 && (
            <div className="matrix">
              <h4>產生組合：每一層勾選要的選項</h4>
              {levels.map((l, i) => (
                <div key={l.id} className="chips">
                  <span className="chip-label">{l.name}</span>
                  {l.values.filter((v) => !(l.disabled || []).includes(v)).map((v) => (
                    <button key={v} className={'chip' + ((pick[i] || []).includes(v) ? ' on' : '')} onClick={() => togglePick(i, v)}>{v}</button>
                  ))}
                </div>
              ))}
              <button className="primary" disabled={!combos().length} onClick={generate}>產生 {combos().length} 個組合（已存在的會略過）</button>
            </div>
          )}
          <SkuTable product={p} skus={skus} />
        </div>
      )}
      {edit && <ProductForm product={p} onClose={() => setEdit(false)} />}
    </div>
  )
}

function SkuTable({ product, skus }) {
  const s = useShop()
  const setSku = (id, patch) => commit(writeBatch(db).set(doc(db, s.shopPath, 'skus', id), patch, { merge: true }))
  const setInit = (id, v) => s.eventPath && commit(writeBatch(db).set(doc(db, s.eventPath, 'stock', id), { initial: Number(v) || 0 }, { merge: true }))
  const del = (k) => { if (confirm('刪除這個組合？')) commit(writeBatch(db).delete(doc(db, s.shopPath, 'skus', k.id))) }
  if (!skus.length) return <p className="muted">還沒有組合。</p>
  return (
    <div className="table-wrap">
      <table className="sku-table">
        <thead>
          <tr><th></th><th>組合</th><th>定價</th><th>活動價</th>{product.trackStock !== false && <><th>初始庫存</th><th>目前</th></>}<th>啟用</th><th></th></tr>
        </thead>
        <tbody>
          {skus.map((k, i) => (
            <tr key={k.id} className={k.active === false ? 'off' : ''}>
              <td><MoveBtns first={i === 0} last={i === skus.length - 1}
                onUp={() => reorder(s.shopPath, 'skus', skus, k, -1)} onDown={() => reorder(s.shopPath, 'skus', skus, k, 1)} /></td>
              <td>{(k.opts || []).join('・') || product.name}</td>
              <td><NumCell value={k.price} onSave={(v) => setSku(k.id, { price: Number(v) || 0 })} /></td>
              <td><NumCell value={k.promoPrice ?? ''} placeholder="無" onSave={(v) => setSku(k.id, { promoPrice: v === '' ? null : Number(v) })} /></td>
              {product.trackStock !== false && (
                <>
                  <td><NumCell value={s.eventId ? (s.stockInit[k.id]?.initial ?? '') : ''} onSave={(v) => setInit(k.id, v)} disabled={!s.eventId} /></td>
                  <td className={(s.stock[k.id] ?? 0) <= 0 ? 'neg' : ''}>{s.stock[k.id] ?? 0}</td>
                </>
              )}
              <td><input type="checkbox" checked={k.active !== false} onChange={(e) => setSku(k.id, { active: e.target.checked })} /></td>
              <td><button className="icon" onClick={() => del(k)}>🗑️</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function NumCell({ value, onSave, placeholder, disabled }) {
  const v0 = value
  const [v, setV] = useState(null)
  const shown = v === null ? v0 : v
  return (
    <input className="num" inputMode="numeric" value={shown ?? ''} placeholder={placeholder} disabled={disabled}
      onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={() => { if (v !== null && String(v) !== String(v0 ?? '')) onSave(v); setV(null) }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
  )
}

// ---------------- 選項清單 ----------------
function ListsTab() {
  const s = useShop()
  const [newName, setNewName] = useState('')
  const addList = () => {
    if (!newName.trim()) return
    commit(writeBatch(db).set(doc(db, s.shopPath, 'optionLists', s.newId(`${s.shopPath}/optionLists`)), { name: newName.trim(), values: [], disabled: [], order: Date.now() }))
    setNewName('')
  }
  return (
    <div>
      <p className="muted">品種、處理法、重量等選項。停用的選項不會出現在新組合中，已有的組合不受影響。</p>
      {s.optionLists.map((l) => <ListCard key={l.id} l={l} />)}
      <div className="row gap">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="新的選項清單名稱，例：烘焙度" />
        <button onClick={addList}>＋ 新增清單</button>
      </div>
    </div>
  )
}

function ListCard({ l }) {
  const s = useShop()
  const [v, setV] = useState('')
  const save = (patch) => commit(writeBatch(db).set(doc(db, s.shopPath, 'optionLists', l.id), patch, { merge: true }))
  const add = () => {
    const x = v.trim()
    if (!x || l.values.includes(x)) return
    save({ values: [...l.values, x] }); setV('')
  }
  const dis = l.disabled || []
  return (
    <div className="card">
      <b>{l.name}</b>
      <div className="chips">
        {l.values.map((x) => (
          <button key={x} className={'chip' + (dis.includes(x) ? ' off' : ' on')} title="點一下停用／啟用"
            onClick={() => save({ disabled: dis.includes(x) ? dis.filter((d) => d !== x) : [...dis, x] })}>{x}</button>
        ))}
      </div>
      <div className="row gap">
        <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder={`新增${l.name}`} />
        <button onClick={add}>新增</button>
      </div>
    </div>
  )
}

// ---------------- 展覽場次 ----------------
function EventsTab() {
  const s = useShop()
  const { toast } = useUi()
  const [f, setF] = useState({ name: '2026 南港咖啡展', start: '2026-11-13', end: '2026-11-16' })
  const create = () => {
    if (!f.name || !f.start || !f.end || f.end < f.start) return toast('請填寫名稱與正確日期', { kind: 'error' })
    const id = s.newId(`${s.shopPath}/events`)
    const b = writeBatch(db)
    b.set(doc(db, s.shopPath, 'events', id), { ...f, createdAt: Date.now() })
    b.set(doc(db, s.shopPath), { currentEventId: id }, { merge: true })
    commit(b)
    toast('已建立並設為目前場次')
  }
  const setCurrent = (id) => commit(writeBatch(db).set(doc(db, s.shopPath), { currentEventId: id }, { merge: true }))
  const saveEv = (e, patch) => commit(writeBatch(db).set(doc(db, s.shopPath, 'events', e.id), patch, { merge: true }))

  const wipe = async (e) => {
    const word = prompt(`將永久刪除「${e.name}」的所有資料（銷售、庫存、零錢、收件資料）。\n請先下載 Excel。\n確定刪除請輸入：刪除`)
    if (word !== '刪除') return
    const subs = ['orders', 'stock', 'adjustments', 'cashCounts', 'cashMoves', 'shipping']
    let n = 0
    for (const c of subs) {
      const snap = await getDocs(collection(db, s.shopPath, 'events', e.id, c))
      for (let i = 0; i < snap.docs.length; i += 400) {
        const b = writeBatch(db)
        snap.docs.slice(i, i + 400).forEach((d) => { b.delete(d.ref); n++ })
        await b.commit()
      }
    }
    const b = writeBatch(db)
    b.delete(doc(db, s.shopPath, 'events', e.id))
    if (s.eventId === e.id) b.set(doc(db, s.shopPath), { currentEventId: null }, { merge: true })
    await b.commit()
    toast(`已刪除 ${n} 筆資料`)
  }

  return (
    <div>
      {s.events.map((e) => {
        const del = s.deleteAfterOf(e)
        const expired = del && today() >= del
        return (
          <div key={e.id} className={'card' + (e.id === s.eventId ? ' current' : '')}>
            <div className="row between">
              <b>{e.name}{e.id === s.eventId && <span className="badge">目前場次</span>}</b>
              {e.id !== s.eventId && <button onClick={() => setCurrent(e.id)}>設為目前場次</button>}
            </div>
            <div className="row gap">
              <label>開始<input type="date" value={e.start} onChange={(x) => saveEv(e, { start: x.target.value })} /></label>
              <label>結束<input type="date" value={e.end} onChange={(x) => saveEv(e, { end: x.target.value })} /></label>
            </div>
            <p className={expired ? 'warn' : 'muted'}>
              資料保留至 {del}（展覽結束後 14 天）{expired && '：已到期，請下載 Excel 後刪除'}
            </p>
            <button className="danger" onClick={() => wipe(e)}>刪除此場次資料</button>
          </div>
        )
      })}
      <div className="card">
        <h4>建立新場次</h4>
        <label>名稱<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <div className="row gap">
          <label>開始<input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
          <label>結束<input type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label>
        </div>
        <button className="primary" onClick={create}>建立</button>
      </div>
    </div>
  )
}

// ---------------- 庫存調整 ----------------
export function SkuPicker({ value, onChange, onlyStock = true }) {
  const s = useShop()
  const [q, setQ] = useState('')
  const list = s.skus
    .filter((k) => !onlyStock || s.productById[k.productId]?.trackStock !== false)
    .map((k) => ({ k, label: skuLabel(k, s.productById[k.productId]) }))
    .filter((x) => !q || x.label.toLowerCase().includes(q.toLowerCase()))
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋品項" />
      <select size={6} value={value || ''} onChange={(e) => onChange(e.target.value)} className="picker">
        {list.map(({ k, label }) => <option key={k.id} value={k.id}>{label}（庫存 {s.stock[k.id] ?? 0}）</option>)}
      </select>
    </div>
  )
}

function AdjustTab() {
  const s = useShop()
  const { toast } = useUi()
  const [skuId, setSkuId] = useState('')
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState(ADJUST_REASONS[0])
  const [note, setNote] = useState('')
  if (!s.eventId) return <div className="warn">請先建立展覽場次。</div>
  const save = () => {
    const d = Number(delta)
    if (!skuId || !d) return toast('請選品項並輸入數量（可為負數）', { kind: 'error' })
    const now = Date.now()
    commit(writeBatch(db).set(doc(db, s.eventPath, 'adjustments', s.newId(`${s.eventPath}/adjustments`)),
      { skuId, name: s.labelOf(skuId), delta: d, reason, note, ts: now, day: dayOf(now), device: deviceId }))
    toast(`已調整 ${s.labelOf(skuId)} ${d > 0 ? '+' : ''}${d}`)
    setDelta(''); setNote('')
  }
  return (
    <div className="grid2">
      <div className="card">
        <h4>新增庫存調整（註銷）</h4>
        <SkuPicker value={skuId} onChange={setSkuId} />
        <label>差異數量（少了請輸入負數，例如 -2）
          <input inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, ''))} />
        </label>
        <label>原因<select value={reason} onChange={(e) => setReason(e.target.value)}>{ADJUST_REASONS.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label>備註<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <button className="primary" onClick={save}>送出調整</button>
      </div>
      <div className="card">
        <h4>調整紀錄</h4>
        {s.adjustments.map((a) => (
          <div key={a.id} className="line">
            <span>{a.day.slice(5)} {timeOf(a.ts)}</span>
            <span>{a.name}</span>
            <b className={a.delta < 0 ? 'neg' : 'pos'}>{a.delta > 0 ? '+' : ''}{a.delta}</b>
            <span className="muted">{a.reason}{a.note ? '・' + a.note : ''}</span>
          </div>
        ))}
        {!s.adjustments.length && <p className="muted">沒有紀錄</p>}
      </div>
    </div>
  )
}

// ---------------- 功能設定 ----------------
function SettingsTab() {
  const s = useShop()
  const st = s.settings
  const [name, setName] = useState(s.shop?.name || '')
  const T = ({ k, children }) => (
    <label className="check"><input type="checkbox" checked={!!st[k]} onChange={(e) => s.saveSettings({ [k]: e.target.checked })} />{children}</label>
  )
  const payTypes = st.prePayTypes || {}
  return (
    <div className="card settings">
      <label>攤位名稱
        <input value={name} onChange={(e) => setName(e.target.value)}
          onBlur={() => commit(writeBatch(db).set(doc(db, s.shopPath), { name }, { merge: true }))} />
      </label>
      <h4>功能開關</h4>
      <T k="cashCount">零錢數量管理（開店、收攤點各面額數量）</T>
      <T k="coin1">1 元面額</T>
      <T k="giftEnabled">贈與單</T>
      <T k="brewEnabled">沖泡耗用單</T>
      <T k="preorderEnabled">預定&amp;宅配</T>
      <label className="check"><input type="checkbox" disabled checked={!!st.voiceEnabled} readOnly />語音輸入（第二階段開放；點選按鈕永遠可用）</label>

      <h4>預定付款方式（至少一種）</h4>
      {Object.entries(PAY_TYPE_LABEL).map(([k, label]) => (
        <label key={k} className="check">
          <input type="checkbox" checked={!!payTypes[k]}
            onChange={(e) => {
              const next = { ...payTypes, [k]: e.target.checked }
              if (!Object.values(next).some(Boolean)) return
              s.saveSettings({ prePayTypes: next })
            }} />{label}
        </label>
      ))}

      <h4>滿額免運門檻</h4>
      <label>商品合計達此金額時運費自動帶 0（0 = 不設定）
        <input className="num" inputMode="numeric" defaultValue={st.freeShipThreshold || 0}
          onBlur={(e) => s.saveSettings({ freeShipThreshold: Number(e.target.value) || 0 })} />
      </label>

      <h4>低庫存通知門檻</h4>
      <div className="row gap">
        {[5, 3, 1].map((t) => (
          <label key={t} className="check">
            <input type="checkbox" checked={!!st.lowStock?.[t]} onChange={(e) => s.saveSettings({ lowStock: { ...st.lowStock, [t]: e.target.checked } })} />剩 {t} 包
          </label>
        ))}
      </div>
    </div>
  )
}

// ---------------- 資料下載 ----------------
function DataTab() {
  const s = useShop()
  const { toast } = useUi()
  const del = s.deleteAfterOf(s.event)
  const preOf = preIndex(s.orders)
  const pending = s.orders.filter((o) => o.status !== 'void' && o.pre && !preOf(o).cancelled && !o.pre.shipped).length
  return (
    <div className="card">
      <h4>下載 Excel</h4>
      {s.event ? (
        <>
          <p>場次：{s.event.name}（{s.event.start} ～ {s.event.end}）</p>
          <p className="muted">資料保留至 {del}，請於期限內下載。</p>
          {pending > 0 && <p className="warn">還有 {pending} 筆預定未出貨，收件資料在「待出貨」工作表。</p>}
          <button className="primary" onClick={() => exportEventExcel(s).then(() => toast('已下載')).catch((e) => toast('下載失敗：' + e.message, { kind: 'error' }))}>
            下載 Excel（.xlsx）
          </button>
        </>
      ) : <p className="muted">尚未選擇場次</p>}
      <hr />
      <p className="muted">登入帳號：{s.user?.email}</p>
      <button onClick={() => signOut(auth)}>登出</button>
    </div>
  )
}

