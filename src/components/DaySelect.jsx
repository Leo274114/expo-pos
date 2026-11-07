import { daysBetween, today } from '../lib/calc.js'

export function eventDays(event) {
  const days = daysBetween(event?.start, event?.end)
  const t = today()
  if (!days.includes(t)) days.push(t)
  return days.sort()
}

export default function DaySelect({ event, value, onChange }) {
  const days = eventDays(event)
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {days.map((d) => (
        <option key={d} value={d}>{d.slice(5).replace('-', '/')}{d === today() ? '（今天）' : ''}</option>
      ))}
    </select>
  )
}
