// AIカズオ（コードで描いたキャラ）：表情・ポーズ・口パク・まばたき・ゆらゆら
(function () {
  'use strict';

  // 青一色の配色（VIVANTのAI画面の雰囲気）
  var C = {
    line: '#0a0f2e',
    hair: '#1b2f8e',
    brow: '#101a4f',
    hairHi: '#4a6fdc',
    hairSide: '#2c42a0',
    skin: '#e2ebf9',
    skinShade: '#c5d4f0',
    suit: '#3a6fd0',
    suitDark: '#2b56aa',
    suitLight: '#4d82e2',
    shirt: '#f0f5ff',
    tie: '#16348c',
    pants: '#3264c4',
    shoe: '#1a2b6b',
    mouth: '#15215a',
    tongue: '#7393e6',
    lens: 'rgba(205,225,255,0.10)',
    glare: 'rgba(255,255,255,0.55)'
  };

  // ===== 表情の数値 =====
  // 目（左目基準、+x が鼻側）: top=上まぶたの一番上, outer/inner=目じり/目頭の高さ, bottom=下まぶた,
  //   iris=黒目の半径, lx/ly=黒目の位置, crease=二重線, arc=1 で「^」の笑い目
  // 眉: outer/inner=眉じり/眉頭の高さ, arch=山の高さ
  // 口: w=閉じた時の半分の幅, wo=開いた時の半分の幅, yl/yr=左右の口角の高さ, ym=口の中央の高さ,
  //   x=横のずれ, base=黙っていても開いている量, max=最大の開き, teeth=上の歯, round=丸い口
  function eye(o) {
    return Object.assign({ top: -12, outer: 0, inner: 0, bottom: 10, iris: 9, lx: 0, ly: 1, crease: 0, arc: 0 }, o);
  }
  var EXPR = {
    normal: { // ニヤリ顔
      eyes: [eye({ top: -5, outer: 2, inner: 0, bottom: 9, iris: 8, lx: 2, ly: 4, crease: 1 }),
             eye({ top: -5, outer: 2, inner: 0, bottom: 9, iris: 8, lx: 2, ly: 4, crease: 1 })],
      brows: [{ outer: -35, inner: -33, arch: -4 }, { outer: -35, inner: -33, arch: -4 }],
      mouth: { w: 15, wo: 19, yl: -1, yr: -8, ym: 3, x: 2, base: 0, max: 22, teeth: 1, round: 0 }
    },
    smile: {
      eyes: [eye({ arc: 1, top: -10, bottom: 6 }), eye({ arc: 1, top: -10, bottom: 6 })],
      brows: [{ outer: -38, inner: -40, arch: -6 }, { outer: -38, inner: -40, arch: -6 }],
      mouth: { w: 20, wo: 22, yl: -6, yr: -6, ym: 5, x: 0, base: 0, max: 22, teeth: 1, round: 0 }
    },
    angry: {
      eyes: [eye({ top: -8, outer: -5, inner: 4, bottom: 9, iris: 8, lx: 1, ly: 2 }),
             eye({ top: -8, outer: -5, inner: 4, bottom: 9, iris: 8, lx: 1, ly: 2 })],
      brows: [{ outer: -44, inner: -27, arch: 1 }, { outer: -44, inner: -27, arch: 1 }],
      mouth: { w: 13, wo: 17, yl: 5, yr: 5, ym: -1, x: 0, base: 0, max: 18, teeth: 1, round: 0 }
    },
    think: { // 考えている・疑っている（片眉を上げて横目）
      eyes: [eye({ top: -4, outer: 2, inner: 2, bottom: 8, iris: 8, lx: 6, ly: 3 }),
             eye({ top: -12, outer: -1, inner: -1, bottom: 10, iris: 9, lx: -6, ly: 1 })],
      brows: [{ outer: -32, inner: -29, arch: -1 }, { outer: -50, inner: -44, arch: -7 }],
      mouth: { w: 10, wo: 13, yl: 0, yr: -3, ym: 2, x: 6, base: 0, max: 14, teeth: 0, round: 0 }
    },
    sad: {
      eyes: [eye({ top: -8, outer: 5, inner: -2, bottom: 9, iris: 9, lx: 0, ly: 3 }),
             eye({ top: -8, outer: 5, inner: -2, bottom: 9, iris: 9, lx: 0, ly: 3 })],
      brows: [{ outer: -32, inner: -46, arch: -1 }, { outer: -32, inner: -46, arch: -1 }],
      mouth: { w: 11, wo: 14, yl: 5, yr: 5, ym: 0, x: 0, base: 0, max: 14, teeth: 0, round: 0 }
    },
    surprise: {
      eyes: [eye({ top: -15, outer: 0, inner: 0, bottom: 12, iris: 6, lx: 0, ly: 0 }),
             eye({ top: -15, outer: 0, inner: 0, bottom: 12, iris: 6, lx: 0, ly: 0 })],
      brows: [{ outer: -48, inner: -51, arch: -8 }, { outer: -48, inner: -51, arch: -8 }],
      mouth: { w: 7, wo: 11, yl: 0, yr: 0, ym: -2, x: 0, base: 8, max: 18, teeth: 0, round: 1 }
    }
  };

  var EYE_L = [155, 252], EYE_R = [245, 252], MOUTH = [200, 308];

  // ===== SVG の組み立て =====
  var S = 'stroke="' + C.line + '" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';

  // とがった髪の毛：点を結び、少し外側へふくらませる
  function spiky(pts, bulge) {
    var d = 'M' + pts[0][0] + ',' + pts[0][1];
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      var dx = b[0] - a[0], dy = b[1] - a[1];
      var nx = dy, ny = -dx; // 時計回りの点列で外向き
      d += ' Q' + (mx + nx * bulge).toFixed(1) + ',' + (my + ny * bulge).toFixed(1) + ' ' + b[0] + ',' + b[1];
    }
    return d + 'Z';
  }

  var HAIR = [
    [107, 242], [103, 204], [98, 182], [106, 172], [100, 148], [114, 140], [114, 116], [134, 112],
    [140, 90], [160, 94], [172, 72], [192, 86], [210, 66], [226, 84], [246, 74], [254, 96],
    [274, 96], [280, 116], [296, 124], [292, 146], [302, 166], [295, 178], [296, 204], [293, 242],
    [286, 212], [280, 184], [268, 196], [262, 168], [246, 190], [236, 160], [216, 188], [204, 156],
    [184, 190], [172, 160], [156, 196], [144, 170], [130, 206], [120, 186], [113, 214]
  ];

  // 両端が丸い棒（腕）
  function capsule(x1, y1, x2, y2, r) {
    var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
    var nx = -dy / len * r, ny = dx / len * r;
    function p(x, y) { return x.toFixed(1) + ',' + y.toFixed(1); }
    return 'M' + p(x1 + nx, y1 + ny) + ' L' + p(x2 + nx, y2 + ny) +
      ' A' + r + ',' + r + ' 0 0 0 ' + p(x2 - nx, y2 - ny) +
      ' L' + p(x1 - nx, y1 - ny) + ' A' + r + ',' + r + ' 0 0 0 ' + p(x1 + nx, y1 + ny) + 'Z';
  }

  function arm(id, d, extra) {
    return '<g id="' + id + '">' +
      '<path d="' + d + '" fill="' + C.suit + '" ' + S + '/>' + (extra || '') + '</g>';
  }

  function hand(cx, cy, rx, ry, rot) {
    return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" transform="rotate(' + rot + ' ' + cx + ' ' + cy + ')" fill="' + C.skin + '" ' + S + '/>';
  }

  function eyeGroup(side, pos) {
    var mirror = side === 'R' ? ' scale(-1,1)' : '';
    return '<g transform="translate(' + pos[0] + ',' + pos[1] + ')' + mirror + '">' +
      '<clipPath id="eyeClip' + side + '"><path id="eyeClipPath' + side + '"/></clipPath>' +
      '<path id="eyeWhite' + side + '" fill="#ffffff"/>' +
      '<g clip-path="url(#eyeClip' + side + ')">' +
        '<g id="iris' + side + '">' +
          '<circle id="irisC' + side + '" r="9" fill="' + C.line + '"/>' +
          '<circle id="irisH' + side + '" r="2.6" fill="#ffffff"/>' +
        '</g>' +
      '</g>' +
      '<path id="lowerLid' + side + '" fill="none" stroke="' + C.line + '" stroke-width="2" stroke-linecap="round" opacity="0.8"/>' +
      '<path id="upperLid' + side + '" fill="none" stroke="' + C.line + '" stroke-width="4.5" stroke-linecap="round"/>' +
      '<path id="crease' + side + '" fill="none" stroke="' + C.line + '" stroke-width="2" stroke-linecap="round"/>' +
      '<path id="arcEye' + side + '" fill="none" stroke="' + C.line + '" stroke-width="5" stroke-linecap="round"/>' +
      '<path id="brow' + side + '" fill="none" stroke="' + C.brow + '" stroke-width="8" stroke-linecap="round"/>' +
    '</g>';
  }

  function build(svg) {
    var lapelL = 'M170,338 L151,371 L165,377 L200,442 Z';
    var lapelR = 'M230,338 L249,371 L235,377 L200,442 Z';
    var html = '' +
      '<defs>' +
        '<clipPath id="mouthClip"><path id="mouthClipPath"/></clipPath>' +
      '</defs>' +
      '<g id="body">' +
        // 足
        '<g id="legs">' +
          '<path d="M152,474 L197,474 L195,529 L156,529 Z" fill="' + C.pants + '" ' + S + '/>' +
          '<path d="M203,474 L248,474 L244,529 L205,529 Z" fill="' + C.pants + '" ' + S + '/>' +
          '<path d="M150,531 C146,548 196,550 198,537 L196,527 L155,527 Z" fill="' + C.shoe + '" ' + S + '/>' +
          '<path d="M250,531 C254,548 204,550 202,537 L204,527 L245,527 Z" fill="' + C.shoe + '" ' + S + '/>' +
        '</g>' +
        // 上着
        '<g id="torso">' +
          '<path d="M124,370 C126,350 150,340 172,337 L228,337 C250,340 274,350 276,370 L271,484 C230,493 170,493 129,484 Z" fill="' + C.suit + '" ' + S + '/>' +
          '<path d="M170,338 L230,338 L200,440 Z" fill="' + C.shirt + '" ' + S + '/>' +
          '<path d="M193,349 L207,349 L205,361 L195,361 Z" fill="' + C.tie + '" ' + S + ' stroke-width="3"/>' +
          '<path d="M195,361 L205,361 L212,418 L200,433 L188,418 Z" fill="' + C.tie + '" ' + S + ' stroke-width="3"/>' +
          '<path d="M171,338 L188,357 L200,347 L212,357 L229,338" fill="' + C.shirt + '" ' + S + ' stroke-width="3"/>' +
          '<path d="' + lapelL + '" fill="' + C.suitLight + '" ' + S + ' stroke-width="3.5"/>' +
          '<path d="' + lapelR + '" fill="' + C.suitLight + '" ' + S + ' stroke-width="3.5"/>' +
          '<circle cx="225" cy="374" r="3.6" fill="#a8c4ff" stroke="' + C.line + '" stroke-width="1.5"/>' +
          '<circle cx="200" cy="456" r="4" fill="' + C.suitDark + '" stroke="' + C.line + '" stroke-width="2"/>' +
          '<path d="M200,462 L200,488" stroke="' + C.line + '" stroke-width="3"/>' +
          '<path d="M146,452 L170,452 M230,452 L254,452" stroke="' + C.line + '" stroke-width="2.5" stroke-linecap="round"/>' +
        '</g>' +
        // ポーズ：腰に手
        '<g id="pose-hips">' +
          arm('armHipL', 'M134,350 C104,360 84,392 82,420 C81,440 104,458 126,470 L141,452 C122,442 108,430 110,418 C112,398 128,384 148,376 Z',
            '<path d="M124,470 L141,450 L148,456 L131,475 Z" fill="' + C.shirt + '" ' + S + ' stroke-width="3"/>' +
            hand(144, 466, 13, 11, -35)) +
          '<use href="#armHipL" transform="translate(400,0) scale(-1,1)"/>' +
        '</g>' +
        // ポーズ：手もみ
        '<g id="pose-rub">' +
          arm('armRubL', 'M136,350 C112,366 104,404 110,438 C116,456 146,452 176,434 L172,410 C160,418 150,420 144,418 C142,398 146,382 154,372 Z',
            '<path d="M168,410 L180,434 L188,430 L178,407 Z" fill="' + C.shirt + '" ' + S + ' stroke-width="3"/>') +
          '<use href="#armRubL" transform="translate(400,0) scale(-1,1)"/>' +
          '<g id="rubHandR">' + hand(210, 418, 16, 14, 20) +
            '<path d="M202,410 Q210,406 220,412" fill="none" stroke="' + C.line + '" stroke-width="2"/></g>' +
          '<g id="rubHandL">' + hand(190, 422, 16, 14, -20) +
            '<path d="M182,428 Q190,432 198,428 M184,420 Q192,424 199,420" fill="none" stroke="' + C.line + '" stroke-width="2"/></g>' +
        '</g>' +
        // ポーズ：腕組み（両手で反対側の二の腕をつかむ）
        '<g id="pose-cross">' +
          '<path d="M134,350 C110,366 102,400 108,436 L144,434 C140,404 146,384 154,374 Z" fill="' + C.suit + '" ' + S + '/>' +
          '<path d="M266,350 C290,366 298,400 292,436 L256,434 C260,404 254,384 246,374 Z" fill="' + C.suit + '" ' + S + '/>' +
          '<path d="' + capsule(284, 428, 140, 404, 17) + '" fill="' + C.suitDark + '" ' + S + '/>' +
          '<path d="' + capsule(150, 398, 144, 416, 9) + '" fill="' + C.shirt + '" ' + S + ' stroke-width="3"/>' +
          hand(130, 398, 14, 12, 15) +
          '<path d="' + capsule(116, 432, 260, 404, 18) + '" fill="' + C.suit + '" ' + S + '/>' +
          '<path d="' + capsule(250, 398, 256, 416, 9) + '" fill="' + C.shirt + '" ' + S + ' stroke-width="3"/>' +
          hand(270, 398, 14, 12, -15) +
        '</g>' +
        // 頭
        '<g id="head">' +
          '<ellipse cx="103" cy="258" rx="15" ry="21" fill="' + C.skin + '" ' + S + '/>' +
          '<ellipse cx="297" cy="258" rx="15" ry="21" fill="' + C.skin + '" ' + S + '/>' +
          '<path d="M104,250 Q98,258 104,268 M296,250 Q302,258 296,268" fill="none" stroke="' + C.line + '" stroke-width="2.5" stroke-linecap="round"/>' +
          '<path d="M108,170 C104,250 116,300 146,326 C170,347 230,347 254,326 C284,300 296,250 292,170 C290,110 110,110 108,170 Z" fill="' + C.skin + '" ' + S + '/>' +
          '<path d="' + spiky(HAIR, 0.12) + '" fill="' + C.hair + '" ' + S + '/>' +
          '<path d="M104,214 Q100,232 107,240 M296,214 Q300,232 293,240" fill="none" stroke="' + C.hairSide + '" stroke-width="6" stroke-linecap="round"/>' +
          '<path d="M150,108 Q170,86 196,90 Q176,98 160,118 Z" fill="' + C.hairHi + '"/>' +
          '<path d="M222,96 Q246,92 262,110 Q244,104 228,108 Z" fill="' + C.hairHi + '"/>' +
          '<path d="M118,150 Q126,132 142,126 Q132,140 126,156 Z" fill="' + C.hairHi + '" opacity="0.8"/>' +
          eyeGroup('L', EYE_L) +
          eyeGroup('R', EYE_R) +
          // メガネ
          '<g id="glasses">' +
            '<rect x="121" y="227" width="68" height="46" rx="9" fill="' + C.lens + '" stroke="' + C.line + '" stroke-width="4"/>' +
            '<rect x="211" y="227" width="68" height="46" rx="9" fill="' + C.lens + '" stroke="' + C.line + '" stroke-width="4"/>' +
            '<path d="M189,241 Q200,235 211,241" fill="none" stroke="' + C.line + '" stroke-width="4"/>' +
            '<path d="M121,240 L108,236 M279,240 L292,236" stroke="' + C.line + '" stroke-width="4" stroke-linecap="round"/>' +
            '<path d="M170,233 L181,233 L160,266 L149,266 Z M260,233 L271,233 L250,266 L239,266 Z" fill="' + C.glare + '" opacity="0.35"/>' +
          '</g>' +
          '<path d="M199,278 Q194,288 201,290 Q205,290 206,287" fill="none" stroke="' + C.line + '" stroke-width="2.8" stroke-linecap="round"/>' +
          // 口
          '<g transform="translate(' + MOUTH[0] + ',' + MOUTH[1] + ') scale(1.35)">' +
            '<path id="mouthFill" fill="' + C.mouth + '"/>' +
            '<g clip-path="url(#mouthClip)">' +
              '<ellipse id="tongue" fill="' + C.tongue + '"/>' +
              '<rect id="teeth" fill="#ffffff"/>' +
            '</g>' +
            '<path id="mouthLine" fill="none" stroke="' + C.line + '" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round"/>' +
          '</g>' +
        '</g>' +
      '</g>';
    svg.innerHTML = html;
  }

  // ===== 動き =====
  var svg, el = {};
  var cur = null;          // 今表示している表情の数値（なめらかに目標へ近づける）
  var target = 'normal';
  var pose = 'hips';
  var blink = { next: 2, start: -1, double: false };
  var look = { x: 0, y: 0, tx: 0, ty: 0, next: 1 };
  var nod = 0, lastOpen = 0, bounce = 0;
  var rub = { on: false, until: 0, next: 1.5 };

  function $(id) { return svg.querySelector('#' + id); }

  function init(svgEl) {
    svg = svgEl;
    build(svg);
    ['body', 'head', 'pose-hips', 'pose-rub', 'pose-cross', 'rubHandL', 'rubHandR',
     'mouthFill', 'mouthLine', 'mouthClipPath', 'teeth', 'tongue'].forEach(function (id) { el[id] = $(id); });
    ['L', 'R'].forEach(function (s) {
      ['eyeClipPath', 'eyeWhite', 'iris', 'irisC', 'irisH', 'lowerLid', 'upperLid', 'crease', 'arcEye', 'brow']
        .forEach(function (id) { el[id + s] = $(id + s); });
    });
    cur = Settings.clone(EXPR.normal);
    setPose('hips', true);
  }

  function setExpression(id) {
    if (EXPR[id]) target = id;
  }

  function setPose(id, silent) {
    if (pose === id && !silent) return;
    pose = id;
    ['hips', 'rub', 'cross'].forEach(function (p) {
      el['pose-' + p].style.display = p === id ? '' : 'none';
    });
    if (!silent) bounce = 1;
  }

  function approach(a, b, k) {
    Object.keys(b).forEach(function (key) {
      var bv = b[key];
      if (typeof bv === 'number') a[key] = a[key] + (bv - a[key]) * k;
      else if (Array.isArray(bv)) bv.forEach(function (item, i) { approach(a[key][i], item, k); });
      else if (bv && typeof bv === 'object') approach(a[key], bv, k);
    });
  }

  function f(n) { return n.toFixed(2); }

  function drawEye(s, e, b) {
    var useArc = e.arc > 0.5;
    var w = 21;
    var top = e.top + (e.bottom - 1 - e.top) * b;
    var yc = (4 * top - e.outer - e.inner) / 2;
    var ycb = (4 * e.bottom - e.outer - e.inner) / 2;
    var upper = 'M' + (-w) + ',' + f(e.outer) + ' Q0,' + f(yc) + ' ' + w + ',' + f(e.inner);
    var shape = upper + ' Q0,' + f(ycb) + ' ' + (-w) + ',' + f(e.outer) + 'Z';
    el['eyeWhite' + s].setAttribute('d', shape);
    el['eyeClipPath' + s].setAttribute('d', shape);
    el['upperLid' + s].setAttribute('d', 'M' + (-w - 3) + ',' + f(e.outer + 1.5) + ' Q0,' + f(yc) + ' ' + (w + 1) + ',' + f(e.inner));
    el['lowerLid' + s].setAttribute('d', 'M' + (-w + 6) + ',' + f(e.outer + (e.bottom - e.outer) * 0.55) + ' Q0,' + f(e.bottom + 3) + ' ' + (w - 6) + ',' + f(e.inner + (e.bottom - e.inner) * 0.55));
    el['crease' + s].setAttribute('d', e.crease > 0.5 && b < 0.5
      ? 'M' + (-w + 2) + ',' + f(top - 8) + ' Q0,' + f(top - 13) + ' ' + (w - 4) + ',' + f(top - 6) : '');
    el['irisC' + s].setAttribute('r', f(e.iris));
    el['irisH' + s].setAttribute('cx', f(-e.iris * 0.35));
    el['irisH' + s].setAttribute('cy', f(-e.iris * 0.35));
    var lx = e.lx + (s === 'L' ? look.x : -look.x);
    el['iris' + s].setAttribute('transform', 'translate(' + f(lx) + ',' + f(e.ly + look.y) + ')');
    el['arcEye' + s].setAttribute('d', useArc ? 'M-17,5 Q0,-15 17,5' : '');
    var vis = useArc ? 'hidden' : 'visible';
    ['eyeWhite', 'iris', 'lowerLid', 'upperLid', 'crease'].forEach(function (id) {
      el[id + s].setAttribute('visibility', vis);
    });
  }

  function drawBrow(s, br, lift) {
    var o = br.outer - lift, i = br.inner - lift;
    var mid = (o + i) / 2 + br.arch;
    el['brow' + s].setAttribute('d', 'M-25,' + f(o) + ' Q-3,' + f(mid * 2 - (o + i) / 2) + ' 19,' + f(i));
  }

  function drawMouth(m, open, bright) {
    var h = m.base + open * m.max * (1.1 - 0.4 * bright);
    var wf = 1 + (0.85 + 0.35 * bright - 1) * open;
    var w = (m.w + (m.wo - m.w) * open) * wf;
    var yTop = m.ym - (m.round ? h * 0.35 : h * 0.12);
    var ycT = (4 * yTop - m.yl - m.yr) / 2;
    var ycB = (4 * (yTop + h) - m.yl - m.yr) / 2;
    var L = f(m.x - w) + ',' + f(m.yl), R = f(m.x + w) + ',' + f(m.yr);
    var d = 'M' + L + ' Q' + f(m.x) + ',' + f(ycT) + ' ' + R + ' Q' + f(m.x) + ',' + f(ycB) + ' ' + L + 'Z';
    el.mouthFill.setAttribute('d', d);
    el.mouthLine.setAttribute('d', d);
    el.mouthClipPath.setAttribute('d', d);
    var showInside = h > 2.5;
    el.mouthFill.setAttribute('visibility', showInside ? 'visible' : 'hidden');
    var teethH = m.teeth > 0.5 && showInside ? Math.min(h * 0.32, 6) : 0;
    el.teeth.setAttribute('x', f(m.x - w - 2));
    el.teeth.setAttribute('y', f(Math.min(m.yl, m.yr) - 14));
    el.teeth.setAttribute('width', f(w * 2 + 4));
    el.teeth.setAttribute('height', f(Math.max(0, yTop + teethH - (Math.min(m.yl, m.yr) - 14))));
    el.teeth.setAttribute('visibility', teethH > 0 ? 'visible' : 'hidden');
    el.tongue.setAttribute('cx', f(m.x));
    el.tongue.setAttribute('cy', f(yTop + h));
    el.tongue.setAttribute('rx', f(w * 0.6));
    el.tongue.setAttribute('ry', f(h * 0.45));
  }

  // state: { open: 0..1, bright: 0..1, level: 0..1 }
  function update(t, dt, state) {
    if (!svg) return;
    var k = 1 - Math.exp(-dt * 16);
    approach(cur, EXPR[target], k);

    // まばたき
    var b = 0;
    if (blink.start < 0 && t >= blink.next) { blink.start = t; blink.double = Math.random() < 0.15; }
    if (blink.start >= 0) {
      var p = (t - blink.start) / 0.15;
      if (p >= 1) {
        if (blink.double) { blink.start = t + 0.08; blink.double = false; }
        else { blink.start = -1; blink.next = t + 1.8 + Math.random() * 4; }
      } else if (p > 0) b = Math.sin(Math.PI * p);
    }
    if (target === 'surprise') b *= 0.3;

    // 視線のゆれ
    if (t >= look.next) {
      look.tx = (Math.random() - 0.5) * 3;
      look.ty = (Math.random() - 0.5) * 1.6;
      look.next = t + 1 + Math.random() * 3;
    }
    look.x += (look.tx - look.x) * Math.min(1, dt * 12);
    look.y += (look.ty - look.y) * Math.min(1, dt * 12);

    var open = Math.max(0, Math.min(1.2, state.open));
    drawEye('L', cur.eyes[0], b);
    drawEye('R', cur.eyes[1], b);
    var lift = open * 2.5; // しゃべると眉が少し上がる
    drawBrow('L', cur.brows[0], lift);
    drawBrow('R', cur.brows[1], lift);
    drawMouth(cur.mouth, open, state.bright || 0);

    // 頭のゆれ（止まって見えないくらい少し）としゃべる時のうなずき
    var dOpen = open - lastOpen;
    lastOpen = open;
    nod += ((open * 3 + Math.max(0, dOpen) * 25) - nod) * Math.min(1, dt * 10);
    var sway = Math.sin(t * 0.7) * 1.4 + Math.sin(t * 1.9 + 1) * 0.5;
    var headY = -nod * 0.8 + Math.sin(t * 1.3) * 0.6;
    el.head.setAttribute('transform', 'rotate(' + f(sway + open * Math.sin(t * 5) * 1.2) + ' 200 338) translate(0,' + f(headY) + ')');

    // 呼吸と、ポーズを変えた時のぴょこん
    bounce *= Math.exp(-dt * 7);
    var breathe = Math.sin(t * 1.6) * 0.008;
    var squash = Math.sin(bounce * Math.PI * 3) * bounce * 0.05;
    var sy = 1 + breathe - squash, sx = 1 - breathe * 0.4 + squash * 0.6;
    el.body.setAttribute('transform', 'translate(200,548) scale(' + f(sx * 1000 / 1000) + ',' + f(sy) + ') translate(-200,-548)');

    // 手もみ（ときどき手をこすり合わせる）
    if (pose === 'rub') {
      if (!rub.on && t > rub.next) { rub.on = true; rub.until = t + 1.2 + Math.random() * 1.2; }
      if (rub.on && t > rub.until) { rub.on = false; rub.next = t + 1.5 + Math.random() * 3; }
      var r = rub.on ? Math.sin(t * 13) * 3 : 0;
      el.rubHandL.setAttribute('transform', 'translate(' + f(r * 0.6) + ',' + f(r) + ')');
      el.rubHandR.setAttribute('transform', 'translate(' + f(-r * 0.6) + ',' + f(-r) + ')');
    }
  }

  window.Character = {
    init: init,
    update: update,
    setExpression: setExpression,
    setPose: setPose,
    expressions: Object.keys(EXPR)
  };
})();
