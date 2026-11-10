// 好攤 說明文件排版原稿：node docs/build/系統功能說明.cjs → docs/out/好攤-系統功能說明.pptx，再轉 PDF（見 docs/README.md）
const pptxgen = require('pptxgenjs');
const React = require('react');
const RDS = require('react-dom/server');
const sharp = require('sharp');
const fa = require('react-icons/fa');
const path = require('path');
const fs = require('fs');
const { applyTheme } = require('./apply_theme.cjs');

const FONT = 'Microsoft JhengHei';
const THEME = {
  name: '琥珀橘', headFontFace: FONT, bodyFontFace: FONT,
  colors: {
    dk1: '3B2412', lt1: 'FFFFFF', dk2: '7A4A1E', lt2: 'FDEBDB',
    accent1: 'F58220', accent2: 'C85F0A', accent3: '3B2412', accent4: 'FDEBDB',
    accent5: '2E7D4F', accent6: 'B23A2E', hlink: 'C85F0A', folHlink: '7A4A1E',
  },
};
const HEX = { orange: 'F58220', deep: 'C85F0A', brown: '3B2412', mid: '7A4A1E', tint: 'FDEBDB', white: 'FFFFFF' };

async function icon(Comp, color = '#F58220') {
  const svg = RDS.renderToStaticMarkup(React.createElement(Comp, { size: 256, color }));
  const buf = await sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer();
  return 'image/png;base64,' + buf.toString('base64');
}

(async () => {
  fs.mkdirSync(path.join(__dirname, '../out'), { recursive: true });
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_16x9'; // 10 x 5.625
  pres.theme = { headFontFace: FONT, bodyFontFace: FONT };
  pres.title = '好攤 系統功能說明';
  pres.author = 'LEO';
  const C = pres.SchemeColor;

  pres.defineSlideMaster({
    title: 'COVER',
    background: { color: 'FDEBDB' },
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: 0.7, y: 1.5, w: 8.6, h: 1.2, fontSize: 44, bold: true, color: C.accent2, align: 'left', valign: 'bottom', margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'body', type: 'body', x: 0.7, y: 2.9, w: 8.6, h: 1.4, fontSize: 18, color: C.text1, align: 'left', valign: 'top', margin: 0 }, text: '' } },
    ],
  });
  pres.defineSlideMaster({
    title: 'CONTENT',
    background: { color: 'FDEBDB' },
    margin: [0.5, 0.5, 0.5, 0.5],
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: 1.25, y: 0.35, w: 8.25, h: 0.7, fontSize: 30, bold: true, color: C.accent2, align: 'left', valign: 'middle', margin: 0 }, text: '' } },
      { text: { text: '好攤 系統功能說明', options: { x: 0.5, y: 5.2, w: 5, h: 0.3, fontSize: 10, color: C.text1, margin: 0 } } },
    ],
    slideNumber: { x: 9.0, y: 5.2, w: 0.5, h: 0.3, fontSize: 10, color: '3B2412', align: 'right' },
  });

  const icons = {};
  for (const [k, comp] of Object.entries({
    info: fa.FaInfoCircle, play: fa.FaPlayCircle, cog: fa.FaCogs, box: fa.FaBoxes, sliders: fa.FaSlidersH,
    cash: fa.FaCashRegister, check: fa.FaReceipt, mic: fa.FaMicrophone, cards: fa.FaClone, truck: fa.FaTruck,
    coins: fa.FaCoins, chart: fa.FaChartBar, lock: fa.FaShieldAlt, list: fa.FaClipboardCheck, warn: fa.FaExclamationTriangle,
    trend: fa.FaChartLine, phone: fa.FaMobileAlt, cloud: fa.FaCloudUploadAlt, toggle: fa.FaToggleOn, cup: fa.FaMugHot,
  })) icons[k] = await icon(comp, '#FFFFFF');
  const coverIcon = await icon(fa.FaStore, '#F58220');

  function content(title, iconKey, section) {
    const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: section });
    s.addShape(pres.shapes.OVAL, { x: 0.5, y: 0.35, w: 0.6, h: 0.6, fill: { color: C.accent1 }, line: { color: C.accent1 }, objectName: '標題圖示底' });
    s.addImage({ data: icons[iconKey], x: 0.62, y: 0.47, w: 0.36, h: 0.36, objectName: '標題圖示' });
    s.addText(title, { placeholder: 'title' });
    return s;
  }
  function card(s, x, y, w, h, name) {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: C.background1 }, line: { color: 'F3C9A3', width: 0.75 }, shadow: { type: 'outer', color: '7A4A1E', opacity: 0.12, blur: 6, offset: 2, angle: 90 }, objectName: name });
  }
  const T = (text, opt) => ({ text, options: opt || {} });
  function table(s, rows, x, y, w, colW, fontSize = 12, name = '表格') {
    const data = rows.map((r, i) => r.map((c) => ({
      text: c,
      options: i === 0
        ? { bold: true, color: HEX.white, fill: { color: HEX.deep }, fontSize, fontFace: FONT }
        : { color: HEX.brown, fill: { color: i % 2 ? HEX.white : HEX.tint }, fontSize, fontFace: FONT },
    })));
    s.addTable(data, { x, y, w, colW, border: { type: 'solid', pt: 0.5, color: 'F3C9A3' }, margin: [0.04, 0.08, 0.04, 0.08], valign: 'middle', objectName: name });
  }
  function steps(s, items, x, y, w, rowH, fontSize = 14) {
    items.forEach((t, i) => {
      const yy = y + i * rowH;
      s.addShape(pres.shapes.OVAL, { x, y: yy + (rowH - 0.4) / 2, w: 0.4, h: 0.4, fill: { color: C.accent1 }, line: { color: C.accent1 }, objectName: `步驟${i + 1}圓` });
      s.addText(String(i + 1), { x, y: yy + (rowH - 0.4) / 2, w: 0.4, h: 0.4, fontSize: 14, bold: true, color: C.background1, align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: `步驟${i + 1}號` });
      s.addText(t, { x: x + 0.55, y: yy, w: w - 0.55, h: rowH, fontSize, color: C.text1, valign: 'middle', margin: 0, isTextBox: true, objectName: `步驟${i + 1}` });
    });
  }
  function bullets(items, fontSize = 14) {
    return items.map((t, i) => ({ text: t, options: { bullet: { indent: 14 }, fontSize, color: HEX.brown, paraSpaceAfter: 6, breakLine: i < items.length - 1 } }));
  }
  function head(s, text, x, y, w) {
    s.addText(text, { x, y, w, h: 0.35, fontSize: 16, bold: true, color: C.accent2, margin: 0, isTextBox: true, objectName: '小標 ' + text });
  }

  // 1 封面
  pres.addSection({ title: '封面' });
  let s = pres.addSlide({ masterName: 'COVER', sectionTitle: '封面' });
  s.addImage({ data: coverIcon, x: 0.7, y: 0.6, w: 0.8, h: 0.8, objectName: '封面圖示' });
  s.addText('好攤 系統功能說明', { placeholder: 'title' });
  s.addText([
    T('展場攤商的收銀與庫存 App', { breakLine: true, bold: true }),
    T('版本 v0.22.0｜首次上場 2026 南港咖啡展 11/13–11/16', { breakLine: true }),
    T('https://leo274114.github.io/expo-pos/'),
  ], { placeholder: 'body' });

  // 2 系統簡介
  pres.addSection({ title: '簡介與開始' });
  s = content('系統簡介', 'info', '簡介與開始');
  const intro = [
    ['網址', 'leo274114.github.io/expo-pos/'], ['裝置', 'iPad、iPhone 收銀；電腦設定商品與價格'], ['同步', '同帳號裝置即時同步；上方顯示「已全部同步」或「N 筆尚未上傳」'],
    ['斷網', '可以照常結帳，恢復連線後自動上傳'], ['費用', '使用 Firebase 免費方案，不需付費'], ['下方選單', '收銀、銷售、總結、零錢、管理、分析、預購單；右上角 Q&A 可搜尋說明'],
  ];
  intro.forEach(([k, v], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 0.5 + col * 3.07, y = 1.35 + row * 1.85, w = 2.86, h = 1.65;
    card(s, x, y, w, h, '卡片 ' + k);
    s.addText(k, { x: x + 0.2, y: y + 0.18, w: w - 0.4, h: 0.4, fontSize: 18, bold: true, color: C.accent2, margin: 0, isTextBox: true });
    s.addText(v, { x: x + 0.2, y: y + 0.62, w: w - 0.4, h: 0.85, fontSize: 14, color: C.text1, margin: 0, valign: 'top', isTextBox: true });
  });

  // 3 開始使用
  s = content('開始使用：第一次約 10 分鐘', 'play', '簡介與開始');
  card(s, 0.5, 1.3, 5.6, 3.75, '步驟卡');
  steps(s, [
    '用 Safari 開啟網址，按「使用 Google 帳號登入」；一個帳號就是一個攤位',
    '第一次登入：攤位名稱必填，看完使用須知，勾選同意後開始',
    '加到手機桌面（主畫面）：iPhone／iPad、安卓步驟見下一頁',
    '照「開店清單」走：建立場次 → 載入範本 → 填價格與庫存 → 填耗材（可略過）',
    '開店清單最後一步：開店點零錢，每一步都能直接點過去',
  ], 0.7, 1.4, 5.25, 0.71, 13);
  card(s, 6.35, 1.3, 3.15, 3.75, '同意聲明卡');
  s.addText('同意聲明', { x: 6.55, y: 1.45, w: 2.75, h: 0.4, fontSize: 16, bold: true, color: C.accent2, margin: 0, isTextBox: true });
  s.addText('本 App 由浩子維護。浩子可查看各攤位的銷售統計，用於改良本 App；不會查看您的庫存數據，也不會將任何數據提供給他人。展覽結束 14 天後資料將刪除，屆時不另行通知，請於期限內下載 Excel 檔保存。',
    { x: 6.55, y: 1.9, w: 2.75, h: 3.0, fontSize: 12, color: C.text1, margin: 0, valign: 'top', isTextBox: true });

  // 加到手機桌面
  s = content('加到手機桌面：像 App 一樣打開', 'phone', '簡介與開始');
  card(s, 0.5, 1.3, 4.4, 3.0, 'iOS 卡');
  head(s, 'iPhone／iPad（用 Safari）', 0.7, 1.42, 4.0);
  steps(s, [
    '用 Safari 打開網址並登入',
    '點下方（iPad 在上方）的分享按鈕 □↑',
    '往下滑，點「加入主畫面」',
    '右上角按「加入」，桌面出現「好攤」',
  ], 0.7, 1.85, 4.0, 0.6, 12.5);
  card(s, 5.1, 1.3, 4.4, 3.0, '安卓卡');
  head(s, '安卓手機（用 Chrome）', 5.3, 1.42, 4.0);
  steps(s, [
    '用 Chrome 打開網址並登入',
    '點右上角「⋮」',
    '選「加到主畫面」或「安裝應用程式」',
    '按「安裝」或「新增」，桌面出現「好攤」',
  ], 5.3, 1.85, 4.0, 0.6, 12.5);
  card(s, 0.5, 4.45, 9.0, 0.6, '注意卡');
  s.addText([T('注意：', { bold: true, color: HEX.deep }), T('不要在 LINE、Facebook 裡面的瀏覽器登入，Google 會擋（畫面一片白）。從 LINE 點連結會自動改用手機瀏覽器開啟；三星瀏覽器：≡ →「新增頁面至」→「主螢幕」。')],
    { x: 0.7, y: 4.45, w: 8.6, h: 0.6, fontSize: 11.5, color: C.text1, margin: 0, valign: 'middle', isTextBox: true });

  // 4 管理頁
  pres.addSection({ title: '管理頁' });
  s = content('管理頁：建議在電腦上操作', 'cog', '管理頁');
  table(s, [
    ['分頁', '可以做什麼'],
    ['商品與價格', '新增商品與類別、產生組合、填定價與活動價、初始庫存、⋮⋮ 拖曳排序、設定組成、重設範本'],
    ['選項清單', '維護品種、處理法、重量、包裝、茶種等選項；可新增；拖曳換順序、拖到垃圾桶刪除'],
    ['展覽場次', '建立或從共用展覽清單直接使用、修改日期與營業時間、清除測試資料、刪除場次'],
    ['耗材', '試飲杯、濾紙、手提袋等：展前準備、展後剩餘，自動算用量'],
    ['庫存調整', '盤點差異、破損、瑕疵、補貨；保留每筆紀錄，不直接改數字'],
    ['功能設定', '攤位名稱與 Logo、上方顏色、功能開關、預購付款、滿額活動、滿額免運、低庫存、語音別名'],
    ['資料下載', '下載 Excel、上傳 Google 雲端、下載或列印價目表、帳號資訊、登出'],
    ['版本', '目前版本與每版更新內容'],
  ], 0.5, 1.3, 9.0, [1.7, 7.3], 13, '管理頁分頁表');

  // 5 商品、選項與組合
  s = content('商品、選項與組合', 'box', '管理頁');
  card(s, 0.5, 1.3, 4.4, 3.75, '組合卡');
  head(s, '選項是材料，商品是成品', 0.7, 1.45, 4.0);
  s.addText('一個商品最多三層選項，每個組合各有價格與庫存，例：咖啡豆・SL-34・日曬・1/2磅', { x: 0.7, y: 1.85, w: 4.0, h: 0.75, fontSize: 13, color: C.text1, margin: 0, valign: 'top', isTextBox: true });
  steps(s, ['在「選項清單」新增需要的值', '點開商品，勾選每層選項，按「產生組合」', '填定價與初始庫存；有活動價就取代定價'], 0.7, 2.6, 4.0, 0.55, 13);
  s.addText('「啟用」開關關掉＝暫時不賣（價格、庫存保留）；類別可改名、刪除、拖曳排序', { x: 0.7, y: 4.35, w: 4.0, h: 0.55, fontSize: 12, bold: true, color: C.accent2, margin: 0, isTextBox: true });
  card(s, 5.1, 1.3, 4.4, 3.75, '組成卡');
  head(s, '組成：套裝與盒裝共用庫存', 5.3, 1.45, 4.0);
  s.addText(bullets([
    '組合列「組成」欄按「設定」，賣出時改扣組成品項庫存',
    '套裝：在「套裝組合」類別新增，組成 A×1＋B×1＋C×1，畫面顯示客人省多少',
    '濾掛盒裝：一盒 = 單包 × 10，只管單包庫存，盒裝顯示「可組 N」',
    '開賣前才改選項層：會刪除現有組合、價格與庫存',
  ], 13), { x: 5.3, y: 1.9, w: 4.0, h: 3.0, margin: 0, valign: 'top', isTextBox: true });

  // 6 功能設定
  s = content('功能設定（每個攤位各自設定）', 'sliders', '管理頁');
  table(s, [
    ['設定', '預設', '說明'],
    ['攤位名稱、攤位 Logo', '必填／無', 'Logo 上傳後顯示在畫面上方，可拖曳縮放'],
    ['上方顏色', '茶園綠', '茶園綠、琥珀橘、咖啡棕、海鹽藍、櫻桃紅、墨黑或自訂'],
    ['零錢數量管理／1 元面額', '開／關', '開店、收攤點各面額數量；價格有個位數尾數才開 1 元'],
    ['贈與單、沖泡耗用單', '開', '關閉後結帳畫面不顯示'],
    ['預購&宅配', '開', '庫存為 0 時可改為預購'],
    ['預購付款方式', '全開', '現場付全額、先付訂金、貨到付款，至少一種'],
    ['滿額活動', '無', '單筆達門檻提醒發贈品，可設多個、每滿一次送一份'],
    ['滿額免運門檻', '0（不設定）', '商品合計達標時運費自動帶 0，仍可修改'],
    ['低庫存通知', '5、3、1', '賣到門檻時跳出提醒；總結低庫存清單跟著最大門檻'],
    ['顯示未開賣品項', '開', '停用但有價格與庫存的組合以灰色顯示，點一下開賣'],
    ['語音點單', '關', '開啟後收銀畫面出現「語音點單」按鈕'],
    ['語音別名', '空白', '每行一筆「說法=系統名稱」，只屬於自己的攤位'],
  ], 0.5, 1.2, 9.0, [2.2, 1.4, 5.4], 10.5, '功能設定表');

  // 7 收銀
  pres.addSection({ title: '收銀與銷售' });
  s = content('收銀：多位客人同時結帳', 'cash', '收銀與銷售');
  card(s, 0.5, 1.3, 3.6, 3.75, '多客人卡');
  head(s, '一位客人一張卡片', 0.7, 1.45, 3.2);
  s.addText(bullets([
    '按「＋」新增客人',
    '左右滑動切換；電腦用滑鼠拖曳，或點分頁、圓點',
    'A 還在猶豫，先幫 B 結帳，回來 A 的內容都在',
    '暫存單存在裝置上，App 關掉也不會不見',
    '客人編號每天從 1 開始，換日清掉空卡片',
  ], 13), { x: 0.7, y: 1.9, w: 3.2, h: 3.0, margin: 0, valign: 'top', isTextBox: true });
  table(s, [
    ['動作', '方式'],
    ['加入商品', '類別 → 商品 → 逐層選項；搜尋框記得最近搜尋'],
    ['熱賣', '第一個分類，今天賣最多的 8 樣'],
    ['改數量', '＋／−，或點數字輸入；輸入 0 刪除'],
    ['刪除／清除', '垃圾桶刪一項、「清除」清整張；都可按「復原」救回'],
    ['單品改價', '點價格輸入新單價，可選原因'],
    ['整單折扣', '折抵金額或折數（9 = 九折）'],
  ], 4.3, 1.3, 5.2, [1.3, 3.9], 13, '選品表');
  s.addText('售完為斜紋底；灰色虛線「未開賣」點一下確認就開賣；品名一整行，數量鈕在下方', { x: 4.3, y: 4.45, w: 5.2, h: 0.6, fontSize: 12, color: C.text1, margin: 0, valign: 'middle', isTextBox: true });

  // 8 結帳
  s = content('結帳流程', 'check', '收銀與銷售');
  card(s, 0.5, 1.3, 5.6, 3.75, '結帳步驟卡');
  steps(s, [
    '按「結帳」選類型：銷售、贈與或沖泡耗用（後兩者扣庫存、不計營業額）',
    '含預購品項：填收件人、電話、地址、運費，選全額／訂金／貨到付款',
    '選現金或 LINE Pay；大數字鍵盤輸入收款，＋100／＋500／＋1000 快速加，大字顯示找零與建議找法',
    '按「確認完成」，產生銷售卡片，暫存單清空',
  ], 0.7, 1.45, 5.25, 0.88, 13);
  card(s, 6.35, 1.3, 3.15, 1.8, '庫存為0卡');
  s.addText('庫存為 0 時', { x: 6.55, y: 1.42, w: 2.75, h: 0.4, fontSize: 16, bold: true, color: C.accent2, margin: 0, isTextBox: true });
  s.addText('不能直接超賣；按「改為預購&宅配」加入預購品項，不扣目前庫存', { x: 6.55, y: 1.85, w: 2.75, h: 1.15, fontSize: 12, color: C.text1, margin: 0, valign: 'top', isTextBox: true });
  card(s, 6.35, 3.25, 3.15, 1.8, 'LINE Pay 卡');
  s.addText('滿額活動', { x: 6.55, y: 3.37, w: 2.75, h: 0.4, fontSize: 16, bold: true, color: C.accent2, margin: 0, isTextBox: true });
  s.addText('達門檻時結帳畫面提醒發贈品；購物車提示「再買多少」。LINE Pay 只做標記，不串接金流', { x: 6.55, y: 3.8, w: 2.75, h: 1.15, fontSize: 12, color: C.text1, margin: 0, valign: 'top', isTextBox: true });

  // 9 語音點單
  s = content('語音點單（預設關閉）', 'mic', '收銀與銷售');
  card(s, 0.5, 1.3, 5.6, 3.75, '語音步驟卡');
  steps(s, [
    '按「語音點單」就直接開始聽，說：「SL-34 日曬半磅兩包、苦茶油一瓶」',
    '即時列出品項：綠色確定、黃色要點選、灰色聽不懂',
    '按「加入客人 N」；庫存不足的部分自動改為預購',
  ], 0.7, 1.5, 5.25, 1.1, 14);
  card(s, 6.35, 1.3, 3.15, 3.75, '語音提示卡');
  head(s, '別名與小提醒', 6.55, 1.45, 2.75);
  s.addText(bullets([
    '內建別名（半磅、藝妓、日晒、掛耳…）所有攤商共用',
    '自己加的別名只屬於自己的攤位',
    '不支援一鍵收音時，自動改用鍵盤聽寫',
    '展場吵雜，建議用藍牙耳機麥克風',
  ], 12), { x: 6.55, y: 1.9, w: 2.75, h: 3.0, margin: 0, valign: 'top', isTextBox: true });


  // 開賣管理
  s = content('開賣管理：啟用開關與未開賣', 'toggle', '收銀與銷售');
  card(s, 0.5, 1.3, 4.4, 3.75, '啟用卡');
  head(s, '「啟用」開關＝這個品項賣不賣', 0.7, 1.45, 4.0);
  s.addText(bullets([
    '管理 → 商品與價格，商品和每個組合各有一個開關',
    '關掉後價格與初始庫存都保留，打開就能直接賣',
    '四天展期品項多：先填好數量，還沒要賣的關掉',
    '每次開關都記錄時間，分析頁用來算開賣時間',
  ], 13), { x: 0.7, y: 1.9, w: 4.0, h: 3.0, margin: 0, valign: 'top', isTextBox: true });
  card(s, 5.1, 1.3, 4.4, 3.75, '未開賣卡');
  head(s, '收銀畫面的灰色「未開賣」', 5.3, 1.45, 4.0);
  steps(s, [
    '停用、但已填價格且有庫存的組合，以灰色虛線按鈕顯示',
    '點一下，選「開賣」或「開賣並加入客人 N」',
    '不用回管理頁；開賣時間照樣記錄',
  ], 5.3, 1.9, 4.0, 0.72, 12);
  s.addText('不想看到：功能設定關掉「顯示未開賣品項」；這次不賣的品項庫存留空就不會出現', { x: 5.3, y: 4.2, w: 4.0, h: 0.75, fontSize: 11.5, bold: true, color: C.accent2, margin: 0, valign: 'top', isTextBox: true });

  // 10 單據類型
  s = content('銷售：卡片、作廢與退換貨', 'cards', '收銀與銷售');
  table(s, [
    ['類型', '扣庫存', '計營業額'],
    ['銷售', '是', '是'],
    ['預購&宅配', '否（進預購單）', '依實際收到的金額'],
    ['贈與', '是', '否'],
    ['沖泡耗用', '是（以包計）', '否'],
    ['退貨', '可選回庫存', '扣除退款'],
    ['換貨', '退回＋、換出−', '補或退差額'],
  ], 0.5, 1.3, 5.0, [1.4, 1.6, 2.0], 13, '單據類型表');
  card(s, 5.7, 1.3, 3.8, 3.75, '作廢退換卡');
  s.addText(bullets([
    '作廢：打錯單用，卡片變灰，庫存回補，不計報表',
    '退換貨：卡片按「退換貨」，選數量，勾選是否回庫存（不勾 = 瑕疵）',
    '下一步到收銀，可直接退款或加入換出品項',
    '退款單價按整單折扣比例分攤；原卡片標示「部分退貨」或「已退貨」',
  ], 13), { x: 5.9, y: 1.5, w: 3.4, h: 3.4, margin: 0, valign: 'top', isTextBox: true });

  // 11 待出貨
  s = content('預購單', 'truck', '收銀與銷售');
  const ship = [
    ['清單內容', '預購品項、付款方式、已收與待收、收件人、電話（可撥打）、地址'],
    ['收尾款', '輸入金額，選現金或 LINE Pay，計入收款當天營業額'],
    ['已出貨', '標記後移到「已出貨」分頁，可改回'],
    ['取消預購', '未出貨才能取消，已收訂金走退款'],
  ];
  ship.forEach(([k, v], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.5 + col * 4.6, y = 1.3 + row * 1.45, w = 4.4, h = 1.3;
    card(s, x, y, w, h, '卡片 ' + k);
    s.addText(k, { x: x + 0.2, y: y + 0.12, w: w - 0.4, h: 0.4, fontSize: 16, bold: true, color: C.accent2, margin: 0, isTextBox: true });
    s.addText(v, { x: x + 0.2, y: y + 0.52, w: w - 0.4, h: 0.7, fontSize: 13, color: C.text1, margin: 0, valign: 'top', isTextBox: true });
  });
  s.addText('下方選單最右邊，分「未出貨／已出貨／已取消／全部」。展後刪除前務必下載 Excel，「預購單」工作表含收件資料。', { x: 0.5, y: 4.3, w: 9.0, h: 0.7, fontSize: 13, bold: true, color: C.text1, margin: 0, valign: 'middle', isTextBox: true });

  // 12 零錢
  pres.addSection({ title: '對帳與報表' });
  s = content('零錢對帳：開店、收攤各點一次', 'coins', '對帳與報表');
  card(s, 0.5, 1.3, 5.6, 2.55, '零錢步驟卡');
  steps(s, [
    '開店：「開店零用金」輸入 1000／500／100／50／10／5（可選 1）數量',
    '收攤：在「收攤點算」再輸入一次',
    '看結果：顯示相符，或多、少多少',
  ], 0.7, 1.4, 5.25, 0.78, 13);
  card(s, 0.5, 4.0, 5.6, 1.05, '公式卡');
  s.addText([T('應有現金 = ', { bold: true, color: HEX.deep }), T('零用金 + 當天所有現金收支 + 現金調整')], { x: 0.7, y: 4.05, w: 5.25, h: 0.95, fontSize: 14, color: C.text1, margin: 0, valign: 'middle', isTextBox: true });
  card(s, 6.35, 1.3, 3.15, 3.75, '現金調整卡');
  head(s, '現金調整', 6.55, 1.45, 2.75);
  s.addText(bullets([
    '找錯錢、換零錢時記一筆，少了填負數',
    '每筆都保留紀錄',
    '營業中不用逐筆記面額',
    '關閉「零錢數量管理」時只顯示現金總額',
  ], 13), { x: 6.55, y: 1.9, w: 2.75, h: 3.0, margin: 0, valign: 'top', isTextBox: true });

  // 13 總結
  s = content('總結報表', 'chart', '對帳與報表');
  table(s, [
    ['區塊', '內容'],
    ['上方數字', '今日營業額、現金、LINE Pay、銷售筆數'],
    ['每小時營業額', '長條圖，最高的時段顏色加深'],
    ['熱賣排行', '前 10 名，依銷售數量'],
    ['金額明細', '原價總額、折扣與特價、退貨金額、運費收入、實收'],
    ['預購、贈與、沖泡、耗材', '預購已收／待收、贈與對象與價值、沖泡包數、耗材用量、零錢對帳'],
    ['各品項銷售數量', '可切換「今天／整個展期」，依類別小計'],
    ['展期每日營業額', '曲線圖，捲動到才畫出來'],
    ['低庫存、完售紀錄', '跟著低庫存通知門檻；每個品項第一次賣完的時間與開賣後多久賣完'],
  ], 0.5, 1.2, 9.0, [2.2, 6.8], 11, '總結報表表');
  s.addText('「下載 Excel」含銷售明細、品項統計、每日營業額、庫存、完售紀錄、零錢對帳、退換貨、預購單、耗材、展期總覽等 13 個工作表', { x: 0.5, y: 4.45, w: 9.0, h: 0.6, fontSize: 12, bold: true, color: C.text1, margin: 0, valign: 'middle', isTextBox: true });


  // 分析
  s = content('分析：品項銷售曲線', 'trend', '對帳與報表');
  card(s, 0.5, 1.3, 4.4, 3.75, '分析卡');
  head(s, '比較每個品項受客人喜歡的程度', 0.7, 1.45, 4.0);
  s.addText(bullets([
    '下方選單「分析」，勾選要比較的品項，最多 8 個',
    '品種＋處理法算一個品項；重量換算公克加總（1/4 磅＝113 g），也可切件數',
    '只算銷售，不含贈與、沖泡、預購；套裝拆成組成品項',
    '「從開賣起算」最公平；「時鐘時間」看哪個時段好賣',
    '表格「每小時」＝已售 ÷ 開賣時數，越大越受歡迎；完售標出時間',
  ], 12), { x: 0.7, y: 1.9, w: 4.0, h: 3.1, margin: 0, valign: 'top', isTextBox: true });
  card(s, 5.1, 1.3, 4.4, 1.7, '營業時間卡');
  head(s, '先填營業時間', 5.3, 1.42, 4.0);
  s.addText('管理 → 展覽場次：填一組開門、收攤時間自動套用每一天，哪天不同再改那天（預設 10:00–18:00）', { x: 5.3, y: 1.82, w: 4.0, h: 1.1, fontSize: 12, color: C.text1, margin: 0, valign: 'top', isTextBox: true });
  card(s, 5.1, 3.15, 4.4, 1.9, '開賣時間卡');
  head(s, '開賣時間怎麼算', 5.3, 3.27, 4.0);
  s.addText(bullets([
    '開門那一刻已開啟的：算開門時間（開門前打開也一樣，不用等開門後才打開）',
    '開門後才打開的：從打開那一刻算',
  ], 12), { x: 5.3, y: 3.67, w: 4.0, h: 1.3, margin: 0, valign: 'top', isTextBox: true });

  // 耗材
  s = content('耗材：這次帶多少、用掉多少', 'cup', '對帳與報表');
  card(s, 0.5, 1.3, 5.6, 3.75, '耗材步驟卡');
  steps(s, [
    '管理 → 耗材：內建試飲杯、濾紙、手提袋，可自行新增與自訂單位',
    '展前填「準備數量」（開店清單的一步，可略過）',
    '收攤點零錢時提醒點剩多少，填「剩餘數量」',
    '自動算出本次用量；下次建場次可參考上次用量',
  ], 0.7, 1.45, 5.25, 0.88, 13);
  card(s, 6.35, 1.3, 3.15, 3.75, '耗材提醒卡');
  head(s, '小提醒', 6.55, 1.45, 2.75);
  s.addText(bullets([
    '耗材不賣、不計營業額，和商品庫存分開',
    '都不是必填',
    '列入總結報表與 Excel「耗材」工作表',
    '場次刪除後看不到上次用量，請先下載 Excel',
  ], 12), { x: 6.55, y: 1.9, w: 2.75, h: 3.0, margin: 0, valign: 'top', isTextBox: true });

  // 14 資料保存
  pres.addSection({ title: '資料與上場準備' });
  s = content('資料保存、隱私與離線', 'lock', '資料與上場準備');
  const priv = [
    ['帳號隔離', '資料存在 Firebase 雲端，每個 Google 帳號只能讀寫自己的攤位'],
    ['浩子總覽', '只有系統管理者看得到：各攤位目前場次營業額、筆數與明細；讀不到庫存與宅配收件資料'],
    ['14 天刪除', '展覽結束 14 天後刪除；展後開 App 會提醒期限與未出貨筆數，請先下載 Excel 或上傳雲端'],
    ['離線結帳', '斷網照常結帳，上方顯示「離線中・N 筆尚未上傳」，恢復後自動同步；有資料沒上傳時按登出會先警告'],
  ];
  priv.forEach(([k, v], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.5 + col * 4.6, y = 1.3 + row * 1.9, w = 4.4, h = 1.75;
    card(s, x, y, w, h, '卡片 ' + k);
    s.addText(k, { x: x + 0.2, y: y + 0.15, w: w - 0.4, h: 0.4, fontSize: 16, bold: true, color: C.accent2, margin: 0, isTextBox: true });
    s.addText(v, { x: x + 0.2, y: y + 0.58, w: w - 0.4, h: 1.05, fontSize: 13, color: C.text1, margin: 0, valign: 'top', isTextBox: true });
  });


  // Google 雲端
  s = content('備份到自己的 Google 雲端', 'cloud', '資料與上場準備');
  card(s, 0.5, 1.3, 5.6, 3.75, '雲端步驟卡');
  steps(s, [
    '管理 → 資料下載 → 「上傳 Google 雲端」，第一次跳出 Google 視窗按同意',
    '雲端硬碟自動建「好攤」資料夾，每場一個試算表「好攤_場次名稱」',
    '再上傳會更新同一個檔案；收攤點零錢後授權還有效就自動更新',
    '分頁：展期總覽、每小時營業額（尖峰曲線圖）、商品價格，以及 Excel 所有工作表',
  ], 0.7, 1.45, 5.25, 0.88, 12.5);
  card(s, 6.35, 1.3, 3.15, 3.75, '雲端安全卡');
  head(s, '安心的地方', 6.55, 1.45, 2.75);
  s.addText(bullets([
    '檔案在你自己的雲端硬碟，14 天後也不會刪',
    '好攤只能存取它自己建立的檔案，看不到其他東西',
    '浩子看不到你的雲端檔案',
    '授權約 1 小時，過期按一下再更新',
    '上傳也算「已下載」',
  ], 12), { x: 6.55, y: 1.9, w: 2.75, h: 3.0, margin: 0, valign: 'top', isTextBox: true });

  // 使用須知
  s = content('使用須知：開攤前一定要知道', 'warn', '資料與上場準備');
  const notes = [
    ['先在有網路的地方登入', '到現場前開 App、確認登入、商品價格都載入；斷網結帳的前提是已登入'],
    ['斷網時絕對不要登出', '離線登出就無法再登入結帳，沒上傳的資料也會遺失'],
    ['每天找機會同步一次', '網路不穩就開手機熱點幾分鐘，等到「已全部同步」'],
    ['準備備案', '行動電源、紙本記帳簿、計算機；照價目表手寫也能繼續賣'],
    ['金額以實際金流為準', 'LINE Pay 看商家後台、現金看實際點收；系統數字供參考與對帳'],
    ['免費小工具，請自行備份', '尚未經過長期展場測試；每天收攤下載 Excel，問題截圖傳給浩子'],
  ];
  notes.forEach(([k, v], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.5 + col * 4.6, y = 1.3 + row * 1.27, w = 4.4, h = 1.15;
    card(s, x, y, w, h, '須知卡 ' + k);
    s.addText(k, { x: x + 0.2, y: y + 0.1, w: w - 0.4, h: 0.35, fontSize: 15, bold: true, color: C.accent2, margin: 0, isTextBox: true });
    s.addText(v, { x: x + 0.2, y: y + 0.47, w: w - 0.4, h: 0.6, fontSize: 12, color: C.text1, margin: 0, valign: 'top', isTextBox: true });
  });

  // 15 開展前檢查
  s = content('開展前檢查與常見問題', 'list', '資料與上場準備');
  card(s, 0.5, 1.3, 4.3, 3.75, '檢查清單卡');
  head(s, '開展前一天用 iPad + iPhone 跑一次', 0.7, 1.42, 3.9);
  const chk = ['兩台裝置「管理 → 版本」都是 v0.22.0', '開店清單完成；場次營業時間已填', '組合都有定價、庫存；盒裝與套裝組成已設定', '下載或列印價目表，放一本紙本記帳簿', '開店 → 結帳 → 預購 → 退貨 → 斷網 → 同步 → 收攤 → Excel → 分析',
    '跑完到「展覽場次」按「清除測試資料」', '帶行動電源與不同電信的分享器'];
  s.addText(chk.map((t, i) => ({ text: '☐  ' + t, options: { fontSize: 12, color: HEX.brown, paraSpaceAfter: 5, breakLine: i < chk.length - 1 } })), { x: 0.7, y: 1.85, w: 3.9, h: 3.1, margin: 0, valign: 'top', isTextBox: true });
  table(s, [
    ['問題', '怎麼處理'],
    ['iPad 上還是舊版', '關掉 App 再開；仍舊版就在 Safari 重新整理'],
    ['滑不動客人卡片', '至少要兩位客人；電腦用滑鼠按住拖曳'],
    ['商品沒出現在收銀', '沒填價格或庫存為 0 的停用組合不顯示；或還沒產生組合'],
    ['庫存數字不對', '用「庫存調整」記一筆，不要改初始庫存'],
    ['其他問題', '右上角 Q&A 輸入關鍵字，即時搜尋常見問題與功能說明'],
  ], 5.0, 1.3, 4.5, [1.55, 2.95], 11, '常見問題表');

  await pres.writeFile({ fileName: path.join(__dirname, '../out/好攤-系統功能說明.pptx') });
  await applyTheme(path.join(__dirname, '../out/好攤-系統功能說明.pptx'), THEME);
  console.log('done');
})();
