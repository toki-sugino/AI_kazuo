"""読み込むファイルに付けている版番号（?v=...）を新しくする。

ブラウザは GitHub Pages のファイルをしばらく覚えている（キャッシュする）ので、
更新したのに古い見た目のまま、ということが起きる。版番号を変えると、必ず新しいファイルを読み込む。

使い方（更新をコミットする前に実行）:
  python tools/bump_version.py
"""
import pathlib
import re
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = ['index.html', 'screen.html', 'js/app.js', 'characters/config.js']

version = time.strftime('%Y%m%d%H%M')
pattern = re.compile(r'(\.(?:css|js|html|svg))\?v=[0-9]+')
for name in FILES:
    path = ROOT / name
    text = path.read_text(encoding='utf-8')
    new = pattern.sub(r'\1?v=' + version, text)
    path.write_text(new, encoding='utf-8')
print('版番号:', version)
