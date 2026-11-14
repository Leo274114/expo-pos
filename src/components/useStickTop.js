import { useEffect } from 'react'

// 表頭置頂時要躲在頁面上方工具列（日期、切換鈕）下面：量工具列高度設成 CSS 變數 --stick-top
export default function useStickTop() {
  useEffect(() => {
    const bar = document.querySelector('main .toolbar')
    if (!bar) return
    const set = () => document.documentElement.style.setProperty('--stick-top', bar.offsetHeight + 'px')
    set()
    const ro = new ResizeObserver(set)
    ro.observe(bar)
    return () => ro.disconnect()
  }, [])
}
