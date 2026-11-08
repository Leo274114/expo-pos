import { useMemo, useState, useEffect, useRef } from 'react'
import { collection, getDocs, doc, writeBatch } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { auth, db } from '../firebase.js'
import { useShop, useUi, commit, deviceId } from '../store.jsx'
import { TEMPLATE_LISTS, TEMPLATE_PRODUCTS, ADJUST_REASONS, CATEGORY_ORDER, CATEGORY_HINT, sortCats, THEME_PRESETS, textOn } from '../lib/template.js'
import { preIndex, componentAvail, fmt, PAY_TYPE_LABEL, skuLabel, today, dayOf, timeOf } from '../lib/calc.js'
import { exportEventExcel } from '../lib/excel.js'
import Modal from '../components/Modal.jsx'
import { useSearchParams } from 'react-router-dom'
import SortGroup, { moveItem } from '../components/SortGroup.jsx'
import Icon from '../components/Icon.jsx'
import { VERSION, CHANGELOG } from '../version.js'
import { aliasesToText, textToAliases } from '../lib/voice.js'
import Help from '../components/Help.jsx'
import { HELP } from '../lib/help.js'

const TABS = ['商品與價格', '選項清單', '展覽場次', '庫存調整', '功能設定', '資料下載', `版本 ${VERSION}`]

export default function Admin() {
  const [params] = useSearchParams()
  const [tab, setTab] = useState(() => Math.min(TABS.length - 1, Math.max(0, Number(params.get('tab')) || 0)))
  useEffect(() => { const n = Number(params.get('tab')); if (!Number.isNaN(n) && params.get('tab') !== null) setTab(n) }, [params])
  return (
    <div className="page admin">
      <div className="tabs toolbar">
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
      {tab === 6 && <VersionTab />}
    </div>
  )
}

// 拖曳排序後：依新順序重新編號寫回 order
function reorderTo(shopPath, coll, list, from, to) {
  const next = moveItem(list, from, to)
  const b = writeBatch(db)
  next.forEach((x, k) => { if (x.order !== (k + 1) * 10) b.set(doc(db, shopPath, coll, x.id), { order: (k + 1) * 10 }, { merge: true }) })
  commit(b)
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
    return sortCats(Object.keys(g), s.settings.catOrder).map((c) => [c, g[c]])
  }, [s.products, s.settings.catOrder])

  return (
    <div>
      {!s.eventId && <div className="warn">尚未選擇展覽場次，請先到「展覽場次」建立並設為目前場次，才能填初始庫存。</div>}
      <div className="row gap">
        <button className="primary" onClick={() => setAdding('')}>＋ 新增商品</button>
        <button onClick={seedTemplate}>載入內建範本</button>
        {s.products.length > 0 && <span className="row"><button className="danger-outline" onClick={resetAll}>重設為內建範本</button><Help>{HELP.reset}</Help></span>}
      </div>
      <SortGroup items={grouped} onDrop={(a, b) => s.saveSettings({ catOrder: moveItem(grouped.map(([c]) => c), a, b) })}>
      {([cat, ps], ci, catGrip) => (
        <section key={cat} data-sort className="cat-section">
          <h3 className="cat row between"><span className="row">{catGrip}{cat}</span><button className="small-btn" onClick={() => setAdding(cat)}>＋ 新增到{cat}</button></h3>
          {!ps.length && <p className="muted">{CATEGORY_HINT[cat] || '此類別沒有商品'}</p>}
          <SortGroup items={ps} onDrop={(a, b) => reorderTo(s.shopPath, 'products', ps, a, b)}>
            {(p, i, grip) => (
              <div key={p.id} data-sort>
                <ProductCard p={p} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} move={grip} />
              </div>
            )}
          </SortGroup>
        </section>
      )}
      </SortGroup>
      {!s.products.length && <p className="muted">還沒有商品。可以先「載入內建範本」，再修改。</p>}
      {adding !== null && <ProductForm initialCategory={adding} onClose={() => setAdding(null)} />}
    </div>
  )
}

function ProductForm({ product, onClose, initialCategory = '' }) {
  const s = useShop()
  const [f, setF] = useState(product || { name: '', category: initialCategory, unit: initialCategory === '周邊產品' ? '個' : initialCategory === '套裝組合' ? '組' : '包', levels: [], trackStock: true, active: true })
  const mySkus = product ? s.skus.filter((k) => k.productId === product.id) : []
  const hasCombos = mySkus.some((k) => (k.opts || []).length)
  const cats = sortCats([...new Set([...s.products.map((p) => p.category), ...CATEGORY_ORDER])].filter(Boolean), s.settings.catOrder)
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
        <legend>選項層（最多三層）<Help>{HELP.levels}</Help></legend>
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
              <h4>產生組合：每一層勾選要的選項<Help>{HELP.combos}</Help></h4>
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
          {(p.levels || []).includes('pack') && <p className="hint">散包和盒裝共用庫存：在「一盒」那一列按「組成」，選同處理法的「單包」× 每盒包數。之後只要填單包的庫存。</p>}
          <SkuTable product={p} skus={skus} />
        </div>
      )}
      {edit && <ProductForm product={p} onClose={() => setEdit(false)} />}
    </div>
  )
}

function SkuTable({ product, skus }) {
  const s = useShop()
  const [compFor, setCompFor] = useState(null)
  const setSku = (id, patch) => commit(writeBatch(db).set(doc(db, s.shopPath, 'skus', id), patch, { merge: true }))
  const setInit = (id, v) => s.eventPath && commit(writeBatch(db).set(doc(db, s.eventPath, 'stock', id), { initial: Number(v) || 0 }, { merge: true }))
  const del = (k) => { if (confirm('刪除這個組合？')) commit(writeBatch(db).delete(doc(db, s.shopPath, 'skus', k.id))) }
  const tracked = (id) => { const k = s.skuById[id]; return !!k && s.productById[k.productId]?.trackStock !== false }
  const showStock = product.trackStock !== false
  if (!skus.length) return <p className="muted">還沒有組合。</p>
  return (
    <div className="table-wrap">
      <table className="sku-table">
        <thead>
          <tr><th></th><th>組合</th><th>定價</th><th>活動價<Help>{HELP.promoPrice}</Help></th>{showStock && <><th>初始庫存<Help>{HELP.initStock}</Help></th><th>目前</th></>}<th>組成<Help>{HELP.components}</Help></th><th>啟用</th><th></th></tr>
        </thead>
        <SortGroup as="tbody" items={skus} onDrop={(a, b) => reorderTo(s.shopPath, 'skus', skus, a, b)}>
          {(k, i, grip) => {
            const comps = k.components || []
            const canMake = comps.length ? componentAvail(comps, (id) => (tracked(id) ? s.stock[id] ?? 0 : Infinity)) : null
            return (
              <tr key={k.id} data-sort className={k.active === false ? 'off' : ''}>
                <td>{grip}</td>
                <td>{(k.opts || []).join('・') || product.name}</td>
                <td><NumCell value={k.price} onSave={(v) => setSku(k.id, { price: Number(v) || 0 })} /></td>
                <td><NumCell value={k.promoPrice ?? ''} placeholder="無" onSave={(v) => setSku(k.id, { promoPrice: v === '' ? null : Number(v) })} /></td>
                {showStock && (comps.length ? (
                  <>
                    <td className="muted small">扣組成的庫存</td>
                    <td className={canMake <= 0 ? 'neg' : ''}>{canMake === Infinity ? '—' : `可組 ${canMake}`}</td>
                  </>
                ) : (
                  <>
                    <td><NumCell value={s.eventId ? (s.stockInit[k.id]?.initial ?? '') : ''} onSave={(v) => setInit(k.id, v)} disabled={!s.eventId} /></td>
                    <td className={(s.stock[k.id] ?? 0) <= 0 ? 'neg' : ''}>{s.stock[k.id] ?? 0}</td>
                  </>
                ))}
                <td>
                  <button className="small-btn" onClick={() => setCompFor(k)}>
                    {comps.length ? comps.map((c) => `${s.labelOf(c.skuId).split('・').slice(-2).join('・')}×${c.qty}`).join('＋') : '設定'}
                  </button>
                </td>
                <td><Switch checked={k.active !== false} onChange={(v) => setSku(k.id, { active: v })} /></td>
                <td><button className="icon" onClick={() => del(k)} aria-label="刪除"><Icon name="trash" size={20} /></button></td>
              </tr>
            )
          }}
        </SortGroup>
      </table>
      {compFor && <ComponentsModal sku={compFor} product={product} onClose={() => setCompFor(null)}
        onSave={(components) => { setSku(compFor.id, { components }); setCompFor(null) }} />}
    </div>
  )
}

export function Switch({ checked, onChange, label }) {
  return (
    <label className="switch" title={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden="true" />
      {label && <em>{label}</em>}
    </label>
  )
}

// 組成：套裝（A+B+C）或盒裝（＝單包×10），賣出時扣組成的庫存
function ComponentsModal({ sku, product, onClose, onSave }) {
  const s = useShop()
  const [rows, setRows] = useState(() => (sku.components || []).map((c) => ({ ...c })))
  const options = s.skus.filter((k) => k.id !== sku.id && !(k.components || []).length)
    .map((k) => ({ k, label: s.labelOf(k.id) }))
  const sum = rows.reduce((a, r) => a + (Number(s.skuById[r.skuId]?.price) || 0) * (Number(r.qty) || 0), 0)
  const valid = rows.filter((r) => r.skuId && Number(r.qty) > 0)
  return (
    <Modal title={`組成：${s.labelOf(sku.id)}`} wide onClose={onClose}
      footer={<>
        {(sku.components || []).length > 0 && <button className="danger-outline" onClick={() => onSave([])}>取消組成（改回自己的庫存）</button>}
        <button onClick={onClose}>取消</button>
        <button className="primary" onClick={() => onSave(valid.map((r) => ({ skuId: r.skuId, qty: Number(r.qty) })))}>儲存</button>
      </>}>
      <p className="muted small">賣出這個品項時，改扣下面這些品項的庫存。例：套裝＝A×1＋B×1＋C×1；濾掛一盒＝濾掛單包×10（散包與盒裝共用庫存）。</p>
      {rows.map((r, i) => (
        <div key={i} className="comp-row">
          <select value={r.skuId || ''} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, skuId: e.target.value } : x)))}>
            <option value="">— 選擇品項 —</option>
            {options.map(({ k, label }) => <option key={k.id} value={k.id}>{label}</option>)}
          </select>
          <span>×</span>
          <input className="num" inputMode="numeric" value={r.qty} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/[^\d]/g, '') } : x)))} />
          <button className="icon" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="移除"><Icon name="close" size={18} /></button>
        </div>
      ))}
      <button onClick={() => setRows([...rows, { skuId: '', qty: 1 }])}><Icon name="plus" size={18} />加一項</button>
      {valid.length > 0 && (
        <p className="muted">內含品項定價合計 {fmt(sum)}{Number(sku.price) > 0 && sum > Number(sku.price) ? `，套裝價 ${fmt(sku.price)}，客人省 ${fmt(sum - sku.price)}` : ''}</p>
      )}
    </Modal>
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
        <h4>建立新場次<Help>{HELP.events}</Help></h4>
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
        <h4>新增庫存調整（註銷）<Help>{HELP.adjust}</Help></h4>
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
    <div className="setting-row"><span>{children}{HELP[k] && <Help>{HELP[k]}</Help>}</span><Switch checked={!!st[k]} onChange={(v) => s.saveSettings({ [k]: v })} /></div>
  )
  const payTypes = st.prePayTypes || {}
  return (
    <div className="card settings">
      <label>攤位名稱
        <input value={name} onChange={(e) => setName(e.target.value)}
          onBlur={() => commit(writeBatch(db).set(doc(db, s.shopPath), { name }, { merge: true }))} />
      </label>

      <h4>攤位 Logo<Help>{HELP.logo}</Help></h4>
      <LogoUpload logo={s.shop?.logo} onSave={(logo) => commit(writeBatch(db).set(doc(db, s.shopPath), { logo }, { merge: true }))} />
      <h4>畫面上方顏色<Help>{HELP.theme}</Help></h4>
      <div className="theme-row">
        {THEME_PRESETS.map((x) => (
          <button key={x.color} className={'theme-swatch' + ((st.themeColor || '#183d2e').toLowerCase() === x.color.toLowerCase() ? ' on' : '')}
            onClick={() => s.saveSettings({ themeColor: x.color })}>
            <i style={{ background: x.color }} />{x.name}
          </button>
        ))}
        <label className="theme-custom check">
          <input type="color" defaultValue={st.themeColor || '#183d2e'} key={st.themeColor}
            onChange={(e) => { const v = e.target.value; clearTimeout(window.__themeT); window.__themeT = setTimeout(() => s.saveSettings({ themeColor: v }), 400) }} />自己調
        </label>
      </div>
      <div className="theme-preview" style={{ background: st.themeColor || '#183d2e', color: textOn(st.themeColor || '#183d2e') }}>{s.shop?.name || '我的攤位'}　預覽</div>

      <h4>功能開關</h4>
      <T k="cashCount">零錢數量管理（開店、收攤點各面額數量）</T>
      <T k="coin1">1 元面額</T>
      <T k="giftEnabled">贈與單</T>
      <T k="brewEnabled">沖泡耗用單</T>
      <T k="preorderEnabled">預定&amp;宅配</T>
      <T k="voiceEnabled">語音點單（收銀畫面出現「語音點單」按鈕；點選按鈕永遠可用）</T>

      <h4>預定付款方式（至少一種）<Help>{HELP.prePay}</Help></h4>
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

      <h4>滿額活動<Help>{HELP.promos}</Help></h4>
      <PromoEditor promos={st.promos || []} onSave={(promos) => s.saveSettings({ promos })} />

      <h4>滿額免運門檻<Help>{HELP.freeShip}</Help></h4>
      <label>商品合計達此金額時運費自動帶 0（0 = 不設定）
        <input className="num" inputMode="numeric" defaultValue={st.freeShipThreshold || 0}
          onBlur={(e) => s.saveSettings({ freeShipThreshold: Number(e.target.value) || 0 })} />
      </label>

      <h4>低庫存通知門檻<Help>{HELP.lowStock}</Help></h4>
      <div className="row gap">
        {[5, 3, 1].map((t) => (
          <label key={t} className="check">
            <input type="checkbox" checked={!!st.lowStock?.[t]} onChange={(e) => s.saveSettings({ lowStock: { ...st.lowStock, [t]: e.target.checked } })} />剩 {t} 包
          </label>
        ))}
      </div>

      <h4>語音別名<Help>{HELP.aliases}</Help></h4>
      <p className="muted small">客人或你習慣的說法，每行一筆「說法=系統名稱」。內建已有：半磅=1/2磅、四分之一磅=1/4磅、藝妓=藝伎、日晒=日曬、金軒=金萱 等。</p>
      <textarea rows={5} defaultValue={aliasesToText(st.aliases || {})} placeholder={'招牌豆=SL-34\n紅玉=紅茶'}
        onBlur={(e) => s.saveSettings({ aliases: textToAliases(e.target.value) })} />
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
          {pending > 0 && <p className="warn">還有 {pending} 筆預定未出貨，收件資料在「預約單」工作表。</p>}
          <button className="primary" onClick={() => exportEventExcel(s).then(() => toast('已下載')).catch((e) => toast('下載失敗：' + e.message, { kind: 'error' }))}>
            下載 Excel（.xlsx）
          </button>
        </>
      ) : <p className="muted">尚未選擇場次</p>}
      <hr />
      <p className="muted">登入帳號：{s.user?.email}</p>
      <p className="muted small">帳號 ID：<code>{s.user?.uid}</code>{s.isAdmin && <span className="badge">系統管理者</span>}</p>
      <button onClick={() => signOut(auth)}>登出</button>
    </div>
  )
}


// ---------------- 版本 ----------------
function VersionTab() {
  return (
    <div className="card changelog">
      <p>目前版本 <b className="num">v{VERSION}</b>。iPad 上看到的版本號和這裡一樣，就代表已經更新到最新。</p>
      <p className="muted small">沒有更新時：關掉 App 再打開；仍舊沒有，在 Safari 重新整理一次。</p>
      {CHANGELOG.map((c) => (
        <section key={c.v} className={c.v === VERSION ? 'current' : ''}>
          <h4><span className="num">v{c.v}</span><span className="muted small">{c.date}</span></h4>
          <ul>{c.items.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
      ))}
    </div>
  )
}

// 滿額活動：單筆商品金額（扣折扣、不含運費）達門檻時，結帳畫面提醒
function PromoEditor({ promos, onSave }) {
  const [list, setList] = useState(promos)
  const save = (next) => { setList(next); onSave(next) }
  const set = (i, patch) => save(list.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  return (
    <div className="promo-editor">
      <p className="muted small">單筆消費（扣掉折扣、不含運費）達到門檻時，結帳畫面會提醒你發贈品；快達到時，購物車也會提示「再買多少」。</p>
      {list.map((p, i) => (
        <div key={p.id} className="promo-row">
          <label>門檻<input className="num" inputMode="numeric" defaultValue={p.threshold || ''} placeholder="2500"
            onBlur={(e) => set(i, { threshold: Number(e.target.value) || 0 })} /></label>
          <label className="grow">送什麼／要做什麼<input defaultValue={p.text} placeholder="例：套餐兌換券一份、抽扭蛋一顆"
            onBlur={(e) => set(i, { text: e.target.value.trim() })} /></label>
          <span className="row"><label className="check small"><input type="checkbox" checked={!!p.repeat} onChange={(e) => set(i, { repeat: e.target.checked })} />每滿一次送一份</label><Help>{HELP.promoRepeat}</Help></span>
          <label className="check small"><input type="checkbox" checked={p.on !== false} onChange={(e) => set(i, { on: e.target.checked })} />啟用</label>
          <button className="icon" onClick={() => { if (confirm('刪除這個活動？')) save(list.filter((_, j) => j !== i)) }} aria-label="刪除"><Icon name="trash" size={20} /></button>
        </div>
      ))}
      <button onClick={() => save([...list, { id: Date.now().toString(36), threshold: 0, text: '', repeat: false, on: true }])}>＋ 新增滿額活動</button>
    </div>
  )
}

// 攤位 Logo：選圖後可拖曳、放大縮小決定範圍，輸出 256×256（存進攤位資料，不需要另外的圖片空間）
function LogoUpload({ logo, onSave }) {
  const [err, setErr] = useState('')
  const [src, setSrc] = useState(null)
  const pick = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/')) return setErr('請選擇圖片檔')
    setErr('')
    setSrc(URL.createObjectURL(f))
  }
  return (
    <div className="logo-row">
      <div className="logo-preview">{logo ? <img src={logo} alt="攤位 Logo" /> : <span className="muted small">尚未上傳</span>}</div>
      <label className="file-btn">{logo ? '更換圖片' : '上傳圖片'}<input type="file" accept="image/*" onChange={pick} /></label>
      {logo && <button className="danger-outline" onClick={() => { if (confirm('移除 Logo？')) onSave(null) }}>移除</button>}
      {err && <span className="neg small">{err}</span>}
      {src && <LogoCrop src={src} onClose={() => { URL.revokeObjectURL(src); setSrc(null) }}
        onDone={(data) => { URL.revokeObjectURL(src); setSrc(null); if (data.length > 400000) setErr('圖片太大，請縮小範圍或換一張'); else onSave(data) }} />}
    </div>
  )
}

const BOX = 260
function LogoCrop({ src, onClose, onDone }) {
  const [img, setImg] = useState(null)
  const [scale, setScale] = useState(1)
  const [off, setOff] = useState({ x: 0, y: 0 })
  const drag = useRef(null)
  useEffect(() => { const im = new Image(); im.onload = () => setImg(im); im.src = src }, [src])
  const fit = img ? BOX / Math.max(img.width, img.height) : 1
  const dw = img ? img.width * fit * scale : 0
  const dh = img ? img.height * fit * scale : 0
  const left = BOX / 2 - dw / 2 + off.x
  const top = BOX / 2 - dh / 2 + off.y
  const down = (e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, o: off } }
  const move = (e) => { if (!drag.current) return; const d = drag.current; setOff({ x: d.o.x + e.clientX - d.x, y: d.o.y + e.clientY - d.y }) }
  const up = () => { drag.current = null }
  const zoom = (z) => setScale((v) => Math.min(4, Math.max(0.3, +(v * z).toFixed(3))))
  const done = () => {
    const c = document.createElement('canvas')
    const S = 256, r = S / BOX
    c.width = S; c.height = S
    c.getContext('2d').drawImage(img, left * r, top * r, dw * r, dh * r)
    onDone(c.toDataURL('image/png'))
  }
  return (
    <Modal title="調整 Logo 範圍" onClose={onClose}
      footer={<><button onClick={onClose}>取消</button><button className="primary" disabled={!img} onClick={done}>完成</button></>}>
      <p className="muted small">拖曳圖片移動位置，用下方滑桿放大或縮小。方框內就是顯示的範圍。</p>
      <div className="crop-wrap">
        <div className="crop-box" style={{ width: BOX, height: BOX }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          onWheel={(e) => zoom(e.deltaY < 0 ? 1.08 : 1 / 1.08)}>
          {img && <img src={src} alt="" draggable={false} style={{ left, top, width: dw, height: dh }} />}
        </div>
      </div>
      <div className="crop-zoom">
        <button onClick={() => zoom(1 / 1.15)} aria-label="縮小"><Icon name="minus" size={18} /></button>
        <input type="range" min="0.3" max="4" step="0.01" value={scale} onChange={(e) => setScale(Number(e.target.value))} aria-label="縮放" />
        <button onClick={() => zoom(1.15)} aria-label="放大"><Icon name="plus" size={18} /></button>
        <button className="link small" onClick={() => { setScale(1); setOff({ x: 0, y: 0 }) }}>重設</button>
      </div>
    </Modal>
  )
}
