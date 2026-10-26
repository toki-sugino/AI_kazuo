// 操作画面：マイク・声・表情・写真・暗転を操作し、投影画面へ指示を送る
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
    muted: false,
    testHeld: false,
    open: 0,
    bright: 0,
    level: 0,
    db: -100,
    gateOpenUntil: 0,
    off: false,
    photoId: null
  };

  function save() { Settings.save(S); }

  // ===== 投影画面とのやりとり =====
  // 投影画面（とプレビュー）は2秒ごとに hello を送ってくる。届いた相手に指示を送る
  var targets = [];
  var displayWin = null;

  function trusted(e) {
    return e.origin === location.origin || location.protocol === 'file:';
  }

  window.addEventListener('message', function (e) {
    var m = e.data;
    if (!m || typeof m.t !== 'string' || !trusted(e) || !e.source) return;
    if (m.t === 'hello') {
      var tg = targets.find(function (x) { return x.win === e.source; });
      if (!tg) {
        tg = { win: e.source, preview: !!m.preview, last: 0 };
        targets.push(tg);
        // この操作画面より前から開いている投影画面なら（操作画面を読み込み直した時）、その状態を引き継ぐ
        if (!m.preview && m.age > performance.now()) adoptScreenState(m);
        sendFullState(tg.win);
      }
      tg.last = performance.now();
      updateScreenStatus();
    } else if (m.t === 'key') {
      if (targets.some(function (x) { return x.win === e.source; })) handleKey(m);
    }
  });

  function adoptScreenState(m) {
    if (m.off !== state.off) setOffUi(!!m.off);
    if (m.photoId !== state.photoId) {
      state.photoId = m.photoId == null ? null : m.photoId;
      renderPhotos();
    }
  }

  function post(win, m) {
    try { win.postMessage(m, '*'); } catch (e) { /* 閉じている */ }
  }

  function sendAll(m) {
    var now = performance.now();
    targets = targets.filter(function (x) { return !x.win.closed && now - x.last < 7000; });
    targets.forEach(function (x) { post(x.win, m); });
  }

  function stateMsg() {
    return { t: 'state', expression: S.expression, charScale: S.charScale, charY: S.charY, off: state.off };
  }

  function sendState() { sendAll(stateMsg()); }

  function sendFullState(win) {
    post(win, stateMsg());
    if (state.photoId != null) {
      var p = photoById(state.photoId);
      if (p) post(win, { t: 'photo', id: p.id, blob: p.blob });
    }
  }

  function updateScreenStatus() {
    var now = performance.now();
    var live = targets.some(function (x) { return !x.preview && !x.win.closed && now - x.last < 5000; });
    var el = $('screenStatus');
    el.textContent = live ? '投影画面：接続中' : '投影画面：未接続';
    el.classList.toggle('on', live);
  }
  setInterval(updateScreenStatus, 1000);

  // 投影画面を開く。液晶がつながっていれば、そちらの画面に開く
  async function openScreen() {
    if (displayWin && !displayWin.closed) { displayWin.focus(); return; }
    var feat = 'popup,width=1280,height=720';
    try {
      if ('getScreenDetails' in window) {
        var d = await window.getScreenDetails();
        var other = d.screens.filter(function (s) { return s !== d.currentScreen; })[0];
        if (other) {
          feat = 'popup,left=' + other.availLeft + ',top=' + other.availTop +
            ',width=' + other.availWidth + ',height=' + other.availHeight;
        }
      }
    } catch (e) { /* 画面の情報を使えない時は普通に開く */ }
    displayWin = window.open('screen.html', 'aiKazuoScreen', feat);
    if (!displayWin) {
      alert('投影画面を開けませんでした。アドレスバー右端の「ポップアップがブロックされました」から、このサイトのポップアップを許可して、もう一度押してください。');
    }
  }
  $('openScreen').addEventListener('click', openScreen);

  // ===== 設定のつまみ =====
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
  bindRange('charScale', 'charScale', function (v) { return Math.round(v * 100) + '%'; }, sendState);
  bindRange('charY', 'charY', function (v) { return v; }, sendState);
  bindCheck('noiseSuppression', 'noiseSuppression', function () { if (AudioEngine.isRunning()) startMic(); });
  bindCheck('voiceOut', 'voiceOut', applyOutput);
  bindCheck('gate', 'gate', function () { AudioEngine.setGate(true); });

  function applyOutput() {
    AudioEngine.setOutput(S.voiceOut, S.volume, state.muted);
  }

  // ===== 声のプリセット =====
  function renderPresets() {
    var box = $('presetBtns');
    box.innerHTML = '';
    Object.keys(Settings.PRESETS).forEach(function (id) {
      var b = document.createElement('button');
      b.innerHTML = '';
      b.appendChild(document.createTextNode(Settings.PRESETS[id].label));
      var k = document.createElement('kbd');
      k.textContent = Settings.PRESETS[id].key;
      b.appendChild(k);
      b.className = id === S.preset ? 'active' : '';
      b.addEventListener('click', function () { setPreset(id); });
      box.appendChild(b);
    });
    $('presetName').textContent = '「' + Settings.PRESETS[S.preset].label + '」の調整：';
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
  function hasExpression(id) { return !!(window.CHARACTER && CHARACTER.expressions[id]); }

  function renderExpressions() {
    var box = $('exprBtns');
    box.innerHTML = '';
    Settings.EXPRESSIONS.forEach(function (e) {
      var b = document.createElement('button');
      b.appendChild(document.createTextNode(e.label + (hasExpression(e.id) ? '' : '（未）')));
      var k = document.createElement('kbd');
      k.textContent = e.key;
      b.appendChild(k);
      b.className = e.id === S.expression ? 'active' : '';
      b.addEventListener('click', function () { setExpression(e.id); });
      box.appendChild(b);
    });
  }

  function setExpression(id) {
    if (!Settings.EXPRESSIONS.some(function (e) { return e.id === id; })) id = 'normal';
    S.expression = id;
    save();
    renderExpressions();
    sendState();
  }

  // ===== 写真 =====
  var photos = [];   // { id, name, blob, url }

  function photoById(id) { return photos.find(function (p) { return p.id === id; }); }

  async function loadPhotos() {
    var list;
    try { list = await Photos.list(); } catch (e) { list = []; console.error(e); }
    photos.forEach(function (p) { URL.revokeObjectURL(p.url); });
    photos = list.map(function (p) { return { id: p.id, name: p.name, blob: p.blob, url: URL.createObjectURL(p.blob) }; });
    if (state.photoId != null && !photoById(state.photoId)) hidePhoto();
    renderPhotos();
  }

  function renderPhotos() {
    var ol = $('photoList');
    ol.innerHTML = '';
    photos.forEach(function (p, i) {
      var li = document.createElement('li');
      li.className = p.id === state.photoId ? 'showing' : '';
      li.title = 'クリックで客席に出す／もう一度クリックで消す';
      var num = document.createElement('span'); num.className = 'num'; num.textContent = i + 1;
      var img = document.createElement('img'); img.src = p.url; img.alt = '';
      var name = document.createElement('span'); name.className = 'name'; name.textContent = p.name;
      var ops = document.createElement('span'); ops.className = 'ops';
      [['↑', '上へ', function () { Photos.move(p.id, -1).then(loadPhotos); }],
       ['↓', '下へ', function () { Photos.move(p.id, 1).then(loadPhotos); }],
       ['×', '削除', function () {
         if (!confirm('「' + p.name + '」を削除しますか？')) return;
         if (state.photoId === p.id) hidePhoto();
         Photos.remove(p.id).then(loadPhotos);
       }]].forEach(function (op) {
        var b = document.createElement('button');
        b.textContent = op[0]; b.title = op[1];
        b.addEventListener('click', function (ev) { ev.stopPropagation(); op[2](); });
        ops.appendChild(b);
      });
      li.appendChild(num); li.appendChild(img); li.appendChild(name); li.appendChild(ops);
      li.addEventListener('click', function () {
        if (state.photoId === p.id) hidePhoto(); else showPhoto(p.id);
      });
      ol.appendChild(li);
    });
    var cur = photoById(state.photoId);
    $('photoNow').textContent = '表示中：' + (cur ? (photos.indexOf(cur) + 1) + '. ' + cur.name : 'なし');
  }

  function showPhoto(id) {
    var p = photoById(id);
    if (!p) return;
    state.photoId = id;
    sendAll({ t: 'photo', id: p.id, blob: p.blob });
    renderPhotos();
  }

  function hidePhoto() {
    state.photoId = null;
    sendAll({ t: 'photo', id: null });
    renderPhotos();
  }

  function stepPhoto(dir) {
    if (!photos.length) return;
    var i = photos.findIndex(function (p) { return p.id === state.photoId; });
    if (i < 0) i = dir > 0 ? 0 : photos.length - 1;
    else i = Math.max(0, Math.min(photos.length - 1, i + dir));
    showPhoto(photos[i].id);
  }

  async function addFiles(files) {
    var imgs = Array.prototype.filter.call(files, function (f) { return /^image\//.test(f.type); });
    for (var i = 0; i < imgs.length; i++) {
      try { await Photos.add(imgs[i]); } catch (e) { alert('写真を保存できませんでした: ' + e); }
    }
    loadPhotos();
  }

  $('photoInput').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
  var dz = $('dropZone');
  ['dragenter', 'dragover'].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); });
  });
  dz.addEventListener('drop', function (e) { addFiles(e.dataTransfer.files); });
  // 枠の外に落としてもブラウザが写真を開いてしまわないように
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) { e.preventDefault(); });
  $('hidePhoto').addEventListener('click', hidePhoto);

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
      $('micPill').textContent = 'マイク：動作中';
      $('micPill').classList.add('on');
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
      $('micStatus').textContent = msg;
      $('startError').textContent = msg;
      return false;
    }
  }

  $('micToggle').addEventListener('click', function () {
    if (AudioEngine.isRunning()) {
      AudioEngine.stop();
      $('micToggle').textContent = 'マイク開始';
      $('micStatus').textContent = '停止中';
      $('micPill').textContent = 'マイク：停止中';
      $('micPill').classList.remove('on');
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
    try { await AudioEngine.setSink(S.outId); } catch (e) { $('micStatus').textContent = '音を出す先を切り替えられませんでした'; }
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

  // ===== ミュート・テスト・暗転 =====
  function setMuted(m) {
    state.muted = m;
    $('muteBtn').classList.toggle('active', m);
    applyOutput();
  }
  $('muteBtn').addEventListener('click', function () { setMuted(!state.muted); });

  var testBtn = $('testMouth');
  testBtn.addEventListener('pointerdown', function () { state.testHeld = true; });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
    testBtn.addEventListener(ev, function () { state.testHeld = false; });
  });

  function setOffUi(off) {
    state.off = off;
    $('bootBtn').classList.toggle('off', off);
    $('bootBtn').firstChild.textContent = off ? '暗転中 → 起動 ' : '暗転 / 起動 ';
  }

  function toggleBoot() {
    setOffUi(!state.off);
    sendAll({ t: 'boot', off: state.off });
  }
  $('bootBtn').addEventListener('click', toggleBoot);

  // ===== キー操作（投影画面で押したキーもここに届く） =====
  var PRESET_KEYS = {};
  Object.keys(Settings.PRESETS).forEach(function (id) { PRESET_KEYS[Settings.PRESETS[id].key.toLowerCase()] = id; });
  var EXPR_KEYS = {};
  Settings.EXPRESSIONS.forEach(function (e) { EXPR_KEYS[e.key] = e.id; });

  function handleKey(e) {
    var k = (e.key || '').toLowerCase();
    if (e.type === 'up') { if (k === 't') state.testHeld = false; return false; }
    if (k === 't') { state.testHeld = true; return true; }
    if (e.repeat) return false;
    var digit = /^(?:Digit|Numpad)(\d)$/.exec(e.code || '');
    var dk = digit ? digit[1] : k;
    if (EXPR_KEYS[dk]) { setExpression(EXPR_KEYS[dk]); return true; }
    if (dk === '0') { hidePhoto(); return true; }
    if (PRESET_KEYS[k]) { setPreset(PRESET_KEYS[k]); return true; }
    if (k === 'arrowright') { stepPhoto(1); return true; }
    if (k === 'arrowleft') { stepPhoto(-1); return true; }
    if (k === 'b') { toggleBoot(); return true; }
    if (k === 'm') { setMuted(!state.muted); return true; }
    return false;
  }

  window.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (tag === 'INPUT' && (e.target.type !== 'checkbox' || /^Arrow/.test(e.key))) return;
    if (handleKey({ type: 'down', key: e.key, code: e.code, repeat: e.repeat })) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { handleKey({ type: 'up', key: e.key, code: e.code }); });
  window.addEventListener('blur', function () { state.testHeld = false; });

  // ===== 口パクの計算 =====
  // マイクの音量は音声処理の中から約16ミリ秒ごとに届く（操作画面が隠れていても止まらない）。
  // 届かない時（マイクなし・古いブラウザ）はタイマーで計算する
  var lastLevelAt = 0;
  AudioEngine.onLevel(function (a) { lastLevelAt = performance.now(); tick(a); });
  setInterval(function () {
    if (performance.now() - lastLevelAt > 100) tick(AudioEngine.analyze());
  }, 16);

  function tick(a) {
    var t = performance.now() / 1000;
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
    sendAll({ t: 'frame', open: state.open, bright: state.bright, level: state.level });
  }

  // ===== 画面の表示（メーターとプレビューの大きさ） =====
  var meterBar = $('meterBar'), meterTh = $('meterThreshold');
  var previewBox = $('previewBox'), previewFrame = $('preview');
  function draw() {
    var pct = function (db) { return Math.max(0, Math.min(100, (db + 90) / 90 * 100)); };
    meterBar.style.width = pct(state.db) + '%';
    meterBar.className = state.db > S.threshold ? 'open' : '';
    meterTh.style.left = pct(S.threshold) + '%';
    previewFrame.style.transform = 'scale(' + (previewBox.clientWidth / 1280) + ')';
    requestAnimationFrame(draw);
  }

  // ===== 起動 =====
  renderPresets();
  setExpression(S.expression);
  loadPhotos();
  requestAnimationFrame(draw);
})();
