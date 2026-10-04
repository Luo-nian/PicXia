/* 图匣 E2E：真实 Edge + CDP 自动化测试
 * 跑法: node tests/e2e.mjs
 * 覆盖:
 *  1) scanner.js 在真实页面上的提取（img/lazy data-src/picture/bg/直链a/滚动）
 *  2) popup UI：缩略图加载、404 占位、全选/清空不重建网格、关键词过滤、真实下载
 */
import { spawn, execSync } from 'node:child_process';
import { readFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'tests', 'site');
const TMP = path.join(ROOT, 'tests', 'tmp');
const DL = path.join(TMP, 'dl');
const PROFILE = path.join(TMP, 'edge-profile');
mkdirSync(DL, { recursive: true });

const HTTP_PORT = 8777;
const CDP_PORT = 9333;
const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => existsSync(p));

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- 小 CDP 客户端 ----------
let msgId = 0;
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    ws.onopen = () => resolve({
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const id = ++msgId;
          pending.set(id, { res, rej });
          ws.send(JSON.stringify({ id, method, params }));
        });
      },
      close() { ws.close(); }
    });
    ws.onerror = reject;
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id);
        pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      }
    };
  });
}
async function evaluate(cdp, expr) {
  const r = await cdp.send('Runtime.evaluate', {
    expression: expr, awaitPromise: true, returnByValue: true
  });
  if (r.exceptionDetails) throw new Error('页面内执行出错: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
}
async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await sleep(300);
  }
  throw new Error('等待超时: ' + label);
}
async function httpJson(url, method = 'GET') {
  const r = await fetch(url, { method });
  return r.json();
}

// ---------- 启动 ----------
const py = spawn('C:/Users/Hasee/.workbuddy/binaries/python/versions/3.13.12/python.exe',
  ['-m', 'http.server', String(HTTP_PORT), '--bind', '127.0.0.1'], { cwd: SITE, stdio: 'ignore' });

if (!EDGE) { console.log('FAIL  找不到 Edge'); process.exit(1); }
const edge = spawn(EDGE, [
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${PROFILE}`,
  '--no-first-run', '--no-default-browser-check', '--no-proxy-server',
  `--disable-extensions-except=${ROOT}`,
  `--load-extension=${ROOT}`,
  '--start-minimized',  // Edge 的 headless=new 不加载扩展，只能有头；跑完自动杀
  'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });
edge.stderr.on('data', d => { const s = String(d).trim(); if (s) console.log('[edge]', s.slice(0, 200)); });
edge.on('exit', c => console.log('[edge] exited, code =', c));

function cleanup() {
  try { edge.kill(); } catch {}
  try { py.kill(); } catch {}
  try { execSync('taskkill /F /IM msedge.exe /FI "WINDOWTITLE eq about:blank*" 2>nul', { stdio: 'ignore' }); } catch {}
}
process.on('exit', cleanup);

try {
  // 等 CDP 起来
  let ver = null;
  await waitFor(async () => {
    try { ver = await httpJson(`http://127.0.0.1:${CDP_PORT}/json/version`); return ver; }
    catch { return null; }
  }, 20000, 'CDP 端口');
  console.log('Edge 已起:', ver.Browser);

  // 找扩展 id（background service worker 目标）
  const targets = await waitFor(async () => {
    const list = await httpJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
    return list.find(t => t.url.includes('chrome-extension://') && t.url.includes('background.js')) ? list : null;
  }, 15000, '扩展 service worker');
  const swTarget = targets.find(t => t.url.includes('chrome-extension://') && t.url.includes('background.js'));
  const EXT_ID = new URL(swTarget.url).host;
  console.log('扩展 ID:', EXT_ID);

  // 下载目录改到 tests/tmp/dl
  const browser = await connect(ver.webSocketDebuggerUrl);
  await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });

  // ---------- 第 1 轮: scanner 在真实页面 ----------
  const page = await httpJson(`http://127.0.0.1:${CDP_PORT}/json/new?http://127.0.0.1:${HTTP_PORT}/test.html`, 'PUT');
  const tab = await connect(page.webSocketDebuggerUrl);
  await tab.send('Runtime.enable');
  await waitFor(() => evaluate(tab, 'document.readyState === "complete"'), 10000, '测试页加载');
  await sleep(1200); // 等图都加载完

  const scannerSrc = readFileSync(path.join(ROOT, 'scanner.js'), 'utf8');
  const items = await evaluate(tab,
    `${scannerSrc}; window.__picxiaScan({scroll:false})`);

  const urls = items.map(i => i.url);
  const has = name => urls.some(u => u.endsWith('/' + name));
  check('扫描: 普通 img (big.jpg, mid.png)', has('big.jpg') && has('mid.png'));
  check('扫描: 懒加载 data-src (lazy-real.jpg)', has('lazy-real.jpg'));
  check('扫描: picture/source srcset (pic-source.webp)', has('pic-source.webp'));
  check('扫描: 内联背景图 (bg.png)', has('bg.png'));
  check('扫描: 直链 a (linked.jpg)', has('linked.jpg'));
  check('扫描: 底部图 (bottom.jpg)', has('bottom.jpg'));

  const big = items.find(i => i.url.endsWith('/big.jpg'));
  check('尺寸: big.jpg = 1200x800', big && big.w === 1200 && big.h === 800, big ? `${big.w}x${big.h}` : 'not found');
  const linked = items.find(i => i.url.endsWith('/linked.jpg'));
  check('探针: linked.jpg 未知尺寸已探测', linked && linked.w === 900, linked ? `${linked.w}x${linked.h}` : 'not found');
  const dup = urls.filter(u => u.endsWith('/mid.png')).length;
  check('去重: mid.png 只出现一次', dup === 1, `x${dup}`);

  // 滚动模式不崩
  const items2 = await evaluate(tab, `window.__picxiaScan({scroll:true})`);
  check('滚动扫描: 不崩且数量不少', Array.isArray(items2) && items2.length >= items.length);

  // ---------- 第 2 轮: popup UI ----------
  // 用 addScriptToEvaluateOnNewDocument 打桩 chrome.tabs.query / executeScript
  const stubItems = [
    { url: `http://127.0.0.1:${HTTP_PORT}/big.jpg`, w: 1200, h: 800, from: 'img' },
    { url: `http://127.0.0.1:${HTTP_PORT}/mid.png`, w: 640, h: 480, from: 'img' },
    { url: `http://127.0.0.1:${HTTP_PORT}/pic-source.webp`, w: 700, h: 500, from: 'picture' },
    { url: `http://127.0.0.1:${HTTP_PORT}/no-such-img.png`, w: 0, h: 0, from: 'link' } // 404 → 占位块
  ];
  const stub = `
    (function(){
      var items = ${JSON.stringify(stubItems)};
      chrome.tabs.query = function(q, cb){ cb([{id:-1, url:'http://127.0.0.1:${HTTP_PORT}/test.html'}]); };
      chrome.scripting = { executeScript: function(opts, cb){
        if (opts.files) { cb && cb([]); return; }
        cb && cb([{result: items}]);
      }};
    })();`;

  const pop = await httpJson(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, 'PUT');
  const ptab = await connect(pop.webSocketDebuggerUrl);
  await ptab.send('Page.enable');
  await ptab.send('Page.addScriptToEvaluateOnNewDocument', { source: stub });
  await ptab.send('Page.navigate', { url: `chrome-extension://${EXT_ID}/popup.html` });
  // 激活标签页，避免后台节流导致 lazy 缩略图不加载
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/activate/${pop.id}`, { method: 'PUT' }).catch(() => {});

  await waitFor(() => evaluate(ptab, `document.querySelectorAll('#grid .card').length === 4`),
    10000, 'popup 渲染 4 张卡片');
  check('popup: 渲染 4 张卡片', true);
  await sleep(5000); // 等缩略图加载/失败

  const imgDiag = await evaluate(ptab, `
    [...document.querySelectorAll('#grid .card img')].map(i =>
      ({src: i.src.slice(-30), complete: i.complete, nw: i.naturalWidth, rp: i.referrerPolicy}))`);
  console.log('缩略图诊断:', JSON.stringify(imgDiag, null, 1));

  const okImgs = await evaluate(ptab,
    `[...document.querySelectorAll('#grid .card img')].filter(i => i.naturalWidth > 0).length`);
  check('popup: 3 张缩略图真实加载成功', okImgs === 3, `ok=${okImgs}`);
  const phCount = await evaluate(ptab, `document.querySelectorAll('#grid .card.noimg .ph').length`);
  check('popup: 404 图显示占位块而非消失', phCount === 1, `ph=${phCount}`);
  const stat1 = await evaluate(ptab, `document.querySelector('#stat').textContent`);
  check('popup: 默认全选', stat1.includes('已选 4'), stat1);

  // 全选/清空不重建网格（卡片元素引用不变 = 不闪）
  await evaluate(ptab, `window.__c0 = document.querySelector('#grid .card'); document.querySelector('#selNone').click(); true`);
  const stat2 = await evaluate(ptab, `document.querySelector('#stat').textContent`);
  check('清空: 已选 0 且下载按钮禁用',
    stat2.includes('已选 0') && await evaluate(ptab, `document.querySelector('#download').disabled`));
  await evaluate(ptab, `document.querySelector('#selAll').click(); true`);
  const sameNode = await evaluate(ptab, `window.__c0 === document.querySelector('#grid .card')`);
  check('全选: 网格未重建（元素引用不变）', sameNode);
  const stat3 = await evaluate(ptab, `document.querySelector('#stat').textContent`);
  check('全选: 已选 4', stat3.includes('已选 4'), stat3);

  // 关键词过滤
  await evaluate(ptab, `
    var kw = document.querySelector('#kw');
    kw.value = 'big'; kw.dispatchEvent(new Event('input')); true`);
  const afterKw = await evaluate(ptab, `document.querySelectorAll('#grid .card').length`);
  check('过滤: 关键词 big → 只剩 1 张', afterKw === 1, `cards=${afterKw}`);
  await evaluate(ptab, `var kw=document.querySelector('#kw'); kw.value=''; kw.dispatchEvent(new Event('input')); true`);

  // 格式过滤：关掉 webp → 3 张
  await evaluate(ptab, `
    var cb = [...document.querySelectorAll('#formats input')].find(c => c.value === 'webp');
    cb.checked = false; cb.dispatchEvent(new Event('change')); true`);
  const afterFmt = await evaluate(ptab, `document.querySelectorAll('#grid .card').length`);
  check('过滤: 关掉 webp → 剩 3 张', afterFmt === 3, `cards=${afterFmt}`);
  await evaluate(ptab, `
    var cb = [...document.querySelectorAll('#formats input')].find(c => c.value === 'webp');
    cb.checked = true; cb.dispatchEvent(new Event('change')); true`);

  // 真实下载（只留 1 张选中：清空后点第一张卡片）
  await evaluate(ptab, `
    document.querySelector('#selNone').click();
    document.querySelector('#grid .card').click();
    document.querySelector('#download').click(); true`);
  const dl = await waitFor(async () => {
    const r = await evaluate(ptab,
      `new Promise(res => chrome.downloads.search({limit: 5, orderBy: ['-startTime']}, res))`);
    return r && r.length ? r[0] : null;
  }, 10000, '下载记录出现');
  // 注：测试用 setDownloadBehavior 改了下载目录，filename 只留 basename，属测试环境行为
  check('下载: chrome.downloads 已创建', !!dl.id, dl.filename);

  await sleep(1500);
  const files = readdirSync(DL, { recursive: true }).map(String);
  const got = files.filter(f => f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.webp'));
  check('下载: 文件落盘到指定目录', got.length >= 1, got.join(', '));

  await browser.close(); tab.close(); ptab.close();
} catch (e) {
  check('运行过程', false, e.message);
} finally {
  cleanup();
}

const fails = results.filter(r => !r.ok);
console.log(`\n===== ${results.length - fails.length}/${results.length} 通过 =====`);
process.exit(fails.length ? 1 : 0);
