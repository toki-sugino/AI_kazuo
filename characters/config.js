// キャラの設定：表情ごとの絵（トレースしたSVG）と、口・まばたきの位置
//   座標はそのSVGの中の位置（左上が 0,0 / 単位は元画像のピクセル）
//
//   mouth: 口。黙っている時は口角(lx,ly)〜(rx,ry)を結ぶ線になり、mid はその線の真ん中の高さ。
//          mid が口角より下なら笑った口、上ならへの字口。
//          open=しゃべった時に開く最大の高さ, base=黙っていても開いている量（驚きの口など）,
//          teeth=上の歯を見せるか, shade=下くちびるの影を描くか, width=線の太さ
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
      src: 'characters/normal.svg',
      width: 765,
      height: 1024,
      skin: '#cddcf6',
      mouth: { lx: 328, ly: 521, rx: 449, ry: 516, mid: 532, open: 46, base: 0, teeth: true, shade: true, width: 5.5 },
      blink: {
        eyes: [[301, 407, 38, 17], [465, 405, 38, 17]],
        lines: 'M266,409 Q300,421 337,407 M429,407 Q465,419 501,409'
      }
    }
    // smile / angry / think / sad / surprise は、画像ができたら同じ形で追加する
  }
};
