// 背景：横線・舞う粒（青い粒、ガラス片、白い結晶、泡）・うっすらした円
(function () {
  'use strict';

  var canvas, ctx, W = 0, H = 0, DPR = 1;
  var particles = [];
  var BLUES = ['#0e2a9e', '#1a3fd6', '#2f6bff', '#4f86ff', '#7fa8ff', '#163088'];

  function init(el) {
    canvas = el;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.floor(window.innerWidth * DPR);
    H = Math.floor(window.innerHeight * DPR);
    canvas.width = W;
    canvas.height = H;
    spawn();
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // 中央（キャラのいる所）は少しまばらにする
  function place() {
    for (var i = 0; i < 20; i++) {
      var x = Math.random() * W, y = Math.random() * H;
      var dx = (x - W / 2) / (H * 0.32), dy = (y - H / 2) / (H * 0.55);
      if (dx * dx + dy * dy > 1 || Math.random() < 0.3) return { x: x, y: y };
    }
    return { x: Math.random() * W, y: Math.random() * H };
  }

  function makeParticle() {
    var pos = place();
    var z = Math.pow(Math.random(), 1.6); // 0=奥, 1=手前
    var r = Math.random();
    var type = r < 0.62 ? 'dot' : r < 0.8 ? 'shard' : r < 0.9 ? 'crystal' : 'bubble';
    var p = {
      type: type,
      x: pos.x,
      y: pos.y,
      z: z,
      vx: rand(-4, 4) * (0.4 + z) * DPR,
      vy: rand(-7, -1) * (0.4 + z) * DPR,
      rot: rand(0, Math.PI * 2),
      vr: rand(-0.6, 0.6),
      tw: rand(0.6, 2.4),
      ph: rand(0, Math.PI * 2),
      color: pick(BLUES)
    };
    var s = DPR * (H / 1080 / DPR) * 1.0;
    if (type === 'dot') p.size = rand(0.8, 2.6) * (0.6 + z * 1.6) * s;
    if (type === 'shard') p.size = rand(3, 9) * (0.6 + z * 1.8) * s;
    if (type === 'crystal') p.size = rand(2.5, 7) * (0.6 + z * 1.8) * s;
    if (type === 'bubble') p.size = rand(3, 8) * (0.6 + z * 1.4) * s;
    if (type === 'shard' || type === 'crystal') {
      var n = type === 'crystal' ? 5 : 4, pts = [];
      for (var i = 0; i < n; i++) {
        var a = (i / n) * Math.PI * 2 + rand(-0.35, 0.35);
        var rr = rand(0.6, 1.1);
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      p.pts = pts;
    }
    return p;
  }

  function spawn() {
    var count = Math.round((W * H) / (DPR * DPR) / 2600);
    count = Math.max(200, Math.min(count, 900));
    particles = [];
    for (var i = 0; i < count; i++) particles.push(makeParticle());
  }

  function drawLines(t, level) {
    var n = 30;
    var cx = W / 2, cy = H / 2;
    var gap = H / n;
    var drift = (t * 3 * DPR) % gap;
    ctx.lineWidth = Math.max(1, DPR * 1.1);
    var a = 0.22 + level * 0.25;
    var grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, 'rgba(150,170,215,' + (a * 1.3) + ')');
    grad.addColorStop(0.5, 'rgba(150,170,215,' + (a * 0.75) + ')');
    grad.addColorStop(1, 'rgba(150,170,215,' + (a * 1.3) + ')');
    ctx.strokeStyle = grad;
    for (var i = -1; i <= n; i++) {
      var y0 = i * gap + drift;
      var bend = (y0 - cy) * 0.09; // 中央から離れるほど少し弓なりにする
      ctx.beginPath();
      ctx.moveTo(0, y0);
      ctx.quadraticCurveTo(cx, y0 - bend * 2, W, y0);
      ctx.stroke();
    }
  }

  function drawRings(t) {
    var cx = W / 2, cy = H / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineWidth = Math.max(1, DPR);
    ctx.strokeStyle = 'rgba(120,150,220,0.10)';
    ctx.beginPath();
    ctx.arc(0, 0, H * 0.44, 0, Math.PI * 2);
    ctx.stroke();
    ctx.rotate(t * 0.04);
    ctx.setLineDash([H * 0.05, H * 0.03]);
    ctx.strokeStyle = 'rgba(120,150,220,0.07)';
    ctx.beginPath();
    ctx.arc(0, 0, H * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);
  }

  function drawParticle(p, t, level) {
    var tw = 0.55 + 0.45 * Math.sin(t * p.tw + p.ph);
    var alpha = (0.35 + p.z * 0.65) * (0.6 + 0.4 * tw);
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.type === 'dot') {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.fill();
      if (p.z > 0.6) {
        ctx.globalAlpha = alpha * 0.25;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (p.type === 'shard' || p.type === 'crystal') {
      ctx.rotate(p.rot);
      ctx.beginPath();
      for (var i = 0; i < p.pts.length; i++) {
        var q = p.pts[i];
        if (i === 0) ctx.moveTo(q[0] * p.size, q[1] * p.size);
        else ctx.lineTo(q[0] * p.size, q[1] * p.size);
      }
      ctx.closePath();
      if (p.type === 'crystal') {
        ctx.globalAlpha = Math.min(1, alpha * 1.1 + level * 0.3);
        ctx.fillStyle = '#f2f5ff';
        ctx.shadowColor = 'rgba(200,220,255,0.9)';
        ctx.shadowBlur = p.size * 1.5;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = alpha * 0.5;
        ctx.fillStyle = '#b8c8ee';
        ctx.beginPath();
        ctx.moveTo(p.pts[0][0] * p.size, p.pts[0][1] * p.size);
        ctx.lineTo(p.pts[1][0] * p.size, p.pts[1][1] * p.size);
        ctx.lineTo(0, 0);
        ctx.fill();
      } else {
        ctx.globalAlpha = alpha * 0.85;
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.globalAlpha = alpha * 0.7;
        ctx.strokeStyle = 'rgba(190,210,255,0.8)';
        ctx.lineWidth = Math.max(1, DPR * 0.8);
        ctx.stroke();
      }
    } else if (p.type === 'bubble') {
      ctx.globalAlpha = alpha * 0.8;
      ctx.strokeStyle = 'rgba(130,170,255,0.7)';
      ctx.lineWidth = Math.max(1, DPR * 0.9);
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(40,80,200,0.18)';
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(230,240,255,0.9)';
      ctx.beginPath();
      ctx.arc(-p.size * 0.35, -p.size * 0.35, p.size * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function step(p, dt, t) {
    p.x += (p.vx + Math.sin(t * 0.3 + p.ph) * 3 * DPR) * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    var m = 30 * DPR;
    if (p.y < -m) { p.y = H + m; p.x = Math.random() * W; }
    if (p.y > H + m) p.y = -m;
    if (p.x < -m) p.x = W + m;
    if (p.x > W + m) p.x = -m;
  }

  function draw(t, dt, level) {
    if (!ctx) return;
    var g = ctx.createRadialGradient(W / 2, H / 2, H * 0.05, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, '#060c22');
    g.addColorStop(1, '#01030a');
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    drawLines(t, level);
    drawRings(t);
    for (var i = 0; i < particles.length; i++) {
      step(particles[i], dt, t);
      drawParticle(particles[i], t, level);
    }
    ctx.globalAlpha = 1;
  }

  window.Background = { init: init, draw: draw };
})();
