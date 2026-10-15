"""白背景のキャラ画像を、アプリで使うSVGに変換する。

  1. 青一色（VIVANTのAI画面風）にする（--keep-color で元の色のまま）
  2. 周りの白い背景を透明にする
  3. 口を肌の色で塗りつぶして消す（--mouth で場所を指定）
  4. トレースしてSVGにする

使い方:
  pip install vtracer pillow numpy
  python tools/make_character.py 元画像.png characters/smile.svg --mouth 318,505,460,563

  --mouth は消す口の範囲（楕円が収まる四角の 左,上,右,下。元画像のピクセル座標）。
  最後に表示される「肌の色」を characters/config.js の skin に書く。
  口の位置（lx,ly,rx,ry,mid）とまばたきの位置も、元画像のピクセル座標で config.js に書く。
"""
import argparse

import numpy as np
import vtracer
from PIL import Image, ImageDraw

# 明るさ → 青の対応（暗い所は紺、明るい所は白っぽい水色）
BLUE_STOPS = [
    (0.00, (8, 12, 40)),
    (0.25, (20, 40, 130)),
    (0.50, (45, 95, 200)),
    (0.75, (120, 165, 235)),
    (0.92, (225, 235, 250)),
    (1.00, (255, 255, 255)),
]


def to_blue(im):
    a = np.asarray(im.convert('RGB')).astype(float) / 255
    lum = 0.3 * a[..., 0] + 0.59 * a[..., 1] + 0.11 * a[..., 2]
    out = np.zeros(a.shape)
    for (p0, c0), (p1, c1) in zip(BLUE_STOPS, BLUE_STOPS[1:]):
        m = (lum >= p0) & (lum <= p1)
        t = ((lum - p0) / (p1 - p0))[m][:, None]
        out[m] = np.array(c0) * (1 - t) + np.array(c1) * t
    return Image.fromarray(out.astype('uint8'))


def background_mask(im):
    """画像の端からつながっている白い部分を背景とみなす。"""
    w, h = im.size
    mark = im.copy()
    magic = (255, 0, 255)
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),
             (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]
    for seed in seeds:
        if mark.getpixel(seed) != magic:
            ImageDraw.floodfill(mark, seed, magic, thresh=40)
    return np.all(np.asarray(mark) == magic, axis=2)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--mouth', help='消す口の範囲 左,上,右,下')
    ap.add_argument('--keep-color', action='store_true', help='青一色にしない')
    ap.add_argument('--preview', help='確認用PNGの保存先')
    args = ap.parse_args()

    im = Image.open(args.src).convert('RGB')
    if not args.keep_color:
        im = to_blue(im)

    skin = None
    if args.mouth:
        x0, y0, x1, y1 = [int(v) for v in args.mouth.split(',')]
        a = np.asarray(im).astype(int)
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        ring = [a[y0 - 6, cx], a[y1 + 6, cx], a[cy, x0 - 4], a[cy, x1 + 4]]
        skin = tuple(int(v) for v in np.median(np.array(ring), axis=0))
        ImageDraw.Draw(im).ellipse([x0, y0, x1, y1], fill=skin)

    mask = background_mask(im)
    rgba = np.dstack([np.asarray(im), np.where(mask, 0, 255).astype('uint8')])
    tmp = args.dst + '.tmp.png'
    Image.fromarray(rgba, 'RGBA').save(tmp)
    vtracer.convert_image_to_svg_py(
        tmp, args.dst, colormode='color', hierarchical='stacked', mode='spline',
        filter_speckle=4, color_precision=6, layer_difference=16, corner_threshold=60,
        length_threshold=4.0, splice_threshold=45, path_precision=1)
    if args.preview:
        Image.fromarray(rgba, 'RGBA').save(args.preview)

    # ブラウザで大きさを合わせやすいように viewBox を付ける
    w, h = im.size
    svg = open(args.dst, encoding='utf-8').read()
    svg = svg[svg.index('<svg'):]
    svg = svg.replace('width="%d" height="%d"' % (w, h),
                      'viewBox="0 0 %d %d" width="%d" height="%d"' % (w, h, w, h), 1)
    open(args.dst, 'w', encoding='utf-8').write(svg)

    import os
    os.remove(tmp)
    print('保存しました:', args.dst, '大きさ: %dx%d' % (w, h))
    if skin:
        print('肌の色: #%02x%02x%02x' % skin)


if __name__ == '__main__':
    main()
