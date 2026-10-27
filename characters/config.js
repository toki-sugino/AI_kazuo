// キャラの設定：表情ごとの絵（トレースしたSVG）と、口・まばたきの位置
//   座標はそのSVGの中の位置（左上が 0,0 / 単位は元画像のピクセル）
//
//   mouth: 口。黙っている時は口角(lx,ly)〜(rx,ry)を結ぶ線になり、mid はその線の真ん中の高さ。
//          mid が口角より下なら笑った口、上ならへの字口。
//          open=しゃべった時に開く最大の高さ, base=黙っていても開いている量（驚きの口など）,
//          teeth=上の歯を見せるか, shade=下くちびるの影を描くか, round=丸い口にするか, width=線の太さ
//   blink: まばたき。eyes=目をかくす楕円 [中心x, 中心y, 横半径, 縦半径]、lines=閉じた目の線。
//          null にするとまばたきしない（もともと目を閉じている絵など）
//   skin:  目をかくす時の肌の色
window.CHARACTER = {
  colors: {
    line: '#0a1137',
    mouth: '#121b52',
    teeth: '#f4f7ff',
    tongue: '#5a7bd6',
    shade: '#9db9ee'
  },
  expressions: {
    normal: {
      src: 'characters/normal.svg?v=202610270226',
      width: 765,
      height: 1024,
      skin: '#cddcf6',
      mouth: { lx: 328, ly: 521, rx: 449, ry: 516, mid: 532, open: 46, base: 0, teeth: true, shade: true, width: 5.5 },
      blink: {
        eyes: [[301, 407, 38, 17], [465, 405, 38, 17]],
        lines: 'M266,409 Q300,421 337,407 M429,407 Q465,419 501,409'
      }
    },
    smile: {
      src: 'characters/smile.svg?v=202610270226',
      width: 765,
      height: 1024,
      skin: '#cadbf6',
      mouth: { lx: 324, ly: 522, rx: 446, ry: 519, mid: 528, open: 36, base: 14, teeth: true, shade: false, width: 5.5 },
      blink: {
        eyes: [[301, 407, 38, 15], [463, 404, 39, 15]],
        lines: 'M265,408 Q300,420 337,406 M427,405 Q463,417 501,407'
      }
    },
    think: {
      src: 'characters/think.svg?v=202610270226',
      width: 765,
      height: 1024,
      skin: '#cbdcf6',
      mouth: { lx: 340, ly: 543, rx: 437, ry: 529, mid: 534, open: 34, base: 0, teeth: false, shade: false, width: 5.5 },
      blink: {
        eyes: [[301, 410, 38, 14], [462, 406, 39, 14]],
        lines: 'M265,410 Q300,421 337,409 M425,406 Q462,417 500,408'
      }
    },
    surprise: {
      src: 'characters/surprise.svg?v=202610270226',
      width: 765,
      height: 1024,
      skin: '#cbdcf6',
      mouth: { lx: 340, ly: 535, rx: 440, ry: 530, mid: 525, open: 22, base: 30, teeth: false, shade: false, round: true, width: 5.5 },
      blink: {
        eyes: [[300, 413, 43, 26], [465, 411, 43, 26]],
        lines: 'M262,414 Q300,428 340,412 M425,412 Q465,426 503,414'
      }
    },
    assert: {
      src: 'characters/assert.svg?v=202610270226',
      width: 765,
      height: 1024,
      skin: '#c9dbf6',
      mouth: { lx: 334, ly: 532, rx: 446, ry: 511, mid: 528, open: 40, base: 6, teeth: true, shade: false, width: 5.5 },
      blink: {
        eyes: [[300, 410, 40, 17], [464, 407, 39, 17]],
        lines: 'M262,412 Q300,424 340,410 M426,409 Q464,421 503,410'
      }
    }
  }
};
