/* 图匣 popup 逻辑 */
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var grid = $('#grid'), stat = $('#stat'), empty = $('#empty'), emptyMsg = $('#emptyMsg');
  var dlBtn = $('#download'), toast = $('#toast');

  var all = [];          // 扫描到的全部图片
  var selected = {};     // url -> true
  var scanning = false;

  function extOf(url) {
    var m = /\.(jpe?g|png|webp|gif|avif|bmp|svg)(?=[?#]|$)/i.exec(url);
    if (!m) return 'other';
    var e = m[1].toLowerCase();
    return e === 'jpeg' ? 'jpg' : e;
  }

  function fmtOf(url) {
    var e = extOf(url);
    return e === 'bmp' ? 'other' : e;
  }

  function activeFormats() {
    var set = {};
    document.querySelectorAll('#formats input[type=checkbox]').forEach(function (cb) {
      if (cb.checked) set[cb.value] = true;
    });
    return set;
  }

  function filtered() {
    var kw = $('#kw').value.trim().toLowerCase();
    var minW = parseInt($('#minW').value, 10) || 0;
    var fmts = activeFormats();
    return all.filter(function (it) {
      if (!fmts[fmtOf(it.url)]) return false;
      if (kw && it.url.toLowerCase().indexOf(kw) === -1) return false;
      // 尺寸已知的按门槛过滤；未知的(w=0)保留，交给用户判断
      if (it.w && it.h && (it.w < minW || it.h < minW)) return false;
      return true;
    });
  }

  function showToast(msg, ms) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toast.classList.add('hidden'); }, ms || 2200);
  }

  function updateStat(list) {
    var selCount = 0;
    list.forEach(function (it) { if (selected[it.url]) selCount++; });
    stat.textContent = '共 ' + all.length + ' 张 · 显示 ' + list.length + ' · 已选 ' + selCount;
    dlBtn.disabled = selCount === 0;
    dlBtn.textContent = selCount ? '下载所选 (' + selCount + ')' : '下载所选';
  }

  // 原地刷新选中态，不重建网格（避免图片重载闪烁）
  function paintSel() {
    var cards = grid.children;
    for (var i = 0; i < cards.length; i++) {
      var u = cards[i].dataset.url;
      cards[i].classList.toggle('sel', !!selected[u]);
    }
    updateStat(filtered());
  }

  function buildCard(it) {
    var card = document.createElement('div');
    card.className = 'card' + (selected[it.url] ? ' sel' : '');
    card.title = it.url;
    card.dataset.url = it.url;

    var img = document.createElement('img');
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer'; // 绕开大部分防盗链
    img.src = it.url;
    img.onerror = function () {
      // 加载失败不隐藏卡片，换占位块，仍可勾选/下载
      if (card.classList.contains('noimg')) return;
      card.classList.add('noimg');
      var ph = document.createElement('div');
      ph.className = 'ph';
      ph.textContent = extOf(it.url).toUpperCase();
      card.insertBefore(ph, card.firstChild);
    };
    card.appendChild(img);

    var badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = '✓';
    card.appendChild(badge);

    var ext = document.createElement('span');
    ext.className = 'ext';
    ext.textContent = extOf(it.url).toUpperCase();
    card.appendChild(ext);

    var meta = document.createElement('div');
    meta.className = 'meta';
    var dim = document.createElement('span');
    dim.textContent = it.w ? it.w + '×' + it.h : '未知尺寸';
    var ops = document.createElement('span');
    var open = document.createElement('span');
    open.className = 'open'; open.textContent = '↗'; open.title = '新标签页打开原图';
    open.onclick = function (e) { e.stopPropagation(); window.open(it.url, '_blank'); };
    var dl = document.createElement('span');
    dl.className = 'dl'; dl.textContent = '↓'; dl.title = '下载这一张';
    dl.onclick = function (e) {
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: 'download', items: [it], folder: folderName() });
      showToast('已提交 1 张下载');
    };
    ops.appendChild(open); ops.appendChild(dl);
    meta.appendChild(dim); meta.appendChild(ops);
    card.appendChild(meta);

    card.onclick = function () {
      if (selected[it.url]) delete selected[it.url];
      else selected[it.url] = true;
      card.classList.toggle('sel');
      updateStat(filtered());
    };
    return card;
  }

  function render() {
    var list = filtered();
    grid.innerHTML = '';
    empty.classList.toggle('hidden', list.length > 0 || scanning);
    if (!scanning && list.length === 0) {
      emptyMsg.textContent = all.length === 0 ? '这一页没扫到图片' : '过滤后没有剩余图片';
    }
    list.forEach(function (it) { grid.appendChild(buildCard(it)); });
    updateStat(list);
  }

  function folderName() {
    var d = new Date();
    function p(n) { return String(n).padStart(2, '0'); }
    var stamp = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
    var host = (folderName._host || 'page').replace(/[\\/:*?"<>|]/g, '_');
    return '图匣/' + host + '_' + stamp;
  }

  function scan() {
    if (scanning) return;
    scanning = true;
    all = []; selected = {};
    stat.textContent = '扫描中…';
    grid.innerHTML = '';
    empty.classList.add('hidden');

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab || !/^https?:/.test(tab.url || '')) {
        scanning = false;
        stat.textContent = '';
        empty.classList.remove('hidden');
        emptyMsg.textContent = '这个页面不支持抓取（浏览器内部页 / 商店页）';
        return;
      }
      try { folderName._host = new URL(tab.url).hostname; } catch (e) { folderName._host = 'page'; }

      var opts = { scroll: $('#autoScroll').checked };
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['scanner.js']
      }, function () {
        if (chrome.runtime.lastError) return fail(chrome.runtime.lastError.message);
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: function (o) { return window.__picxiaScan(o); },
          args: [opts]
        }, function (results) {
          scanning = false;
          if (chrome.runtime.lastError) return fail(chrome.runtime.lastError.message);
          all = (results && results[0] && results[0].result) || [];
          // 默认全选
          all.forEach(function (it) { selected[it.url] = true; });
          render();
        });
      });

      function fail(msg) {
        scanning = false;
        stat.textContent = '';
        empty.classList.remove('hidden');
        emptyMsg.textContent = '注入失败：' + msg;
      }
    });
  }

  // 事件绑定：选区操作一律原地刷新，不重建网格
  $('#selAll').onclick = function () { filtered().forEach(function (it) { selected[it.url] = true; }); paintSel(); };
  $('#selNone').onclick = function () { selected = {}; paintSel(); };
  $('#selInv').onclick = function () {
    filtered().forEach(function (it) {
      if (selected[it.url]) delete selected[it.url]; else selected[it.url] = true;
    });
    paintSel();
  };
  $('#rescan').onclick = scan;
  $('#kw').oninput = render;
  $('#minW').onchange = render;
  document.querySelectorAll('#formats input').forEach(function (cb) { cb.onchange = render; });

  dlBtn.onclick = function () {
    var items = filtered().filter(function (it) { return selected[it.url]; });
    if (!items.length) return;
    chrome.runtime.sendMessage({ type: 'download', items: items, folder: folderName() }, function (resp) {
      if (resp && resp.ok) showToast('已提交 ' + items.length + ' 张，后台下载中（目录：下载/' + folderName() + '）', 3500);
      else showToast('提交失败，请重试');
    });
  };

  scan();
})();
