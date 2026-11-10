import { useEffect, useRef, useState } from 'react'
import { hmOf, spreadLabels } from '../lib/analysis.js'

// 品項累計銷售曲線（SVG）
// 切換品項時：新加入的線由左往右像波浪一樣長上來，原本的線上下彈幾下，拿掉的線往下收
const L = 50, R = 18, T = 16, B = 30
const eob = (p) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2) }
const eic = (p) => p * p * p
const eoc = (p) => 1 - Math.pow(1 - p, 3)
const cl = (v) => Math.max(0, Math.min(1, v))
const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

function niceStep(max) {
  const raw = max / 5, p = Math.pow(10, Math.floor(Math.log10(raw || 1)))
  const n = raw / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

export default function SalesCurve({ series, selected, view, mode, open, close, colorOf, resetKey }) {
  const refs = { ax: useRef(null), ar: useRef(null), ln: useRef(null), mk: useRef(null) }
  const st = useRef({ prev: new Set(), prevView: view, yOld: 1, raf: 0, resetKey: null, colors: {} })
  // 依實際寬度畫（手機上文字才不會被縮得太小）
  const box = useRef(null)
  const [W, setW] = useState(680)
  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = W < 520 ? 240 : 300, PW = W - L - R, PH = H - T - B

  useEffect(() => {
    const S = st.current
    const byKey = Object.fromEntries(series.map((s) => [s.key, s]))
    const sel = selected.filter((k) => byKey[k])
    if (S.resetKey !== resetKey) { S.prev = new Set(); S.resetKey = resetKey }
    const shown = new Set(sel)
    for (const k of sel) S.colors[k] = colorOf(k)
    const col = (k) => S.colors[k] || colorOf(k)
    const all = [...new Set([...S.prev, ...sel])].filter((k) => byKey[k])
    const unitLabel = mode === 'grams' ? (v) => (v >= 1000 ? `${+(v / 1000).toFixed(1)}kg` : `${v}g`) : (v) => `${v}`
    const yNew = Math.max(mode === 'grams' ? 500 : 5, ...sel.map((k) => byKey[k].total)) * 1.12
    const X = view === 'E'
      ? Math.max(3600000, ...sel.map((k) => byKey[k].end - byKey[k].start))
      : Math.max(3600000, close - open)
    const xOf = (s, ts) => L + cl((view === 'E' ? ts - s.start : ts - open) / X) * PW
    const viewChanged = S.prevView !== view
    const t0 = performance.now()
    const yOld = S.yOld || yNew

    const frame = (now) => {
      const e = reduce ? 5000 : now - t0
      const ym = yOld + (yNew - yOld) * eoc(cl(e / 650))
      // 座標軸
      const step = niceStep(ym)
      let ax = ''
      for (let v = 0; v <= ym; v += step) {
        const y = T + PH - (v / ym) * PH
        ax += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="sc-grid"/><text x="${L - 8}" y="${y + 4}" text-anchor="end" class="sc-tick">${unitLabel(Math.round(v))}</text>`
      }
      const hourMs = 3600000
      const every = PW / (X / hourMs) < 44 ? 2 : 1
      if (view === 'E') {
        for (let m = 0; m <= X + 1; m += hourMs * every) ax += `<text x="${L + (m / X) * PW}" y="${H - 9}" text-anchor="middle" class="sc-tick">${m / hourMs}h</text>`
      } else {
        const first = Math.ceil(open / hourMs) * hourMs
        for (let t = first; t <= close; t += hourMs * every) ax += `<text x="${L + ((t - open) / X) * PW}" y="${H - 9}" text-anchor="middle" class="sc-tick">${hmOf(t)}</text>`
      }
      ax += `<line x1="${L}" x2="${W - R}" y1="${T + PH}" y2="${T + PH}" class="sc-base"/>`
      refs.ax.current.innerHTML = ax

      let ar = '', ln = '', mk = ''
      const labels = []
      all.forEach((k, idx) => {
        const s = byKey[k]
        const state = shown.has(k) ? (S.prev.has(k) && !viewChanged ? 'stay' : 'enter') : 'leave'
        const dl = idx * 80
        const f = (xf) => {
          if (state === 'enter') return eob(cl((e - dl - xf * 260) / 560))
          if (state === 'leave') return 1 - eic(cl((e - xf * 140) / 360))
          const p = cl(e / 900)
          return 1 + 0.14 * Math.sin(p * Math.PI * 3 + xf * 5) * Math.pow(1 - p, 2)
        }
        const P = s.pts.map(([ts, v]) => { const x = xOf(s, ts); return [x, T + PH - (Math.max(0, v * f((x - L) / PW)) / ym) * PH] })
        if (P.length < 2) return
        const c = col(k)
        const d = 'M' + P.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L')
        ar += `<path d="${d} L${P[P.length - 1][0].toFixed(1)},${T + PH} L${P[0][0].toFixed(1)},${T + PH} Z" fill="url(#sc-g-${idx})"/>`
        ln += `<path d="${d}" fill="none" stroke="${c}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`
        if (state !== 'leave') {
          const lp = P[P.length - 1]
          if (e > 650) mk += `<circle cx="${lp[0]}" cy="${lp[1]}" r="4.5" fill="${c}" stroke="#fff" stroke-width="2"/>`
          if (view === 'C' && e > 650) mk += `<line x1="${P[0][0]}" x2="${P[0][0]}" y1="${T + PH}" y2="${T + PH - 6}" stroke="${c}" stroke-width="2"/>`
          if (s.soldOutTs && e > 700) labels.push({ x: lp[0], y: lp[1] - 8, text: `完售 ${hmOf(s.soldOutTs)}`, c })
        }
      })
      // 完售標籤：互相錯開，不重疊
      for (const lb of spreadLabels(labels, 15, T + 10, T + PH - 4)) {
        const right = lb.x > W - R - 92
        const tx = right ? lb.x - 9 : lb.x + 9
        mk += `<text x="${tx}" y="${lb.y}" text-anchor="${right ? 'end' : 'start'}" class="sc-label" style="fill:${lb.c}">${lb.text}</text>`
      }
      // 每條線各自的漸層（依顯示順序）
      const defs = all.map((k, idx) => `<linearGradient id="sc-g-${idx}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col(k)}" stop-opacity="0.34"/><stop offset="1" stop-color="${col(k)}" stop-opacity="0"/></linearGradient>`).join('')
      refs.ar.current.innerHTML = `<defs>${defs}</defs>` + ar
      refs.ln.current.innerHTML = ln
      refs.mk.current.innerHTML = mk
      if (e < 1500) S.raf = requestAnimationFrame(frame)
      else { S.prev = shown; S.prevView = view; S.yOld = yNew }
    }
    cancelAnimationFrame(S.raf)
    S.raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(S.raf)
  }, [series, selected.join('|'), view, mode, open, close, resetKey, W])

  return (
    <div ref={box}>
      <svg className="sales-curve" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="各品項累計銷售曲線">
        <g ref={refs.ax} /><g ref={refs.ar} /><g ref={refs.ln} /><g ref={refs.mk} />
      </svg>
    </div>
  )
}
