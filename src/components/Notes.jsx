import { useEffect, useRef, useState } from 'react'
import { doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useShop, commit } from '../store.jsx'
import { timeOf } from '../lib/calc.js'
import { gripRef, dragOn, dragOff } from './SortGroup.jsx'
import { eventDays } from './DaySelect.jsx'
import { NOTE_FIELDS, noteFields, noteText, hasNote, newNoteKey } from '../lib/notes.js'
export { NOTE_FIELDS, noteFields, noteText, hasNote } from '../lib/notes.js'

// 展場心得：跟著展覽場次，存在攤位底下 notes/{場次ID}（場次 14 天後清除時心得保留，下次參展可以回頭看）
// { eventName, start, end, fields: { 欄位: 內容 }, labels: { 自訂欄位: 名稱 }, all: 舊版整體心得, days: { 'YYYY-MM-DD': 當天觀察 }, updatedAt }
export function saveNote(s, e, patch) {
  if (!e) return
  commit(writeBatch(db).set(doc(db, s.shopPath, 'notes', e.id), {
    eventName: e.name || '', start: e.start || '', end: e.end || '', ...patch, updatedAt: Date.now()
  }, { merge: true }))
}

// 自動儲存的文字框：停止打字 1.5 秒或離開欄位就存；高度跟著內容長，寫多少都看得到
function NoteBox({ value, onSave, placeholder, rows = 4 }) {
  const [v, setV] = useState(value || '')
  const [state, setState] = useState('') // '' | 'typing' | 'saved'
  const t = useRef(null)
  const last = useRef(value || '')
  useEffect(() => { if (state !== 'typing') { setV(value || ''); last.current = value || '' } }, [value])
  const ta = useRef(null)
  const grow = () => { const el = ta.current; if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px' } }
  useEffect(grow, [v])
  const flush = (text) => {
    clearTimeout(t.current)
    if (text === last.current) return
    last.current = text
    onSave(text)
    setState('saved')
  }
  return (
    <div className="note-box">
      <textarea ref={ta} rows={rows} value={v} placeholder={placeholder}
        onChange={(e) => { const x = e.target.value; setV(x); setState('typing'); clearTimeout(t.current); t.current = setTimeout(() => flush(x), 1500) }}
        onBlur={() => flush(v)} />
      <span className="note-state muted small">{state === 'typing' ? '輸入中…' : state === 'saved' ? '已自動儲存' : ''}</span>
    </div>
  )
}

// 卡片拖曳排序（兩欄格狀，可左右上下）：按住卡片左上的「⋮⋮」拖到想放的位置
// 拖到畫面上下邊緣會自動捲動；放開時插到最靠近的那張卡片的位置
function useGridSort(onDrop) {
  const box = useRef(null)
  const [drag, setDrag] = useState(null) // { i, dx, dy, target }
  const start = (e, i) => {
    if (e.button !== undefined && e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    const cards = () => Array.from(box.current?.querySelectorAll('[data-sortcard]') || [])
    const sx = e.clientX, sy = e.clientY, sy0 = window.scrollY
    let st = { i, dx: 0, dy: 0, target: i }
    let px = sx, py = sy, timer = null
    dragOn()
    const calc = () => {
      const dx = px - sx, dy = py - sy + (window.scrollY - sy0)
      let target = i, best = Infinity
      cards().forEach((el, k) => {
        if (k === i) return
        const r = el.getBoundingClientRect()
        const d = Math.hypot(px - (r.left + r.width / 2), py - (r.top + r.height / 2))
        if (d < best && d < Math.max(r.width, r.height) * 0.6) { best = d; target = k }
      })
      st = { i, dx, dy, target }
      setDrag(st)
    }
    const edge = () => {
      const h = window.innerHeight
      const v = py < 90 ? -14 : py > h - 110 ? 14 : 0
      if (v) { window.scrollBy(0, v); calc() }
    }
    const move = (ev) => { ev.preventDefault(); px = ev.clientX; py = ev.clientY; calc() }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      clearInterval(timer)
      dragOff()
      setDrag(null)
      if (st.target !== i) onDrop(i, st.target)
    }
    timer = setInterval(edge, 30)
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }
  const grip = (i) => (
    <span className="grip" ref={gripRef} onPointerDown={(e) => start(e, i)} title="按住拖曳換順序" aria-label="拖曳排序" role="button">
      <svg width="14" height="20" viewBox="0 0 14 20" aria-hidden="true">
        {[4, 10, 16].map((y) => [<circle key={'a' + y} cx="4" cy={y} r="1.7" />, <circle key={'b' + y} cx="10" cy={y} r="1.7" />])}
      </svg>
    </span>
  )
  return { box, drag, grip }
}

export default function EventNotes({ event }) {
  const s = useShop()
  const e = event || s.event
  const dropRef = useRef(null)
  const sorter = useGridSort((a, b) => dropRef.current?.(a, b))
  if (!e) return null
  const n = s.notes[e.id] || {}
  const days = eventDays(e)
  const custom = s.settings.noteCustom || []
  const order = s.settings.noteOrder || []
  const fields = noteFields(n, custom, order)
  const movable = fields.filter((f) => !f[4] && f[0] !== 'all')
  dropRef.current = (from, to) => {
    const ks = movable.map(([k]) => k)
    const [x] = ks.splice(from, 1)
    ks.splice(to, 0, x)
    s.saveSettings({ noteOrder: ks })
  }
  const taken = (name, skip) => [...NOTE_FIELDS.map(([, l]) => l), ...custom.filter((c) => c.k !== skip).map((c) => c.label)].includes(name)
  const ask = (msg, cur = '', skip) => {
    const name = (prompt(msg, cur) || '').trim()
    if (!name || name === cur) return ''
    if (taken(name, skip)) { alert(`已經有「${name}」這個欄位了`); return '' }
    return name
  }
  const addField = () => {
    const label = ask('新欄位名稱，例如：主辦單位、攤位費、交通住宿')
    if (label) s.saveSettings({ noteCustom: [...custom, { k: newNoteKey(), label }] })
  }
  const renameField = (c) => {
    const label = ask(`把「${c.label}」改名為：`, c.label, c.k)
    if (!label) return
    s.saveSettings({ noteCustom: custom.map((x) => (x.k === c.k ? { ...x, label } : x)) })
    if (noteText(n, c.k)) saveNote(s, e, { labels: { [c.k]: label } })
  }
  const removeField = (c) => {
    const here = noteText(n, c.k)
    if (!confirm(`刪除「${c.label}」欄位？` + (here ? '\n這一場寫在這格的內容也會一起清掉。' : '') + '\n以前場次寫過的內容會保留。')) return
    s.saveSettings({ noteCustom: custom.filter((x) => x.k !== c.k) })
    if (here) saveNote(s, e, { fields: { [c.k]: '' } })
  }
  return (
    <div className="card notes-card">
      <h4>展場心得・{e.name}</h4>
      <p className="muted small">每一項各自一張卡片，寫多少都會整段顯示，打字自動儲存；想記別的可以按「＋ 新增欄位」；按住卡片左上的「⋮⋮」可以拖曳換順序，欄位和順序所有場次共用；場次資料 14 天後清除時心得會保留，下次參展可以在「管理 → 展覽場次」回頭看。</p>
      <div className="note-grid" ref={sorter.box}>
        {fields.map(([k, label, ph, mine, gone], idx) => {
          const c = mine && custom.find((x) => x.k === k)
          const si = idx < movable.length ? idx : -1
          const d = sorter.drag
          return (
            <div key={k} {...(si >= 0 ? { 'data-sortcard': '' } : {})}
              className={'note-field' + (noteText(n, k) ? ' filled' : '') + (mine ? ' custom' : '') + (d?.i === si ? ' sorting' : '') + (d && d.i !== si && d.target === si ? ' drop-here' : '')}
              style={d?.i === si ? { transform: `translate(${d.dx}px, ${d.dy}px)` } : undefined}>
              <div className="note-field-head">
                {si >= 0 && sorter.grip(si)}
                <h5>{label}{gone && <span className="muted small">（已從欄位清單刪除）</span>}</h5>
                {c && <span className="note-field-tools">
                  <button className="btn-mini" onClick={() => renameField(c)}>改名</button>
                  <button className="btn-mini btn-mini-del" onClick={() => removeField(c)}>刪除</button>
                </span>}
              </div>
              <NoteBox value={noteText(n, k)} rows={3} placeholder={ph || '自己加的欄位，想寫什麼都可以'}
                onSave={(text) => saveNote(s, e, k === 'all' ? { all: text } : { fields: { [k]: text }, ...(mine || gone ? { labels: { [k]: label } } : {}) })} />
            </div>
          )
        })}
        <button className="note-add" onClick={addField}>＋ 新增欄位<span className="muted small">例如：主辦單位、攤位費、交通住宿</span></button>
      </div>
      <details className="note-days" open={days.some((d) => n.days?.[d])}>
        <summary>每天的觀察（{days.filter((d) => n.days?.[d]).length}／{days.length} 天有寫）</summary>
        {days.map((d) => (
          <div key={d}>
            <label>{d.slice(5).replace('-', '/')}</label>
            <NoteBox value={n.days?.[d]} rows={2} placeholder="當天的狀況" onSave={(text) => saveNote(s, e, { days: { [d]: text } })} />
          </div>
        ))}
      </details>
      {n.updatedAt && <p className="muted small">最後更新 {new Date(n.updatedAt).toLocaleDateString('zh-TW')} {timeOf(n.updatedAt)}</p>}
    </div>
  )
}

// 歷次展場心得（含已清除的場次）
export function NotesHistory() {
  const s = useShop()
  const list = Object.entries(s.notes).map(([id, n]) => ({ id, ...n }))
    .filter((n) => n.id !== s.eventId && hasNote(n))
    .sort((a, b) => (b.start || '').localeCompare(a.start || ''))
  if (!list.length) return null
  return (
    <div className="card">
      <h4>歷次展場心得</h4>
      {list.map((n) => {
        const ev = s.events.find((e) => e.id === n.id)
        return (
          <details key={n.id} className="note-history">
            <summary><b>{n.eventName}</b> <span className="muted small">{n.start}～{n.end}{ev ? '' : '（場次資料已清除）'}</span></summary>
            {ev ? <EventNotes event={ev} /> : (
              <div className="note-read">
                {noteFields(n, s.settings.noteCustom || [], s.settings.noteOrder || []).filter(([k]) => noteText(n, k)).map(([k, label]) => <p key={k}><b>{label}</b>　{noteText(n, k)}</p>)}
                {Object.entries(n.days || {}).filter(([, t]) => t).sort().map(([d, t]) => <p key={d}><b>{d.slice(5).replace('-', '/')}</b>　{t}</p>)}
              </div>
            )}
          </details>
        )
      })}
    </div>
  )
}
