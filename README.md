# 出攤記帳（expo-pos）

展場銷售、庫存、預定宅配與零錢對帳的網頁 App。iPad／iPhone 加到主畫面使用，斷網也能結帳。

- 網址（部署後）：https://leo274114.github.io/expo-pos/
- 技術：React + Vite（PWA）、Firebase Firestore（離線暫存）、Google 登入
- 規格書：見 claude.ai 專案「出攤記帳」中的《出攤記帳-規格書》

## 第一次設定

1. 把 Firebase 的 `firebaseConfig` 貼到 `src/firebase-config.js`
2. Firebase 主控台 → Firestore → 規則：貼上 `firestore.rules` 的內容 → 發布
3. Firebase 主控台 → Authentication → 設定 → 授權網域：新增 `leo274114.github.io`

## 本機開發（Windows PowerShell）

```
cd "Y:\記帳工具\展場記帳"
npm install
npm run dev      # 開發模式，網址會顯示在畫面上
npm test         # 計算邏輯測試
npm run build    # 建置
```

## 部署到 GitHub Pages

1. 在 GitHub 建立 repo：`expo-pos`
2. repo → Settings → Pages → Source 選「GitHub Actions」
3. 推送程式碼：

```
git init
git add .
git commit -m "出攤記帳 第一版"
git branch -M main
git remote add origin https://github.com/Leo274114/expo-pos.git
git push -u origin main
```

之後每次 `git push`，GitHub 會自動建置並更新網站。

## 在 iPad／iPhone 安裝

用 Safari 開啟網址 → 分享 → 「加入主畫面」。

## 資料結構

```
shops/{uid}                         攤位、功能設定、目前場次
  optionLists / products / skus     選項清單、商品、組合（價格、活動價）
  events/{eventId}                  展覽場次
    stock/{skuId}                   初始庫存
    orders/{id}                     所有單據（銷售、預定、贈與、沖泡、退換貨、收尾款、取消預定）
    shipping/{orderId}              宅配收件資料（系統管理者讀不到）
    adjustments / cashCounts / cashMoves
```

目前庫存 = 初始庫存 + 所有單據與調整的異動；作廢單自動不計。
