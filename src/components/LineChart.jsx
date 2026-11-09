import { fmt } from '../lib/calc.js'

// 曲線圖（SVG）：進場時整條曲線從 0 往上長到應有的位置，圓點跟著升起
// data: [{label, value}]；放在 <InView> 裡就會等捲動到才播放
export default function LineChart({ data, height = 160 }) {
  const n = data.length
  const max = Math.max(1, ...data.map((d) => d.value))
  const H = 60
  const w = 100 / Math.max(1, n)
  const pts = data.map((d, i) => [(i + 0.5) * w, H - (Math.max(0, d.value) / max) * (H - 6)])
  // 平滑曲線（Catmull-Rom 轉貝茲）
  let path = ''
  if (pts.length) {
    path = `M ${pts[0][0]} ${pts[0][1]}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, Math.min(H, p1[1] + (p2[1] - p0[1]) / 6)]
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, Math.min(H, p2[1] - (p3[1] - p1[1]) / 6)]
      path += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`
    }
  }
  const area = pts.length > 1 ? `${path} L ${pts[n - 1][0]} ${H} L ${pts[0][0]} ${H} Z` : ''
  return (
    <div className={'chart line-chart' + (n <= 8 ? ' few' : '')}>
      <div className="line-box" style={{ height }}>
        <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none">
          <line x1="0" x2="100" y1={H - 0.15} y2={H - 0.15} className="baseline" />
          <g className="line-anim">
            {area && <path d={area} className="line-area" />}
            {pts.length > 1 && <path d={path} className="line-path" vectorEffect="non-scaling-stroke" />}
          </g>
        </svg>
        {data.map((d, i) => (
          <span key={i} className={'line-dot' + (d.value === max && d.value > 0 ? ' peak' : '')}
            style={{ left: `${pts[i][0]}%`, bottom: `${((H - pts[i][1]) / H) * 100}%`, animationDelay: `${i * 60}ms` }}
            title={`${d.label}：${fmt(d.value)}`} />
        ))}
      </div>
      <div className="chart-labels">
        {data.map((d, i) => (
          <div key={i} style={{ width: w + '%' }}>
            <div className="chart-val" style={{ animationDelay: `${i * 60 + 600}ms` }}>{d.value ? fmt(d.value).replace('$', '') : ''}</div>
            <div>{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
