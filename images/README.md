# キャラ画像の置き場所

このフォルダに、次の名前で画像を置いてください（小文字・半角）。

| 表情（キー） | 口閉じ（必須） | 半開き（任意） | 口開き | まばたき（任意） |
|---|---|---|---|---|
| 1 通常 | `normal_closed.png` | `normal_half.png` | `normal_open.png` | `normal_blink.png` |
| 2 笑顔 | `smile_closed.png` | `smile_half.png` | `smile_open.png` | `smile_blink.png` |
| 3 怒り | `angry_closed.png` | `angry_half.png` | `angry_open.png` | `angry_blink.png` |
| 4 考え・疑い | `think_closed.png` | `think_half.png` | `think_open.png` | `think_blink.png` |
| 5 困り・悲しみ | `sad_closed.png` | `sad_half.png` | `sad_open.png` | `sad_blink.png` |
| 6 驚き | `surprise_closed.png` | `surprise_half.png` | `surprise_open.png` | `surprise_blink.png` |

- 最低限 `normal_closed.png` と `normal_open.png` があれば動きます。
- その表情の「口閉じ」がない場合は、「通常」の画像を使います。
- 半開きやまばたきがない場合は、口閉じや口開きで代わりに表示します。
- **同じ表情の画像（口閉じ・半開き・口開き・まばたき）は、画像の大きさと絵の位置を完全にそろえてください。** 位置がずれていると、しゃべるたびに体がガタガタ動いて見えます。
