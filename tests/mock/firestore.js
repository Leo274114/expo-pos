// 簡易記憶體版 Firestore，只供 UI 測試
const data = new Map()
const colSubs = new Map()
const docSubs = new Map()
window.__fs = data
const j = (segs) => segs.flatMap((s) => String(s).split('/')).filter(Boolean).join('/')
let n = 0
const rid = () => 'id' + (++n).toString(36) + Math.random().toString(36).slice(2, 6)
export const initializeFirestore = () => ({})
export const persistentLocalCache = () => ({})
export const persistentMultipleTabManager = () => ({})
export function collection(_db, ...segs) { return { type: 'col', path: j(segs) } }
export function doc(a, ...segs) {
  if (a && a.type === 'col') return { type: 'doc', path: a.path + '/' + (segs[0] || rid()), get id() { return this.path.split('/').pop() } }
  const p = j(segs)
  return { type: 'doc', path: p, get id() { return p.split('/').pop() } }
}
const parent = (p) => p.split('/').slice(0, -1).join('/')
const docSnap = (p) => ({ id: p.split('/').pop(), exists: () => data.has(p), data: () => structuredClone(data.get(p)), ref: { type: 'doc', path: p } })
const colSnap = (cp) => {
  const docs = []
  for (const k of data.keys()) if (parent(k) === cp) docs.push(docSnap(k))
  return { docs }
}
function notify(p) {
  setTimeout(() => {
    ;(docSubs.get(p) || []).forEach((cb) => cb(docSnap(p)))
    const cp = parent(p)
    ;(colSubs.get(cp) || []).forEach((cb) => cb(colSnap(cp)))
  }, 0)
}
export function onSnapshot(ref, cb) {
  const m = ref.type === 'col' ? colSubs : docSubs
  if (!m.has(ref.path)) m.set(ref.path, new Set())
  m.get(ref.path).add(cb)
  setTimeout(() => cb(ref.type === 'col' ? colSnap(ref.path) : docSnap(ref.path)), 0)
  return () => m.get(ref.path).delete(cb)
}
const merge = (a, b) => {
  const o = { ...(a || {}) }
  for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) ? merge(o[k], v) : v
  return o
}
function apply(op) {
  if (op.kind === 'delete') data.delete(op.ref.path)
  else data.set(op.ref.path, structuredClone(op.opts?.merge ? merge(data.get(op.ref.path), op.val) : op.val))
  notify(op.ref.path)
}
export function writeBatch() {
  const ops = []
  const b = {
    set: (ref, val, opts) => { ops.push({ kind: 'set', ref, val, opts }); return b },
    delete: (ref) => { ops.push({ kind: 'delete', ref }); return b },
    commit: async () => { ops.forEach(apply) }
  }
  return b
}
export const setDoc = async (ref, val, opts) => apply({ kind: 'set', ref, val, opts })
export const getDocs = async (ref) => colSnap(ref.path)

export const getDoc = async (ref) => docSnap(ref.path)
