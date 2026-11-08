import { useEffect, useRef, useState } from 'react'
import { fmt } from '../lib/calc.js'

// 數字滾動：從 0 跑到目標值（使用者設定減少動態時直接顯示）
export default function CountUp({ value, money = true, ms = 800 }) {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [shown, setShown] = useState(reduce ? value : 0)
  const from = useRef(0)
  useEffect(() => {
    if (reduce) { setShown(value); return }
    const start = performance.now(), a = from.current, b = value
    let raf
    const tick = (now) => {
      const p = Math.min(1, (now - start) / ms)
      const e = 1 - Math.pow(1 - p, 3)
      const v = a + (b - a) * e
      setShown(v)
      if (p < 1) raf = requestAnimationFrame(tick)
      else from.current = b
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); from.current = b }
  }, [value])
  return <>{money ? fmt(shown) : Math.round(shown)}</>
}
