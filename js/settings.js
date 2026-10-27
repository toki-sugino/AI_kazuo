// 設定の初期値と保存（このPCのブラウザに保存される）
(function () {
  'use strict';

  var KEY = 'aiKazuo.settings.v1';

  // 声のプリセット。値の意味:
  //  pitch : 声の高さ（半音。+12で1オクターブ上）
  //  mix   : 高さを変えた声の割合（0=元の声だけ, 1=変えた声だけ）
  //  double: 1オクターブ下の声を重ねる量（AIっぽい厚み）
  //  robot : ロボット感（震え）
  //  metal : 金属感（響き）
  //  radio : 無線・スピーカーっぽさ
  var PRESETS = {
    natural: { label: '素の声', key: 'Q', pitch: 0, mix: 0, double: 0, robot: 0, metal: 0, radio: 0 },
    ai: { label: 'AIの声', key: 'W', pitch: 0, mix: 0, double: 0.35, robot: 0.3, metal: 0.45, radio: 0.15 },
    high: { label: '高い声', key: 'E', pitch: 5, mix: 1, double: 0, robot: 0, metal: 0, radio: 0 },
    highAi: { label: '高いAIの声', key: 'R', pitch: 5, mix: 1, double: 0.25, robot: 0.3, metal: 0.45, radio: 0.15 }
  };

  var EXPRESSIONS = [
    { id: 'normal', label: '通常', key: '1' },
    { id: 'smile', label: '笑顔', key: '2' },
    { id: 'think', label: '悩み', key: '3' },
    { id: 'surprise', label: '驚き', key: '4' },
    { id: 'assert', label: '断定', key: '5' }
  ];

  var DEFAULTS = {
    micId: '',
    noiseSuppression: true,
    micGainDb: 0,
    threshold: -52,
    range: 26,
    mouthScale: 1,
    voiceOut: false,
    outId: '',
    volume: 1,
    gate: true,
    preset: 'ai',
    presets: clone(PRESETS),
    expression: 'normal',
    charScale: 1,
    charY: 0,
    kazuo: true,          // カズオを出すか
    autoPlay: true,       // 動画は出したらすぐ再生する
    videoLoop: false,
    videoSound: true,
    videoVolume: 1
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function merge(base, extra) {
    if (!extra || typeof extra !== 'object') return base;
    Object.keys(base).forEach(function (k) {
      if (!(k in extra)) return;
      var b = base[k], e = extra[k];
      if (b && typeof b === 'object' && !Array.isArray(b)) base[k] = merge(b, e);
      else if (typeof e === typeof b) base[k] = e;
    });
    return base;
  }

  function load() {
    var s = clone(DEFAULTS);
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) merge(s, JSON.parse(raw));
    } catch (e) { /* 保存できない環境でも初期値で動く */ }
    return s;
  }

  var saveTimer = 0;
  function save(s) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* 無視 */ }
    }, 200);
  }

  window.Settings = {
    PRESETS: PRESETS,
    EXPRESSIONS: EXPRESSIONS,
    load: load,
    save: save,
    clone: clone
  };
})();
