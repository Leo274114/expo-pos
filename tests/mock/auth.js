let user = null
const subs = new Set()
export const getAuth = () => ({})
export class GoogleAuthProvider { setCustomParameters() {} }
export const onAuthStateChanged = (_a, cb) => { subs.add(cb); setTimeout(() => cb(user), 0); return () => subs.delete(cb) }
export const signInWithPopup = async () => { user = { uid: 'leo', email: 'leo@test' }; subs.forEach((c) => c(user)); return { user } }
export const signInWithRedirect = signInWithPopup
export const getRedirectResult = async () => null
export const signOut = async () => { user = null; subs.forEach((c) => c(null)) }
