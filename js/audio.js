// マイク入力・音量の解析（口パク用）・ボイスチェンジャー
(function () {
  'use strict';

  // ピッチシフター（声の高さを変える）。ファイルを分けると file:// で読めないので文字列で持つ
  var WORKLET = [
    'class PitchShifter extends AudioWorkletProcessor {',
    '  static get parameterDescriptors() {',
    '    return [{ name: "pitch", defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: "k-rate" }];',
    '  }',
    '  constructor() {',
    '    super();',
    '    this.W = Math.floor(0.04 * sampleRate);',
    '    this.N = 1; while (this.N < this.W * 2 + 256) this.N <<= 1;',
    '    this.mask = this.N - 1;',
    '    this.buf = new Float32Array(this.N);',
    '    this.w = 0; this.phase = 0;',
    '  }',
    '  read(d) {',
    '    let pos = this.w - d; if (pos < 0) pos += this.N;',
    '    const i = Math.floor(pos), fr = pos - i;',
    '    return this.buf[i & this.mask] * (1 - fr) + this.buf[(i + 1) & this.mask] * fr;',
    '  }',
    '  process(inputs, outputs, params) {',
    '    const out = outputs[0][0]; if (!out) return true;',
    '    const inp = inputs[0] && inputs[0][0];',
    '    const step = (1 - params.pitch[0]) / this.W;',
    '    for (let n = 0; n < out.length; n++) {',
    '      this.buf[this.w] = inp ? inp[n] : 0;',
    '      const p1 = this.phase; let p2 = p1 + 0.5; if (p2 >= 1) p2 -= 1;',
    '      const g1 = Math.sin(Math.PI * p1) ** 2, g2 = Math.sin(Math.PI * p2) ** 2;',
    '      out[n] = this.read(p1 * this.W + 1) * g1 + this.read(p2 * this.W + 1) * g2;',
    '      this.phase += step;',
    '      if (this.phase >= 1) this.phase -= 1; else if (this.phase < 0) this.phase += 1;',
    '      this.w = (this.w + 1) & this.mask;',
    '    }',
    '    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);',
    '    return true;',
    '  }',
    '}',
    'registerProcessor("pitch-shifter", PitchShifter);',
    // 音量メーター：約16ミリ秒ごとに音量と「声の明るさ」の目安を知らせる。
    // 画面が隠れて描画が止まっても、こちらは止まらないので口パクが続く
    'class LevelMeter extends AudioWorkletProcessor {',
    '  constructor() { super(); this.sum = 0; this.n = 0; this.zc = 0; this.prev = 0; this.target = Math.round(sampleRate * 0.016); }',
    '  process(inputs) {',
    '    const x = inputs[0] && inputs[0][0];',
    '    if (x) {',
    '      for (let i = 0; i < x.length; i++) {',
    '        const v = x[i]; this.sum += v * v;',
    '        if ((v >= 0) !== (this.prev >= 0)) this.zc++;',
    '        this.prev = v;',
    '      }',
    '      this.n += x.length;',
    '    } else { this.n += 128; }',
    '    if (this.n >= this.target) {',
    '      this.port.postMessage({ rms: Math.sqrt(this.sum / this.n), zcr: this.zc / this.n });',
    '      this.sum = 0; this.n = 0; this.zc = 0;',
    '    }',
    '    return true;',
    '  }',
    '}',
    'registerProcessor("level-meter", LevelMeter);'
  ].join('\n');

  var ctx = null, stream = null, source = null;
  var n = {};              // ノード
  var timeBuf = null, freqBuf = null;
  var running = false;
  var shifterOk = false;
  var outState = { enabled: false, volume: 1, muted: false };
  var levelCallback = null;

  function db2gain(db) { return Math.pow(10, db / 20); }

  function makeCurve(amount) {
    var len = 1024, curve = new Float32Array(len);
    var k = amount;
    for (var i = 0; i < len; i++) {
      var x = (i * 2) / len - 1;
      curve[i] = k > 0 ? ((1 + k) * x) / (1 + k * Math.abs(x)) : x;
    }
    return curve;
  }

  async function ensureContext() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    try {
      var url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      shifterOk = true;
    } catch (e) {
      console.warn('ピッチシフターが使えません（声の高さは変わりません）', e);
      shifterOk = false;
    }
    buildGraph();
  }

  function mono(node) {
    node.channelCount = 1;
    node.channelCountMode = 'explicit';
    node.channelInterpretation = 'speakers';
    return node;
  }

  function buildGraph() {
    n.input = mono(ctx.createGain());
    n.analyser = ctx.createAnalyser();
    n.analyser.fftSize = 1024;
    n.analyser.smoothingTimeConstant = 0.3;
    n.input.connect(n.analyser);
    if (shifterOk) {
      n.meter = new AudioWorkletNode(ctx, 'level-meter', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 1, channelCountMode: 'explicit' });
      n.meter.port.onmessage = function (e) {
        if (!running || !levelCallback) return;
        var d = e.data;
        var db = 20 * Math.log10(d.rms + 1e-9);
        var hz = d.zcr * ctx.sampleRate / 2;
        levelCallback({ db: db, bright: Math.max(0, Math.min(1, (hz - 600) / 2200)) });
      };
      n.input.connect(n.meter);
    }
    timeBuf = new Float32Array(n.analyser.fftSize);
    freqBuf = new Uint8Array(n.analyser.frequencyBinCount);

    n.hp = ctx.createBiquadFilter(); n.hp.type = 'highpass'; n.hp.frequency.value = 80;
    n.input.connect(n.hp);

    n.dry = ctx.createGain();
    n.mix = mono(ctx.createGain());
    n.hp.connect(n.dry); n.dry.connect(n.mix);

    if (shifterOk) {
      var opts = { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit' };
      n.shiftA = new AudioWorkletNode(ctx, 'pitch-shifter', opts);
      n.shiftB = new AudioWorkletNode(ctx, 'pitch-shifter', opts);
      n.shiftAGain = ctx.createGain(); n.shiftBGain = ctx.createGain();
      n.hp.connect(n.shiftA); n.shiftA.connect(n.shiftAGain); n.shiftAGain.connect(n.mix);
      n.hp.connect(n.shiftB); n.shiftB.connect(n.shiftBGain); n.shiftBGain.connect(n.mix);
    }

    // ロボット感：音量を低い周波数でふるわせる（リングモジュレーション）
    n.ring = ctx.createGain();
    n.osc = ctx.createOscillator(); n.osc.frequency.value = 42;
    n.oscGain = ctx.createGain(); n.oscGain.gain.value = 0;
    n.osc.connect(n.oscGain); n.oscGain.connect(n.ring.gain);
    n.osc.start();
    n.mix.connect(n.ring);

    // 金属感：短いやまびこ（コムフィルター）
    n.combDry = ctx.createGain();
    n.combDelay = ctx.createDelay(0.05); n.combDelay.delayTime.value = 0.0055;
    n.combFb = ctx.createGain(); n.combWet = ctx.createGain();
    n.post = ctx.createGain();
    n.ring.connect(n.combDry); n.combDry.connect(n.post);
    n.ring.connect(n.combDelay); n.combDelay.connect(n.combFb); n.combFb.connect(n.combDelay);
    n.combDelay.connect(n.combWet); n.combWet.connect(n.post);

    // 無線っぽさ：低音と高音を削って少し歪ませる
    n.lp = ctx.createBiquadFilter(); n.lp.type = 'lowpass'; n.lp.frequency.value = 15000;
    n.shaper = ctx.createWaveShaper(); n.shaper.oversample = '2x';
    n.comp = ctx.createDynamicsCompressor();
    n.comp.threshold.value = -20; n.comp.ratio.value = 4; n.comp.attack.value = 0.003; n.comp.release.value = 0.15;
    n.gate = ctx.createGain(); n.gate.gain.value = 1;
    n.out = ctx.createGain(); n.out.gain.value = 0;
    n.post.connect(n.lp); n.lp.connect(n.shaper); n.shaper.connect(n.comp);
    n.comp.connect(n.gate); n.gate.connect(n.out); n.out.connect(ctx.destination);
  }

  async function start(opts) {
    await ensureContext();
    if (ctx.state === 'suspended') await ctx.resume();
    stopStream();
    var audio = {
      echoCancellation: false,
      noiseSuppression: !!opts.noiseSuppression,
      autoGainControl: false,
      channelCount: { ideal: 1 },
      latency: { ideal: 0.01 }
    };
    if (opts.deviceId) audio.deviceId = { exact: opts.deviceId };
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: audio });
    } catch (e) {
      if (opts.deviceId && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) {
        delete audio.deviceId; // 前に選んだマイクが見つからない時は既定のマイク
        stream = await navigator.mediaDevices.getUserMedia({ audio: audio });
      } else {
        throw e;
      }
    }
    source = ctx.createMediaStreamSource(stream);
    source.connect(n.input);
    running = true;
    applyOutput();
  }

  function stopStream() {
    if (source) { try { source.disconnect(); } catch (e) { /* 無視 */ } source = null; }
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    running = false;
  }

  function stop() {
    stopStream();
    applyOutput();
  }

  function setMicGain(db) {
    if (n.input) n.input.gain.setTargetAtTime(db2gain(db), ctx.currentTime, 0.02);
  }

  function applyPreset(p) {
    if (!ctx) return;
    var t = ctx.currentTime, tc = 0.03;
    var ratio = Math.pow(2, p.pitch / 12);
    var mix = shifterOk ? p.mix : 0;
    n.dry.gain.setTargetAtTime(1 - mix, t, tc);
    if (shifterOk) {
      n.shiftA.parameters.get('pitch').setTargetAtTime(ratio, t, tc);
      n.shiftB.parameters.get('pitch').setTargetAtTime(ratio / 2, t, tc);
      n.shiftAGain.gain.setTargetAtTime(mix, t, tc);
      n.shiftBGain.gain.setTargetAtTime(p.double * 0.9, t, tc);
    }
    n.ring.gain.setTargetAtTime(1 - p.robot * 0.85, t, tc);
    n.oscGain.gain.setTargetAtTime(p.robot * 0.85, t, tc);
    n.combDry.gain.setTargetAtTime(1 - p.metal * 0.3, t, tc);
    n.combWet.gain.setTargetAtTime(p.metal * 0.9, t, tc);
    n.combFb.gain.setTargetAtTime(0.2 + p.metal * 0.5, t, tc);
    n.hp.frequency.setTargetAtTime(80 + p.radio * 500, t, tc);
    n.lp.frequency.setTargetAtTime(15000 - p.radio * 11500, t, tc);
    n.shaper.curve = p.radio > 0.01 ? makeCurve(p.radio * 25) : null;
  }

  function applyOutput() {
    if (!n.out) return;
    var g = outState.enabled && !outState.muted && running ? outState.volume : 0;
    n.out.gain.setTargetAtTime(g, ctx.currentTime, 0.03);
  }

  function setOutput(enabled, volume, muted) {
    outState.enabled = enabled;
    outState.volume = volume;
    outState.muted = muted;
    applyOutput();
  }

  function setGate(open) {
    if (!n.gate) return;
    n.gate.gain.setTargetAtTime(open ? 1 : 0, ctx.currentTime, open ? 0.004 : 0.06);
  }

  // 今の音量(dB)と声の明るさ(0..1)
  function analyze() {
    if (!running || !n.analyser) return { db: -100, bright: 0 };
    n.analyser.getFloatTimeDomainData(timeBuf);
    var sum = 0;
    for (var i = 0; i < timeBuf.length; i++) sum += timeBuf[i] * timeBuf[i];
    var rms = Math.sqrt(sum / timeBuf.length);
    var db = 20 * Math.log10(rms + 1e-9);

    n.analyser.getByteFrequencyData(freqBuf);
    var binHz = ctx.sampleRate / n.analyser.fftSize;
    var lo = Math.floor(150 / binHz), hi = Math.min(freqBuf.length - 1, Math.floor(4500 / binHz));
    var num = 0, den = 0;
    for (var j = lo; j <= hi; j++) { var m = freqBuf[j]; num += m * j * binHz; den += m; }
    var centroid = den > 0 ? num / den : 0;
    var bright = Math.max(0, Math.min(1, (centroid - 700) / 1500));
    return { db: db, bright: bright };
  }

  async function listDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return { inputs: [], outputs: [] };
    var all = await navigator.mediaDevices.enumerateDevices();
    return {
      inputs: all.filter(function (d) { return d.kind === 'audioinput'; }),
      outputs: all.filter(function (d) { return d.kind === 'audiooutput'; })
    };
  }

  function canSelectOutput() {
    return typeof (window.AudioContext && AudioContext.prototype.setSinkId) === 'function';
  }

  async function setSink(id) {
    await ensureContext();
    if (canSelectOutput()) await ctx.setSinkId(id || '');
  }

  // 音声処理の中から音量を受け取る（使えない環境では null のまま。その時は analyze() を自分で呼ぶ）
  function onLevel(fn) { levelCallback = fn; }
  function hasLevelStream() { return !!n.meter; }

  window.AudioEngine = {
    onLevel: onLevel,
    hasLevelStream: hasLevelStream,
    start: start,
    stop: stop,
    isRunning: function () { return running; },
    hasPitchShift: function () { return shifterOk; },
    setMicGain: setMicGain,
    applyPreset: applyPreset,
    setOutput: setOutput,
    setGate: setGate,
    analyze: analyze,
    listDevices: listDevices,
    canSelectOutput: canSelectOutput,
    setSink: setSink
  };
})();
