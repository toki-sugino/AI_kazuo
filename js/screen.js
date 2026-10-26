// 投影画面：操作画面から届く指示どおりに、キャラ・写真・暗転を表示する
//   操作画面の「投影画面を開く」から開く（またはプレビューとして操作画面に埋め込まれる）
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var preview = /[?&]preview=1/.test(location.search);
  if (preview) document.body.classList.add('preview');

  // 指示を出してくれる操作画面
  var control = preview ? window.parent : window.opener;
  if (control === window) control = null;

  Background.init($('bg'));
  TracedChar.init($('charWrap'), $('charBounce'));

  var st = { open: 0, bright: 0.5, level: 0 };
  var lastFrame = 0;
  var off = false;
  var photo = { id: null, url: null };

  function send(m) {
    if (!control) return;
    try { control.postMessage(m, '*'); } catch (e) { /* 操作画面が閉じている */ }
  }

  // 操作画面に「ここにいます」と知らせる（操作画面を読み込み直しても、また繋がる）
  //   操作画面を読み込み直した時は、こちらの状態（暗転中か・出している写真）を引き継いでもらう
  function hello() {
    send({ t: 'hello', preview: preview, age: performance.now(), off: off, photoId: photo.id });
  }
  hello();
  setInterval(hello, 2000);

  if (!control) {
    $('hintMain').textContent = '操作画面の「投影画面を開く」から開いてください';
  }

  // ===== 指示を受け取る =====
  window.addEventListener('message', function (e) {
    if (!control || e.source !== control) return;
    var m = e.data;
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'frame') {
      st.open = m.open; st.bright = m.bright; st.level = m.level;
      lastFrame = performance.now();
    } else if (m.t === 'state') {
      applyState(m);
    } else if (m.t === 'photo') {
      setPhoto(m.id, m.blob);
    } else if (m.t === 'boot') {
      setOff(m.off, true);
    }
  });

  function applyState(m) {
    TracedChar.setExpression(m.expression);
    var r = document.documentElement.style;
    r.setProperty('--char-scale', m.charScale);
    r.setProperty('--char-y', m.charY + 'vh');
    if (m.off !== off) setOff(m.off, false);
  }

  // ===== 暗転と起動演出 =====
  var screenEl = $('screen');
  var animTimer = 0;
  function setOff(next, animate) {
    if (next === off && animate) return;
    off = next;
    clearTimeout(animTimer);
    screenEl.classList.remove('boot', 'powerOff');
    if (off) {
      if (!animate) { document.body.classList.add('is-off'); return; }
      void screenEl.offsetWidth;
      screenEl.classList.add('powerOff');
      animTimer = setTimeout(function () {
        document.body.classList.add('is-off');
        screenEl.classList.remove('powerOff');
      }, 560);
    } else {
      document.body.classList.remove('is-off');
      if (!animate) return;
      void screenEl.offsetWidth; // アニメーションを最初から
      screenEl.classList.add('boot');
      animTimer = setTimeout(function () { screenEl.classList.remove('boot'); }, 1700);
    }
  }

  // ===== 写真 =====
  var frameEl = $('photoFrame'), imgEl = $('photoImg');
  var outTimer = 0;
  function setPhoto(id, blob) {
    clearTimeout(outTimer);
    if (id == null || !blob) {
      if (photo.id == null) return;
      photo.id = null;
      frameEl.classList.add('out');
      outTimer = setTimeout(function () {
        document.body.classList.remove('has-photo');
        frameEl.classList.remove('out');
      }, 450);
      return;
    }
    if (photo.id === id && document.body.classList.contains('has-photo')) return;
    if (photo.url) URL.revokeObjectURL(photo.url);
    photo.id = id;
    photo.url = URL.createObjectURL(blob);
    imgEl.src = photo.url;
    frameEl.classList.remove('out');
    document.body.classList.remove('has-photo');
    void frameEl.offsetWidth; // 出てくる演出を最初から
    document.body.classList.add('has-photo');
  }

  // ===== 全画面 =====
  function goFullscreen() {
    if (preview) return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(function () { /* 無視 */ });
    }
  }
  $('hint').addEventListener('click', goFullscreen);
  document.addEventListener('fullscreenchange', function () {
    document.body.classList.toggle('is-fullscreen', !!document.fullscreenElement);
  });

  // キー操作は操作画面へ回す（F だけはこの画面の全画面切り替え）
  function forwardKey(type) {
    return function (e) {
      if (preview) return;
      if (type === 'down' && e.key.toLowerCase() === 'f' && !e.repeat) {
        if (document.fullscreenElement) document.exitFullscreen(); else goFullscreen();
        return;
      }
      send({ t: 'key', type: type, key: e.key, code: e.code, repeat: e.repeat });
    };
  }
  window.addEventListener('keydown', forwardKey('down'));
  window.addEventListener('keyup', forwardKey('up'));

  // マウスを動かさなければカーソルを隠す
  var cursorTimer = 0;
  function hideCursorSoon() {
    document.body.classList.remove('hide-cursor');
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(function () { document.body.classList.add('hide-cursor'); }, 1500);
  }
  window.addEventListener('mousemove', hideCursorSoon);
  hideCursorSoon();

  // ===== 毎フレームの描画 =====
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    var t = now / 1000;
    // 操作画面からの音量が途切れたら口を閉じる
    if (now - lastFrame > 400) { st.open *= 0.8; st.level *= 0.9; }
    Background.draw(t, dt, st.level);
    TracedChar.update(t, dt, st);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
