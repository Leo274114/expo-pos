import { useEffect, useMemo, useRef, useState } from 'react'
import { doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useShop, useUi, useCarts, commit, deviceId } from '../store.jsx'
import {
  fmt, skuLabel, effectivePrice, cartTotals, changeBreakdown, denomsFor, dayOf, orderMoves,
  lowStockCrossings, componentAvail, PAY_TYPE_LABEL, GIFT_TO, promoHits, promoNext
} from '../lib/calc.js'
import Modal from '../components/Modal.jsx'
import { sortCats, catColor } from '../lib/template.js'
import { parseOrder } from '../lib/voice.js'
import Icon from '../components/Icon.jsx'
import Onboarding from '../components/Onboarding.jsx'
import Help from '../components/Help.jsx'
import { HELP } from '../lib/help.js'

let lineSeq = 0
const lineKey = () => Date.now().toString(36) + '-' + lineSeq++

export default function Pos() {
  const s = useShop()
  const ui = useUi()
  const cs = useCarts()
  const cart = cs.cart
  const [cat, setCat] = useState('')
  const [q, setQ] = useState('')
  const [picker, setPicker] = useState(null)   // { product, chosen: [] }
  const [zero, setZero] = useState(null)       // sku
  const [priceEdit, setPriceEdit] = useState(null) // line
  const [qtyEdit, setQtyEdit] = useState(null) // { c, l }
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [flash, setFlash] = useState(null) // 剛加入的品項，用來做亮一下的回饋
  const [discountOpen, setDiscountOpen] = useState(false)
  const [checkout, setCheckout] = useState(false)
  const [cartOpen, setCartOpen] = useState(false) // 手機版購物車展開

  const activeSkus = useMemo(
    () => s.skus.filter((k) => k.active !== false && s.productById[k.productId] && s.productById[k.productId].active !== false),
    [s.skus, s.productById]
  )
  const products = s.products.filter((p) => p.active !== false && activeSkus.some((k) => k.productId === p.id))
  // 熱賣：今天賣最多的 8 樣（今天還沒賣就用整個展期）
  const hot = useMemo(() => {
    const count = (list) => {
      const m = {}
      for (const o of list) {
        if (o.status === 'void' || (o.type !== 'sale' && o.type !== 'exchange')) continue
        for (const it of o.items || []) if (!it.pre) m[it.skuId] = (m[it.skuId] || 0) + it.qty
      }
      return m
    }
    let m = count(s.orders.filter((o) => o.day === dayOf(Date.now())))
    if (!Object.keys(m).length) m = count(s.orders)
    const ok = new Set(activeSkus.map((k) => k.id))
    return Object.entries(m).filter(([id]) => ok.has(id)).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => ({ sku: s.skuById[id], n }))
  }, [s.orders, activeSkus, s.skuById])
  const cats = [...(hot.length ? ['熱賣'] : []), ...sortCats([...new Set(products.map((p) => p.category || '未分類'))])]
  const curCat = cats.includes(cat) ? cat : cats[0]

  // 所有暫存單中已佔用的數量（現貨）
  // 套裝／盒裝的組成也算佔用
  const reserved = (skuId) => {
    let n = 0
    for (const c of cs.carts) for (const l of c.lines) {
      if (l.pre || l.ret) continue
      if (l.components?.length) { for (const x of l.components) if (x.skuId === skuId) n += x.qty * l.qty }
      else if (l.skuId === skuId) n += l.qty
    }
    return n
  }
  const tracksId = (skuId) => {
    const k = s.skuById[skuId]
    return !!k && s.productById[k.productId]?.trackStock !== false
  }
  const leftOf = (skuId) => (tracksId(skuId) ? (s.stock[skuId] ?? 0) - reserved(skuId) : Infinity)
  const tracks = (sku) => (sku.components?.length ? sku.components.some((c) => tracksId(c.skuId)) : s.productById[sku.productId]?.trackStock !== false)
  const avail = (sku) => (sku.components?.length ? componentAvail(sku.components, leftOf) : leftOf(sku.id))

  const updateLines = (fn, cartId = cart.id) => cs.update(cartId, (c) => ({ ...c, lines: fn(c.lines) }))

  const pushLine = (sku, qty, pre) => {
    setFlash({ skuId: sku.id, pre: !!pre, n: Date.now() })
    const product = s.productById[sku.productId]
    const price = effectivePrice(sku)
    updateLines((lines) => {
      const i = lines.findIndex((l) => l.skuId === sku.id && !l.ret && !!l.pre === pre && l.price === price && !l.reason)
      if (i >= 0) return lines.map((l, j) => (j === i ? { ...l, qty: l.qty + qty } : l))
      return [...lines, {
        key: lineKey(), skuId: sku.id, name: skuLabel(sku, product), category: product?.category || '', unit: product?.unit || '',
        qty, price, listPrice: Number(sku.price) || 0, pre,
        ...(sku.components?.length ? { components: sku.components.map((c) => ({ skuId: c.skuId, qty: Number(c.qty) || 1 })) } : {})
      }]
    })
  }

  const addSku = (sku, pre = false) => {
    if (!pre && tracks(sku) && avail(sku) <= 0) { setZero(sku); return }
    pushLine(sku, 1, pre)
  }

  // 語音點單一次加入多件：庫存不足的部分改為預定（有開啟預定時）
  const addVoiceLines = (items) => {
    const short = []
    for (const { sku, qty } of items) {
      const can = tracks(sku) ? Math.max(0, Math.min(qty, avail(sku))) : qty
      if (can > 0) pushLine(sku, can, false)
      const rest = qty - can
      if (rest > 0) {
        if (s.settings.preorderEnabled && !cart.refOrderId) { pushLine(sku, rest, true); short.push(`${skuLabel(sku, s.productById[sku.productId])} ${rest} 件改為預定`) }
        else short.push(`${skuLabel(sku, s.productById[sku.productId])} 庫存不足，少加 ${rest} 件`)
      }
    }
    if (short.length) ui.toast(short.join('；'), { kind: 'error', ms: 7000 })
  }

  // 這一列最多可以到幾件
  const maxQtyOf = (line) => {
    if (line.ret) return line.maxQty
    if (line.pre) return Infinity
    const sku = s.skuById[line.skuId]
    return sku && tracks(sku) ? line.qty + Math.max(0, avail(sku)) : Infinity
  }

  const inc = (c, line, d) => {
    if (d > 0) {
      if (line.ret) { if (line.qty >= line.maxQty) return }
      else if (!line.pre) {
        const sku = s.skuById[line.skuId]
        if (sku && tracks(sku) && avail(sku) <= 0) { setZero(sku); return }
      }
    }
    updateLines((lines) => lines.map((l) => (l.key === line.key ? { ...l, qty: Math.max(1, l.qty + d) } : l)), c.id)
  }

  const setQty = (c, line, n) => {
    const max = maxQtyOf(line)
    let q = Math.floor(Number(n) || 0)
    if (q <= 0) { removeLine(c, line); return }
    if (q > max) {
      ui.toast(line.ret ? `最多可退 ${max}` : `庫存只剩 ${max}，已改為 ${max}${s.settings.preorderEnabled ? '；不足的可再點商品改為預定' : ''}`, { kind: 'error', ms: 5000 })
      q = max
    }
    updateLines((lines) => lines.map((l) => (l.key === line.key ? { ...l, qty: q } : l)), c.id)
  }

  const removeLine = (c, line) => {
    const idx = c.lines.findIndex((l) => l.key === line.key)
    const cartId = c.id
    updateLines((lines) => lines.filter((l) => l.key !== line.key), cartId)
    ui.toast(`已刪除 ${line.name}`, {
      ms: 5000,
      action: { label: '復原', onClick: () => cs.update(cartId, (c) => { const ls = [...c.lines]; ls.splice(Math.min(idx, ls.length), 0, line); return { ...c, lines: ls } }) }
    })
  }

  const t = cartTotals(cart, {})

  // 客人卡片左右滑動（scroll-snap），和上方分頁同步
  const slider = useRef(null)
  const scrollTimer = useRef(null)
  const userScroll = useRef(false)
  const markUser = () => { userScroll.current = true }
  const firstScroll = useRef(true)
  useEffect(() => {
    const el = slider.current
    if (!el || !el.clientWidth) return
    const cur = Math.round(el.scrollLeft / el.clientWidth)
    if (cur !== cs.active) el.scrollTo({ left: cs.active * el.clientWidth, behavior: firstScroll.current ? 'auto' : 'smooth' })
    firstScroll.current = false
  }, [cs.active, cs.carts.length])
  // 滑動中依距離縮放卡片，做出卡片切換的動態感
  const paint = () => {
    const el = slider.current
    if (!el || !el.clientWidth) return
    const pos = el.scrollLeft / el.clientWidth
    Array.from(el.children).forEach((slide, i) => {
      const d = Math.min(1, Math.abs(pos - i))
      const card = slide.firstChild
      if (!card) return
      card.style.transform = `scale(${1 - d * 0.08}) rotateY(${(i - pos) * -8}deg)`
      card.style.opacity = String(1 - d * 0.5)
    })
  }
  useEffect(paint)
  const onSlide = () => {
    requestAnimationFrame(paint)
    clearTimeout(scrollTimer.current)
    scrollTimer.current = setTimeout(() => {
      const el = slider.current
      if (!el || !el.clientWidth) return
      const i = Math.round(el.scrollLeft / el.clientWidth)
      // 只有手指／觸控板滑動才切換客人；程式捲動（點分頁、新增客人）不會改變目前客人
      if (userScroll.current) {
        userScroll.current = false
        if (i !== cs.active && i >= 0 && i < cs.carts.length) cs.setActive(i)
      } else if (i !== cs.active) {
        el.scrollTo({ left: cs.active * el.clientWidth, behavior: 'smooth' })
      }
    }, 120)
  }

  // 電腦用滑鼠拖曳切換（觸控螢幕直接用手指滑）
  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    const el = slider.current
    if (!el) return
    const start = { x: e.clientX, left: el.scrollLeft, moved: false }
    const move = (ev) => {
      const dx = ev.clientX - start.x
      if (!start.moved && Math.abs(dx) < 6) return
      if (!start.moved) { start.moved = true; el.style.scrollSnapType = 'none'; el.classList.add('dragging') }
      el.scrollLeft = start.left - dx
      requestAnimationFrame(paint)
    }
    const up = (ev) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (!start.moved) return
      const w = el.clientWidth
      const dx = ev.clientX - start.x
      const from = Math.round(start.left / w)
      let to = Math.abs(dx) > w * 0.18 ? from + (dx < 0 ? 1 : -1) : from
      to = Math.max(0, Math.min(cs.carts.length - 1, to))
      el.classList.remove('dragging')
      el.scrollTo({ left: to * w, behavior: 'smooth' })
      setTimeout(() => { el.style.scrollSnapType = '' }, 400)
      cs.setActive(to)
      // 拖曳結束不要誤觸按鈕
      const block = (ce) => { ce.stopPropagation(); ce.preventDefault() }
      el.addEventListener('click', block, { capture: true, once: true })
      setTimeout(() => el.removeEventListener('click', block, { capture: true }), 50)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  if (!s.eventId || !activeSkus.some((k) => Number(k.price) > 0)) return <div className="page"><Onboarding /></div>

  const searchHits = q.trim()
    ? activeSkus.map((k) => ({ k, label: skuLabel(k, s.productById[k.productId]) })).filter((x) => x.label.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 40)
    : null

  return (
    <div className="pos-page">
      {ui.notices.length > 0 && (
        <div className="notices">
          {ui.notices.map((n) => (
            <div key={n.id} className="notice" onClick={() => ui.dismissNotice(n.id)}>⚠️ {n.text}<span className="x">✕</span></div>
          ))}
        </div>
      )}

      <div className="pos-main">
        {/* 商品區 */}
        <div className="products-pane">
          <div className="search-row">
            <label className="search"><Icon name="search" size={20} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋品項，例：SL-34 日曬" /></label>
            {s.settings.voiceEnabled && (
              <button className="mic-btn" onClick={() => setVoiceOpen({ rec: startRecognizer() })} aria-label="語音點單"><Icon name="mic" size={22} />語音點單</button>
            )}
          </div>
          {searchHits ? (
            <div className="grid">
              {searchHits.map(({ k, label }) => (
                <SkuButton key={k.id} sku={k} label={label} cat={s.productById[k.productId]?.category} avail={avail(k)} onClick={() => { addSku(k); }} />
              ))}
              {!searchHits.length && <p className="muted">找不到</p>}
            </div>
          ) : (
            <>
              <div className="tabs scroll">
                {cats.map((c) => <button key={c} className={c === curCat ? 'on' : ''} style={{ '--cat': catColor(c) }} onClick={() => setCat(c)}><i className="swatch" />{c}</button>)}
              </div>
              <div className="grid">
                {curCat === '熱賣' && hot.map(({ sku, n }, i) => (
                  <div key={sku.id} className="hot-wrap">
                    <span className="hot-rank">{i + 1}</span>
                    <SkuButton sku={sku} label={skuLabel(sku, s.productById[sku.productId])} cat={s.productById[sku.productId]?.category} avail={avail(sku)} onClick={() => addSku(sku)} />
                  </div>
                ))}
                {curCat !== '熱賣' && products.filter((p) => (p.category || '未分類') === curCat).map((p) => {
                  const ks = activeSkus.filter((k) => k.productId === p.id)
                  const single = !(p.levels || []).length && ks.length === 1
                  if (single) return <SkuButton key={p.id} sku={ks[0]} label={p.name} cat={p.category} avail={avail(ks[0])} onClick={() => addSku(ks[0])} />
                  const minP = Math.min(...ks.map(effectivePrice)), maxP = Math.max(...ks.map(effectivePrice))
                  return (
                    <button key={p.id} className="pbtn" style={{ '--cat': catColor(p.category) }} onClick={() => setPicker({ product: p, chosen: [] })}>
                      <span className="pname">{p.name}</span>
                      <span className="pprice num">{minP === maxP ? fmt(minP) : `${fmt(minP)}–${fmt(maxP).replace('$', '')}`}</span>
                      <span className="pstock">{ks.length} 種選擇</span>
                    </button>
                  )
                })}
                {!products.length && <p className="muted">還沒有可販賣的商品，請到「管理」新增並設定價格。</p>}
              </div>
            </>
          )}
        </div>

        {/* 購物車 */}
        <div className={'cart-pane' + (cartOpen ? ' open' : '')}>
          <button className="cart-toggle" onClick={() => setCartOpen(!cartOpen)}>
            <span>{cart.name}　{t.count} 件</span><b className="num">{fmt(t.total)}</b><span className="chev">{cartOpen ? '收起' : '展開'}</span>
          </button>
          <div className="cart-tabs">
            {cs.carts.map((c, i) => {
              const n = c.lines.reduce((a, l) => a + l.qty, 0)
              return (
                <button key={c.id} className={i === cs.active ? 'on' : ''} onClick={() => cs.setActive(i)}>
                  {c.name}{n ? `（${n}）` : ''}
                </button>
              )
            })}
            <button className="add" onClick={() => cs.add()} aria-label="新增客人"><Icon name="plus" size={18} /></button>
          </div>
          <div className="cart-slider" ref={slider} onScroll={onSlide} onPointerDown={onPointerDown} onTouchStart={markUser} onWheel={markUser}>
            {cs.carts.map((c, ci) => (
              <div key={c.id} className="cart-slide">
                <div className={'cart-card' + (ci === cs.active ? ' active' : '')}>
                  <div className="cart-card-head">
                    <b>{c.name}</b>
                    <span>{c.lines.reduce((a, l) => a + l.qty, 0)} 件</span>
                  </div>
                  {c.refOrderId && <div className="hint">退換貨：退回品項已帶入，可再加入換出的品項。</div>}
                  {c.lines.map((l) => (
                    <div key={l.key} className={'cart-line' + (l.ret ? ' ret' : '') + (l.pre ? ' pre' : '')}>
                      {flash && ci === cs.active && flash.skuId === l.skuId && flash.pre === !!l.pre && !l.ret && <span className="flash-bg" key={flash.n} />}
                      <div className="cl-name">
                        {l.ret && <span className="badge red">退回</span>}
                        {l.pre && <span className="badge blue">預定</span>}
                        {l.name}
                        {l.ret && (
                          <label className="check small">
                            <input type="checkbox" checked={l.restock} onChange={(e) => updateLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, restock: e.target.checked } : x)), c.id)} />
                            回庫存（取消 = 瑕疵）
                          </label>
                        )}
                      </div>
                      <div className="cl-qty">
                        <button onClick={() => inc(c, l, -1)} aria-label="減少"><Icon name="minus" size={18} /></button>
                        <button className="qty-num" onClick={() => setQtyEdit({ c, l })}>{l.qty}</button>
                        <button onClick={() => inc(c, l, 1)} aria-label="增加"><Icon name="plus" size={18} /></button>
                      </div>
                      <button className={'cl-price' + (l.price !== l.listPrice && !l.ret ? ' changed' : '')} disabled={l.ret} onClick={() => setPriceEdit(l)}>
                        {l.ret ? '-' : ''}{fmt(l.price * l.qty)}
                        {l.price !== l.listPrice && !l.ret && <small>{l.reason || '特價'}</small>}
                      </button>
                      <button className="icon trash" onClick={() => removeLine(c, l)} aria-label="刪除"><Icon name="trash" size={20} /></button>
                    </div>
                  ))}
                  {!c.lines.length && <p className="empty-cart">點商品加入{c.name}的購物車</p>}
                </div>
              </div>
            ))}
          </div>
          {cs.carts.length > 1 && (
            <div className="dots" aria-hidden="true">
              {cs.carts.map((c, i) => <button key={c.id} className={i === cs.active ? 'on' : ''} onClick={() => cs.setActive(i)} />)}
            </div>
          )}
          <div className="cart-foot">
            <div className="row between"><span>小計</span><span>{fmt(t.subtotal)}</span></div>
            <div className="row between">
              <span className="row"><button className="link" onClick={() => setDiscountOpen(true)}>整單折扣{cart.discount?.value ? (cart.discount.type === 'percent' ? `（${cart.discount.value} 折）` : '') : '＋'}</button><Help>{HELP.discount}</Help></span>
              <span>{t.discountAmt ? '-' + fmt(t.discountAmt) : ''}</span>
            </div>
            {t.retTotal > 0 && <div className="row between"><span>退回</span><span>-{fmt(t.retTotal)}</span></div>}
            <div className="row between total"><span>合計</span><span className="num big-num total-pop" key={t.total}>{fmt(t.total)}</span></div>
            {!cart.refOrderId && (() => {
              const amt = Math.max(0, t.subtotal - t.discountAmt)
              const got = promoHits(amt, s.settings.promos || [])
              const nx = promoNext(amt, s.settings.promos || [])
              return (
                <>
                  {got.map((h) => <div key={h.id} className="promo-tag on"><Icon name="gift" size={16} />已達：{h.text}{h.count > 1 ? ` × ${h.count}` : ''}</div>)}
                  {nx && <div className="promo-tag"><Icon name="gift" size={16} />再買 {fmt(nx.gap)} 可得：{nx.text}</div>}
                </>
              )
            })()}
            <div className="row gap">
              <button onClick={() => { if (!cart.lines.length || confirm(`清除「${cart.name}」？`)) cs.remove(cart.id) }}>清除</button>
              <button className="primary big" disabled={!cart.lines.length} onClick={() => setCheckout(true)}>結帳</button>
            </div>
          </div>
        </div>
      </div>

      {picker && (
        <OptionPicker picker={picker} setPicker={setPicker} skus={activeSkus.filter((k) => k.productId === picker.product.id)} avail={avail}
          onPick={(k) => { setPicker(null); addSku(k) }} />
      )}
      {zero && (
        <Modal title="庫存為 0" onClose={() => setZero(null)}
          footer={<>
            <button onClick={() => setZero(null)}>取消</button>
            {s.settings.preorderEnabled && !cart.refOrderId && (
              <button className="primary" onClick={() => { addSku(zero, true); setZero(null) }}>改為預定&amp;宅配</button>
            )}
          </>}>
          <p className="big-text">「{skuLabel(zero, s.productById[zero.productId])}」庫存為 0</p>
          {!s.settings.preorderEnabled && <p className="muted">預定&amp;宅配功能已關閉（可在管理頁開啟）。</p>}
        </Modal>
      )}
      {voiceOpen && <VoiceModal rec0={voiceOpen.rec} cartName={cart.name} skus={activeSkus} avail={avail} onClose={() => setVoiceOpen(false)}
        onAdd={(items) => { addVoiceLines(items); setVoiceOpen(false) }} />}
      {qtyEdit && <QtyModal line={qtyEdit.l} max={maxQtyOf(qtyEdit.l)} onClose={() => setQtyEdit(null)}
        onSave={(n) => { setQty(qtyEdit.c, qtyEdit.l, n); setQtyEdit(null) }} />}
      {priceEdit && <PriceModal line={priceEdit} onClose={() => setPriceEdit(null)}
        onSave={(price, reason) => { const owner = cs.carts.find((c) => c.lines.some((l) => l.key === priceEdit.key)); if (owner) updateLines((ls) => ls.map((l) => (l.key === priceEdit.key ? { ...l, price, reason } : l)), owner.id); setPriceEdit(null) }} />}
      {discountOpen && <DiscountModal cart={cart} subtotal={t.subtotal} onClose={() => setDiscountOpen(false)}
        onSave={(d) => { cs.update(cart.id, (c) => ({ ...c, discount: d })); setDiscountOpen(false) }} />}
      {checkout && <Checkout cart={cart} onClose={() => setCheckout(false)} onDone={() => { setCheckout(false); setCartOpen(false); cs.remove(cart.id) }} />}
    </div>
  )
}

function SkuButton({ sku, label, avail, onClick, cat }) {
  const out = avail <= 0
  const low = !out && avail !== Infinity && avail <= 3
  return (
    <button className={'pbtn' + (out ? ' soldout' : '')} style={{ '--cat': catColor(cat) }} onClick={onClick}>
      <span className="pname">{label}</span>
      <span className="pprice num">
        {sku.promoPrice != null && sku.promoPrice !== '' && <s>{fmt(sku.price)}</s>}{fmt(effectivePrice(sku))}
      </span>
      <span className={'pstock' + (low ? ' low' : '')}>{avail === Infinity ? '現做' : out ? '售完' : `剩 ${avail}`}</span>
    </button>
  )
}

function OptionPicker({ picker, setPicker, skus, avail, onPick }) {
  const s = useShop()
  const p = picker.product
  const levels = (p.levels || []).map((id) => s.optionLists.find((l) => l.id === id))
  const depth = picker.chosen.length
  const match = skus.filter((k) => picker.chosen.every((v, i) => k.opts?.[i] === v))
  const isLast = depth === levels.length - 1
  const values = [...new Set(match.map((k) => k.opts?.[depth]))].filter((v) => v !== undefined)
  // 依清單原本順序排列
  const order = levels[depth]?.values || []
  values.sort((a, b) => order.indexOf(a) - order.indexOf(b))
  return (
    <Modal title={`${p.name}${picker.chosen.length ? '・' + picker.chosen.join('・') : ''}`} onClose={() => setPicker(null)} wide
      footer={depth > 0 && <button onClick={() => setPicker({ ...picker, chosen: picker.chosen.slice(0, -1) })}>‹ 上一步</button>}>
      <h4>選擇{levels[depth]?.name || '選項'}</h4>
      <div className="grid">
        {values.map((v) => {
          if (isLast) {
            const k = match.find((x) => x.opts?.[depth] === v)
            return <SkuButton key={v} sku={k} label={v} cat={p.category} avail={avail(k)} onClick={() => onPick(k)} />
          }
          const sub = match.filter((x) => x.opts?.[depth] === v)
          const left = sub.reduce((a, k) => a + Math.max(0, avail(k) === Infinity ? 0 : avail(k)), 0)
          return (
            <button key={v} className="pbtn" style={{ '--cat': catColor(p.category) }} onClick={() => setPicker({ ...picker, chosen: [...picker.chosen, v] })}>
              <span className="pname">{v}</span><span className="pstock">{sub.length} 種{left ? `，共剩 ${left}` : ''}</span>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

// ---------------- 語音點單 ----------------
// 一鍵收音：瀏覽器支援語音辨識時，按下按鈕就直接開始聽；不支援時改用鍵盤上的麥克風
// 必須在按鈕的點擊當下呼叫 start()，iPhone／iPad 才會允許使用麥克風
function startRecognizer() {
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
  if (!SR) return null
  try {
    const rec = new SR()
    rec.lang = 'zh-TW'
    rec.interimResults = true
    rec.continuous = true
    rec.maxAlternatives = 1
    rec.start()
    return rec
  } catch { return null }
}

const SR_ERR = {
  'not-allowed': '麥克風權限被拒絕：到「設定 → Safari → 麥克風」改成允許，或改用鍵盤上的麥克風。',
  'service-not-allowed': '這個環境不能直接收音，請改用鍵盤上的麥克風。',
  'no-speech': '沒有聽到聲音，請按「再說一次」。',
  'audio-capture': '找不到麥克風。',
  network: '語音辨識需要網路，請改用鍵盤上的麥克風。'
}

function VoiceModal({ rec0, cartName, skus, avail, onClose, onAdd }) {
  const s = useShop()
  const [text, setText] = useState('')
  const [rec, setRec] = useState(rec0)
  const [listening, setListening] = useState(!!rec0)
  const [srErr, setSrErr] = useState(rec0 === null && (window.SpeechRecognition || window.webkitSpeechRecognition) ? 'service-not-allowed' : '')
  const base = useRef('')
  const textRef = useRef('')
  textRef.current = text
  useEffect(() => {
    if (!rec) return
    base.current = textRef.current ? textRef.current + '，' : ''
    rec.onresult = (e) => {
      const said = Array.from(e.results).map((r) => r[0].transcript).join('')
      setText(base.current + said)
    }
    rec.onerror = (e) => { setSrErr(e.error || 'error'); setListening(false) }
    rec.onend = () => setListening(false)
    setListening(true)
    return () => { try { rec.abort() } catch { /* 忽略 */ } }
  }, [rec])
  const again = () => { setSrErr(''); const r = startRecognizer(); if (r) setRec(r); else setSrErr('service-not-allowed') }
  const stop = () => { try { rec?.stop() } catch { /* 忽略 */ } }
  const canListen = !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  const [rows, setRows] = useState([])
  const vSkus = useMemo(() => skus.map((k) => ({ ...k, productName: s.productById[k.productId]?.name || '' })), [skus, s.productById])
  useEffect(() => {
    const id = setTimeout(() => setRows(parseOrder(text, vSkus, s.settings.aliases || {}).map((r, i) => ({ ...r, id: i }))), 250)
    return () => clearTimeout(id)
  }, [text, vSkus, s.settings.aliases])
  const set = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const ready = rows.filter((r) => r.sku && r.status !== 'none' && r.qty > 0)
  const label = (k) => skuLabel(k, s.productById[k.productId])
  return (
    <Modal title="語音點單" wide onClose={onClose}
      footer={<>
        <button onClick={onClose}>取消</button>
        <button className="primary" disabled={!ready.length || rows.some((r) => r.status === 'pick' && !r.sku)}
          onClick={() => onAdd(ready.map((r) => ({ sku: r.sku, qty: r.qty })))}>加入{cartName}（{ready.reduce((a, r) => a + r.qty, 0)} 件）</button>
      </>}>
      {canListen && (
        <div className={'listen-bar' + (listening ? ' on' : '')}>
          <span className="listen-dot" />
          <span className="listen-text">{listening ? '正在聽，請說出品項與數量…' : srErr ? (SR_ERR[srErr] || '收音中斷，請按「再說一次」。') : '已停止收音'}</span>
          {listening ? <button onClick={stop}>說完了</button> : <button className="primary" onClick={again}><Icon name="mic" size={18} />再說一次</button>}
        </div>
      )}
      <textarea className="voice-input" autoFocus={!rec0} rows={2} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={canListen ? '聽到的內容會出現在這裡，也可以直接修改或打字' : '按鍵盤上的麥克風說出品項，例如：SL-34 日曬半磅兩包、蜂蜜一瓶'} />
      {!canListen && <p className="muted small">沒看到麥克風？iPad／iPhone「設定 → 一般 → 鍵盤」打開「啟用聽寫」。也可以直接打字。</p>}
      <div className="voice-rows">
        {rows.map((r) => (
          <div key={r.id} className={'voice-row ' + (r.status === 'none' ? 'none' : r.sku ? 'ok' : 'pick')}>
            <div className="vr-said">「{r.text}」</div>
            {r.status === 'none' ? <div className="muted">聽不懂這段，可以略過或改字</div> : (
              <>
                {r.sku
                  ? <div className="vr-sku">{label(r.sku)}{avail(r.sku) !== Infinity && (r.qty > Math.max(0, avail(r.sku))
                        ? <span className="short small">　庫存只有 {Math.max(0, avail(r.sku))}，{s.settings.preorderEnabled ? `${r.qty - Math.max(0, avail(r.sku))} 件會改為預定` : '只會加入現有庫存'}</span>
                        : <span className="muted small">　庫存 {Math.max(0, avail(r.sku))}</span>)}
                      {r.candidates.length > 0 && <button className="link small" onClick={() => set(r.id, { sku: null })}>換一個</button>}</div>
                  : (
                    <div className="chips">
                      <span className="chip-label">要哪一個？</span>
                      {r.candidates.map((k) => <button key={k.id} className="chip" onClick={() => set(r.id, { sku: k })}>{label(k)}</button>)}
                    </div>
                  )}
                <div className="cl-qty">
                  <button onClick={() => set(r.id, { qty: Math.max(0, r.qty - 1) })} aria-label="減少"><Icon name="minus" size={18} /></button>
                  <span className="qty-num">{r.qty}</span>
                  <button onClick={() => set(r.id, { qty: r.qty + 1 })} aria-label="增加"><Icon name="plus" size={18} /></button>
                </div>
              </>
            )}
          </div>
        ))}
        {!rows.length && <p className="empty-cart">說完會在這裡列出聽到的品項，確認後再加入購物車。</p>}
      </div>
    </Modal>
  )
}

function QtyModal({ line, max, onClose, onSave }) {
  const [v, setV] = useState(String(line.qty))
  return (
    <Modal title={`數量：${line.name}`} onClose={onClose}
      footer={<><button onClick={onClose}>取消</button><button className="primary" onClick={() => onSave(v)}>確定</button></>}>
      <label>{line.ret ? `退回數量（最多 ${max}）` : max === Infinity ? '數量' : `數量（目前最多 ${max}）`}
        <input className="num big" inputMode="numeric" autoFocus value={v}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && onSave(v)} />
      </label>
      <div className="chips">
        {[1, 2, 3, 5, 10, 20].map((n) => <button key={n} className="chip" onClick={() => setV(String(n))}>{n}</button>)}
      </div>
      <p className="muted">輸入 0 會刪除這一項。</p>
    </Modal>
  )
}

function PriceModal({ line, onClose, onSave }) {
  const [v, setV] = useState(String(line.price))
  const [reason, setReason] = useState(line.reason || '')
  return (
    <Modal title={`改價：${line.name}`} onClose={onClose}
      footer={<>
        <button onClick={() => onSave(line.listPrice, '')}>恢復定價 {fmt(line.listPrice)}</button>
        <button className="primary" onClick={() => onSave(Math.max(0, Number(v) || 0), reason)}>確定</button>
      </>}>
      <label>單價（定價 {fmt(line.listPrice)}）
        <input className="num big" inputMode="numeric" autoFocus value={v} onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ''))} />
      </label>
      <div className="chips">
        {['熟客', '最後一包', '特價', '員工'].map((r) => <button key={r} className={'chip' + (reason === r ? ' on' : '')} onClick={() => setReason(reason === r ? '' : r)}>{r}</button>)}
      </div>
      <label>原因（選填）<input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
    </Modal>
  )
}

function DiscountModal({ cart, subtotal, onClose, onSave }) {
  const [type, setType] = useState(cart.discount?.type || 'amount')
  const [v, setV] = useState(cart.discount?.value ? String(cart.discount.value) : '')
  return (
    <Modal title="整單折扣" onClose={onClose}
      footer={<><button onClick={() => onSave(null)}>不折扣</button><button className="primary" onClick={() => onSave(v ? { type, value: Number(v) } : null)}>確定</button></>}>
      <div className="seg">
        <button className={type === 'amount' ? 'on' : ''} onClick={() => setType('amount')}>折抵金額</button>
        <button className={type === 'percent' ? 'on' : ''} onClick={() => setType('percent')}>打折</button>
      </div>
      <label>{type === 'amount' ? '折抵金額' : '折數（例：9 = 九折、8.5 = 85 折）'}
        <input className="num big" inputMode="decimal" autoFocus value={v} onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ''))} />
      </label>
      <p className="muted">小計 {fmt(subtotal)}</p>
    </Modal>
  )
}

// ---------------- 結帳 ----------------
function Checkout({ cart, onClose, onDone }) {
  const s = useShop()
  const ui = useUi()
  const st = s.settings
  const isRet = cart.lines.some((l) => l.ret)
  const hasOut = cart.lines.some((l) => !l.ret)
  const hasPre = cart.lines.some((l) => l.pre)
  const types = isRet ? [] : ['sale', ...(!hasPre && st.giftEnabled ? ['gift'] : []), ...(!hasPre && st.brewEnabled ? ['brew'] : [])]
  const [type, setType] = useState('sale')
  const [giftTo, setGiftTo] = useState(GIFT_TO[0])
  const [note, setNote] = useState('')
  const payTypes = Object.entries(st.prePayTypes || {}).filter(([, on]) => on).map(([k]) => k)
  const [payType, setPayType] = useState(payTypes[0] || 'full')
  const [deposit, setDeposit] = useState('')
  const [ship, setShip] = useState({ name: '', phone: '', address: '', note: '' })
  const subtotalRaw = cartTotals(cart, {}).subtotal
  const autoFree = st.freeShipThreshold > 0 && subtotalRaw >= st.freeShipThreshold
  const [fee, setFee] = useState(autoFree ? '0' : '')
  const [method, setMethod] = useState('cash')
  const [received, setReceived] = useState('')

  const t = cartTotals(cart, { shippingFee: fee, payType, deposit })
  const isMoney = type === 'sale'
  const due = isMoney ? t.dueNow : 0
  const rec = Number(received) || 0
  const change = method === 'cash' && due > 0 ? rec - due : 0
  const denoms = denomsFor(st)

  const errs = []
  if (hasPre && type === 'sale') {
    if (!ship.name.trim() || !ship.phone.trim() || !ship.address.trim()) errs.push('請填寫收件人、電話、地址')
    if (payType === 'deposit' && !(Number(deposit) > 0)) errs.push('請輸入訂金')
  }
  if (isMoney && due > 0 && method === 'cash' && received !== '' && rec < due) errs.push('收款不足')

  // 滿額活動：只算銷售單的商品金額（扣折扣、不含運費）
  const promoAmt = Math.max(0, t.subtotal - t.discountAmt)
  const hits = type === 'sale' && !isRet ? promoHits(promoAmt, st.promos || []) : []

  const confirmOrder = () => {
    if (errs.length) return
    const now = Date.now()
    const orderType = isRet ? (hasOut ? 'exchange' : 'return') : type
    const items = cart.lines.filter((l) => !l.ret).map((l) => ({
      skuId: l.skuId, name: l.name, category: l.category || '', qty: l.qty, listPrice: l.listPrice, price: l.price,
      ...(l.pre ? { pre: true } : {}), ...(l.reason ? { reason: l.reason } : {}), ...(l.components ? { components: l.components } : {})
    }))
    const rets = cart.lines.filter((l) => l.ret).map((l) => ({ skuId: l.skuId, name: l.name, qty: l.qty, price: l.price, restock: !!l.restock, ...(l.components ? { components: l.components } : {}) }))
    const money = !isMoney && !isRet ? null : due === 0 ? { method: null, amount: 0 } : {
      method, amount: due,
      ...(method === 'cash' && due > 0 ? { received: received === '' ? due : rec, change: received === '' ? 0 : change } : {})
    }
    const order = {
      type: orderType, ts: now, day: dayOf(now), device: deviceId, status: 'normal',
      items, rets, subtotal: t.subtotal, discountAmt: t.discountAmt, shippingFee: t.ship, total: t.total,
      money, refOrderId: cart.refOrderId || null, note: note || ''
    }
    if (orderType === 'gift') order.gift = { to: giftTo, note }
    if (hits.length) order.promos = hits.map(({ id, text, count }) => ({ id, text, count }))
    if (t.hasPre && orderType === 'sale') {
      order.pre = { payType, preTotal: t.preShare, paidNow: t.preShare - t.due, due: t.due, shipped: false }
    }
    const id = s.newId(`${s.eventPath}/orders`)
    const b = writeBatch(db)
    b.set(doc(db, s.eventPath, 'orders', id), order)
    if (order.pre) b.set(doc(db, s.eventPath, 'shipping', id), { ...ship, orderId: id, ts: now })
    commit(b)

    // 低庫存通知
    const before = { ...s.stock }
    const after = { ...before }
    for (const m of orderMoves(order)) after[m.skuId] = (after[m.skuId] || 0) + m.delta
    const touched = Object.fromEntries(Object.keys(after).filter((k) => after[k] !== before[k]).map((k) => [k, after[k]]))
    for (const x of lowStockCrossings(before, touched, st)) {
      const sku = s.skuById[x.skuId]
      const unit = s.productById[sku?.productId]?.unit || '包'
      ui.notice(x.left <= 0 ? `${s.labelOf(x.skuId)} 已售完` : `${s.labelOf(x.skuId)} 剩下最後 ${x.left} ${unit}`)
    }
    const msg = !money ? `已記錄${orderType === 'gift' ? '贈與' : '沖泡耗用'}`
      : due < 0 ? `已完成，退款 ${fmt(-due)}` : `已完成 ${fmt(due)}${change > 0 ? `，找零 ${fmt(change)}` : ''}`
    ui.toast(msg, { kind: 'ok' })
    for (const h of hits) ui.notice(`${cart.name} 達到滿額活動：${h.text}${h.count > 1 ? ` × ${h.count}` : ''}，記得發給客人`)
    onDone()
  }


  return (
    <Modal title={isRet ? (hasOut ? '換貨結帳' : '退貨') : '結帳'} onClose={onClose} wide
      footer={<>
        <button onClick={onClose}>返回</button>
        <button className="primary big" disabled={errs.length > 0} onClick={confirmOrder}>確認完成</button>
      </>}>
      {types.length > 1 && <div className="row between"><span className="muted small">單據類型</span><Help>{HELP.checkoutType}</Help></div>}
      {types.length > 1 && (
        <div className="seg">
          {types.map((x) => <button key={x} className={type === x ? 'on' : ''} onClick={() => setType(x)}>{{ sale: '銷售', gift: '贈與', brew: '沖泡耗用' }[x]}</button>)}
        </div>
      )}

      <div className="summary-lines">
        {cart.lines.map((l) => (
          <div key={l.key} className="row between">
            <span>{l.ret ? '【退回】' : l.pre ? '【預定】' : ''}{l.name} × {l.qty}</span>
            <span>{type === 'sale' ? (l.ret ? '-' : '') + fmt(l.price * l.qty) : fmt(l.listPrice * l.qty)}</span>
          </div>
        ))}
      </div>

      {type === 'gift' && (
        <div className="box">
          <div className="seg">{GIFT_TO.map((g) => <button key={g} className={giftTo === g ? 'on' : ''} onClick={() => setGiftTo(g)}>{g}</button>)}</div>
          <label>備註<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：王經理" /></label>
        </div>
      )}
      {type === 'brew' && <p className="muted">現場沖泡耗用：扣庫存，不計營業額。</p>}

      {type === 'sale' && hasPre && (
        <div className="box">
          <h4>預定&amp;宅配<Help>{HELP.preorderEnabled}</Help></h4>
          <div className="grid2">
            <label>收件人<input value={ship.name} onChange={(e) => setShip({ ...ship, name: e.target.value })} /></label>
            <label>電話<input inputMode="tel" value={ship.phone} onChange={(e) => setShip({ ...ship, phone: e.target.value })} /></label>
          </div>
          <label>地址<input value={ship.address} onChange={(e) => setShip({ ...ship, address: e.target.value })} /></label>
          <label>備註<input value={ship.note} onChange={(e) => setShip({ ...ship, note: e.target.value })} /></label>
          <label>運費{autoFree && <span className="badge">已達滿額免運</span>}
            <input className="num" inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value.replace(/[^\d]/g, ''))} placeholder="0" />
          </label>
          {payTypes.length > 1 && (
            <div className="seg">{payTypes.map((p) => <button key={p} className={payType === p ? 'on' : ''} onClick={() => setPayType(p)}>{PAY_TYPE_LABEL[p]}</button>)}</div>
          )}
          {payTypes.length === 1 && <p>付款方式：{PAY_TYPE_LABEL[payType]}</p>}
          {payType === 'deposit' && (
            <label>訂金<input className="num" inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value.replace(/[^\d]/g, ''))} /></label>
          )}
          <p className="muted">預定金額（含運）{fmt(t.preShare)}{t.due > 0 ? `，待收 ${fmt(t.due)}` : ''}</p>
        </div>
      )}

      {type === 'sale' && (
        <>
          {t.discountAmt > 0 && <div className="row between"><span>整單折扣</span><span>-{fmt(t.discountAmt)}</span></div>}
          {hits.map((h) => (
            <div key={h.id} className="promo-hit">
              <Icon name="gift" size={26} />
              <div><b>達到滿額活動（滿 {fmt(h.threshold)}）</b><div>{h.text}{h.count > 1 ? ` × ${h.count}` : ''}，記得發給客人</div></div>
            </div>
          ))}
          <div className="row between total"><span>{due < 0 ? '應退客人' : '本次應收'}</span><span>{fmt(Math.abs(due))}</span></div>
          {due !== 0 && (
            <div className="seg">
              <button className={method === 'cash' ? 'on' : ''} onClick={() => setMethod('cash')}><Icon name="cash" size={20} />現金</button>
              <button className={method === 'linepay' ? 'on' : ''} onClick={() => setMethod('linepay')}><Icon name="phonepay" size={20} />LINE Pay</button>
            </div>
          )}
          {method === 'linepay' && due < 0 && <p className="warn">請到 LINE Pay 商家後台操作退款。</p>}
          {method === 'cash' && due > 0 && (
            <div className="cash-pad">
              <div className="pad-left">
                <div className="pad-display">
                  <span>收款</span>
                  <b className="num">{received === '' ? <span className="ph">{fmt(due)}</span> : fmt(rec)}</b>
                </div>
                <div className={'pad-change' + (received !== '' && rec < due ? ' short' : '')}>
                  <span>{received !== '' && rec < due ? '還差' : '找零'}</span>
                  <b className="num">{received === '' ? fmt(0) : fmt(Math.abs(rec - due))}</b>
                </div>
                {received !== '' && change > 0 && (
                  <div className="muted small">建議找法：{changeBreakdown(change, denoms).parts.map(([d, n]) => `${d}×${n}`).join('　')}</div>
                )}
                <div className="bills">
                  <button onClick={() => setReceived(String(due))}>剛好</button>
                  {[100, 500, 1000].map((x) => (
                    <button key={x} onClick={() => setReceived(String((received === '' ? 0 : rec) + x))}>＋{x}</button>
                  ))}
                </div>
              </div>
              <div className="keypad">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫'].map((k) => (
                  <button key={k} className={k === '⌫' ? 'back' : ''}
                    onClick={() => setReceived((r) => (k === '⌫' ? r.slice(0, -1) : (r + k).replace(/^0+(?=\d)/, '').slice(0, 7)))}>{k}</button>
                ))}
                <button className="clear" onClick={() => setReceived('')}>清除</button>
              </div>
            </div>
          )}
        </>
      )}
      {errs.map((e) => <p key={e} className="warn">{e}</p>)}
    </Modal>
  )
}
