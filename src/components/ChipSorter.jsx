import { useRef, useState } from 'react'
import Icon from './Icon.jsx'

// 選項小卡：按住左右（上下）拖曳換順序；拖到右邊垃圾桶放開＝刪除
// onMove(from, to)：to 是放開時插入的位置（以移除自己之前的索引計算）；onTrash(index)
export default function ChipSorter({ items, onMove, onTrash }) {
  const box = useRef(null)
  const bin = useRef(null)
  const [drag, setDrag] = useState(null) // { i, dx, dy, target, overBin }

  const start = (e, i) => {
    if (e.button !== undefined && e.button !== 0) return
    const chips = Array.from(box.current.querySelectorAll('[data-chip]'))
    const rects = chips.map((el) => el.getBoundingClientRect())
    const sx = e.clientX, sy = e.clientY
    let moved = false
    let state = { i, dx: 0, dy: 0, target: i, overBin: false }
    const move = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy
      if (!moved && Math.hypot(dx, dy) < 6) return
      moved = true
      ev.preventDefault()
      const b = bin.current?.getBoundingClientRect()
      const overBin = !!b && ev.clientX >= b.left - 12 && ev.clientX <= b.right + 12 && ev.clientY >= b.top - 12 && ev.clientY <= b.bottom + 12
      // 插入位置：同一行（垂直重疊）裡，指標在哪個小卡中線的左邊
      let target = rects.length
      let best = Infinity
      rects.forEach((r, k) => {
        const rowDist = ev.clientY < r.top ? r.top - ev.clientY : ev.clientY > r.bottom ? ev.clientY - r.bottom : 0
        const cx = r.left + r.width / 2
        const d = rowDist * 1000 + Math.abs(ev.clientX - cx)
        if (d < best) { best = d; target = ev.clientX < cx ? k : k + 1 }
      })
      state = { i, dx, dy, target, overBin }
      setDrag(state)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      setDrag(null)
      if (!moved) return
      if (state.overBin) return onTrash(i)
      let to = state.target > i ? state.target - 1 : state.target
      if (to !== i) onMove(i, to)
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const marker = drag && !drag.overBin && drag.target !== drag.i && drag.target !== drag.i + 1 ? drag.target : -1
  return (
    <div className="chip-sorter">
      <div className="chips" ref={box}>
        {items.map((x, k) => (
          <span key={x} data-chip
            className={'chip on draggable' + (drag?.i === k ? ' dragging' : '') + (marker === k ? ' drop-before' : '') + (marker === items.length && k === items.length - 1 ? ' drop-after' : '')}
            style={drag?.i === k ? { transform: `translate(${drag.dx}px, ${drag.dy}px)` } : undefined}
            onPointerDown={(e) => start(e, k)} title="按住拖曳換順序；拖到垃圾桶刪除">{x}</span>
        ))}
        {!items.length && <span className="muted">還沒有選項</span>}
      </div>
      <div ref={bin} className={'chip-bin' + (drag ? ' show' : '') + (drag?.overBin ? ' over' : '')} aria-label="拖到這裡刪除">
        <Icon name="trash" size={22} />
        <span>{drag?.overBin ? '放開刪除' : '拖到這裡刪除'}</span>
      </div>
    </div>
  )
}
