# 好攤 說明文件原稿

這個資料夾放「系統功能說明」與「系統優點」兩份 PDF 的排版原稿。要更新說明書時，只改文字、重新輸出，版面與配色維持一致。

| 路徑 | 內容 |
|---|---|
| `pdf/` | 目前發給攤商的 PDF 成品 |
| `build/系統功能說明.cjs` | 系統功能說明的排版程式（16 頁，淡橘底 #FDEBDB、標題深橘 #C85F0A、主色 #F58220） |
| `build/系統優點.cjs` | 系統優點的排版程式（12 頁，每頁一張實際畫面截圖） |
| `build/apply_theme.cjs` | 把配色寫進簡報主題的小工具 |
| `shots/` | 系統優點用的 App 截圖（iPad 768×1024、iPhone 375×812，v0.15.0 實際畫面；總覽頁有攤商 email，不放） |

## 重新輸出

需要 Node.js 與 LibreOffice。

```
npm install --no-save pptxgenjs react react-dom react-icons sharp
node docs/build/系統功能說明.cjs      # → docs/out/好攤-系統功能說明.pptx
node docs/build/系統優點.cjs          # → docs/out/好攤-系統優點.pptx
cd docs/out
soffice --headless --convert-to pdf *.pptx
```

把 `docs/out/` 裡的 PDF 複製到 `docs/pdf/` 取代舊檔即可（`docs/out/` 不進版控）。LEO 只需要 PDF，不用另外給 PPT。

## 待更新（下次一起改）

- 系統功能說明內容停在 v0.15.0：要補 v0.16–v0.19（耗材、預購用詞、Google 雲端備份、分析頁、營業時間、開賣時間規則：開門前打開也算開門時間開賣），標題改用「好攤」。
- 系統優點加一頁「展後資料，下次參展更好準備」（表格：看哪個數字 → 下次怎麼用）。
