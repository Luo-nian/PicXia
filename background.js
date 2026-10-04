/* 图匣 后台 service worker：串行下载队列 */
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg && msg.type === 'download') {
    runQueue(msg.items || [], msg.folder || '图匣').then(function (r) {
      sendResponse({ ok: true, done: r.done, failed: r.failed });
    });
    return true; // 异步 sendResponse
  }
});

function extOf(url) {
  var m = /\.(jpe?g|png|webp|gif|avif|bmp|svg)(?=[?#]|$)/i.exec(url);
  return m ? '.' + m[1].toLowerCase().replace('jpeg', 'jpg') : '.jpg';
}

async function runQueue(items, folder) {
  var done = 0, failed = 0;
  for (var i = 0; i < items.length; i++) {
    var filename = folder + '/img_' + String(i + 1).padStart(3, '0') + extOf(items[i].url);
    try {
      await chrome.downloads.download({
        url: items[i].url,
        filename: filename,
        conflictAction: 'uniquify',
        saveAs: false
      });
      done++;
    } catch (e) {
      failed++;
    }
    // 间隔一下，避免触发站点限流 / 浏览器卡顿
    await new Promise(function (r) { setTimeout(r, 250); });
  }
  return { done: done, failed: failed };
}
