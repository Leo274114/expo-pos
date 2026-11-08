import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// 「？」說明：平時只顯示小圓點，點一下才展開說明，再點一下或點旁邊就收起
// 說明框直接畫在畫面最上層（不會被對話框或卡片邊界切掉），並自動避開螢幕邊緣
export default function Help({ children, title }) {
  const [pos, setPos] = useState(null) // { top, left, arrow, up }
  const btn = useRef(null)
  const pop = useRef(null)
  const open = !!pos
  const place = () => {
    const r = btn.current?.getBoundingClientRect()
    if (!r) return
    const W = Math.min(300, window.innerWidth - 16)
    const left = Math.max(8, Math.min(r.left + r.width / 2 - 24, window.innerWidth - W - 8))
    const below = window.innerHeight - r.bottom
    const up = below < 180 && r.top > below
    setPos({ left, width: W, arrow: r.left + r.width / 2 - left, ...(up ? { bottom: window.innerHeight - r.top + 8 } : { top: r.bottom + 8 }), up })
  }
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!btn.current?.contains(e.target) && !pop.current?.contains(e.target)) setPos(null) }
    const shut = () => setPos(null)
    document.addEventListener('pointerdown', close)
    window.addEventListener('resize', shut)
    window.addEventListener('scroll', shut, true)
    return () => { document.removeEventListener('pointerdown', close); window.removeEventListener('resize', shut); window.removeEventListener('scroll', shut, true) }
  }, [open])
  return (
    <span className="help">
      <button ref={btn} type="button" className={'help-btn' + (open ? ' on' : '')} aria-label="說明" aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); open ? setPos(null) : place() }}>?</button>
      {open && createPortal(
        <span ref={pop} className={'help-pop' + (pos.up ? ' up' : '')} role="note"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, '--arrow': pos.arrow + 'px' }}
          onClick={(e) => e.stopPropagation()}>
          {title && <b>{title}</b>}
          {children}
        </span>,
        document.body
      )}
    </span>
  )
}
