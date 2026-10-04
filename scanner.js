/* 图匣 · 批量取图 —— 页面图片扫描器
 * 由 popup 通过 chrome.scripting.executeScript 注入。
 * 注入后挂载 window.__picxiaScan(opts)，返回 Promise<items[]>。
 * items: { url, w, h, from }  w/h 为 0 表示尺寸未知
 */
(function () {
  if (window.__picxiaScan) return; // 已注入过，直接复用

  var IMG_EXT = /\.(jpe?g|png|webp|gif|avif|bmp|svg)(?=[?#]|$)/i;

  function abs(u) {
    try { return new URL(u, location.href).href; } catch (e) { return null; }
  }

  // 从 srcset 里挑最大的一张
  function pickFromSrcset(srcset) {
    var best = null, bestScore = -1;
    srcset.split(',').forEach(function (part) {
      var seg = part.trim().split(/\s+/);
      if (!seg[0]) return;
      var score = 1;
      if (seg[1]) {
        var m = /^(\d+(?:\.\d+)?)([wx])$/.exec(seg[1]);
        if (m) score = m[2] === 'w' ? parseFloat(m[1]) : parseFloat(m[1]) * 1000;
      }
      if (score > bestScore) { bestScore = score; best = seg[0]; }
    });
    return best;
  }

  function collect(map) {
    function add(u, w, h, from) {
      if (!u || typeof u !== 'string') return;
      u = u.trim();
      if (!u || u.indexOf('data:') === 0 || u.indexOf('blob:') === 0) return;
      var a = abs(u);
      if (!a || !/^https?:/i.test(a)) return;
      var cur = map.get(a);
      if (!cur) map.set(a, { url: a, w: w || 0, h: h || 0, from: from });
      else if ((w * h) > (cur.w * cur.h)) { cur.w = w; cur.h = h; }
    }

    // 1) <img>：当前源 + 懒加载属性 + srcset
    document.querySelectorAll('img').forEach(function (img) {
      add(img.currentSrc || img.src, img.naturalWidth, img.naturalHeight, 'img');
      var lazy = [
        img.getAttribute('data-src'), img.getAttribute('data-original'),
        img.getAttribute('data-lazy-src'), img.getAttribute('data-lazysrc'),
        img.getAttribute('data-actual'), img.getAttribute('data-url'),
        img.getAttribute('data-img'), img.getAttribute('data-thumb')
      ];
      lazy.forEach(function (u) { add(u, 0, 0, 'lazy'); });
      var ds = img.getAttribute('data-srcset');
      if (ds) add(pickFromSrcset(ds), 0, 0, 'lazy');
      if (img.srcset) add(pickFromSrcset(img.srcset), img.naturalWidth, img.naturalHeight, 'img');
    });

    // 2) <source srcset>（<picture> 标签）
    document.querySelectorAll('source[srcset]').forEach(function (s) {
      add(pickFromSrcset(s.getAttribute('srcset')), 0, 0, 'picture');
    });

    // 3) 内联 style 的 background-image
    document.querySelectorAll('[style]').forEach(function (el) {
      var st = el.getAttribute('style') || '';
      if (st.indexOf('background') === -1) return;
      var m = /background-image\s*:\s*url\(\s*(['"]?)(.*?)\1\s*\)/i.exec(st);
      if (m) add(m[2], 0, 0, 'bg');
    });

    // 4) 计算样式的背景图（限量，防卡页面）
    var els = document.querySelectorAll('div,span,a,li,figure,section,i,b,em,p,h1,h2,h3,h4');
    var n = Math.min(els.length, 600);
    for (var i = 0; i < n; i++) {
      var bg = getComputedStyle(els[i]).backgroundImage;
      if (bg && bg !== 'none') {
        var m2 = /url\(\s*["']?(.*?)["']?\s*\)/.exec(bg);
        if (m2) add(m2[1], 0, 0, 'bg');
      }
    }

    // 5) 直指图片文件的 <a> 链接（原图入口）
    document.querySelectorAll('a[href]').forEach(function (a) {
      if (IMG_EXT.test(a.href)) add(a.href, 0, 0, 'link');
    });
  }

  // 触发懒加载：分段滚到底再滚回顶部
  function autoScroll() {
    return new Promise(function (resolve) {
      var step = Math.max(window.innerHeight, 400);
      var y = 0, rounds = 0, maxRounds = 40;
      var timer = setInterval(function () {
        y += step; rounds++;
        window.scrollTo(0, y);
        if (y >= document.documentElement.scrollHeight || rounds >= maxRounds) {
          clearInterval(timer);
          setTimeout(function () { window.scrollTo(0, 0); resolve(); }, 600);
        }
      }, 300);
    });
  }

  // 并发加载探尺寸（只探未知的）
  function probeDims(items) {
    var unknown = items.filter(function (it) { return !it.w || !it.h; });
    var queue = unknown.slice(0, 400); // 封顶，防极端页面
    var idx = 0, CONC = 8;
    function worker() {
      if (idx >= queue.length) return Promise.resolve();
      var it = queue[idx++];
      return new Promise(function (res) {
        var im = new Image();
        var done = false;
        var t = setTimeout(function () { if (!done) { done = true; res(); } }, 4000);
        im.onload = function () {
          if (!done) { done = true; clearTimeout(t); it.w = im.naturalWidth; it.h = im.naturalHeight; res(); }
        };
        im.onerror = function () { if (!done) { done = true; clearTimeout(t); res(); } };
        im.src = it.url;
      }).then(worker);
    }
    var workers = [];
    for (var i = 0; i < CONC; i++) workers.push(worker());
    return Promise.all(workers);
  }

  window.__picxiaScan = function (opts) {
    opts = opts || {};
    var map = new Map();
    var p = opts.scroll ? autoScroll() : Promise.resolve();
    return p.then(function () {
      collect(map);
      var items = Array.from(map.values());
      if (items.length > 800) items = items.slice(0, 800);
      return probeDims(items).then(function () { return items; });
    });
  };
})();
