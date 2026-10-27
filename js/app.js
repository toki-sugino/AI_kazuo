// 操作画面：マイク・声・表情・カズオのオン/オフ・画像/動画・暗転を操作し、投影画面へ指示を送る
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
    mediaId: null,
    full: false       // 画像・動画を枠なしで画面いっぱいにしているか
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
        tg = { win: e.source, preview: !!m.preview, last: 0, fullscreen: false };
        targets.push(tg);
        // この操作画面より前から開いている投影画面なら（操作画面を読み込み直した時）、その状態を引き継ぐ
        if (!m.preview && m.age > performance.now()) adoptScreenState(m);
        sendFullState(tg.win);
      }
      tg.last = performance.now();
      tg.fullscreen = !!m.fullscreen;
      if (!m.preview) {
        displayWin = e.source;
        // 「投影開始」を押した直後なら、そのクリックの許可を渡して全画面にしてもらう
        if (pendingFullscreen && !m.fullscreen) delegateFullscreen(e.source);
        pendingFullscreen = false;
      }
      updateScreenStatus();
    } else if (m.t === 'key') {
      if (targets.some(function (x) { return x.win === e.source; })) handleKey(m);
    }
  });

  function adoptScreenState(m) {
    if (m.off !== state.off) setOffUi(!!m.off);
    if (typeof m.kazuo === 'boolean' && m.kazuo !== S.kazuo) { S.kazuo = m.kazuo; save(); }
    state.full = !!m.full;
    renderStage();
    if (m.mediaId !== state.mediaId) {
      state.mediaId = m.mediaId == null ? null : m.mediaId;
      var it = itemById(state.mediaId);
      if (it && it.kind === 'video') loadPlayer(it, false);
      renderMedia();
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
    return {
      t: 'state', kazuo: S.kazuo, full: state.full && state.mediaId != null,
      expression: S.expression, charScale: S.charScale, charY: S.charY, off: state.off
    };
  }

  function sendState() { sendAll(stateMsg()); }

  function sendFullState(win) {
    post(win, stateMsg());
    var it = itemById(state.mediaId);
    if (it) {
      post(win, { t: 'media', id: it.id, kind: it.kind, blob: it.blob });
      if (it.kind === 'video') post(win, videoMsg());
    }
  }

  // 客席に映っている（全画面で投影中・暗転していない）間は、プレビューを赤枠にする
  var projecting = false;
  function renderOnAir() {
    $('previewBox').classList.toggle('onair', projecting && !state.off);
  }

  function updateScreenStatus() {
    var now = performance.now();
    var scr = targets.filter(function (x) { return !x.preview && !x.win.closed && now - x.last < 5000; })[0];
    var b = $('openScreen');
    b.textContent = !scr ? '投影開始' : scr.fullscreen ? '投影中' : '全画面にする';
    b.classList.toggle('live', !!(scr && scr.fullscreen));
    b.classList.toggle('primary', !(scr && scr.fullscreen));
    projecting = !!(scr && scr.fullscreen);
    renderOnAir();
  }
  setInterval(updateScreenStatus, 1000);

  // 投影画面を開く。液晶（外部ディスプレイ）がつながっていれば、そちらに全画面で開く
  var pendingFullscreen = false;

  function notice(msg) {
    var el = $('notice');
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  // ボタンを押した「許可」を投影画面に渡して、全画面にしてもらう
  function delegateFullscreen(win) {
    try {
      win.postMessage({ t: 'fullscreen' }, { targetOrigin: location.origin, delegate: 'fullscreen' });
    } catch (e) {
      post(win, { t: 'fullscreen' }); // 渡せない時（ファイルを直接開いた時など）は投影画面をクリックしてもらう
    }
  }

  async function findExternalScreen() {
    if (!('getScreenDetails' in window)) return { screen: null, asked: false };
    var asked = false;
    try {
      var perm = await navigator.permissions.query({ name: 'window-management' });
      asked = perm.state === 'prompt';
    } catch (e) { /* 古いブラウザ */ }
    try {
      var d = await window.getScreenDetails();
      var other = d.screens.filter(function (s) { return s !== d.currentScreen; });
      // 外部ディスプレイ（内蔵でない画面）を優先する
      other.sort(function (a, b) { return (a.isInternal ? 1 : 0) - (b.isInternal ? 1 : 0); });
      return { screen: other[0] || null, asked: asked };
    } catch (e) {
      return { screen: null, asked: asked, denied: true };
    }
  }

  async function openScreen() {
    notice('');
    var now = performance.now();
    var live = targets.filter(function (x) { return !x.preview && !x.win.closed && now - x.last < 5000; })[0];
    if (live) {
      if (!live.fullscreen) delegateFullscreen(live.win);
      return;
    }
    var found = await findExternalScreen();
    var ext = found.screen;
    var feat = ext
      ? 'popup,fullscreen,left=' + ext.availLeft + ',top=' + ext.availTop + ',width=' + ext.availWidth + ',height=' + ext.availHeight
      : 'popup,width=1280,height=720';
    displayWin = window.open('screen.html?v=202610270159', 'aiKazuoScreen', feat);
    if (!displayWin) {
      notice(found.asked
        ? '許可ありがとうございます。もう一度「投影開始」を押してください。'
        : '投影画面を開けませんでした。アドレスバー右端の「ポップアップがブロックされました」から、このサイトのポップアップを許可して、もう一度押してください。');
      return;
    }
    pendingFullscreen = !!ext;
    if (!ext) {
      notice(found.denied
        ? '「ウィンドウの管理」が許可されていないため、液晶の場所が分かりません。投影画面を液晶側へドラッグして、クリックすると全画面になります。'
        : '液晶（外部ディスプレイ）が見つかりません。Windowsキー＋P で「拡張」にしてから、投影画面を閉じてもう一度押してください。');
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
  bindCheck('autoPlay', 'autoPlay');
  bindCheck('videoLoop', 'videoLoop', function () { player.loop = S.videoLoop; sendVideo(); });
  bindCheck('videoSound', 'videoSound', applyVideoAudio);
  bindRange('videoVolume', 'videoVolume', function (v) { return Math.round(v * 100) + '%'; }, applyVideoAudio);

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
    $('presetName').textContent = Settings.PRESETS[S.preset].label;
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
      b.appendChild(document.createTextNode(e.label));
      b.disabled = !hasExpression(e.id);
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

  // ===== カズオのオン/オフ・枠なしの全画面 =====
  function setKazuo(on) {
    S.kazuo = on;
    save();
    renderStage();
    sendState();
  }

  function setFull(on) {
    state.full = on && state.mediaId != null;
    renderStage();
    sendState();
  }

  function renderStage() {
    $('kazuoBtn').classList.toggle('active', S.kazuo);
    $('fullBtn').classList.toggle('active', state.full);
    $('fullBtn').disabled = state.mediaId == null;
    document.body.classList.toggle('kazuo-off', !S.kazuo);
  }
  $('kazuoBtn').addEventListener('click', function () { setKazuo(!S.kazuo); });
  $('fullBtn').addEventListener('click', function () { setFull(!state.full); });

  // ===== 画像・動画 =====
  var items = [];   // { id, name, blob, url, kind }

  function itemById(id) { return id == null ? null : items.find(function (p) { return p.id === id; }) || null; }
  function kindOf(blob) { return /^video\//.test(blob.type) ? 'video' : 'image'; }

  async function loadMedia() {
    var list;
    try { list = await Photos.list(); } catch (e) { list = []; console.error(e); }
    items.forEach(function (p) { URL.revokeObjectURL(p.url); });
    items = list.map(function (p) {
      return { id: p.id, name: p.name, blob: p.blob, url: URL.createObjectURL(p.blob), kind: kindOf(p.blob) };
    });
    if (state.mediaId != null) {
      var cur = itemById(state.mediaId);
      if (!cur) hideMedia();
      else if (cur.kind === 'video' && (!playerItem || playerItem.id !== cur.id)) loadPlayer(cur, false);
    }
    renderMedia();
  }

  function renderMedia() {
    var ol = $('photoList');
    ol.innerHTML = '';
    items.forEach(function (p, i) {
      var li = document.createElement('li');
      li.className = p.id === state.mediaId ? 'showing' : '';
      li.title = 'クリックで客席に出す／もう一度クリックで消す';
      var num = document.createElement('span'); num.className = 'num'; num.textContent = i + 1;
      var thumb;
      if (p.kind === 'video') {
        thumb = document.createElement('video');
        thumb.muted = true; thumb.preload = 'metadata';
        thumb.src = p.url + '#t=0.1';
      } else {
        thumb = document.createElement('img'); thumb.alt = '';
        thumb.src = p.url;
      }
      thumb.className = 'thumb';
      var name = document.createElement('span'); name.className = 'name';
      if (p.kind === 'video') {
        var badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = '動画';
        name.appendChild(badge);
      }
      name.appendChild(document.createTextNode(p.name));
      var ops = document.createElement('span'); ops.className = 'ops';
      [['↑', '上へ', function () { Photos.move(p.id, -1).then(loadMedia); }],
       ['↓', '下へ', function () { Photos.move(p.id, 1).then(loadMedia); }],
       ['×', '削除', function () {
         if (!confirm('「' + p.name + '」を削除しますか？')) return;
         if (state.mediaId === p.id) hideMedia();
         Photos.remove(p.id).then(loadMedia);
       }]].forEach(function (op) {
        var b = document.createElement('button');
        b.textContent = op[0]; b.title = op[1];
        b.addEventListener('click', function (ev) { ev.stopPropagation(); op[2](); });
        ops.appendChild(b);
      });
      li.appendChild(num); li.appendChild(thumb); li.appendChild(name); li.appendChild(ops);
      li.addEventListener('click', function () {
        if (state.mediaId === p.id) hideMedia(); else showMedia(p.id);
      });
      ol.appendChild(li);
    });
    $('dropZone').classList.toggle('empty', !items.length);
    $('hidePhoto').disabled = state.mediaId == null;
    renderStage();
    renderVideoControls();
  }

  function showMedia(id) {
    var p = itemById(id);
    if (!p) return;
    state.mediaId = id;
    sendAll({ t: 'media', id: p.id, kind: p.kind, blob: p.blob });
    if (p.kind === 'video') loadPlayer(p, S.autoPlay); else unloadPlayer();
    renderMedia();
  }

  function hideMedia() {
    state.mediaId = null;
    unloadPlayer();
    sendAll({ t: 'media', id: null });
    if (state.full) setFull(false);
    renderMedia();
  }

  function stepMedia(dir) {
    if (!items.length) return;
    var i = items.findIndex(function (p) { return p.id === state.mediaId; });
    if (i < 0) i = dir > 0 ? 0 : items.length - 1;
    else i = Math.max(0, Math.min(items.length - 1, i + dir));
    showMedia(items[i].id);
  }

  async function addFiles(files) {
    var ok = Array.prototype.filter.call(files, function (f) { return /^(image|video)\//.test(f.type); });
    for (var i = 0; i < ok.length; i++) {
      try { await Photos.add(ok[i]); } catch (e) { alert('保存できませんでした（容量が足りない可能性があります）: ' + e); }
    }
    loadMedia();
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
  // 枠の外に落としてもブラウザがファイルを開いてしまわないように
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) { e.preventDefault(); });
  $('hidePhoto').addEventListener('click', hideMedia);

  // ===== 動画 =====
  // 動画の音はこの操作画面で鳴らし（投影画面はクリックされていないので、音付きの自動再生が止められることがある）、
  // 投影画面の映像はこの再生位置に合わせて動かす
  var player = $('audioVideo');
  var playerItem = null;

  function videoMsg() {
    return { t: 'video', id: playerItem ? playerItem.id : null, time: player.currentTime, paused: player.paused, loop: player.loop };
  }

  function sendVideo() { if (playerItem) sendAll(videoMsg()); }

  function applyVideoAudio() {
    player.muted = !S.videoSound;
    player.volume = Math.max(0, Math.min(1, S.videoVolume));
    if (S.outId && typeof player.setSinkId === 'function') player.setSinkId(S.outId).catch(function () { /* 既定のまま */ });
  }

  function loadPlayer(p, autoplay) {
    playerItem = p;
    player.src = p.url;
    player.loop = S.videoLoop;
    applyVideoAudio();
    if (autoplay) playVideo(); else sendVideo();
    renderVideoControls();
  }

  function unloadPlayer() {
    if (!playerItem) return;
    playerItem = null;
    player.pause();
    player.removeAttribute('src');
    player.load();
    renderVideoControls();
  }

  function playVideo() {
    if (!playerItem) return;
    if (player.ended) player.currentTime = 0;
    applyVideoAudio();
    player.play().then(function () {
      if (!player.muted || !S.videoSound) notice('');
    }).catch(function () {
      // 音付きで再生できない時は、音なしで映像だけ進める
      player.muted = true;
      player.play().catch(function () { /* 無視 */ });
      notice('動画の音が出せませんでした。この画面を1回クリックしてから、もう一度再生してください。');
    });
    sendVideo();
  }

  function togglePlay() {
    if (!playerItem) return;
    if (player.paused || player.ended) playVideo(); else { player.pause(); sendVideo(); }
  }

  ['play', 'pause', 'seeked', 'ended', 'loadedmetadata'].forEach(function (ev) {
    player.addEventListener(ev, function () { sendVideo(); renderVideoControls(); });
  });
  player.addEventListener('timeupdate', renderVideoTime);
  setInterval(sendVideo, 1000);

  function fmtTime(sec) {
    if (!isFinite(sec)) sec = 0;
    var m = Math.floor(sec / 60), s2 = Math.floor(sec % 60);
    return m + ':' + (s2 < 10 ? '0' : '') + s2;
  }

  function renderVideoTime() {
    var d = player.duration;
    $('vTime').textContent = fmtTime(player.currentTime) + ' / ' + fmtTime(d);
    if (!seeking) $('vSeek').value = isFinite(d) && d > 0 ? Math.round(player.currentTime / d * 1000) : 0;
  }

  function renderVideoControls() {
    $('videoCtl').hidden = !playerItem;
    if (!playerItem) return;
    $('vPlay').firstChild.textContent = player.paused || player.ended ? '▶ ' : '⏸ ';
    renderVideoTime();
  }

  var seeking = false;
  $('vSeek').addEventListener('input', function () {
    seeking = true;
    if (isFinite(player.duration)) player.currentTime = $('vSeek').value / 1000 * player.duration;
  });
  $('vSeek').addEventListener('change', function () { seeking = false; sendVideo(); });
  $('vPlay').addEventListener('click', togglePlay);
  $('vRestart').addEventListener('click', function () { player.currentTime = 0; sendVideo(); });

  // ===== マイク =====
  async function startMic() {
    try {
      await AudioEngine.start({ deviceId: S.micId, noiseSuppression: S.noiseSuppression });
      AudioEngine.setMicGain(S.micGainDb);
      AudioEngine.applyPreset(S.presets[S.preset]);
      applyOutput();
      if (S.outId) { try { await AudioEngine.setSink(S.outId); } catch (e) { /* 既定に戻る */ } }
      if (!AudioEngine.hasPitchShift()) notice('このページの開き方では声の高さを変えられません。URLで開いてください。');
      $('micToggle').classList.add('on');
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
      notice(msg);
      $('startError').textContent = msg;
      return false;
    }
  }

  $('micToggle').addEventListener('click', function () {
    if (AudioEngine.isRunning()) {
      AudioEngine.stop();
      $('micToggle').classList.remove('on');
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
      $('outSelect').hidden = true;
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
    try { await AudioEngine.setSink(S.outId); } catch (e) { notice('音を出す先を切り替えられませんでした'); }
    applyVideoAudio();
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
    $('bootBtn').classList.toggle('active', off);
    renderOnAir();
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
    if (dk === '0') { hideMedia(); return true; }
    if (PRESET_KEYS[k]) { setPreset(PRESET_KEYS[k]); return true; }
    if (k === 'arrowright') { stepMedia(1); return true; }
    if (k === 'arrowleft') { stepMedia(-1); return true; }
    if (k === ' ') { togglePlay(); return true; }
    if (k === 'k') { setKazuo(!S.kazuo); return true; }
    if (k === 'f') { setFull(!state.full); return true; }
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
  renderStage();
  setExpression(S.expression);
  loadMedia();
  requestAnimationFrame(draw);
})();
