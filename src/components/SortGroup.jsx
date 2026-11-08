import { createElement, useRef } from 'react'

// 拖曳排序：按住每一列左邊的「⋮⋮」上下拖曳，放開後呼叫 onDrop(from, to)
// 手指、滑鼠都可以；children(item, index, grip) 回傳的元素要加 data-sort
export default function SortGroup({ as = 'div', items, onDrop, children, className }) {
  const ref = useRef(null)
  const start = (e, index) => {
    if (e.button !== undefined && e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    const box = ref.current
    if (!box) return
    const els = Array.from(box.children).filter((el) => el.hasAttribute('data-sort'))
    const rects = els.map((el) => el.getBoundingClientRect())
    const me = els[index]
    if (!me) return
    const pitch = index < rects.length - 1 ? rects[index + 1].top - rects[index].top : index > 0 ? rects[index].top - rects[index - 1].top : rects[index].height
    const startY = e.clientY
    let target = index
    me.classList.add('sorting')
    els.forEach((el, i) => { if (i !== index) el.style.transition = 'transform 0.15s ease' })
    const move = (ev) => {
      ev.preventDefault()
      const dy = ev.clientY - startY
      me.style.transform = `translateY(${dy}px)`
      const mid = rects[index].top + rects[index].height / 2 + dy
      let t = index
      // 拖過下一列（或上一列）約三分之一高度就換位置，不用拖到正中間
      rects.forEach((r, i) => {
        if (i < index && mid < r.bottom - r.height * 0.35) t = Math.min(t, i)
        if (i > index && mid > r.top + r.height * 0.35) t = Math.max(t, i)
      })
      target = t
      els.forEach((el, i) => {
        if (i === index) return
        let shift = 0
        if (index < target && i > index && i <= target) shift = -pitch
        if (index > target && i < index && i >= target) shift = pitch
        el.style.transform = shift ? `translateY(${shift}px)` : ''
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      me.classList.remove('sorting')
      els.forEach((el) => { el.style.transform = ''; el.style.transition = '' })
      if (target !== index) onDrop(index, target)
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }
  const grip = (i) => (
    <span className="grip" onPointerDown={(e) => start(e, i)} onClick={(e) => e.stopPropagation()} title="按住上下拖曳排序" aria-label="拖曳排序" role="button">
      <svg width="14" height="20" viewBox="0 0 14 20" aria-hidden="true">
        {[4, 10, 16].map((y) => [<circle key={'a' + y} cx="4" cy={y} r="1.7" />, <circle key={'b' + y} cx="10" cy={y} r="1.7" />])}
      </svg>
    </span>
  )
  return createElement(as, { ref, className }, items.map((it, i) => children(it, i, grip(i))))
}

// 依新順序重新編號
export function moveItem(list, from, to) {
  const next = [...list]
  const [x] = next.splice(from, 1)
  next.splice(to, 0, x)
  return next
}
