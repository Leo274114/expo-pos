import { daysBetween, today } from '../lib/calc.js'

export function eventDays(event) {
  const days = daysBetween(event?.start, event?.end)
  const t = today()
  if (!days.includes(t)) days.push(t)
  return days.sort()
}

// 選「整個展期」時 value ＝ 'all'（要傳 allowAll 才會出現）
export const ALL = 'all'
export const eventOnlyDays = (event) => daysBetween(event?.start, event?.end)

export default function DaySelect({ event, value, onChange, allowAll }) {
  const days = eventDays(event)
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {allowAll && <option value={ALL}>整個展期（{eventOnlyDays(event).length} 天）</option>}
      {days.map((d) => (
        <option key={d} value={d}>{d.slice(5).replace('-', '/')}{d === today() ? '（今天）' : ''}</option>
      ))}
    </select>
  )
}
