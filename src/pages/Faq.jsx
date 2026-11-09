import { useState } from 'react'
import { DISCLAIMER, FAQ, FEATURES, searchFaq } from '../lib/faq.js'
import Icon from '../components/Icon.jsx'
import { VERSION } from '../version.js'

// Q&A：上方輸入問題，下方即時篩選常見問題、功能說明與使用須知
export default function Faq() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)
  const notes = searchFaq(DISCLAIMER.map((x) => ({ q: x.t, a: x.d })), q)
  const faq = searchFaq(FAQ, q)
  const feats = searchFaq(FEATURES, q)
  const none = q.trim() && !notes.length && !faq.length && !feats.length
  const Item = ({ x, k }) => (
    <details className="faq-item" open={!!q.trim() || open === k} onToggle={(e) => e.target.open && setOpen(k)}>
      <summary>{x.q}</summary>
      <p>{x.a}</p>
    </details>
  )
  return (
    <div className="page faq">
      <div className="faq-search toolbar">
        <Icon name="search" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="輸入你的問題，例如：沒網路、退貨、價目表" />
        {q && <button className="icon" onClick={() => setQ('')} aria-label="清除">✕</button>}
      </div>
      {none && (
        <div className="card muted">找不到「{q}」的相關說明。可以換個關鍵字，或截圖傳給浩子詢問。</div>
      )}
      {notes.length > 0 && (
        <section className="card faq-notice">
          <h4>⚠️ 使用須知（免責說明）</h4>
          {q.trim()
            ? notes.map((x, i) => <Item key={i} x={x} k={'n' + i} />)
            : <ol>{DISCLAIMER.map((x) => <li key={x.t}><b>{x.t}</b><br /><span>{x.d}</span></li>)}</ol>}
        </section>
      )}
      {faq.length > 0 && (
        <section className="card">
          <h4>常見問題</h4>
          {faq.map((x, i) => <Item key={i} x={x} k={'f' + i} />)}
        </section>
      )}
      {feats.length > 0 && (
        <section className="card">
          <h4>各功能說明</h4>
          {feats.map((x, i) => <Item key={i} x={x} k={'h' + i} />)}
        </section>
      )}
      <p className="muted small center">好攤 v{VERSION}・問題與建議請找浩子</p>
    </div>
  )
}

// 首次加入畫面用的精簡版使用須知
export function DisclaimerList() {
  return (
    <ol className="disclaimer">
      {DISCLAIMER.map((x) => <li key={x.t}><b>{x.t}</b>：{x.d}</li>)}
    </ol>
  )
}
