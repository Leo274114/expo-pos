import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShop, commit } from '../store.jsx'
import { today } from '../lib/calc.js'
import Icon from './Icon.jsx'

// 開店清單：新攤商第一次使用時，一步一步完成設定
// 耗材與開店點零錢不是必填，可以按「略過」直接到下一步
export function onboardingSteps(s) {
  const priced = s.skus.some((k) => Number(k.price) > 0)
  const stocked = Object.values(s.stockInit || {}).some((v) => Number(v?.initial) > 0)
  const opened = !s.settings.cashCount || !!s.cashCounts?.[`${today()}_open`]
  const supplied = Object.values(s.supplies || {}).some((x) => Number(x?.prep) > 0)
  const supplySkipped = !!s.event?.supplySkip
  return [
    { key: 'event', done: !!s.eventId, title: '建立展覽場次', desc: '填場次名稱與起訖日期', to: '/admin?tab=2' },
    { key: 'template', done: s.products.length > 0, title: '載入商品範本', desc: '管理 → 商品與價格 →「載入內建範本」，或自己新增', to: '/admin?tab=0' },
    { key: 'price', done: priced && stocked, title: '填價格與初始庫存', desc: '點開商品，產生組合後填定價與初始庫存', to: '/admin?tab=0' },
    {
      key: 'supplies', done: supplied || supplySkipped, skipped: !supplied && supplySkipped, optional: true, skippable: !!s.eventId,
      title: '填耗材準備數量', desc: '試飲杯、濾紙、手提袋…這次帶了多少（可略過）', to: '/admin?tab=3'
    },
    { key: 'cash', done: opened, optional: true, daily: true, title: '開店點零錢', desc: '每天開店時點一次零用金（可在功能設定關閉）', to: '/cash' }
  ]
}

// 給總覽看的進度：完成幾步、卡在哪一步
export function onboardProgress(s) {
  const steps = onboardingSteps(s)
  const next = steps.find((x) => !x.done)
  return { done: steps.filter((x) => x.done).length, total: steps.length, next: next ? next.title : '' }
}

const skipSupplies = (s) => {
  if (!s.eventPath) return
  commit(s.batch().set(s.ref(s.eventPath), { supplySkip: true }, { merge: true }))
}

export default function Onboarding() {
  const s = useShop()
  const nav = useNavigate()
  const steps = onboardingSteps(s)
  const doneCount = steps.filter((x) => x.done).length
  const next = steps.find((x) => !x.done)
  return (
    <div className="card onboard">
      <div>
        <h3 style={{ margin: 0 }}>開店清單</h3>
        <p className="muted small" style={{ margin: '2px 0 0' }}>完成 {doneCount}／{steps.length}，跟著做就能開始收銀</p>
      </div>
      <div className="onboard-bar"><i style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
      <ol className="onboard-steps">
        {steps.map((x, i) => (
          <li key={x.key} className={(x.done ? 'done' : '') + (x === next ? ' next' : '')}>
            <button onClick={() => nav(x.to)}>
              <span className="ob-num">{x.done ? <Icon name="check" size={18} /> : i + 1}</span>
              <span className="ob-text"><b>{x.title}{x.daily ? '（每天）' : ''}{x.skipped ? '（已略過）' : ''}</b><small>{x.desc}</small></span>
              {!x.done && <span className="ob-go">前往</span>}
            </button>
            {!x.done && x.skippable && <button className="link small ob-skip" onClick={() => skipSupplies(s)}>略過，下一步</button>}
          </li>
        ))}
      </ol>
    </div>
  )
}

// 收銀畫面上方的一行提醒：還有沒完成的步驟時出現，可略過或收起（每個場次各自記住）
export function OnboardBanner() {
  const s = useShop()
  const nav = useNavigate()
  const key = `onboard-hide:${s.shopId}:${s.eventId}`
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(key) === '1' } catch { return false } })
  const steps = onboardingSteps(s)
  const next = steps.find((x) => !x.done)
  if (hidden || !next) return null
  const done = steps.filter((x) => x.done).length
  return (
    <div className="onboard-banner">
      <span>開店清單 {done}／{steps.length}：下一步<b>{next.title}</b></span>
      <span className="row gap">
        <button className="small-btn" onClick={() => nav(next.to)}>前往</button>
        {next.skippable && <button className="small-btn" onClick={() => skipSupplies(s)}>略過</button>}
        <button className="link small" onClick={() => { setHidden(true); try { localStorage.setItem(key, '1') } catch { /* 忽略 */ } }}>收起</button>
      </span>
    </div>
  )
}
