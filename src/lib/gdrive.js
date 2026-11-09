// 上傳到攤商自己的 Google 雲端硬碟
// - 只用 drive.file 權限：只能建立／更新本 App 自己建立的檔案，看不到其他雲端檔案
// - 雲端硬碟裡建一個「好攤」資料夾；每個展覽場次一個試算表「好攤_場次名稱」，再次上傳會更新同一個檔案
// - 純網頁 App 的 Google 授權約 1 小時過期；過期時需要使用者再按一次按鈕（會跳出 Google 視窗）
import { eventSheets, markDownloaded } from './excel.js'

export const GOOGLE_CLIENT_ID = '1049920258449-7jbitsla5qnl4qccvd2bpfjg76a3n944.apps.googleusercontent.com'
const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet'
const TOKEN_KEY = 'gdrive-token'

let gisPromise = null
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  gisPromise ||= new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.src = 'https://accounts.google.com/gsi/client'
    el.async = true
    el.onload = () => resolve()
    el.onerror = () => { gisPromise = null; reject(new Error('無法載入 Google 登入元件，請確認網路')) }
    document.head.appendChild(el)
  })
  return gisPromise
}

function savedToken() {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null')
    if (t && t.exp > Date.now() + 60000) return t.token
  } catch { /* 忽略 */ }
  return null
}

// 授權還有效（不用跳視窗）？收攤後自動上傳前先檢查
export const hasDriveToken = () => !!savedToken()

// 取得授權：已有有效授權就直接用；否則跳出 Google 視窗（必須在使用者按按鈕時呼叫）
export async function getDriveToken(hint) {
  const t = savedToken()
  if (t) return t
  await loadGis()
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      hint,
      callback: (res) => {
        if (res.error || !res.access_token) return reject(new Error(res.error === 'access_denied' ? '已取消授權' : (res.error_description || res.error || '授權失敗')))
        if (!window.google.accounts.oauth2.hasGrantedAllScopes(res, SCOPE)) return reject(new Error('請勾選允許「好攤」存取它建立的檔案'))
        try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token: res.access_token, exp: Date.now() + (Number(res.expires_in) || 3600) * 1000 })) } catch { /* 忽略 */ }
        resolve(res.access_token)
      },
      error_callback: (e) => reject(new Error(e?.type === 'popup_closed' ? '已關閉 Google 視窗' : e?.type === 'popup_failed_to_open' ? '瀏覽器擋住了 Google 視窗，請允許彈出視窗後再試' : '授權失敗'))
    })
    client.requestAccessToken({ prompt: '' })
  })
}

async function api(token, url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } })
  if (res.status === 401) { try { sessionStorage.removeItem(TOKEN_KEY) } catch { /* 忽略 */ } throw new Error('Google 授權已過期，請再按一次') }
  const body = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) {
    const e = new Error(body?.error?.message || `Google 回應錯誤（${res.status}）`)
    e.status = res.status
    throw e
  }
  return body
}

const DRIVE = 'https://www.googleapis.com/drive/v3/files'
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets'

// 檔案還在而且沒被丟到垃圾桶？
async function alive(token, id) {
  if (!id) return false
  try {
    const f = await api(token, `${DRIVE}/${id}?fields=id,trashed`)
    return f && !f.trashed
  } catch (e) {
    if (e.status === 404 || e.status === 403) return false
    throw e
  }
}

async function ensureFolder(token, s) {
  const known = s.shop?.driveFolderId
  if (await alive(token, known)) return known
  // drive.file 權限只看得到本 App 建立的資料夾
  const q = encodeURIComponent(`name='好攤' and mimeType='${FOLDER_MIME}' and trashed=false`)
  const found = await api(token, `${DRIVE}?q=${q}&fields=files(id)&spaces=drive`)
  const id = found?.files?.[0]?.id || (await api(token, DRIVE, { method: 'POST', body: JSON.stringify({ name: '好攤', mimeType: FOLDER_MIME }) })).id
  s.batch().set(s.ref(s.shopPath), { driveFolderId: id }, { merge: true }).commit().catch(() => {})
  return id
}

// 列資料（物件陣列）轉成試算表的二維陣列：第一列是欄名
function toGrid(rows) {
  if (!rows.length) return [['說明'], ['無資料']]
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  return [keys, ...rows.map((r) => keys.map((k) => r[k] ?? ''))]
}

const sheetTitle = (s) => `好攤_${s.event?.name || '未命名場次'}`.replace(/[\\/:*?"<>|]/g, '_')

// 上傳整個場次；回傳試算表網址
export async function uploadEventToDrive(s, { onStep } = {}) {
  if (!s.event) throw new Error('尚未選擇場次')
  const step = (m) => onStep && onStep(m)
  step('連線 Google…')
  const token = await getDriveToken(s.user?.email)
  step('準備「好攤」資料夾…')
  const folderId = await ensureFolder(token, s)

  let sheetId = s.event.driveSheetId
  if (!(await alive(token, sheetId))) {
    step('建立試算表…')
    sheetId = (await api(token, DRIVE, { method: 'POST', body: JSON.stringify({ name: sheetTitle(s), mimeType: SHEET_MIME, parents: [folderId] }) })).id
  } else {
    // 場次改名時，檔名跟著改
    await api(token, `${DRIVE}/${sheetId}`, { method: 'PATCH', body: JSON.stringify({ name: sheetTitle(s) }) }).catch(() => {})
  }

  const sheets = eventSheets(s)
  step('整理分頁…')
  // 先加一個暫存分頁、刪掉舊分頁（含舊圖表），再依序建立新分頁
  const meta = await api(token, `${SHEETS}/${sheetId}?fields=sheets.properties(sheetId,title)`)
  const old = (meta.sheets || []).map((x) => x.properties.sheetId)
  const TMP = 999999
  const reqs = [{ addSheet: { properties: { sheetId: TMP, title: '_更新中' } } }]
  for (const id of old) if (id !== TMP) reqs.push({ deleteSheet: { sheetId: id } })
  sheets.forEach(([title], i) => {
    reqs.push({ addSheet: { properties: { sheetId: i + 1, title, index: i, gridProperties: { frozenRowCount: 1 } } } })
  })
  reqs.push({ deleteSheet: { sheetId: TMP } })
  await api(token, `${SHEETS}/${sheetId}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: reqs }) })

  step('寫入資料…')
  const data = sheets.map(([title, rows]) => ({ range: `'${title}'!A1`, values: toGrid(rows) }))
  await api(token, `${SHEETS}/${sheetId}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }) })

  step('加上格式與尖峰曲線圖…')
  const fmt = []
  sheets.forEach(([, rows], i) => {
    const cols = Math.max(1, toGrid(rows)[0].length)
    fmt.push({ repeatCell: { range: { sheetId: i + 1, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.93, green: 0.95, blue: 0.93 } } }, fields: 'userEnteredFormat(textFormat,backgroundColor)' } })
    fmt.push({ autoResizeDimensions: { dimensions: { sheetId: i + 1, dimension: 'COLUMNS', startIndex: 0, endIndex: cols } } })
  })
  // 每小時營業額：每天一條線的曲線圖，放在表格右邊
  const hi = sheets.findIndex(([t]) => t === '每小時營業額')
  if (hi >= 0) {
    const grid = toGrid(sheets[hi][1])
    const nRows = grid.length, nCols = grid[0].length
    if (nCols > 1 && nRows > 1) {
      const sid = hi + 1
      const src = (c) => ({ sourceRange: { sources: [{ sheetId: sid, startRowIndex: 0, endRowIndex: nRows, startColumnIndex: c, endColumnIndex: c + 1 }] } })
      fmt.push({
        addChart: {
          chart: {
            spec: {
              title: '每小時營業額（尖峰時段）',
              basicChart: {
                chartType: 'LINE', legendPosition: 'BOTTOM_LEGEND', headerCount: 1, lineSmoothing: true,
                axis: [{ position: 'BOTTOM_AXIS', title: '時段' }, { position: 'LEFT_AXIS', title: '營業額' }],
                domains: [{ domain: src(0) }],
                series: Array.from({ length: nCols - 1 }, (_, k) => ({ series: src(k + 1), targetAxis: 'LEFT_AXIS' }))
              }
            },
            position: { overlayPosition: { anchorCell: { sheetId: sid, rowIndex: 0, columnIndex: nCols + 1 }, widthPixels: 640, heightPixels: 360 } }
          }
        }
      })
    }
  }
  await api(token, `${SHEETS}/${sheetId}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: fmt }) })

  const at = Date.now()
  markDownloaded(s, { driveSheetId: sheetId, driveBackupAt: at })
  step('')
  return `https://docs.google.com/spreadsheets/d/${sheetId}/edit`
}
