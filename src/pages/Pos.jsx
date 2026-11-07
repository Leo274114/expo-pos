import { useMemo, useRef, useState } from 'react'
import { doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useShop, useUi, useCarts, commit, deviceId } from '../store.jsx'
import {
  fmt, skuLabel, effectivePrice, cartTotals, changeBreakdown, denomsFor, dayOf, orderMoves,
  lowStockCrossings, PAY_TYPE_LABEL, GIFT_TO
} from '../lib/calc.js'
import Modal from '../components/Modal.jsx'
import { sortCats } from '../lib/template.js'

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
  const [discountOpen, setDiscountOpen] = useState(false)
  const [checkout, setCheckout] = useState(false)
  const [cartOpen, setCartOpen] = useState(false) // 手機版購物車展開

  const activeSkus = useMemo(
    () => s.skus.filter((k) => k.active !== false && s.productById[k.productId] && s.productById[k.productId].active !== false),
    [s.skus, s.productById]
  )
  const products = s.products.filter((p) => p.active !== false && activeSkus.some((k) => k.productId === p.id))
  const cats = sortCats([...new Set(products.map((p) => p.category || '未分類'))])
  const curCat = cats.includes(cat) ? cat : cats[0]

  // 所有暫存單中已佔用的數量（現貨）
  const reserved = (skuId) =>
    cs.carts.reduce((n, c) => n + c.lines.filter((l) => l.skuId === skuId && !l.pre && !l.ret).reduce((a, l) => a + l.qty, 0), 0)
  const tracks = (sku) => s.productById[sku.productId]?.trackStock !== false
  const avail = (sku) => (tracks(sku) ? (s.stock[sku.id] ?? 0) - reserved(sku.id) : Infinity)

  const updateLines = (fn) => cs.update(cart.id, (c) => ({ ...c, lines: fn(c.lines) }))

  const addSku = (sku, pre = false) => {
    if (!pre && tracks(sku) && avail(sku) <= 0) { setZero(sku); return }
    const product = s.productById[sku.productId]
    const price = effectivePrice(sku)
    updateLines((lines) => {
      const i = lines.findIndex((l) => l.skuId === sku.id && !l.ret && !!l.pre === pre && l.price === price && !l.reason)
      if (i >= 0) return lines.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l))
      return [...lines, {
        key: lineKey(), skuId: sku.id, name: skuLabel(sku, product), category: product?.category || '', unit: product?.unit || '',
        qty: 1, price, listPrice: Number(sku.price) || 0, pre
      }]
    })
  }

  const inc = (line, d) => {
    if (d > 0) {
      if (line.ret) { if (line.qty >= line.maxQty) return }
      else if (!line.pre) {
        const sku = s.skuById[line.skuId]
        if (sku && tracks(sku) && avail(sku) <= 0) { setZero(sku); return }
      }
    }
    updateLines((lines) => lines.map((l) => (l.key === line.key ? { ...l, qty: Math.max(1, l.qty + d) } : l)))
  }

  const removeLine = (line) => {
    const idx = cart.lines.findIndex((l) => l.key === line.key)
    const cartId = cart.id
    updateLines((lines) => lines.filter((l) => l.key !== line.key))
    ui.toast(`已刪除 ${line.name}`, {
      ms: 5000,
      action: { label: '復原', onClick: () => cs.update(cartId, (c) => { const ls = [...c.lines]; ls.splice(Math.min(idx, ls.length), 0, line); return { ...c, lines: ls } }) }
    })
  }

  const t = cartTotals(cart, {})

  // 左右滑動切換客人
  const touch = useRef(null)
  const onTouchStart = (e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }
  const onTouchEnd = (e) => {
    if (!touch.current) return
    const dx = e.changedTouches[0].clientX - touch.current.x
    const dy = e.changedTouches[0].clientY - touch.current.y
    touch.current = null
    if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx)) return
    if (dx < 0 && cs.active < cs.carts.length - 1) cs.setActive(cs.active + 1)
    if (dx > 0 && cs.active > 0) cs.setActive(cs.active - 1)
  }

  if (!s.eventId) return <div className="page"><div className="warn">請先到「管理」建立展覽場次。</div></div>

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
          <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 搜尋品項（例：SL-34 日曬）" />
          {searchHits ? (
            <div className="grid">
              {searchHits.map(({ k, label }) => (
                <SkuButton key={k.id} sku={k} label={label} avail={avail(k)} onClick={() => { addSku(k); }} />
              ))}
              {!searchHits.length && <p className="muted">找不到</p>}
            </div>
          ) : (
            <>
              <div className="tabs scroll">
                {cats.map((c) => <button key={c} className={c === curCat ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>)}
              </div>
              <div className="grid">
                {products.filter((p) => (p.category || '未分類') === curCat).map((p) => {
                  const ks = activeSkus.filter((k) => k.productId === p.id)
                  const single = !(p.levels || []).length && ks.length === 1
                  if (single) return <SkuButton key={p.id} sku={ks[0]} label={p.name} avail={avail(ks[0])} onClick={() => addSku(ks[0])} />
                  const minP = Math.min(...ks.map(effectivePrice)), maxP = Math.max(...ks.map(effectivePrice))
                  return (
                    <button key={p.id} className="pbtn" onClick={() => setPicker({ product: p, chosen: [] })}>
                      <span className="pname">{p.name}</span>
                      <span className="pprice">{minP === maxP ? fmt(minP) : `${fmt(minP)}～${fmt(maxP)}`}</span>
                      <span className="pstock muted">{ks.length} 種 ›</span>
                    </button>
                  )
                })}
                {!products.length && <p className="muted">還沒有可販賣的商品，請到「管理」新增並設定價格。</p>}
              </div>
            </>
          )}
        </div>

        {/* 購物車 */}
        <div className={'cart-pane' + (cartOpen ? ' open' : '')} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <button className="cart-toggle" onClick={() => setCartOpen(!cartOpen)}>
            🛒 {cart.name}・{t.count} 件・<b>{fmt(t.total)}</b> {cartOpen ? '▼' : '▲'}
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
            <button className="add" onClick={() => cs.add()}>＋</button>
          </div>
          <div className="cart-lines">
            {cart.refOrderId && <div className="hint">退換貨：退回品項已帶入，可再加入換出的品項。</div>}
            {cart.lines.map((l) => (
              <div key={l.key} className={'cart-line' + (l.ret ? ' ret' : '') + (l.pre ? ' pre' : '')}>
                <div className="cl-name">
                  {l.ret && <span className="badge red">退回</span>}
                  {l.pre && <span className="badge blue">預定</span>}
                  {l.name}
                  {l.ret && (
                    <label className="check small">
                      <input type="checkbox" checked={l.restock} onChange={(e) => updateLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, restock: e.target.checked } : x)))} />
                      回庫存（取消 = 瑕疵）
                    </label>
                  )}
                </div>
                <div className="cl-qty">
                  <button onClick={() => inc(l, -1)}>−</button>
                  <span>{l.qty}</span>
                  <button onClick={() => inc(l, 1)}>＋</button>
                </div>
                <button className={'cl-price' + (l.price !== l.listPrice && !l.ret ? ' changed' : '')} disabled={l.ret} onClick={() => setPriceEdit(l)}>
                  {l.ret ? '-' : ''}{fmt(l.price * l.qty)}
                  {l.price !== l.listPrice && !l.ret && <small>{l.reason || '特價'}</small>}
                </button>
                <button className="icon trash" onClick={() => removeLine(l)} aria-label="刪除">🗑️</button>
              </div>
            ))}
            {!cart.lines.length && <p className="muted center">點左邊商品加入</p>}
          </div>
          <div className="cart-foot">
            <div className="row between"><span>小計</span><span>{fmt(t.subtotal)}</span></div>
            <div className="row between">
              <button className="link" onClick={() => setDiscountOpen(true)}>整單折扣{cart.discount?.value ? (cart.discount.type === 'percent' ? `（${cart.discount.value} 折）` : '') : '＋'}</button>
              <span>{t.discountAmt ? '-' + fmt(t.discountAmt) : ''}</span>
            </div>
            {t.retTotal > 0 && <div className="row between"><span>退回</span><span>-{fmt(t.retTotal)}</span></div>}
            <div className="row between total"><span>合計</span><span>{fmt(t.total)}</span></div>
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
      {priceEdit && <PriceModal line={priceEdit} onClose={() => setPriceEdit(null)}
        onSave={(price, reason) => { updateLines((ls) => ls.map((l) => (l.key === priceEdit.key ? { ...l, price, reason } : l))); setPriceEdit(null) }} />}
      {discountOpen && <DiscountModal cart={cart} subtotal={t.subtotal} onClose={() => setDiscountOpen(false)}
        onSave={(d) => { cs.update(cart.id, (c) => ({ ...c, discount: d })); setDiscountOpen(false) }} />}
      {checkout && <Checkout cart={cart} onClose={() => setCheckout(false)} onDone={() => { setCheckout(false); setCartOpen(false); cs.remove(cart.id) }} />}
    </div>
  )
}

function SkuButton({ sku, label, avail, onClick }) {
  const out = avail <= 0
  return (
    <button className={'pbtn' + (out ? ' soldout' : '')} onClick={onClick}>
      <span className="pname">{label}</span>
      <span className="pprice">
        {sku.promoPrice != null && sku.promoPrice !== '' && <s className="muted">{fmt(sku.price)}</s>} {fmt(effectivePrice(sku))}
      </span>
      <span className="pstock">{avail === Infinity ? '' : out ? '售完' : `剩 ${avail}`}</span>
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
            return <SkuButton key={v} sku={k} label={v} avail={avail(k)} onClick={() => onPick(k)} />
          }
          const sub = match.filter((x) => x.opts?.[depth] === v)
          const left = sub.reduce((a, k) => a + Math.max(0, avail(k) === Infinity ? 0 : avail(k)), 0)
          return (
            <button key={v} className="pbtn" onClick={() => setPicker({ ...picker, chosen: [...picker.chosen, v] })}>
              <span className="pname">{v}</span><span className="pstock muted">{sub.length} 種{left ? `・共剩 ${left}` : ''} ›</span>
            </button>
          )
        })}
      </div>
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

  const confirmOrder = () => {
    if (errs.length) return
    const now = Date.now()
    const orderType = isRet ? (hasOut ? 'exchange' : 'return') : type
    const items = cart.lines.filter((l) => !l.ret).map((l) => ({
      skuId: l.skuId, name: l.name, category: l.category || '', qty: l.qty, listPrice: l.listPrice, price: l.price,
      ...(l.pre ? { pre: true } : {}), ...(l.reason ? { reason: l.reason } : {})
    }))
    const rets = cart.lines.filter((l) => l.ret).map((l) => ({ skuId: l.skuId, name: l.name, qty: l.qty, price: l.price, restock: !!l.restock }))
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
    onDone()
  }

  const quick = [...new Set([due, 100, 500, 1000, 2000].filter((x) => x >= due))].slice(0, 5)

  return (
    <Modal title={isRet ? (hasOut ? '換貨結帳' : '退貨') : '結帳'} onClose={onClose} wide
      footer={<>
        <button onClick={onClose}>返回</button>
        <button className="primary big" disabled={errs.length > 0} onClick={confirmOrder}>確認完成</button>
      </>}>
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
          <h4>預定&amp;宅配</h4>
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
          <div className="row between total"><span>{due < 0 ? '應退客人' : '本次應收'}</span><span>{fmt(Math.abs(due))}</span></div>
          {due !== 0 && (
            <div className="seg">
              <button className={method === 'cash' ? 'on' : ''} onClick={() => setMethod('cash')}>💵 現金</button>
              <button className={method === 'linepay' ? 'on' : ''} onClick={() => setMethod('linepay')}>LINE Pay</button>
            </div>
          )}
          {method === 'linepay' && due < 0 && <p className="warn">請到 LINE Pay 商家後台操作退款。</p>}
          {method === 'cash' && due > 0 && (
            <div className="box">
              <label>收款金額
                <input className="num big" inputMode="numeric" value={received} onChange={(e) => setReceived(e.target.value.replace(/[^\d]/g, ''))} placeholder={String(due)} />
              </label>
              <div className="chips">
                {quick.map((x) => <button key={x} className="chip" onClick={() => setReceived(String(x))}>{x === due ? '剛好' : fmt(x)}</button>)}
              </div>
              {received !== '' && rec >= due && (
                <div className="change">
                  找零 <b>{fmt(change)}</b>
                  {change > 0 && <div className="muted">{changeBreakdown(change, denoms).parts.map(([d, n]) => `${d}×${n}`).join('　')}</div>}
                </div>
              )}
            </div>
          )}
        </>
      )}
      {errs.map((e) => <p key={e} className="warn">{e}</p>)}
    </Modal>
  )
}
