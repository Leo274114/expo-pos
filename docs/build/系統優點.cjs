// 好攤 說明文件排版原稿：node docs/build/系統優點.cjs → docs/out/好攤-系統優點.pptx，再轉 PDF（見 docs/README.md）
const pptxgen = require('pptxgenjs');
const React = require('react');
const RDS = require('react-dom/server');
const sharp = require('sharp');
const fs = require('fs');
const fa = require('react-icons/fa');
const path = require('path');
const { applyTheme } = require('./apply_theme.cjs');

const FONT = 'Microsoft JhengHei';
const OUT = path.join(__dirname, '../out/好攤-系統優點.pptx');
const THEME = {
  name: '琥珀橘', headFontFace: FONT, bodyFontFace: FONT,
  colors: { dk1: '3B2412', lt1: 'FFFFFF', dk2: '7A4A1E', lt2: 'FDEBDB', accent1: 'F58220', accent2: 'C85F0A', accent3: '3B2412', accent4: 'FDEBDB', accent5: '2E7D4F', accent6: 'B23A2E', hlink: 'C85F0A', folHlink: '7A4A1E' },
};
const BG = 'FDEBDB';
const img = (n) => 'image/jpeg;base64,' + fs.readFileSync(path.join(__dirname, '../shots', n + '.jpg')).toString('base64');
async function icon(Comp, color) {
  const svg = RDS.renderToStaticMarkup(React.createElement(Comp, { size: 256, color }));
  return 'image/png;base64,' + (await sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer()).toString('base64');
}

(async () => {
  fs.mkdirSync(path.join(__dirname, '../out'), { recursive: true });
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_16x9';
  pres.theme = { headFontFace: FONT, bodyFontFace: FONT };
  pres.title = '好攤 系統優點';
  const C = pres.SchemeColor;

  pres.defineSlideMaster({
    title: 'COVER', background: { color: BG },
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 1.4, w: 5.6, h: 1.3, fontSize: 36, bold: true, color: C.accent2, align: 'left', valign: 'bottom', margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'body', type: 'body', x: 0.6, y: 2.85, w: 5.4, h: 1.6, fontSize: 16, color: C.text1, align: 'left', valign: 'top', margin: 0 }, text: '' } },
    ],
  });
  pres.defineSlideMaster({
    title: 'FEATURE', background: { color: BG },
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: 1.25, y: 0.35, w: 8.25, h: 0.7, fontSize: 28, bold: true, color: C.accent2, align: 'left', valign: 'middle', margin: 0 }, text: '' } },
      { text: { text: '好攤 系統優點', options: { x: 0.5, y: 5.25, w: 5, h: 0.25, fontSize: 10, color: C.text1, margin: 0 } } },
    ],
    slideNumber: { x: 9.0, y: 5.25, w: 0.5, h: 0.25, fontSize: 10, color: '3B2412', align: 'right' },
  });

  const I = {};
  for (const [k, c] of Object.entries({ next: fa.FaRedoAlt, device: fa.FaMobileAlt, tap: fa.FaHandPointer, users: fa.FaUsers, sync: fa.FaSyncAlt, chart: fa.FaChartBar, cards: fa.FaClone, coins: fa.FaCoins, grid: fa.FaTh, sliders: fa.FaSlidersH, lock: fa.FaShieldAlt, store: fa.FaStore }))
    I[k] = await icon(c, '#FFFFFF');
  I.cash = await icon(fa.FaCashRegister, '#FFFFFF');

  // screenshot with white frame + shadow
  function shot(s, name, x, y, h, ratio) {
    const w = h * ratio, pad = 0.07;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x - pad, y: y - pad, w: w + 2 * pad, h: h + 2 * pad, rectRadius: 0.1, fill: { color: C.background1 }, line: { color: 'F3C9A3', width: 0.75 }, shadow: { type: 'outer', color: '7A4A1E', opacity: 0.18, blur: 8, offset: 3, angle: 90 }, objectName: '截圖框 ' + name });
    s.addImage({ data: img(name), x, y, w, h, altText: '實際畫面：' + name, objectName: '截圖 ' + name });
    return w;
  }
  const IPAD = 557 / 743, PHONE = 375 / 812;

  function feature(title, iconKey) {
    const s = pres.addSlide({ masterName: 'FEATURE', sectionTitle: '系統優點' });
    s.addShape(pres.shapes.OVAL, { x: 0.5, y: 0.4, w: 0.6, h: 0.6, fill: { color: C.accent1 }, line: { color: C.accent1 }, objectName: '標題圖示底' });
    s.addImage({ data: I[iconKey], x: 0.63, y: 0.53, w: 0.34, h: 0.34, objectName: '標題圖示' });
    s.addText(title, { placeholder: 'title' });
    return s;
  }
  // right-hand explanation: lead + points
  function explain(s, x, w, lead, points) {
    s.addText(lead, { x, y: 1.3, w, h: 0.9, fontSize: 18, bold: true, color: C.text1, margin: 0, valign: 'top', isTextBox: true, objectName: '重點' });
    points.forEach(([h, d], i) => {
      const y = 2.3 + i * 0.95;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.82, rectRadius: 0.1, fill: { color: C.background1 }, line: { color: 'F3C9A3', width: 0.75 }, objectName: '要點卡 ' + h });
      s.addText([{ text: h, options: { bold: true, color: '#C85F0A'.slice(1), breakLine: true, fontSize: 14 } }, { text: d, options: { fontSize: 12, color: '3B2412' } }],
        { x: x + 0.18, y: y + 0.06, w: w - 0.36, h: 0.7, margin: 0, valign: 'middle', isTextBox: true, objectName: '要點 ' + h });
    });
  }

  // 1 cover
  pres.addSection({ title: '封面' });
  let s = pres.addSlide({ masterName: 'COVER', sectionTitle: '封面' });
  s.addShape(pres.shapes.OVAL, { x: 0.6, y: 0.55, w: 0.75, h: 0.75, fill: { color: C.accent1 }, line: { color: C.accent1 }, objectName: '封面圖示底' });
  s.addImage({ data: I.store, x: 0.77, y: 0.72, w: 0.41, h: 0.41, objectName: '封面圖示' });
  s.addText('用實際畫面看好攤', { placeholder: 'title' });
  s.addText([
    { text: '為展場攤商做的收銀與庫存 App', options: { bold: true, breakLine: true } },
    { text: 'iPad、iPhone 開網址就能用，資料即時同步，不用付費', options: { breakLine: true } },
    { text: '以下畫面皆為實際截圖（琥珀社咖啡莊園）' },
  ], { placeholder: 'body' });
  shot(s, 'phone_pos', 6.55, 0.45, 4.6, PHONE);
  shot(s, 'phone_pick1', 8.15, 0.85, 4.1, PHONE);

  // 2 overview
  pres.addSection({ title: '系統優點' });
  s = feature('十個讓攤位更好做生意的地方', 'store');
  const ov = [
    ['device', '開網址就能用', '免安裝、免費'], ['tap', '點選不用打字', '逐層選規格'], ['users', '多客人同時結', '庫存就在按鈕上'],
    ['cash', '找零自動算', '還教你怎麼找'], ['chart', '收攤報表', '一眼看懂'],
    ['cards', '每筆一張卡片', '退換有紀錄'], ['coins', '零錢自動對帳', '算出應有現金'], ['grid', '一次建組合', '電腦勾選產生'],
    ['sliders', '功能可開關', '依攤位需求'], ['lock', '資料安全', '斷網也能用'],
  ];
  ov.forEach(([ic, h, d], i) => {
    const col = i % 5, row = Math.floor(i / 5);
    const x = 0.5 + col * 1.82, y = 1.35 + row * 1.9, w = 1.7, hh = 1.75;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: hh, rectRadius: 0.1, fill: { color: C.background1 }, line: { color: 'F3C9A3', width: 0.75 }, objectName: '總覽卡 ' + h });
    s.addShape(pres.shapes.OVAL, { x: x + (w - 0.55) / 2, y: y + 0.18, w: 0.55, h: 0.55, fill: { color: C.accent1 }, line: { color: C.accent1 }, objectName: '總覽圖示底 ' + h });
    s.addImage({ data: I[ic], x: x + (w - 0.29) / 2, y: y + 0.31, w: 0.29, h: 0.29, objectName: '總覽圖示 ' + h });
    s.addText([{ text: `${i + 1}. ${h}`, options: { bold: true, fontSize: 14, color: '3B2412', breakLine: true } }, { text: d, options: { fontSize: 11, color: '7A4A1E' } }],
      { x: x + 0.08, y: y + 0.85, w: w - 0.16, h: 0.8, margin: 0, align: 'center', valign: 'middle', isTextBox: true });
  });

  // 3 devices
  s = feature('1. 開網址就能用，iPad 和 iPhone 都適合', 'device');
  let w = shot(s, 'ipad_pos', 0.6, 1.3, 3.75, IPAD);
  shot(s, 'phone_pos', 0.6 + w + 0.3, 1.3, 3.75, PHONE);
  explain(s, 5.6, 3.9, '同一個網址，裝置自動換版面', [
    ['iPad：左邊選商品、右邊收據', '大螢幕一眼看到品項與購物車'],
    ['iPhone：購物車收在下方', '點一下展開，單手也好操作'],
    ['加到主畫面像 App 一樣', '免上架、免安裝、Firebase 免費方案'],
  ]);

  // 4 tap select
  s = feature('2. 一層一層點選，不用打字也不會選錯', 'tap');
  w = shot(s, 'phone_pick1', 0.6, 1.3, 3.75, PHONE);
  shot(s, 'phone_pick2', 0.6 + w + 0.3, 1.3, 3.75, PHONE);
  explain(s, 4.85, 4.65, '品種 → 處理法 → 重量，三下就選好', [
    ['每格直接顯示剩餘數量', '「2 種，共剩 9」，不用另外查庫存'],
    ['熱賣分頁放最常賣的品項', '排行前幾名一點就加入'],
    ['也能搜尋或語音點單', '「SL-34 日曬半磅兩包」直接帶出'],
  ]);

  // 5 multi customer + stock
  s = feature('3. 多位客人同時結帳，庫存數字就在按鈕上', 'users');
  w = shot(s, 'ipad_cart1', 0.6, 1.3, 3.75, IPAD);
  shot(s, 'ipad_cart2', 0.6 + w + 0.3, 1.3, 3.75, IPAD);
  explain(s, 6.75, 2.75, '客人猶豫時，先幫下一位結帳', [
    ['「客人1（2）」分頁', '件數直接寫在分頁上'],
    ['暫存單存在裝置上', 'App 關掉重開還在'],
    ['按鈕直接寫剩幾件', '賣完變斜紋「售完」'],
  ]);

  // 4 change
  s = feature('4. 現金找零自動算，還告訴你怎麼找', 'cash');
  shot(s, 'ipad_checkout', 0.6, 1.3, 3.75, IPAD);
  explain(s, 4.2, 5.3, '應收 $1,400、收 $2,000，馬上顯示找零 $600', [
    ['建議找法直接列出', '「500×1　100×1」，忙的時候不會找錯'],
    ['快速按鈕：剛好、+100、+500、+1000', '大鈔一按就好，也能用數字鍵輸入'],
    ['同一畫面選現金或 LINE Pay', '也能改成贈與、沖泡耗用，扣庫存不計營業額'],
  ]);

  // 6 summary
  s = feature('5. 收攤報表一眼看懂今天賣得怎麼樣', 'chart');
  w = shot(s, 'ipad_summary', 0.6, 1.3, 3.75, IPAD);
  shot(s, 'ipad_summary2', 0.6 + w + 0.3, 1.3, 3.75, IPAD);
  explain(s, 6.75, 2.75, '營業額、現金、LINE Pay 分開列', [
    ['每小時營業額長條圖', '看出哪個時段最好賣'],
    ['熱賣排行與各品項數量', '切換今天或整個展期'],
    ['低庫存清單', '售完的標紅，提醒補貨'],
  ]);

  // 7 orders
  s = feature('6. 每筆交易一張卡片，退換貨有紀錄', 'cards');
  shot(s, 'ipad_orders', 0.6, 1.3, 3.75, IPAD);
  explain(s, 4.2, 5.3, '依日期與類型篩選，找單很快', [
    ['卡片寫明時間、品項、付款方式', '#6 14:50 現金 $800，對帳有依據'],
    ['打錯單按「作廢」', '卡片變灰保留，庫存自動回補'],
    ['客人退換按「退換貨」', '整單折扣按比例分攤，兩張單互相連結'],
  ]);

  // 8 cash
  s = feature('7. 零錢開店收攤各點一次，自動對帳', 'coins');
  shot(s, 'ipad_cash', 0.6, 1.3, 3.75, IPAD);
  explain(s, 4.2, 5.3, '營業中不用逐筆記面額', [
    ['各面額用 ＋／− 點數量', '開店零用金與收攤實點都能存'],
    ['應有現金自動加總', '零用金 + 現金收支 + 現金調整'],
    ['找錯錢、換零錢記一筆調整', '保留原因，差額有交代'],
  ]);

  // 9 matrix
  s = feature('8. 電腦上勾選規格，一次產生所有組合', 'grid');
  w = shot(s, 'ipad_matrix', 0.6, 1.3, 3.75, IPAD);
  explain(s, 4.2, 5.3, '咖啡豆 13 個組合，不用一筆一筆建', [
    ['品種 × 處理法 × 重量勾一勾', '按「產生組合」，已存在的自動略過'],
    ['表格直接填定價、活動價、庫存', '「目前」欄即時顯示剩餘數量'],
    ['組成功能共用庫存', '盒裝扣單包、套裝扣各品項'],
  ]);

  // 10 settings
  s = feature('9. 每個攤位依自己的做法開關功能', 'sliders');
  shot(s, 'ipad_settings', 0.6, 1.3, 3.75, IPAD);
  explain(s, 4.2, 5.3, '用不到的功能關掉，畫面更單純', [
    ['零錢、贈與、沖泡、預購可各自開關', '結帳畫面只出現有開的選項'],
    ['預購付款方式自選', '現場付全額、先付訂金、貨到付款'],
    ['滿額活動、滿額免運', '達門檻自動提醒、運費自動帶 0'],
  ]);

  // 11 privacy (no screenshot - cards)
  s = feature('10. 資料分開存放，展後下載 Excel 帶回家', 'lock');
  const pv = [
    ['一個 Google 帳號一個攤位', '只能讀寫自己的資料，朋友的攤位互不影響'],
    ['斷網照常結帳', '上方顯示離線中，恢復連線自動同步'],
    ['管理者只看銷售統計', '讀不到庫存與宅配收件資料，也不提供給他人'],
    ['下載 Excel、備份到 Google 雲端', '13 個工作表；也能存成自己雲端硬碟裡的試算表'],
  ];
  pv.forEach(([h, d], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.5 + col * 4.6, y = 1.35 + row * 1.85, ww = 4.4, hh = 1.65;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: ww, h: hh, rectRadius: 0.1, fill: { color: C.background1 }, line: { color: 'F3C9A3', width: 0.75 }, objectName: '隱私卡 ' + h });
    s.addText(h, { x: x + 0.25, y: y + 0.2, w: ww - 0.5, h: 0.45, fontSize: 17, bold: true, color: C.accent2, margin: 0, isTextBox: true });
    s.addText(d, { x: x + 0.25, y: y + 0.7, w: ww - 0.5, h: 0.8, fontSize: 14, color: C.text1, margin: 0, valign: 'top', isTextBox: true });
  });


  // 12 展後資料
  s = feature('加碼：展後資料，下次參展更好準備', 'next');
  const rows = [
    ['看哪個數字', '在哪裡', '下次怎麼用'],
    ['沖泡耗用量', '總結、Excel', '試飲要準備多少豆子，算進備貨量'],
    ['耗材準備與剩餘', '管理 → 耗材', '試飲杯、濾紙、手提袋帶多少剛好'],
    ['完售紀錄', '總結、Excel', '開賣多久就賣完的品項，下次多帶'],
    ['品項銷售曲線', '分析', '比較品種＋處理法的人氣，決定主打與數量'],
    ['整個展期各品項銷量', '總結、Excel', '照實際銷量配貨，少帶賣不動的'],
    ['缺貨改預購的紀錄', '預購單', '客人想買卻沒貨的品項，下次補足'],
    ['每小時營業額', '總結、Google 雲端', '尖峰時段多排人手、先補零錢'],
  ];
  s.addTable(rows.map((r, i) => r.map((c) => ({ text: c, options: i === 0
    ? { bold: true, color: 'FFFFFF', fill: { color: 'C85F0A' }, fontSize: 13, fontFace: FONT }
    : { color: '3B2412', fill: { color: i % 2 ? 'FFFFFF' : 'FDEBDB' }, fontSize: 12.5, fontFace: FONT } }))),
    { x: 0.5, y: 1.3, w: 9.0, colW: [2.3, 2.0, 4.7], border: { type: 'solid', pt: 0.5, color: 'F3C9A3' }, margin: [0.05, 0.1, 0.05, 0.1], valign: 'middle', objectName: '展後資料表' });
  s.addText('每場展覽的 Excel 或雲端試算表都留著，跨展一比就知道哪裡可以更好。', { x: 0.5, y: 4.6, w: 9.0, h: 0.45, fontSize: 13, bold: true, color: C.accent2, margin: 0, valign: 'middle', isTextBox: true });

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log('done');
})();
