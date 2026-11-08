"""从 app-assets/icon-master.png 生成安卓图标与启动屏全套尺寸。

改了主图再跑一次：python scripts/make-icons.py
只碰 android/app/src/main/res，不碰任何业务代码。
"""

import struct
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "app-assets" / "icon-master.png"
RES = ROOT / "android" / "app" / "src" / "main" / "res"

BG = "#2f5d50"
SPLASH_BG = "#f6f6f4"

# 自适应图标前景：108dp 画布，安全区只占中间 66dp，留出 61% 给圆形遮罩
FOREGROUND = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
SAFE = 66 / 108
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
    """把主图的纯色底换成透明，只留标记本身"""
    im = im.convert("RGBA")
    base = im.getpixel((2, 2))
    px = im.load()
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    dst = out.load()
    limit = 90.0**2
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            d = (r - base[0]) ** 2 + (g - base[1]) ** 2 + (b - base[2]) ** 2
            if d >= limit:
                dst[x, y] = (r, g, b, a)
    return out


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
MARK = key_out(master)
bbox = MARK.getbbox()
assert bbox, "主图抠不出标记：底色和标记颜色太接近"
MARK = MARK.crop(bbox)

for d, s in LEGACY.items():
    png(master.resize((s, s), Image.LANCZOS), RES / f"mipmap-{d}" / "ic_launcher.png")
    round_im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, s - 1, s - 1), fill=255)
    round_im.paste(master.resize((s, s), Image.LANCZOS), (0, 0), mask)
    png(round_im, RES / f"mipmap-{d}" / "ic_launcher_round.png")

for d, s in FOREGROUND.items():
    png(mark_on(s, SAFE, None), RES / f"mipmap-{d}" / "ic_launcher_foreground.png")

for d, (w, h) in SPLASH.items():
    canvas = Image.new("RGBA", (w, h), SPLASH_BG)
    # 启动屏直接用整块绿底图标：抠出来的浅色标记压在浅灰底上几乎看不见
    side = int(min(w, h) * 0.34)
    tile = master.resize((side, side), Image.LANCZOS)
    corners = Image.new("L", (side, side), 0)
    ImageDraw.Draw(corners).rounded_rectangle((0, 0, side - 1, side - 1), int(side * 0.22), fill=255)
    tile.putalpha(corners)
    canvas.alpha_composite(tile, ((w - side) // 2, (h - side) // 2))
    png(canvas.convert("RGB"), RES / d / "splash.png")

(RES / "values" / "ic_launcher_background.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">'
    + BG.upper()
    + "</color>\n</resources>",
    encoding="utf-8",
)
print(f"values/ic_launcher_background.xml  {BG}")
