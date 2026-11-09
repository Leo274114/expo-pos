import { useEffect, useRef, useState } from 'react'

// 捲動到畫面裡才開始播放裡面的動畫（只播一次）
// 用法：<InView className="card">…圖表…</InView>
export default function InView({ as: Tag = 'div', className = '', children, ...rest }) {
  const ref = useRef(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect() }
    }, { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  return <Tag ref={ref} className={`${className} await-view${seen ? ' inview' : ''}`} {...rest}>{children}</Tag>
}
