# -*- coding: utf-8 -*-
"""生成 E2E 测试页用的本地图片（尺寸/格式各异）"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "site")
os.makedirs(OUT, exist_ok=True)

def make(name, size, color, text, fmt=None):
    img = Image.new("RGB", size, color)
    d = ImageDraw.Draw(img)
    d.text((size[0] // 3, size[1] // 2), text, fill=(255, 255, 255))
    img.save(os.path.join(OUT, name), format=fmt)
    print(name, size)

make("big.jpg", (1200, 800), (180, 60, 60), "big 1200x800")
make("mid.png", (640, 480), (60, 120, 180), "mid 640x480")
make("lazy-real.jpg", (800, 600), (60, 160, 90), "lazy 800x600")
make("bg.png", (500, 500), (140, 90, 160), "bg 500x500")
make("tiny-icon.png", (32, 32), (200, 200, 60), "")
make("pic-source.webp", (700, 500), (90, 90, 140), "webp 700x500", fmt="WEBP")
make("linked.jpg", (900, 700), (160, 130, 50), "linked 900x700")
# 超长页用的底部图（测滚动懒加载）
make("bottom.jpg", (600, 400), (50, 150, 150), "bottom 600x400")
print("done ->", OUT)
