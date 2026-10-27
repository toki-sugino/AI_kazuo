// 投影画面：操作画面から届く指示どおりに、キャラ・画像/動画・暗転を表示する
//   操作画面の「投影開始」から開く（またはプレビューとして操作画面に埋め込まれる）
//   カズオのオン/オフ × 画像・動画のオン/オフで並びが決まる。画像・動画は枠なしの全画面にもできる
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
  var kazuo = true;      // カズオを出すか
  var full = false;      // 画像・動画を枠なしで画面いっぱいにするか
  var media = { id: null, kind: null, el: null, url: null };

  function send(m) {
    if (!control) return;
    try { control.postMessage(m, '*'); } catch (e) { /* 操作画面が閉じている */ }
  }

  // 操作画面に「ここにいます」と知らせる（操作画面を読み込み直しても、また繋がる）
  //   操作画面を読み込み直した時は、こちらの状態を引き継いでもらう
  function hello() {
    send({
      t: 'hello', preview: preview, age: performance.now(), off: off, kazuo: kazuo, full: full,
      mediaId: media.id, fullscreen: !!document.fullscreenElement
    });
  }
  hello();
  setInterval(hello, 2000);

  if (!control) {
    $('hintMain').textContent = '操作画面の「投影開始」から開いてください';
    $('hintSub').textContent = '';
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
    } else if (m.t === 'media') {
      setMedia(m.id, m.kind, m.blob);
    } else if (m.t === 'video') {
      videoCmd(m);
    } else if (m.t === 'boot') {
      setOff(m.off, true);
    } else if (m.t === 'fullscreen') {
      // 操作画面のボタンから「全画面にしてよい」という許可が渡されてくる
      goFullscreen();
    }
  });

  function applyState(m) {
    TracedChar.setExpression(m.expression);
    var r = document.documentElement.style;
    r.setProperty('--char-scale', m.charScale);
    r.setProperty('--char-y', m.charY + 'vh');
    if (m.off !== off) setOff(m.off, false);
    if (m.kazuo !== kazuo) setKazuo(m.kazuo !== false);
    if (!!m.full !== full) setFull(!!m.full);
  }

  // ===== カズオのオン/オフ =====
  function setKazuo(on) {
    kazuo = on;
    document.body.classList.toggle('kazuo-off', !kazuo);
    if (kazuo) {
      var cb = $('charBounce');
      cb.classList.remove('appear'); void cb.offsetWidth; cb.classList.add('appear');
    }
  }

  // ===== 枠なしの全画面 =====
  function setFull(on) {
    full = on;
    document.body.classList.toggle('media-full', full);
    if (media.el) placeMedia(true);
  }

  // ===== 画像・動画 =====
  var frameEl = $('photoFrame'), frameSlot = $('frameSlot'), fullSlot = $('fullSlot');
  var outTimer = 0;

  function setMedia(id, kind, blob) {
    clearTimeout(outTimer);
    if (id == null || !blob) {
      if (media.id == null) return;
      var old = media;
      media = { id: null, kind: null, el: null, url: null };
      var done = function () {
        document.body.classList.remove('has-photo');
        frameEl.classList.remove('out');
        if (old.el) { if (old.kind === 'video') old.el.pause(); old.el.remove(); }
        if (old.url) URL.revokeObjectURL(old.url);
      };
      if (!full) {
        frameEl.classList.add('out');
        outTimer = setTimeout(done, 450);
      } else {
        done();
      }
      return;
    }
    if (media.id === id && media.el) return;
    if (media.el) { if (media.kind === 'video') media.el.pause(); media.el.remove(); }
    if (media.url) URL.revokeObjectURL(media.url);

    var el;
    if (kind === 'video') {
      el = document.createElement('video');
      el.muted = true;          // 音は操作画面側で鳴らす
      el.playsInline = true;
      el.preload = 'auto';
    } else {
      el = document.createElement('img');
      el.alt = '';
    }
    media = { id: id, kind: kind, el: el, url: URL.createObjectURL(blob) };
    el.src = media.url;
    placeMedia(true);
  }

  // 枠の中か画面いっぱいに置く（動画は再生したまま移せる）
  function placeMedia(animate) {
    var el = media.el;
    if (full) {
      if (el.parentNode !== fullSlot) fullSlot.appendChild(el);
      document.body.classList.add('has-photo');
      if (animate) { el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); }
    } else {
      if (el.parentNode !== frameSlot) frameSlot.appendChild(el);
      el.classList.remove('in');
      frameEl.classList.remove('out');
      if (animate) {
        document.body.classList.remove('has-photo');
        void frameEl.offsetWidth; // 出てくる演出を最初から
      }
      document.body.classList.add('has-photo');
    }
  }

  // 動画の操作。操作画面の時刻に合わせる（ずれが大きい時だけ合わせ直す）
  function videoCmd(m) {
    var v = media.kind === 'video' && media.id === m.id ? media.el : null;
    if (!v) return;
    v.loop = !!m.loop;
    if (typeof m.time === 'number' && isFinite(m.time) && Math.abs(v.currentTime - m.time) > (m.paused ? 0.05 : 0.3)) {
      try { v.currentTime = m.time; } catch (e) { /* 読み込み前 */ }
    }
    if (m.paused === false && v.paused) v.play().catch(function () { /* 無視 */ });
    if (m.paused === true && !v.paused) v.pause();
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

  // ===== 全画面 =====
  function goFullscreen() {
    if (preview || document.fullscreenElement) return;
    document.documentElement.requestFullscreen().catch(function () { /* 許可がない時は案内を出したまま */ });
  }
  $('hint').addEventListener('click', goFullscreen);
  document.addEventListener('fullscreenchange', function () {
    document.body.classList.toggle('is-fullscreen', !!document.fullscreenElement);
    hello();
  });

  // キー操作は操作画面へ回す
  function forwardKey(type) {
    return function (e) {
      if (preview) return;
      if (e.key === ' ' || /^Arrow/.test(e.key)) e.preventDefault();
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
    if (!(full && media.el)) {  // 画面いっぱいに出している間は描かない（動画をなめらかにするため）
      Background.draw(t, dt, st.level);
      if (kazuo) TracedChar.update(t, dt, st);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
