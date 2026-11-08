import { fmt } from '../lib/calc.js'

// 長條圖（SVG）：進場時長條由下往上長出，依序錯開
// data: [{label, value}]；換資料時給不同 key 會重新播放
export default function BarChart({ data, height = 180 }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  const w = 100 / Math.max(1, data.length)
  const H = height / 3
  return (
    <div className={'chart' + (data.length <= 8 ? ' few' : '')}>
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" style={{ height }}>
        <line x1="0" x2="100" y1={H - 0.15} y2={H - 0.15} className="baseline" />
        {data.map((d, i) => {
          const h = (Math.max(0, d.value) / max) * (H - 2)
          return (
            <rect key={i} x={i * w + w * 0.15} width={w * 0.7} y={H - h} height={h} rx="0.6"
              className={'bar' + (d.value === max && d.value > 0 ? ' peak' : '')} style={{ animationDelay: `${i * 45}ms` }}>
              <title>{d.label}：{fmt(d.value)}</title>
            </rect>
          )
        })}
      </svg>
      <div className="chart-labels">
        {data.map((d, i) => (
          <div key={i} style={{ width: w + '%' }}>
            <div className="chart-val" style={{ animationDelay: `${i * 45 + 450}ms` }}>{d.value ? fmt(d.value).replace('$', '') : ''}</div>
            <div>{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
