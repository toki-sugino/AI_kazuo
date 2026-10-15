// キャラ：トレースした絵の上に、プログラムで口とまばたきを描いて動かす
//   設定は characters/config.js
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var cfg, wrap, bounceEl, overlay, el = {};
  var imgs = {};             // 表情ごとの <img>
  var expr = null;
  var blink = { next: 2, until: 0 };
  var bounce = 0, nod = 0;

  function svgEl(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(e);
    return e;
  }

  function init(wrapEl, bounce) {
    cfg = window.CHARACTER;
    wrap = wrapEl;
    bounceEl = bounce;
    Object.keys(cfg.expressions).forEach(function (id) {
      var img = document.createElement('img');
      img.src = cfg.expressions[id].src;
      img.alt = '';
      img.className = 'charImg';
      img.hidden = true;
      bounceEl.appendChild(img);
      imgs[id] = img;
    });

    var c = cfg.colors;
    overlay = svgEl('svg', { class: 'charOverlay', 'aria-hidden': 'true' }, bounceEl);
    var defs = svgEl('defs', {}, overlay);
    var clip = svgEl('clipPath', { id: 'mouthClip' }, defs);
    el.clipPath = svgEl('path', {}, clip);
    el.blink = svgEl('g', { visibility: 'hidden' }, overlay);
    el.shade = svgEl('path', { fill: 'none', stroke: c.shade, 'stroke-linecap': 'round' }, overlay);
    el.fill = svgEl('path', { fill: c.mouth }, overlay);
    var g = svgEl('g', { 'clip-path': 'url(#mouthClip)' }, overlay);
    el.tongue = svgEl('ellipse', { fill: c.tongue }, g);
    el.teeth = svgEl('rect', { fill: c.teeth }, g);
    el.line = svgEl('path', { fill: 'none', stroke: c.line, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, overlay);

    setExpression('normal');
  }

  function has(id) { return !!(cfg && cfg.expressions[id]); }

  function setExpression(id) {
    if (!has(id)) id = 'normal';
    if (id === expr) return;
    var x = cfg.expressions[id];
    if (expr) bounce = 1;
    expr = id;
    Object.keys(imgs).forEach(function (k) { imgs[k].hidden = k !== id; });
    overlay.setAttribute('viewBox', '0 0 ' + x.width + ' ' + x.height);
    wrap.style.aspectRatio = x.width + ' / ' + x.height;
    el.line.setAttribute('stroke-width', x.mouth.width || 5);
    el.shade.setAttribute('stroke-width', (x.mouth.width || 5) * 0.9);

    // まばたきの部品を作り直す
    el.blink.innerHTML = '';
    if (x.blink) {
      x.blink.eyes.forEach(function (e) {
        svgEl('ellipse', { cx: e[0], cy: e[1], rx: e[2], ry: e[3], fill: x.skin }, el.blink);
      });
      svgEl('path', { d: x.blink.lines, fill: 'none', stroke: cfg.colors.line, 'stroke-width': (x.mouth.width || 5) * 1.1, 'stroke-linecap': 'round' }, el.blink);
    }
  }

  function f(n) { return n.toFixed(1); }

  // open: 0..1（1を少し超えてもよい）, bright: 0..1（声の明るさ。「い」で横に広く、「お」ですぼめる）
  function drawMouth(m, open, bright) {
    var w = m.rx - m.lx;
    var h = (m.base || 0) + open * m.open;
    var inX = w * (0.06 + (bright - 0.5) * 0.07) * open;
    var up = w * 0.016 * open;
    var lx = m.lx + inX, ly = m.ly - up, rx = m.rx - inX, ry = m.ry - up;
    var cx = (m.lx + m.rx) / 2;
    var top = m.mid - h * 0.12;
    var bot = top + h;
    var d;
    if (m.round) {
      // 丸い口（驚きなど）：角を丸くした形
      var k = w * 0.04;
      var rT = (8 * top - ly - ry) / 6, rB = (8 * bot - ly - ry) / 6;
      d = 'M' + f(lx) + ',' + f(ly) + ' C' + f(lx + k) + ',' + f(rT) + ' ' + f(rx - k) + ',' + f(rT) + ' ' + f(rx) + ',' + f(ry) +
        ' C' + f(rx - k) + ',' + f(rB) + ' ' + f(lx + k) + ',' + f(rB) + ' ' + f(lx) + ',' + f(ly) + 'Z';
    } else {
      var cT = (4 * top - ly - ry) / 2, cB = (4 * bot - ly - ry) / 2;
      d = 'M' + f(lx) + ',' + f(ly) + ' Q' + f(cx) + ',' + f(cT) + ' ' + f(rx) + ',' + f(ry) +
        ' Q' + f(cx) + ',' + f(cB) + ' ' + f(lx) + ',' + f(ly) + 'Z';
    }
    el.line.setAttribute('d', d);
    el.fill.setAttribute('d', d);
    el.clipPath.setAttribute('d', d);
    var inside = h > w * 0.025;
    el.fill.setAttribute('visibility', inside ? 'visible' : 'hidden');

    var showTeeth = m.teeth && h > w * 0.06;
    var topY = Math.min(ly, ry) - w * 0.2;
    el.teeth.setAttribute('x', f(lx - 5));
    el.teeth.setAttribute('y', f(topY));
    el.teeth.setAttribute('width', f(rx - lx + 10));
    el.teeth.setAttribute('height', f(Math.max(0, top + Math.min(h * 0.3, w * 0.075) - topY)));
    el.teeth.setAttribute('visibility', showTeeth ? 'visible' : 'hidden');
    el.tongue.setAttribute('cx', f(cx));
    el.tongue.setAttribute('cy', f(bot));
    el.tongue.setAttribute('rx', f((rx - lx) * 0.3));
    el.tongue.setAttribute('ry', f(h * 0.45));

    if (m.shade) {
      var sy = m.mid + w * 0.16 + h * 0.9, sw = w * 0.18;
      el.shade.setAttribute('d', 'M' + f(cx - sw) + ',' + f(sy) + ' Q' + f(cx) + ',' + f(sy + w * 0.06) + ' ' + f(cx + sw) + ',' + f(sy));
      el.shade.setAttribute('visibility', 'visible');
    } else {
      el.shade.setAttribute('visibility', 'hidden');
    }
  }

  // state: { open: 0..1, bright: 0..1 }
  function update(t, dt, state) {
    if (!expr) return;
    var x = cfg.expressions[expr];
    var open = Math.max(0, Math.min(1.3, state.open));
    drawMouth(x.mouth, open, state.bright || 0.5);

    // まばたき（たまに2回続けて）
    if (t > blink.next) {
      blink.until = t + 0.12;
      blink.next = t + (Math.random() < 0.15 ? 0.3 : 2 + Math.random() * 4);
    }
    el.blink.setAttribute('visibility', x.blink && t < blink.until ? 'visible' : 'hidden');

    // 止まって見えないくらいのゆれ・呼吸・しゃべる時のうなずき・表情を変えた時のぴょこん
    bounce *= Math.exp(-dt * 7);
    nod += (open - nod) * Math.min(1, dt * 10);
    var breathe = Math.sin(t * 1.6) * 0.007;
    var squash = Math.sin(bounce * Math.PI * 3) * bounce * 0.04;
    var rot = Math.sin(t * 0.7) * 0.7 + Math.sin(t * 1.9 + 1) * 0.3 + Math.sin(t * 6) * nod * 0.4;
    bounceEl.style.transform = 'translateY(' + (-nod * 0.5).toFixed(2) + '%) rotate(' + rot.toFixed(3) + 'deg) scale(' +
      (1 - breathe * 0.4 + squash * 0.6).toFixed(4) + ',' + (1 + breathe - squash).toFixed(4) + ')';
  }

  window.TracedChar = {
    init: init,
    has: has,
    setExpression: setExpression,
    update: update
  };
})();
