// 煙の演出：カズオが出る・消える時に「ドロン」と煙を立てる
(function () {
  'use strict';

  var canvas, ctx, W = 0, H = 0, DPR = 1;
  var puffs = [];
  var sprites = [];

  function init(el) {
    canvas = el;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    for (var i = 0; i < 4; i++) sprites.push(makeSprite(i));
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.floor(window.innerWidth * DPR);
    H = Math.floor(window.innerHeight * DPR);
    canvas.width = W;
    canvas.height = H;
  }

  // もこもこした煙のかたまりの絵（ぼかした丸をいくつか重ねる）
  function makeSprite(seed) {
    var size = 256, c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    var rnd = mulberry(seed * 97 + 13);
    for (var i = 0; i < 9; i++) {
      var a = rnd() * Math.PI * 2, d = rnd() * size * 0.18;
      var x = size / 2 + Math.cos(a) * d, y = size / 2 + Math.sin(a) * d;
      var r = size * (0.22 + rnd() * 0.16);
      var grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(235,242,255,0.55)');
      grad.addColorStop(0.55, 'rgba(200,218,255,0.28)');
      grad.addColorStop(1, 'rgba(170,195,255,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  }

  function mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // rect（画面上のカズオの位置）のまわりに煙を立てる
  function puff(rect) {
    if (!ctx) return;
    var cx = (rect.left + rect.width / 2) * DPR;
    var cy = (rect.top + rect.height * 0.55) * DPR;
    var feet = (rect.top + rect.height * 0.93) * DPR;
    var size = rect.height * DPR;
    var i, a, sp;
    // 体のまわりからパッと外へ広がる煙
    for (i = 0; i < 36; i++) {
      a = (i / 36) * Math.PI * 2 + Math.random() * 0.3;
      var rr = 0.4 + Math.random() * 0.6;
      sp = size * (0.55 + Math.random() * 0.6);
      add(cx + Math.cos(a) * rr * size * 0.16, cy + Math.sin(a) * rr * size * 0.3,
        Math.cos(a) * sp, Math.sin(a) * sp * 0.75,
        size * (0.07 + Math.random() * 0.04), size * (0.17 + Math.random() * 0.09),
        0.5 + Math.random() * 0.3, Math.random() * 0.06);
    }
    // 真ん中をいったん包む煙（この中から現れる・この中に消える）
    for (i = 0; i < 8; i++) {
      a = Math.random() * Math.PI * 2;
      sp = size * (0.1 + Math.random() * 0.2);
      add(cx + (Math.random() - 0.5) * size * 0.2, cy + (Math.random() - 0.5) * size * 0.45,
        Math.cos(a) * sp, Math.sin(a) * sp,
        size * (0.12 + Math.random() * 0.05), size * (0.2 + Math.random() * 0.06),
        0.32 + Math.random() * 0.12, 0);
    }
    // 足もとから横に広がる煙
    for (i = 0; i < 10; i++) {
      var dir = i % 2 ? 1 : -1;
      sp = size * (0.7 + Math.random() * 0.6);
      add(cx + dir * Math.random() * size * 0.08, feet,
        dir * sp, -size * (0.03 + Math.random() * 0.08),
        size * (0.05 + Math.random() * 0.03), size * (0.13 + Math.random() * 0.06),
        0.45 + Math.random() * 0.25, Math.random() * 0.05);
    }
  }

  function add(x, y, vx, vy, s0, s1, life, delay) {
    puffs.push({
      x: x, y: y, vx: vx, vy: vy, s0: s0, s1: s1, life: life, age: -delay,
      rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 1.6,
      img: sprites[Math.floor(Math.random() * sprites.length)]
    });
  }

  function draw(dt) {
    if (!ctx) return;
    if (!puffs.length) {
      if (canvas.dataset.dirty) { ctx.clearRect(0, 0, W, H); delete canvas.dataset.dirty; }
      return;
    }
    canvas.dataset.dirty = '1';
    ctx.clearRect(0, 0, W, H);
    var drag = Math.exp(-dt * 5.5);
    for (var i = puffs.length - 1; i >= 0; i--) {
      var p = puffs[i];
      p.age += dt;
      if (p.age < 0) continue;
      var k = p.age / p.life;
      if (k >= 1) { puffs.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= drag;
      p.vy = p.vy * drag - dt * 30 * DPR; // ゆっくり上へ
      p.rot += p.vr * dt;
      var ease = 1 - Math.pow(1 - k, 3);
      var s = p.s0 + (p.s1 - p.s0) * ease;
      var alpha = 0.6 * (k < 0.08 ? k / 0.08 : Math.pow(1 - (k - 0.08) / 0.92, 1.8));
      ctx.globalAlpha = alpha;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.drawImage(p.img, -s, -s, s * 2, s * 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  window.Smoke = { init: init, puff: puff, draw: draw };
})();
