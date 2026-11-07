import { fmt } from '../lib/calc.js'

// 簡單長條圖（SVG），data: [{label, value}]
export default function BarChart({ data, height = 180 }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  const w = 100 / Math.max(1, data.length)
  return (
    <div className="chart">
      <svg viewBox={`0 0 100 ${height / 3}`} preserveAspectRatio="none" style={{ height }}>
        {data.map((d, i) => {
          const h = (Math.max(0, d.value) / max) * (height / 3 - 2)
          return (
            <rect key={i} x={i * w + w * 0.15} width={w * 0.7} y={height / 3 - h} height={h} rx="0.6" className="bar">
              <title>{d.label}：{fmt(d.value)}</title>
            </rect>
          )
        })}
      </svg>
      <div className="chart-labels">
        {data.map((d, i) => (
          <div key={i} style={{ width: w + '%' }}>
            <div className="chart-val">{d.value ? fmt(d.value).replace('$', '') : ''}</div>
            <div>{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
