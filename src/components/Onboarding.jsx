import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShop } from '../store.jsx'
import { today } from '../lib/calc.js'
import Icon from './Icon.jsx'

// 開店清單：新攤商第一次使用時，一步一步完成設定
export function onboardingSteps(s) {
  const priced = s.skus.some((k) => Number(k.price) > 0)
  const stocked = Object.values(s.stockInit || {}).some((v) => Number(v?.initial) > 0)
  const opened = !s.settings.cashCount || !!s.cashCounts?.[`${today()}_open`]
  return [
    { done: !!s.eventId, title: '建立展覽場次', desc: '填場次名稱與起訖日期', to: '/admin?tab=2' },
    { done: s.products.length > 0, title: '載入商品範本', desc: '管理 → 商品與價格 →「載入內建範本」，或自己新增', to: '/admin?tab=0' },
    { done: priced && stocked, title: '填價格與初始庫存', desc: '點開商品，產生組合後填定價與初始庫存', to: '/admin?tab=0' },
    { done: opened, title: '開店點零錢', desc: '每天開店時點一次零用金（可在功能設定關閉）', to: '/cash', optional: true }
  ]
}

export default function Onboarding({ compact }) {
  const s = useShop()
  const nav = useNavigate()
  const key = `onboard-hide:${s.shopId}`
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(key) === '1' } catch { return false } })
  const steps = onboardingSteps(s)
  const must = steps.filter((x) => !x.optional)
  const doneCount = steps.filter((x) => x.done).length
  if (compact && (hidden || must.every((x) => x.done))) return null
  const next = steps.find((x) => !x.done)
  return (
    <div className="card onboard">
      <div className="row between">
        <div>
          <h3 style={{ margin: 0 }}>開店清單</h3>
          <p className="muted small" style={{ margin: '2px 0 0' }}>完成 {doneCount}／{steps.length}，跟著做就能開始收銀</p>
        </div>
        {compact && <button className="link small" onClick={() => { setHidden(true); try { localStorage.setItem(key, '1') } catch { /* 忽略 */ } }}>之後再說</button>}
      </div>
      <div className="onboard-bar"><i style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
      <ol className="onboard-steps">
        {steps.map((x, i) => (
          <li key={x.title} className={(x.done ? 'done' : '') + (x === next ? ' next' : '')}>
            <button onClick={() => nav(x.to)}>
              <span className="ob-num">{x.done ? <Icon name="check" size={18} /> : i + 1}</span>
              <span className="ob-text"><b>{x.title}{x.optional ? '（每天）' : ''}</b><small>{x.desc}</small></span>
              {!x.done && <span className="ob-go">前往</span>}
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
