// トレースした絵に、プログラムで描いた口とまばたきを重ねるデモ
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  // 元の絵の口の位置（kazuo_normal.svg の座標）
  var M = { lx: 328, ly: 521, rx: 449, ry: 516, mid: 532, cx: 388 };

  var mode = 'auto';           // 'auto' | 'mic'
  var testHeld = false;
  var open = 0, bright = 0.4;
  var blinkNext = 2, blinkUntil = 0;
  var bounce = 0, nod = 0;

  // 自動でしゃべる：音節ごとに口を開け閉めし、ときどき息つぎする
  var talk = { until: 0, amp: 0, pauseUntil: 0, phraseEnd: 0 };
  function autoLevel(t) {
    if (t < talk.pauseUntil) return 0;
    if (t > talk.phraseEnd) {
      talk.pauseUntil = t + 0.5 + Math.random() * 1.0;
      talk.phraseEnd = talk.pauseUntil + 1.2 + Math.random() * 2.5;
      return 0;
    }
    if (t > talk.until) {
      talk.until = t + 0.09 + Math.random() * 0.14;
      talk.amp = Math.random() < 0.15 ? 0.1 : 0.35 + Math.random() * 0.65;
      bright = Math.random();
    }
    var left = (talk.until - t);
    return talk.amp * Math.min(1, left * 14);
  }

  function f(n) { return n.toFixed(1); }

  function drawMouth(o, br) {
    var h = o * 46;
    var inX = 7 * o + (br - 0.5) * 8 * o;    // 「い」の時は横に広く、「お」の時はすぼめる
    var up = 2 * o;
    var lx = M.lx + inX, ly = M.ly - up, rx = M.rx - inX, ry = M.ry - up;
    var top = M.mid - h * 0.12;
    var bot = top + h;
    var cT = (4 * top - ly - ry) / 2, cB = (4 * bot - ly - ry) / 2;
    var d = 'M' + f(lx) + ',' + f(ly) + ' Q' + M.cx + ',' + f(cT) + ' ' + f(rx) + ',' + f(ry) +
      ' Q' + M.cx + ',' + f(cB) + ' ' + f(lx) + ',' + f(ly) + 'Z';
    $('mLine').setAttribute('d', d);
    $('mFill').setAttribute('d', d);
    $('mClipPath').setAttribute('d', d);
    var inside = h > 3;
    $('mFill').setAttribute('visibility', inside ? 'visible' : 'hidden');
    var teethBottom = top + Math.min(h * 0.3, 9);
    var t = $('teeth');
    t.setAttribute('x', f(lx - 5)); t.setAttribute('y', f(Math.min(ly, ry) - 20));
    t.setAttribute('width', f(rx - lx + 10)); t.setAttribute('height', f(Math.max(0, teethBottom - Math.min(ly, ry) + 20)));
    t.setAttribute('visibility', h > 8 ? 'visible' : 'hidden');
    var tg = $('tongue');
    tg.setAttribute('cx', M.cx); tg.setAttribute('cy', f(bot));
    tg.setAttribute('rx', f((rx - lx) * 0.3)); tg.setAttribute('ry', f(h * 0.45));
    // 下くちびるの影（元の絵にある影）
    var sy = M.mid + 19 + h * 0.9;
    $('lipShade').setAttribute('d', 'M' + f(M.cx - 22) + ',' + f(sy) + ' Q' + M.cx + ',' + f(sy + 7) + ' ' + f(M.cx + 22) + ',' + f(sy));
  }

  // ===== ボタン =====
  function setMode(m) {
    mode = m;
    $('autoBtn').className = m === 'auto' ? 'active' : '';
    $('micBtn').className = m === 'mic' ? 'active' : '';
  }
  $('autoBtn').addEventListener('click', function () { setMode('auto'); });
  $('micBtn').addEventListener('click', async function () {
    try {
      if (!AudioEngine.isRunning()) await AudioEngine.start({ noiseSuppression: true });
      setMode('mic');
      $('msg').textContent = 'マイク動作中（声はスピーカーに出しません）';
    } catch (e) {
      $('msg').textContent = 'マイクを使えませんでした（' + (e && e.name ? e.name : e) + '）';
    }
  });
  window.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    if (k === 't') testHeld = true;
    if (k === 'h' && !e.repeat) document.body.classList.toggle('hide-ui');
  });
  window.addEventListener('keyup', function (e) { if (e.key.toLowerCase() === 't') testHeld = false; });

  // ===== 毎フレーム =====
  Background.init($('bg'));
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    var t = now / 1000;
    var size = +$('size').value;

    var target = 0;
    if (testHeld) {
      target = Math.max(0, Math.sin(t * 9) * 0.5 + Math.sin(t * 23) * 0.3 + 0.35);
    } else if (mode === 'auto') {
      target = autoLevel(t);
    } else {
      var a = AudioEngine.analyze();
      target = Math.max(0, Math.min(1, (a.db - +$('th').value) / 26));
      bright += (a.bright - bright) * 0.15;
    }
    target = Math.min(1.3, Math.pow(target, 0.8) * size);
    open += (target - open) * (target > open ? 0.6 : 0.3);

    drawMouth(open, bright);

    // まばたき
    if (t > blinkNext) { blinkUntil = t + 0.12; blinkNext = t + 2 + Math.random() * 4; if (Math.random() < 0.15) blinkNext = t + 0.3; }
    $('blink').setAttribute('visibility', t < blinkUntil ? 'visible' : 'hidden');

    // 止まって見えないくらいのゆれ・呼吸・しゃべる時のうなずき
    nod += (open - nod) * Math.min(1, dt * 10);
    var breathe = Math.sin(t * 1.6) * 0.007;
    var rot = Math.sin(t * 0.7) * 0.7 + Math.sin(t * 1.9 + 1) * 0.3 + Math.sin(t * 6) * nod * 0.4;
    $('char').style.transform = 'translateY(' + (-nod * 0.5).toFixed(2) + '%) rotate(' + rot.toFixed(3) + 'deg) scale(' +
      (1 - breathe * 0.4).toFixed(4) + ',' + (1 + breathe).toFixed(4) + ')';

    Background.draw(t, dt, Math.min(1, open));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
