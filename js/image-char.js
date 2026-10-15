// 画像キャラ：images フォルダの全身画像を差し替えて口パク・まばたきさせる
//   ファイル名: images/<表情>_<口の状態>.png
//   表情: normal smile angry think sad surprise
//   口の状態: closed（口閉じ・必須） half（半開き・任意） open（口開き） blink（まばたき・任意）
(function () {
  'use strict';

  var FRAMES = ['closed', 'half', 'open', 'blink'];
  var EXT = ['png', 'PNG', 'jpg', 'webp'];

  var root = null;          // 画像を並べる要素
  var sets = {};            // sets[expr][frame] = canvas
  var expr = 'normal';
  var shown = null;
  var removeWhite = true;
  var blink = { next: 2.5, until: 0 };
  var frameHold = { frame: 'closed', since: 0 };
  var bounce = 0, nod = 0;
  var loadedCount = 0;
  var status = {};          // status[expr][frame] = 'ok' | 'missing'
  var taintWarning = false;

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }

  async function findImage(name) {
    for (var i = 0; i < EXT.length; i++) {
      try { return await loadImage('images/' + name + '.' + EXT[i]); } catch (e) { /* 次の拡張子 */ }
    }
    return null;
  }

  // 周りの白い背景だけを透明にする（外側からつながっている白だけ消すので、白目やシャツは残る）
  function knockOutWhite(img) {
    var c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    var g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    if (!removeWhite) return c;
    var data;
    try {
      data = g.getImageData(0, 0, c.width, c.height);
    } catch (e) {
      // file:// で開くと画像の中身を読めないことがある。その時は白背景のまま表示
      taintWarning = true;
      return c;
    }
    var px = data.data, W = c.width, H = c.height;
    var seen = new Uint8Array(W * H);
    var stack = [];
    function whiteness(i) {
      var r = px[i * 4], gg = px[i * 4 + 1], b = px[i * 4 + 2], a = px[i * 4 + 3];
      if (a < 10) return 1;
      return Math.min(r, gg, b) / 255;
    }
    function push(i) { if (!seen[i] && whiteness(i) > 0.86) { seen[i] = 1; stack.push(i); } }
    for (var x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
    for (var y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
    while (stack.length) {
      var i = stack.pop();
      var cx = i % W, cy = (i - cx) / W;
      if (cx > 0) push(i - 1);
      if (cx < W - 1) push(i + 1);
      if (cy > 0) push(i - W);
      if (cy < H - 1) push(i + W);
    }
    for (var k = 0; k < W * H; k++) {
      if (seen[k]) { px[k * 4 + 3] = 0; continue; }
      // 背景との境目を少しなめらかに
      var kx = k % W;
      var edge = (kx > 0 && seen[k - 1]) || (kx < W - 1 && seen[k + 1]) || (k >= W && seen[k - W]) || (k < W * (H - 1) && seen[k + W]);
      if (edge) {
        var w = whiteness(k);
        if (w > 0.6) px[k * 4 + 3] = Math.round(px[k * 4 + 3] * (1 - (w - 0.6) / 0.4));
      }
    }
    g.putImageData(data, 0, 0);
    return c;
  }

  async function load(container, opts) {
    root = container;
    removeWhite = opts.removeWhite !== false;
    root.innerHTML = '';
    sets = {};
    status = {};
    loadedCount = 0;
    taintWarning = false;
    var jobs = [];
    opts.expressions.forEach(function (e) {
      sets[e] = {};
      status[e] = {};
      FRAMES.forEach(function (f) {
        jobs.push(findImage(e + '_' + f).then(function (img) {
          if (!img) { status[e][f] = 'missing'; return; }
          var c = knockOutWhite(img);
          c.className = 'frame';
          c.style.display = 'none';
          root.appendChild(c);
          sets[e][f] = c;
          status[e][f] = 'ok';
          loadedCount++;
        }));
      });
    });
    await Promise.all(jobs);
    shown = null;
    return hasImages();
  }

  function hasImages() { return !!(sets.normal && sets.normal.closed); }

  function setExpression(e) {
    if (e !== expr) { expr = e; bounce = 1; }
  }

  function pick(e, frame) {
    var s = sets[e] && sets[e].closed ? sets[e] : sets.normal;
    if (!s) return null;
    if (frame === 'half' && !s.half) frame = 'open';
    if (frame === 'open' && !s.open) frame = 'closed';
    if (frame === 'blink' && !s.blink) frame = 'closed';
    return s[frame] || s.closed;
  }

  function update(t, dt, state, bounceEl) {
    if (!hasImages()) return;
    var open = state.open;

    // 口の状態（パタパタしすぎないように少しだけ保持）
    var want = open > 0.55 ? 'open' : open > 0.2 ? 'half' : 'closed';
    var s = sets[expr] && sets[expr].closed ? sets[expr] : sets.normal;
    if (want === 'half' && !s.half) want = open > 0.35 ? 'open' : 'closed';
    if (want !== frameHold.frame && t - frameHold.since > 0.06) {
      frameHold.frame = want;
      frameHold.since = t;
    }
    var frame = frameHold.frame;

    // まばたき（口を閉じている時だけ）
    if (t > blink.next) { blink.until = t + 0.13; blink.next = t + 2 + Math.random() * 4; }
    if (frame === 'closed' && t < blink.until) frame = 'blink';

    var el = pick(expr, frame);
    if (el !== shown) {
      if (shown) shown.style.display = 'none';
      el.style.display = 'block';
      shown = el;
    }

    // 止まって見えないくらいのゆれ＋呼吸＋しゃべる時のうなずき
    bounce *= Math.exp(-dt * 7);
    nod += (open * 1 - nod) * Math.min(1, dt * 10);
    var breathe = Math.sin(t * 1.6) * 0.007;
    var squash = Math.sin(bounce * Math.PI * 3) * bounce * 0.04;
    var rot = Math.sin(t * 0.7) * 0.6 + Math.sin(t * 1.9 + 1) * 0.25;
    var ty = -nod * 0.6;
    bounceEl.style.transform = 'translateY(' + ty.toFixed(2) + '%) rotate(' + rot.toFixed(3) + 'deg) scale(' +
      (1 - breathe * 0.4 + squash * 0.6).toFixed(4) + ',' + (1 + breathe - squash).toFixed(4) + ')';
  }

  window.ImageChar = {
    FRAMES: FRAMES,
    load: load,
    hasImages: hasImages,
    setExpression: setExpression,
    update: update,
    status: function () { return status; },
    loadedCount: function () { return loadedCount; },
    taintWarning: function () { return taintWarning; }
  };
})();
