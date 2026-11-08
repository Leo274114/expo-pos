import { useEffect, useRef, useState } from 'react'

// 「？」說明：平時只顯示小圓點，點一下才展開說明，再點一下或點旁邊就收起
export default function Help({ children, title }) {
  const [open, setOpen] = useState(false)
  const [right, setRight] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  return (
    <span className="help" ref={ref}>
      <button type="button" className={'help-btn' + (open ? ' on' : '')} aria-label="說明" aria-expanded={open}
        onClick={(e) => {
          e.preventDefault(); e.stopPropagation()
          const r = ref.current?.getBoundingClientRect()
          setRight(!!r && r.left + 310 > window.innerWidth)
          setOpen(!open)
        }}>?</button>
      {open && (
        <span className={'help-pop' + (right ? ' right' : '')} role="note" onClick={(e) => e.stopPropagation()}>
          {title && <b>{title}</b>}
          {children}
        </span>
      )}
    </span>
  )
}
