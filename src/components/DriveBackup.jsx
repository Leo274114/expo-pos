import { useState } from 'react'
import { useShop, useUi } from '../store.jsx'
import { uploadEventToDrive } from '../lib/gdrive.js'

const when = (ts) => new Date(ts).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

// 上傳 Google 雲端：顯示最後備份時間、試算表連結、上傳按鈕
export default function DriveBackup({ compact = false, note }) {
  const s = useShop()
  const ui = useUi()
  const [busy, setBusy] = useState('')
  if (!s.event) return null
  const at = s.event.driveBackupAt
  const url = s.event.driveSheetId ? `https://docs.google.com/spreadsheets/d/${s.event.driveSheetId}/edit` : ''
  const run = async () => {
    if (!navigator.onLine) return ui.toast('目前離線，連上網路後再上傳', { kind: 'error' })
    setBusy('連線 Google…')
    try {
      await uploadEventToDrive(s, { onStep: (m) => setBusy(m || '完成') })
      ui.toast('已上傳到 Google 雲端「好攤」資料夾', { kind: 'ok' })
    } catch (e) {
      ui.toast('上傳失敗：' + e.message, { kind: 'error', ms: 7000 })
    }
    setBusy('')
  }
  return (
    <div className={compact ? 'drive-backup compact' : 'drive-backup'}>
      {note && <p className="small" style={{ margin: '0 0 6px' }}>{note}</p>}
      <div className="row gap wrap" style={{ alignItems: 'center' }}>
        <button className="primary" disabled={!!busy} onClick={run}>{busy || (at ? '更新 Google 雲端' : '上傳 Google 雲端')}</button>
        {url && <a href={url} target="_blank" rel="noreferrer">打開試算表</a>}
      </div>
      <p className={at ? 'pos small' : 'muted small'} style={{ margin: '6px 0 0' }}>
        {at ? `✓ 最後備份：${when(at)}` : '這個場次還沒上傳過。'}
        {!compact && '　存到你自己的 Google 雲端硬碟「好攤」資料夾，檔名「好攤_場次名稱」；同一場再上傳會更新同一個檔案。'}
      </p>
    </div>
  )
}
