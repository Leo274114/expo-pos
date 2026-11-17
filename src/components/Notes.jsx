import { useEffect, useRef, useState } from 'react'
import { doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useShop, commit } from '../store.jsx'
import { timeOf } from '../lib/calc.js'
import { eventDays } from './DaySelect.jsx'

// 展場心得：跟著展覽場次，存在攤位底下 notes/{場次ID}（場次 14 天後清除時心得保留，下次參展可以回頭看）
// { eventName, start, end, all: 整體心得, days: { 'YYYY-MM-DD': 當天觀察 }, updatedAt }
export function saveNote(s, e, patch) {
  if (!e) return
  commit(writeBatch(db).set(doc(db, s.shopPath, 'notes', e.id), {
    eventName: e.name || '', start: e.start || '', end: e.end || '', ...patch, updatedAt: Date.now()
  }, { merge: true }))
}

// 自動儲存的文字框：停止打字 1.5 秒或離開欄位就存
function NoteBox({ value, onSave, placeholder, rows = 4 }) {
  const [v, setV] = useState(value || '')
  const [state, setState] = useState('') // '' | 'typing' | 'saved'
  const t = useRef(null)
  const last = useRef(value || '')
  useEffect(() => { if (state !== 'typing') { setV(value || ''); last.current = value || '' } }, [value])
  const flush = (text) => {
    clearTimeout(t.current)
    if (text === last.current) return
    last.current = text
    onSave(text)
    setState('saved')
  }
  return (
    <div className="note-box">
      <textarea rows={rows} value={v} placeholder={placeholder}
        onChange={(e) => { const x = e.target.value; setV(x); setState('typing'); clearTimeout(t.current); t.current = setTimeout(() => flush(x), 1500) }}
        onBlur={() => flush(v)} />
      <span className="note-state muted small">{state === 'typing' ? '輸入中…' : state === 'saved' ? '已自動儲存' : ''}</span>
    </div>
  )
}

export default function EventNotes({ event }) {
  const s = useShop()
  const e = event || s.event
  if (!e) return null
  const n = s.notes[e.id] || {}
  const days = eventDays(e)
  return (
    <div className="card notes-card">
      <h4>展場心得・{e.name}</h4>
      <p className="muted small">記下這次展場的觀察：人潮、客群、好賣與不好賣的、攤位位置、天氣、下次要改進的…自動儲存；場次資料 14 天後清除時，心得會保留，下次參展可以在「管理 → 展覽場次」回頭看。</p>
      <label>整體心得</label>
      <NoteBox value={n.all} rows={5} placeholder="例：攤位在走道轉角人潮多；藝伎試喝後成交率高；下次多帶 1/4 磅…" onSave={(all) => saveNote(s, e, { all })} />
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
    .filter((n) => n.id !== s.eventId && (n.all || Object.values(n.days || {}).some(Boolean)))
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
                {n.all && <p>{n.all}</p>}
                {Object.entries(n.days || {}).filter(([, t]) => t).sort().map(([d, t]) => <p key={d}><b>{d.slice(5).replace('-', '/')}</b>　{t}</p>)}
              </div>
            )}
          </details>
        )
      })}
    </div>
  )
}
