import { useEffect, useState } from 'react'
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useShop, useUi, commit, deviceId } from '../store.jsx'
import { SUPPLY_UNITS } from '../lib/template.js'
import { supplyRows as calcSupplyRows, daysBetween } from '../lib/calc.js'
import Help from './Help.jsx'
import SortGroup from './SortGroup.jsx'
import { Switch } from '../pages/Admin.jsx'
import { HELP } from '../lib/help.js'

// 耗材：試飲杯、濾紙、手提袋…（不賣、不計營業額、與商品庫存分開）
// 每個場次記「展前準備」與「展後剩餘」，自動算出本次用量

// 本場次的耗材列表（總結、Excel 共用）
export const supplyRows = (s) => calcSupplyRows(s.supplyItems, s.supplies)

const saveSupply = (s, item, patch) => {
  commit(writeBatch(db).set(doc(db, s.eventPath, 'supplies', item.id),
    { name: item.name, unit: item.unit || '', ...patch, ts: Date.now(), device: deviceId }, { merge: true }))
}

function NumInput({ value, onSave, placeholder }) {
  const [v, setV] = useState(value ?? '')
  useEffect(() => setV(value ?? ''), [value])
  return (
    <input className="num" inputMode="numeric" value={v} placeholder={placeholder}
      onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={() => { const n = v === '' ? null : Number(v); if (n !== (value ?? null)) onSave(n) }} />
  )
}

// 上一個場次的耗材紀錄（準備下次活動時參考）
function usePrevious(s) {
  const [prev, setPrev] = useState(null)
  useEffect(() => {
    setPrev(null)
    if (!s.event) return
    const before = s.events.filter((e) => e.id !== s.eventId && (e.start || '') <= (s.event.start || '')).sort((a, b) => (b.start || '').localeCompare(a.start || ''))[0]
    if (!before) return
    getDocs(collection(db, s.shopPath, 'events', before.id, 'supplies'))
      .then((snap) => setPrev({ event: before, map: Object.fromEntries(snap.docs.map((d) => [d.id, d.data()])) }))
      .catch(() => setPrev(null))
  }, [s.eventId, s.events.length])
  return prev
}

// 管理 → 耗材
export function SuppliesTab() {
  const s = useShop()
  const { toast } = useUi()
  const prev = usePrevious(s)
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('個')
  const items = s.supplyItems
  const saveItems = (next) => commit(writeBatch(db).set(doc(db, s.shopPath), { supplyItems: next }, { merge: true }))

  const add = () => {
    const n = name.trim()
    if (!n) return toast('請輸入耗材名稱', { kind: 'error' })
    if (items.some((x) => x.name === n)) return toast('已經有這個耗材', { kind: 'error' })
    saveItems([...items, { id: s.newId(`${s.shopPath}/events`), name: n, unit: unit.trim() || '個', active: true }])
    setName('')
  }
  const rename = (it, patch) => saveItems(items.map((x) => (x.id === it.id ? { ...x, ...patch } : x)))
  const remove = (it) => {
    if (!confirm(`從清單移除「${it.name}」？已記錄的場次資料會保留。`)) return
    saveItems(items.filter((x) => x.id !== it.id))
  }

  if (!s.eventId) return <div className="warn">請先建立展覽場次。</div>
  const rows = supplyRows(s)
  const byId = Object.fromEntries(items.map((x) => [x.id, x]))

  return (
    <div>
      <div className="card">
        <h4>{s.event?.name}：耗材準備與剩餘<Help>{HELP.supplies}</Help></h4>
        <p className="muted small">非必填。展前填「準備」，展覽最後一天收攤後填「剩餘」，系統自動算出本次用量。</p>
        <p className="muted small">「上次用量」來自上一場的紀錄；上一場被清除（展覽結束 14 天後）就不再顯示，請先下載 Excel，裡面的「耗材」工作表有完整數字。</p>
        <div className="table-wrap scroll-head">
          <table className="supply-table">
            <thead><tr><th>耗材</th><th>單位</th><th>展前準備</th><th>展後剩餘</th><th>本次用量</th>{prev && <th>上次用量<br /><span className="muted small">{prev.event.name}</span></th>}</tr></thead>
            <tbody>
              {rows.map((r) => {
                const it = byId[r.id] || r
                const p = prev?.map[r.id]
                const pUsed = p && p.prep != null && p.left != null ? p.prep - p.left : null
                return (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.unit}</td>
                    <td><NumInput value={r.prep} placeholder="帶了多少" onSave={(n) => saveSupply(s, it, { prep: n })} /></td>
                    <td><NumInput value={r.left} placeholder="剩多少" onSave={(n) => saveSupply(s, it, { left: n })} /></td>
                    <td className={'used ' + (r.used < 0 ? 'neg' : '')}>{r.used == null ? '—' : `${r.used} ${r.unit}`}</td>
                    {prev && <td className="muted">{pUsed == null ? (p?.prep != null ? `準備 ${p.prep}` : '—') : `${pUsed} ${r.unit}`}</td>}
                  </tr>
                )
              })}
              {!rows.length && <tr><td colSpan={6} className="muted center">還沒有耗材，請在下方新增</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <DailyTable />

      <div className="card">
        <h4>耗材清單（每個場次共用）</h4>
        <p className="muted small">按住左邊 ⋮⋮ 上下拖曳換順序。右邊開關關掉＝這次不帶，清單保留，上面表格、收攤提醒、總結與 Excel 都不顯示；下次要用再打開（所有場次共用）。</p>
        <SortGroup items={items} onDrop={(a, b) => { const next = [...items]; const [x] = next.splice(a, 1); next.splice(b, 0, x); saveItems(next) }}>
          {(it, i, grip) => (
            <div key={it.id} data-sort className={'supply-item-row' + (it.active === false ? ' off' : '')}>
              {grip}
              <input defaultValue={it.name} key={it.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== it.name) rename(it, { name: v }) }} />
              <UnitPicker value={it.unit} onChange={(v) => v !== it.unit && rename(it, { unit: v })} />
              <label className="check small daily-check" title="每天收攤時記錄用量（例：水）"><input type="checkbox" checked={!!it.daily} onChange={(e) => rename(it, { daily: e.target.checked })} />每天記錄</label>
              <Switch checked={it.active !== false} onChange={(v) => rename(it, { active: v })} />
              <button className="small-btn ghost" onClick={() => remove(it)}>移除</button>
            </div>
          )}
        </SortGroup>
        <div className="supply-item-row" style={{ marginTop: 10 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="新增耗材，例：攪拌棒" />
          <UnitPicker value={unit} onChange={setUnit} />
          <button onClick={add}>新增</button>
        </div>
        <p className="muted small">單位可選條、包、個、盒、張、桶、台；選「自訂…」可以自己打。</p>
      </div>
    </div>
  )
}

// 單位：內建選單＋自訂
function UnitPicker({ value, onChange }) {
  const preset = SUPPLY_UNITS.includes(value)
  const [custom, setCustom] = useState(!preset && !!value)
  const [v, setV] = useState(value || '')
  useEffect(() => { setV(value || ''); if (value && !SUPPLY_UNITS.includes(value)) setCustom(true) }, [value])
  if (custom) {
    return (
      <span className="unit-picker">
        <input className="supply-unit" value={v} placeholder="單位" autoFocus={!value}
          onChange={(e) => setV(e.target.value)} onBlur={() => { const t = v.trim(); if (t) onChange(t) }} />
        <button className="link small" onClick={() => { setCustom(false); onChange(SUPPLY_UNITS[2]) }}>選單</button>
      </span>
    )
  }
  return (
    <select className="supply-unit" value={preset ? value : ''} onChange={(e) => (e.target.value === '__custom' ? (setV(''), setCustom(true)) : onChange(e.target.value))}>
      {!preset && <option value="">單位</option>}
      {SUPPLY_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
      <option value="__custom">自訂…</option>
    </select>
  )
}

// 每天記錄的耗材：展期每一天的用量（管理 → 耗材、總結共用）
export function DailyTable({ readOnly = false }) {
  const s = useShop()
  const rows = supplyRows(s).filter((r) => r.isDaily && (s.supplyItems.find((x) => x.id === r.id)?.active !== false || r.dailyTotal != null))
  if (!rows.length) return null
  const days = daysBetween(s.event?.start, s.event?.end)
  const byId = Object.fromEntries(s.supplyItems.map((x) => [x.id, x]))
  return (
    <div className="card">
      <h4>每日用量</h4>
      {!readOnly && <p className="muted small">勾「每天記錄」的耗材（例：水）在這裡填每天用多少；每天收攤點零錢時也會提醒。</p>}
      <div className="table-wrap scroll-head">
        <table className="supply-table daily-table">
          <thead><tr><th>耗材</th>{days.map((d) => <th key={d}>{d.slice(5).replace('-', '/')}</th>)}<th>合計</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}<span className="muted small">（{r.unit}）</span></td>
                {days.map((d) => (
                  <td key={d}>{readOnly ? (r.daily[d] ?? '—')
                    : <NumInput value={r.daily[d]} placeholder="—" onSave={(n) => saveSupply(s, byId[r.id] || r, { daily: { [d]: n } })} />}</td>
                ))}
                <td className="used">{r.dailyTotal == null ? '—' : `${r.dailyTotal} ${r.unit}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// 零錢頁：每天記錄的耗材，問今天用了多少（可以換日期補填）
export function DailyUsage({ day }) {
  const s = useShop()
  const rows = supplyRows(s).filter((r) => r.isDaily && s.supplyItems.find((x) => x.id === r.id)?.active !== false)
  if (!rows.length) return null
  const byId = Object.fromEntries(s.supplyItems.map((x) => [x.id, x]))
  return (
    <div className="card supply-reminder">
      <h4 style={{ marginTop: 0 }}>{day.slice(5).replace('-', '/')} 用了多少</h4>
      <p className="muted small">每天記錄的耗材，填這一天的用量（非必填）。</p>
      <table className="supply-table">
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td><NumInput value={r.daily[day]} placeholder="用了多少" onSave={(n) => saveSupply(s, byId[r.id] || r, { daily: { [day]: n } })} /></td>
              <td>{r.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// 零錢頁：展覽最後一天（或之後）提醒點耗材剩餘，可略過
export function SupplyLeftReminder({ day }) {
  const s = useShop()
  const key = `supply-left-skip:${s.eventId}`
  const [skip, setSkip] = useState(() => { try { return localStorage.getItem(key) === '1' } catch { return false } })
  if (!s.event?.end || day < s.event.end || skip) return null
  const rows = supplyRows(s).filter((r) => r.prep != null || r.left != null || s.supplyItems.some((x) => x.id === r.id))
  if (!rows.length || rows.every((r) => r.left != null)) return null
  const byId = Object.fromEntries(s.supplyItems.map((x) => [x.id, x]))
  return (
    <div className="card supply-reminder">
      <div className="row between">
        <h4 style={{ margin: 0 }}>展覽最後一天：點一下耗材剩多少</h4>
        <button className="link small" onClick={() => { setSkip(true); try { localStorage.setItem(key, '1') } catch { /* 忽略 */ } }}>略過</button>
      </div>
      <p className="muted small">非必填。填了下次活動就知道該帶多少。</p>
      <table className="supply-table">
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td className="muted">準備 {r.prep ?? '—'}</td>
              <td><NumInput value={r.left} placeholder="剩多少" onSave={(n) => saveSupply(s, byId[r.id] || r, { left: n })} /></td>
              <td>{r.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
