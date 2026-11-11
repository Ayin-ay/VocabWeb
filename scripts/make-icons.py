"""从 app-assets/icon-master.png 生成安卓图标与启动屏全套尺寸。

改了主图再跑一次：python scripts/make-icons.py
只碰 android/app/src/main/res，不碰任何业务代码。

主图是「四块瓷砖 + 浅灰底」的位图，这里先把灰底和瓷砖投影抠成透明：
按饱和度找出色底，再从四边做连通域，只清掉与画布边缘连通的那一片。
白 V 自己也是低饱和的，但它被深绿块围住、不连通到边缘，所以不会被吃掉。
"""

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "app-assets" / "icon-master.png"
RES = ROOT / "android" / "app" / "src" / "main" / "res"

# 自适应图标的背景层：整张图就是四块浮空的瓷砖，底色要透明，让桌面壁纸透出来
BG = "#00000000"
SPLASH_BG = "#f6f6f4"

# 饱和度低于这个值算底色/投影（灰底 3、投影 0–2，米白块 15、薄荷块 26、深绿块 48）
CHROMA_MAX = 8

# 自适应图标前景：108dp 画布，可见区最小是中间 66dp 的圆。
# 主图是方的 2×2 拼块，四个外角正好落在正方形角上，所以要按对角线缩：66/√2 ≈ 46.7dp，
# 占画布 43%。按 66/108=61% 铺满会被圆形遮罩削成四片花瓣。
FOREGROUND = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
SAFE = 66 / 108 / 2**0.5
LEGACY = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
SPLASH = {
    "drawable-land-hdpi": (800, 480),
    "drawable-land-mdpi": (480, 320),
    "drawable-land-xhdpi": (1280, 720),
    "drawable-land-xxhdpi": (1600, 960),
    "drawable-land-xxxhdpi": (1920, 1280),
    "drawable-port-hdpi": (480, 800),
    "drawable-port-mdpi": (320, 480),
    "drawable-port-xhdpi": (720, 1280),
    "drawable-port-xxhdpi": (960, 1600),
    "drawable-port-xxxhdpi": (1280, 1920),
    "drawable": (480, 320),
}


def key_out(im: Image.Image) -> Image.Image:
    """把主图与画布边缘连通的灰底（含瓷砖投影）换成透明，只留四块瓷砖本身"""
    rgb = np.asarray(im.convert("RGB")).astype(np.int16)
    bg_like = (rgb.max(axis=2) - rgb.min(axis=2)) < CHROMA_MAX
    h, w = bg_like.shape
    flood = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()

    def seed(y: int, x: int) -> None:
        if bg_like[y, x] and not flood[y, x]:
            flood[y, x] = True
            q.append((y, x))

    for x in range(w):
        seed(0, x)
        seed(h - 1, x)
    for y in range(h):
        seed(y, 0)
        seed(y, w - 1)
    while q:
        y, x = q.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and bg_like[ny, nx] and not flood[ny, nx]:
                flood[ny, nx] = True
                q.append((ny, nx))

    alpha = np.where(flood, 0, 255).astype(np.uint8)
    return Image.fromarray(np.dstack([rgb.astype(np.uint8), alpha]), "RGBA")


def mark_on(size: int, ratio: float, bg: str | None) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg if bg else (0, 0, 0, 0))
    side = int(size * ratio)
    m = MARK.copy()
    m.thumbnail((side, side), Image.LANCZOS)
    canvas.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return canvas


def png(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "PNG")
    print(f"{path.relative_to(ROOT)}  {im.width}x{im.height}")


master = Image.open(MASTER).convert("RGBA")
KEYED = key_out(master)
bbox = KEYED.getbbox()
assert bbox, "主图抠不出标记：底色和瓷砖颜色太接近"
MARK = KEYED.crop(bbox)
print(f"抠底后保留 {MARK.size[0]}x{MARK.size[1]}，占画布 {(bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) / (master.width * master.height):.0%}")

for d, s in LEGACY.items():
    tile = KEYED.resize((s, s), Image.LANCZOS)
    png(tile, RES / f"mipmap-{d}" / "ic_launcher.png")
    round_im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, s - 1, s - 1), fill=255)
    round_im.paste(tile, (0, 0), mask)
    png(round_im, RES / f"mipmap-{d}" / "ic_launcher_round.png")

for d, s in FOREGROUND.items():
    png(mark_on(s, SAFE, None), RES / f"mipmap-{d}" / "ic_launcher_foreground.png")

for d, (w, h) in SPLASH.items():
    canvas = Image.new("RGBA", (w, h), SPLASH_BG)
    # 启动屏用抠好底的整组图：四块瓷砖自带圆角，不再另加圆角遮罩去切它们
    side = int(min(w, h) * 0.34)
    canvas.alpha_composite(KEYED.resize((side, side), Image.LANCZOS), ((w - side) // 2, (h - side) // 2))
    png(canvas.convert("RGB"), RES / d / "splash.png")

(RES / "values" / "ic_launcher_background.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">'
    + BG.upper()
    + "</color>\n</resources>",
    encoding="utf-8",
)
print(f"values/ic_launcher_background.xml  {BG}")
