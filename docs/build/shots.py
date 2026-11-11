# 系統優點簡報用截圖：用假資料（tests/mock）跑真實畫面，輸出到 docs/shots/
# 先：npx vite build -c tests/vite.mock.config.js && npx vite preview -c tests/vite.mock.config.js --port 4173
# 再：python3 docs/build/shots.py   （需要 playwright 與 Chrome）
import random, sys, os
from datetime import datetime, timezone, timedelta
from playwright.sync_api import sync_playwright

URL = 'http://localhost:4173/expo-pos/'
OUT = os.path.join(os.path.dirname(__file__), '..', 'shots')
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
TW = timezone(timedelta(hours=8))
def ts(d, h, m=0): return int(datetime(2026, 11, d, h, m, tzinfo=TW).timestamp() * 1000)
NOW = ts(14, 16, 40)  # 畫面上的「現在」：南港展第二天下午

P = 'shops/leo'
random.seed(7)
seed = {
  P: {'name': '琥珀社咖啡莊園', 'consentAt': 1, 'currentEventId': 'ev1', 'settings': {'themeColor': '#F58220', 'promos': [{'id': 'p1', 'threshold': 1500, 'text': '滿 1500 送濾掛 1 包'}]},
      'onboard': {'done': 5, 'total': 5}},
  P + '/optionLists/variety': {'name': '品種', 'values': ['SL-34', '波旁', '藝伎'], 'order': 0},
  P + '/optionLists/process': {'name': '處理法', 'values': ['水洗', '日曬', '厭氧水洗'], 'order': 1},
  P + '/optionLists/weight': {'name': '重量', 'values': ['1/4磅', '1/2磅'], 'order': 2},
  P + '/optionLists/pack': {'name': '包裝', 'values': ['單包', '一盒'], 'order': 3},
  P + '/products/bean': {'name': '咖啡豆', 'category': '咖啡豆', 'unit': '包', 'levels': ['variety', 'process', 'weight'], 'trackStock': True, 'order': 0},
  P + '/products/drip': {'name': '濾掛', 'category': '濾掛', 'unit': '包', 'levels': ['process'], 'trackStock': True, 'order': 1},
  P + '/products/flower': {'name': '咖啡花茶', 'category': '咖啡周邊茶', 'unit': '包', 'levels': [], 'trackStock': True, 'order': 2},
  P + '/products/peel': {'name': '咖啡果皮茶', 'category': '咖啡周邊茶', 'unit': '包', 'levels': [], 'trackStock': True, 'order': 3},
  P + '/products/oil': {'name': '苦茶油', 'category': '其他', 'unit': '瓶', 'levels': [], 'trackStock': True, 'order': 4},
  P + '/products/pour': {'name': '手沖一杯', 'category': '現場飲品', 'unit': '杯', 'levels': [], 'trackStock': False, 'order': 5},
  P + '/events/ev1': {'name': '2026 南港咖啡展', 'start': '2026-11-13', 'end': '2026-11-16', 'expoId': 'x1',
                      'hours': {'open': '10:00', 'close': '18:00', 'days': {'2026-11-16': {'open': '10:00', 'close': '17:00'}}}},
  'expos/x1': {'name': '2026 南港咖啡展', 'start': '2026-11-13', 'end': '2026-11-16', 'hours': {'open': '10:00', 'close': '18:00', 'days': {}}, 'createdBy': 'leo'},
  'expos/x2': {'name': '2026 台中咖啡節', 'start': '2026-12-05', 'end': '2026-12-07', 'hours': {'open': '10:00', 'close': '18:00', 'days': {}}, 'createdBy': 'amy'},
}
skus = []  # (id, productId, opts, price, init, active, openTs)
n = 0
for v, base in [('SL-34', 380), ('波旁', 350), ('藝伎', 680)]:
  for pr in ['水洗', '日曬', '厭氧水洗']:
    for w in ['1/4磅', '1/2磅']:
      n += 1
      price = base + (60 if pr == '厭氧水洗' else 0)
      price = price if w == '1/4磅' else price * 2 - 60
      active = not (v == '藝伎' and pr == '厭氧水洗')
      init = 8 if (v, pr, w) == ('SL-34', '日曬', '1/4磅') else 18
      opened = ts(14, 13) if (v == '藝伎' and pr == '日曬') else ts(13, 9)
      skus.append((f'b{n}', 'bean', [v, pr, w], price, init, active, opened))
skus += [('d1', 'drip', ['水洗'], 40, 60, True, ts(13, 9)), ('d2', 'drip', ['日曬'], 45, 60, True, ts(13, 9)),
         ('f1', 'flower', [], 250, 15, True, ts(13, 9)), ('f2', 'peel', [], 220, 15, True, ts(13, 9)),
         ('o1', 'oil', [], 480, 12, True, ts(13, 9)), ('c1', 'pour', [], 120, 0, True, ts(13, 9))]
for i, (sid, pid, opts, price, init, active, opened) in enumerate(skus):
  seed[f'{P}/skus/{sid}'] = {'productId': pid, 'opts': opts, 'price': price, 'order': i, 'active': active,
                             'activeLog': [{'ts': opened, 'on': True}] if active else []}
  if pid != 'pour': seed[f'{P}/events/ev1/stock/{sid}'] = {'initial': init}

names = {'bean': '咖啡豆', 'drip': '濾掛', 'flower': '咖啡花茶', 'peel': '咖啡果皮茶', 'oil': '苦茶油', 'pour': '手沖一杯'}
cats = {'bean': '咖啡豆', 'drip': '濾掛', 'flower': '咖啡周邊茶', 'peel': '咖啡周邊茶', 'oil': '其他', 'pour': '現場飲品'}
left = {s[0]: s[4] for s in skus}
pop = {'b3': 9, 'b1': 4, 'b9': 4, 'b4': 3, 'b2': 3, 'b7': 3, 'b5': 2, 'b8': 2, 'b13': 2, 'b14': 1, 'b15': 3, 'b16': 2, 'b10': 1, 'd1': 6, 'd2': 5, 'f1': 3, 'f2': 2, 'o1': 2, 'c1': 6}
pool = [k for k, wgt in pop.items() for _ in range(wgt)]
skuInfo = {s[0]: s for s in skus}
oid = 0
def order(t, lines, method):
  global oid
  oid += 1
  items, total = [], 0
  for sid, q in lines:
    s = skuInfo[sid]
    if s[1] != 'pour':
      q = min(q, left[sid])
      if q <= 0: continue
      left[sid] -= q
    if s[1] == 'bean' and s[0] in ('b13', 'b14') and t < s[6]: continue
    nm = names[s[1]] + ('・' + '・'.join(s[2]) if s[2] else '')
    items.append({'skuId': sid, 'name': nm, 'category': cats[s[1]], 'qty': q, 'listPrice': s[3], 'price': s[3]})
    total += s[3] * q
  if not items: return
  day = datetime.fromtimestamp(t / 1000, TW).strftime('%Y-%m-%d')
  money = {'method': method, 'amount': total}
  if method == 'cash':
    rec = total if random.random() < 0.3 else ((total // 500) + 1) * 500 if total % 500 else total
    money.update({'received': rec, 'change': rec - total})
  o = {'type': 'sale', 'ts': t, 'day': day, 'device': 'ipad01', 'status': 'normal', 'items': items, 'rets': [], 'subtotal': total,
       'discountAmt': 0, 'shippingFee': 0, 'total': total, 'money': money, 'refOrderId': None, 'note': ''}
  if total >= 1500: o['promos'] = [{'id': 'p1', 'text': '滿 1500 送濾掛 1 包', 'count': 1}]
  seed[f'{P}/events/ev1/orders/o{oid:03d}'] = o

for d, hours in [(13, range(10, 18)), (14, range(10, 17))]:
  for h in hours:
    k = {10: 3, 11: 5, 12: 4, 13: 6, 14: 8, 15: 7, 16: 5, 17: 3}[h]
    for _ in range(k):
      m = random.randint(0, 59)
      t = ts(d, h, m)
      if t > NOW: continue
      lines = {}
      for _ in range(random.choice([1, 1, 2, 2, 3])):
        sid = random.choice(pool); lines[sid] = lines.get(sid, 0) + 1
      order(t, list(lines.items()), 'cash' if random.random() < 0.65 else 'linepay')
# 一筆贈與、沖泡
seed[f'{P}/events/ev1/orders/g1'] = {'type': 'gift', 'ts': ts(14, 11, 20), 'day': '2026-11-14', 'status': 'normal', 'items': [{'skuId': 'd1', 'name': '濾掛・水洗', 'category': '濾掛', 'qty': 2, 'listPrice': 40, 'price': 40}], 'rets': [], 'subtotal': 0, 'total': 0, 'money': None, 'gift': {'to': '客人', 'note': '試喝'}}
seed[f'{P}/events/ev1/orders/w1'] = {'type': 'brew', 'ts': ts(14, 10, 5), 'day': '2026-11-14', 'status': 'normal', 'items': [{'skuId': 'b2', 'name': '咖啡豆・SL-34・水洗・1/2磅', 'category': '咖啡豆', 'qty': 1, 'listPrice': 700, 'price': 0}], 'rets': [], 'subtotal': 0, 'total': 0, 'money': None}
seed[f'{P}/events/ev1/cashCounts/2026-11-14_open'] = {'day': '2026-11-14', 'kind': 'open', 'counts': {'1000': 2, '500': 4, '100': 20, '50': 10, '10': 30, '5': 10}, 'ts': ts(14, 9, 40)}

def run(fn):
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    ctx = b.new_context(viewport={'width': 768, 'height': 1024})
    pg = ctx.new_page()
    pg.clock.set_fixed_time(datetime.fromtimestamp(NOW / 1000, TW))
    pg.on('pageerror', lambda e: print('ERR', e))
    pg.goto(URL); pg.wait_for_timeout(800)
    pg.evaluate('(seed)=>{for(const [k,v] of Object.entries(seed)) window.__fs.set(k,v)}', seed)
    pg.get_by_role('button').first.click(); pg.wait_for_timeout(1500)
    fn(pg)
    b.close()

def shot(pg, name, full=False):
  pg.wait_for_timeout(900)
  pg.screenshot(path=os.path.join(OUT, name + '.jpg'), type='jpeg', quality=88, full_page=full)
  print('shot', name)

def go(pg, hash):
  pg.goto(URL + '#' + hash); pg.wait_for_timeout(1200)
  pg.evaluate("document.querySelectorAll('*').forEach((e) => { if (e.scrollTop) e.scrollTop = 0 }); window.scrollTo(0, 0)")
  b = pg.get_by_role('button', name='收起')
  if b.count(): b.first.click(); pg.wait_for_timeout(200)

def cat(pg, name):
  pg.locator('.tabs.scroll button', has_text=name).first.click(); pg.wait_for_timeout(300)

def prod(pg, name):
  pg.locator('.grid .pbtn', has_text=name).first.click(); pg.wait_for_timeout(400)

def ipad(pg):
  # 收銀
  go(pg, '/')
  shot(pg, 'ipad_pos')
  cat(pg, '咖啡豆'); prod(pg, '咖啡豆')
  pg.locator('.modal .pbtn', has_text='SL-34').click(); pg.wait_for_timeout(300)
  pg.locator('.modal .pbtn', has_text='日曬').first.click(); pg.wait_for_timeout(300)
  pg.locator('.modal .pbtn').nth(1).click(); pg.wait_for_timeout(300)
  cat(pg, '濾掛'); prod(pg, '濾掛')
  pg.locator('.modal .pbtn').first.click(); pg.wait_for_timeout(300)
  pg.locator('.modal .pbtn').first.click() if pg.locator('.modal').count() else None
  pg.wait_for_timeout(300)
  shot(pg, 'ipad_cart1')
  pg.get_by_role('button', name='新增客人').click(); pg.wait_for_timeout(400)
  cat(pg, '咖啡周邊茶'); prod(pg, '咖啡花茶'); prod(pg, '咖啡花茶'); prod(pg, '咖啡果皮茶')
  shot(pg, 'ipad_cart2')
  # 未開賣
  cat(pg, '咖啡豆'); prod(pg, '咖啡豆')
  pg.locator('.modal .pbtn', has_text='藝伎').click(); pg.wait_for_timeout(500)
  shot(pg, 'ipad_waiting')
  pg.locator('.modal .pbtn', has_text='厭氧水洗').click(); pg.wait_for_timeout(300)
  pg.locator('.modal .pbtn').first.click(); pg.wait_for_timeout(500)
  shot(pg, 'ipad_waiting2')
  pg.get_by_role('button', name='取消').click(); pg.wait_for_timeout(300)
  pg.get_by_role('button', name='結帳').first.click(); pg.wait_for_timeout(500)
  pg.get_by_role('button', name='＋1000').first.click(); pg.wait_for_timeout(500)
  shot(pg, 'ipad_checkout')
  go(pg, '/summary'); shot(pg, 'ipad_summary')
  pg.mouse.wheel(0, 900); shot(pg, 'ipad_summary2')
  go(pg, '/orders'); shot(pg, 'ipad_orders')
  go(pg, '/cash'); shot(pg, 'ipad_cash')
  go(pg, '/analysis'); pg.wait_for_timeout(2500); shot(pg, 'ipad_analysis')
  go(pg, '/admin?tab=0')
  pg.locator('text=個組合').first.click(); pg.wait_for_timeout(600)
  pg.mouse.wheel(0, 380); shot(pg, 'ipad_matrix')
  go(pg, '/admin?tab=1'); shot(pg, 'ipad_lists')
  go(pg, '/admin?tab=2'); pg.mouse.wheel(0, 640); shot(pg, 'ipad_events')
  go(pg, '/admin?tab=5'); shot(pg, 'ipad_settings')

def phone(pg):
  pg.set_viewport_size({'width': 375, 'height': 812})
  go(pg, '/'); shot(pg, 'phone_pos')
  cat(pg, '咖啡豆'); prod(pg, '咖啡豆')
  shot(pg, 'phone_pick1')
  pg.locator('.modal .pbtn', has_text='SL-34').click(); pg.wait_for_timeout(300)
  shot(pg, 'phone_pick2')

if __name__ == '__main__':
  which = sys.argv[1:] or ['ipad', 'phone']
  if 'ipad' in which: run(ipad)
  if 'phone' in which: run(phone)
