// 画面全体の制御：パネル操作・キー操作・毎フレームの更新
(function () {
  'use strict';

  var S = Settings.load();
  var $ = function (id) { return document.getElementById(id); };

  var SLIDERS = [
    { key: 'pitch', label: '声の高さ（半音）', min: -12, max: 12, step: 1, fmt: function (v) { return (v > 0 ? '+' : '') + v; } },
    { key: 'mix', label: '高さを変えた声の割合', min: 0, max: 1, step: 0.05 },
    { key: 'double', label: '低い声を重ねる', min: 0, max: 1, step: 0.05 },
    { key: 'robot', label: 'ロボット感', min: 0, max: 1, step: 0.05 },
    { key: 'metal', label: '金属感', min: 0, max: 1, step: 0.05 },
    { key: 'radio', label: '無線っぽさ', min: 0, max: 1, step: 0.05 }
  ];

  var state = {
    useImages: false,
    muted: false,
    testHeld: false,
    open: 0,
    bright: 0,
    level: 0,
    db: -100,
    gateOpenUntil: 0,
    off: false
  };

  // ===== 初期化 =====
  Background.init($('bg'));
  Character.init($('kazuo'));

  function save() { Settings.save(S); }

  function bindRange(id, key, fmt, onChange) {
    var input = $(id), out = $(id + 'Out');
    input.value = S[key];
    var show = function () { if (out) out.textContent = fmt ? fmt(+input.value) : input.value; };
    show();
    input.addEventListener('input', function () {
      S[key] = +input.value;
      show();
      save();
      if (onChange) onChange(S[key]);
    });
  }

  function bindCheck(id, key, onChange) {
    var input = $(id);
    input.checked = !!S[key];
    input.addEventListener('change', function () {
      S[key] = input.checked;
      save();
      if (onChange) onChange(S[key]);
    });
  }

  bindRange('micGain', 'micGainDb', function (v) { return (v > 0 ? '+' : '') + v + ' dB'; }, AudioEngine.setMicGain);
  bindRange('threshold', 'threshold', function (v) { return v + ' dB'; });
  bindRange('range', 'range', function (v) { return v + ' dB'; });
  bindRange('mouthScale', 'mouthScale', function (v) { return Math.round(v * 100) + '%'; });
  bindRange('volume', 'volume', function (v) { return Math.round(v * 100) + '%'; }, applyOutput);
  bindRange('charScale', 'charScale', function (v) { return Math.round(v * 100) + '%'; }, applyLayout);
  bindRange('charY', 'charY', function (v) { return v; }, applyLayout);
  bindCheck('noiseSuppression', 'noiseSuppression', function () { if (AudioEngine.isRunning()) startMic(); });
  bindCheck('voiceOut', 'voiceOut', applyOutput);
  bindCheck('gate', 'gate', function () { AudioEngine.setGate(true); });
  bindCheck('removeWhite', 'removeWhite', loadImages);

  function applyLayout() {
    var r = document.documentElement.style;
    r.setProperty('--char-scale', S.charScale);
    r.setProperty('--char-y', S.charY + 'vh');
  }
  applyLayout();

  function applyOutput() {
    AudioEngine.setOutput(S.voiceOut, S.volume, state.muted);
  }

  // ===== 声のプリセット =====
  function renderPresets() {
    var box = $('presetBtns');
    box.innerHTML = '';
    Object.keys(Settings.PRESETS).forEach(function (id) {
      var b = document.createElement('button');
      b.textContent = Settings.PRESETS[id].key + '  ' + Settings.PRESETS[id].label;
      b.className = id === S.preset ? 'active' : '';
      b.addEventListener('click', function () { setPreset(id); });
      box.appendChild(b);
    });
    var sl = $('presetSliders');
    sl.innerHTML = '';
    var p = S.presets[S.preset];
    SLIDERS.forEach(function (def) {
      if ((def.key === 'pitch' || def.key === 'mix' || def.key === 'double') && !AudioEngine.hasPitchShift() && AudioEngine.isRunning()) return;
      var label = document.createElement('label');
      var out = document.createElement('output');
      var input = document.createElement('input');
      input.type = 'range';
      input.min = def.min; input.max = def.max; input.step = def.step;
      input.value = p[def.key];
      var show = function () { out.textContent = def.fmt ? def.fmt(+input.value) : Math.round(input.value * 100) + '%'; };
      show();
      input.addEventListener('input', function () {
        p[def.key] = +input.value;
        show();
        save();
        AudioEngine.applyPreset(p);
      });
      label.appendChild(document.createTextNode(def.label + ' '));
      label.appendChild(out);
      label.appendChild(input);
      sl.appendChild(label);
    });
  }

  function setPreset(id) {
    if (!S.presets[id]) return;
    S.preset = id;
    save();
    AudioEngine.applyPreset(S.presets[id]);
    renderPresets();
  }

  $('presetReset').addEventListener('click', function () {
    S.presets[S.preset] = Settings.clone(Settings.PRESETS[S.preset]);
    save();
    AudioEngine.applyPreset(S.presets[S.preset]);
    renderPresets();
  });

  // ===== 表情 =====
  function renderExpressions() {
    var box = $('exprBtns');
    box.innerHTML = '';
    Settings.EXPRESSIONS.forEach(function (e) {
      var b = document.createElement('button');
      b.textContent = e.key + ' ' + e.label;
      b.className = e.id === S.expression ? 'active' : '';
      b.addEventListener('click', function () { setExpression(e.id); });
      box.appendChild(b);
    });
  }

  function setExpression(id) {
    S.expression = id;
    save();
    Character.setExpression(id);
    Character.setPose(S.poses[id] || 'hips');
    ImageChar.setExpression(id);
    renderExpressions();
  }

  // ===== 画像キャラ =====
  var EXPR_LABEL = {};
  Settings.EXPRESSIONS.forEach(function (e) { EXPR_LABEL[e.id] = e.label; });
  var FRAME_LABEL = { closed: '口閉じ', half: '半開き', open: '口開き', blink: 'まばたき' };

  async function loadImages() {
    $('imageSummary').textContent = '画像を読み込み中…';
    var ok = await ImageChar.load($('imageChar'), {
      expressions: Settings.EXPRESSIONS.map(function (e) { return e.id; }),
      removeWhite: S.removeWhite
    });
    state.useImages = ok;
    $('imageChar').hidden = !ok;
    $('kazuo').hidden = ok;
    $('charBounce').style.transform = '';
    if (ok) {
      var first = $('imageChar').querySelector('canvas');
      var c = first && first.width ? first : null;
      if (c) $('charWrap').style.aspectRatio = c.width + ' / ' + c.height;
    } else {
      $('charWrap').style.aspectRatio = '';
    }
    renderImageStatus();
  }

  function renderImageStatus() {
    var st = ImageChar.status();
    var msg = state.useImages
      ? ImageChar.loadedCount() + '枚の画像を使っています。'
      : 'images フォルダに normal_closed.png がないので、仮のキャラを表示しています。';
    if (ImageChar.taintWarning()) msg += ' ファイルを直接開いているため、白い背景を消せません（URLで開くか、背景が透明なPNGを使ってください）。';
    $('imageSummary').textContent = msg;
    var html = '<table class="imgStatus"><tr><th>表情</th>';
    ImageChar.FRAMES.forEach(function (f) { html += '<th>' + FRAME_LABEL[f] + '</th>'; });
    html += '</tr>';
    Settings.EXPRESSIONS.forEach(function (e) {
      html += '<tr><td>' + e.key + ' ' + EXPR_LABEL[e.id] + '</td>';
      ImageChar.FRAMES.forEach(function (f) {
        var ok = st[e.id] && st[e.id][f] === 'ok';
        html += '<td class="' + (ok ? 'ok' : 'missing') + '">' + (ok ? '○' : '−') + '</td>';
      });
      html += '</tr>';
    });
    $('imageStatus').innerHTML = html + '</table>';
  }

  $('reloadImages').addEventListener('click', loadImages);

  // ===== マイク =====
  async function startMic() {
    $('micStatus').textContent = '開始中…';
    try {
      await AudioEngine.start({ deviceId: S.micId, noiseSuppression: S.noiseSuppression });
      AudioEngine.setMicGain(S.micGainDb);
      AudioEngine.applyPreset(S.presets[S.preset]);
      applyOutput();
      if (S.outId) { try { await AudioEngine.setSink(S.outId); } catch (e) { /* 既定に戻る */ } }
      $('micStatus').textContent = AudioEngine.hasPitchShift() ? '動作中'
        : location.protocol === 'file:' ? '動作中（ファイルを直接開いているため声の高さは変えられません。URLで開いてください）'
          : '動作中（このブラウザでは声の高さを変えられません）';
      $('micToggle').textContent = 'マイク停止';
      await refreshDevices();
      renderPresets();
      return true;
    } catch (e) {
      console.error(e);
      var msg = e && e.name === 'NotAllowedError'
        ? 'マイクの使用が許可されていません。アドレスバーの鍵マーク（またはカメラのマーク）からマイクを「許可」にして、ページを読み込み直してください。'
        : e && e.name === 'NotFoundError'
          ? 'マイクが見つかりません。マイクがつながっているか確認してください。'
          : 'マイクを開始できませんでした: ' + (e && e.message ? e.message : e);
      $('micStatus').textContent = '停止中';
      $('startError').textContent = msg;
      alertPanel(msg);
      return false;
    }
  }

  function alertPanel(msg) {
    var p = $('micStatus');
    p.textContent = msg;
  }

  $('micToggle').addEventListener('click', function () {
    if (AudioEngine.isRunning()) {
      AudioEngine.stop();
      $('micToggle').textContent = 'マイク開始';
      $('micStatus').textContent = '停止中';
    } else {
      startMic();
    }
  });

  async function refreshDevices() {
    var d = await AudioEngine.listDevices();
    fillSelect($('micSelect'), d.inputs, S.micId, '既定のマイク');
    if (AudioEngine.canSelectOutput()) {
      fillSelect($('outSelect'), d.outputs, S.outId, '既定のスピーカー');
    } else {
      $('outSelectLabel').hidden = true;
    }
  }

  function fillSelect(sel, list, current, defLabel) {
    sel.innerHTML = '';
    var o = document.createElement('option');
    o.value = '';
    o.textContent = defLabel;
    sel.appendChild(o);
    list.forEach(function (dev, i) {
      if (dev.deviceId === 'default' || dev.deviceId === 'communications' || !dev.deviceId) return;
      var op = document.createElement('option');
      op.value = dev.deviceId;
      op.textContent = dev.label || ('デバイス ' + (i + 1));
      sel.appendChild(op);
    });
    sel.value = current;
    if (sel.value !== current) sel.value = '';
  }

  $('micSelect').addEventListener('change', function () {
    S.micId = $('micSelect').value;
    save();
    if (AudioEngine.isRunning()) startMic();
  });

  $('outSelect').addEventListener('change', async function () {
    S.outId = $('outSelect').value;
    save();
    try { await AudioEngine.setSink(S.outId); } catch (e) { alertPanel('音を出す先を切り替えられませんでした'); }
  });

  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', function () {
      if (AudioEngine.isRunning()) refreshDevices();
    });
  }

  // ===== 開始カード =====
  $('startMic').addEventListener('click', async function () {
    $('startError').textContent = '';
    if (await startMic()) $('startCard').hidden = true;
  });
  $('startNoMic').addEventListener('click', function () { $('startCard').hidden = true; });

  // ===== ミュート・テスト =====
  function setMuted(m) {
    state.muted = m;
    $('muteBtn').className = m ? 'active' : '';
    $('muteBtn').textContent = m ? 'ミュート中 (M)' : 'ミュート (M)';
    applyOutput();
  }
  $('muteBtn').addEventListener('click', function () { setMuted(!state.muted); });

  var testBtn = $('testMouth');
  ['pointerdown'].forEach(function (ev) { testBtn.addEventListener(ev, function () { state.testHeld = true; }); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { testBtn.addEventListener(ev, function () { state.testHeld = false; }); });

  // ===== 暗転・起動演出 =====
  var screenEl = $('screen');
  function toggleBoot() {
    if (!state.off) {
      state.off = true;
      screenEl.classList.remove('boot');
      screenEl.classList.add('powerOff');
      setTimeout(function () {
        document.body.classList.add('is-off');
        screenEl.classList.remove('powerOff');
      }, 560);
    } else {
      state.off = false;
      document.body.classList.remove('is-off');
      screenEl.classList.remove('boot');
      void screenEl.offsetWidth; // アニメーションを最初から
      screenEl.classList.add('boot');
      setTimeout(function () { screenEl.classList.remove('boot'); }, 1700);
    }
    $('bootBtn').className = state.off ? 'active' : '';
  }
  $('bootBtn').addEventListener('click', toggleBoot);

  // ===== 全画面・パネル・カーソル =====
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(function () { /* 無視 */ });
  }
  $('fsBtn').addEventListener('click', toggleFullscreen);

  function togglePanel() { document.body.classList.toggle('panel-hidden'); }
  $('panelClose').addEventListener('click', togglePanel);

  var cursorTimer = 0;
  window.addEventListener('mousemove', function () {
    document.body.classList.remove('hide-cursor');
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(function () {
      if (document.body.classList.contains('panel-hidden')) document.body.classList.add('hide-cursor');
    }, 2000);
  });

  // ===== キー操作 =====
  var PRESET_KEYS = {};
  Object.keys(Settings.PRESETS).forEach(function (id) { PRESET_KEYS[Settings.PRESETS[id].key.toLowerCase()] = id; });
  var EXPR_KEYS = {};
  Settings.EXPRESSIONS.forEach(function (e) { EXPR_KEYS[e.key] = e.id; });

  window.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'SELECT' || (tag === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox')) return;
    var k = e.key.toLowerCase();
    if (k === 't') { state.testHeld = true; return; }
    if (e.repeat) return;
    var code = e.code || '';
    var digit = /^Digit(\d)$/.exec(code) || /^Numpad(\d)$/.exec(code);
    var dk = digit ? digit[1] : k;
    if (EXPR_KEYS[dk]) { setExpression(EXPR_KEYS[dk]); e.preventDefault(); return; }
    if (PRESET_KEYS[k]) { setPreset(PRESET_KEYS[k]); return; }
    if (k === 'b') toggleBoot();
    else if (k === 'm') setMuted(!state.muted);
    else if (k === 'h') togglePanel();
    else if (k === 'f') toggleFullscreen();
  });
  window.addEventListener('keyup', function (e) {
    if (e.key.toLowerCase() === 't') state.testHeld = false;
  });
  window.addEventListener('blur', function () { state.testHeld = false; });

  // ===== 毎フレームの処理 =====
  var meterBar = $('meterBar'), meterTh = $('meterThreshold');
  var last = performance.now();

  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    var t = now / 1000;

    var a = AudioEngine.analyze();
    state.db = a.db;
    var target = Math.max(0, Math.min(1, (a.db - S.threshold) / S.range));
    var bright = a.bright;

    // ゲート：しきい値より少し小さい音までは通す。話し終わりは少し待ってから閉じる
    if (a.db > S.threshold - 6) state.gateOpenUntil = t + 0.25;
    AudioEngine.setGate(!S.gate || t < state.gateOpenUntil);

    if (state.testHeld) {
      // テスト用：しゃべっているような口の動き
      target = Math.max(0, Math.sin(t * 9) * 0.5 + Math.sin(t * 23) * 0.3 + 0.35);
      bright = 0.5 + 0.5 * Math.sin(t * 3);
    }
    if (state.muted) target = 0;
    target = Math.pow(target, 0.8) * S.mouthScale;

    state.open += (target - state.open) * (target > state.open ? 0.6 : 0.28);
    state.bright += (bright - state.bright) * 0.15;
    state.level += (Math.min(1, target) - state.level) * 0.1;

    var charState = { open: state.open, bright: state.bright, level: state.level };
    Background.draw(t, dt, state.level);
    if (state.useImages) ImageChar.update(t, dt, charState, $('charBounce'));
    else Character.update(t, dt, charState);

    // レベルメーター（-90dB〜0dB）
    var pct = function (db) { return Math.max(0, Math.min(100, (db + 90) / 90 * 100)); };
    meterBar.style.width = pct(a.db) + '%';
    meterBar.className = a.db > S.threshold ? 'open' : '';
    meterTh.style.left = pct(S.threshold) + '%';

    requestAnimationFrame(frame);
  }

  // ===== 起動 =====
  renderPresets();
  renderExpressions();
  setExpression(S.expression);
  loadImages();
  requestAnimationFrame(frame);
})();
