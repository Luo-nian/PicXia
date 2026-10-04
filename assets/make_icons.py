# -*- coding: utf-8 -*-
"""图匣图标生成器：几何器物风，左右完全对称。
设计：深色圆角方底 + 金色线稿「下箭头落入开匣」。
跑一次生成 icons/icon16/32/48/128.png。
"""
import os
from PIL import Image, ImageDraw

S = 1024                      # 绘制尺寸（最后缩小，保证边缘平滑）
INK = (31, 27, 22, 255)       # 深底
GOLD = (201, 162, 39, 255)    # 金
GOLD_DK = (138, 116, 42, 255) # 暗金（内层线）

def draw_icon(size=S):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = size / 1024.0  # 单位换算

    # 圆角方底
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(210 * u), fill=INK)

    # 外圈细金边（双线，器物轮廓感）
    d.rounded_rectangle([int(36*u)] * 2 + [size - 1 - int(36*u)] * 2,
                        radius=int(180 * u), outline=GOLD, width=int(16 * u))
    d.rounded_rectangle([int(72*u)] * 2 + [size - 1 - int(72*u)] * 2,
                        radius=int(152 * u), outline=GOLD_DK, width=int(6 * u))

    cx = size // 2
    lw = int(34 * u)  # 主线宽

    # —— 匣（开口向上的梯形托盘，左右对称）——
    tray_top_y = int(690 * u)
    tray_bot_y = int(830 * u)
    half_top = int(300 * u)
    half_bot = int(210 * u)
    d.line([(cx - half_top, tray_top_y), (cx - half_bot, tray_bot_y)], fill=GOLD, width=lw)
    d.line([(cx + half_top, tray_top_y), (cx + half_bot, tray_bot_y)], fill=GOLD, width=lw)
    d.line([(cx - half_bot, tray_bot_y), (cx + half_bot, tray_bot_y)], fill=GOLD, width=lw)

    # —— 下落箭头（竖直中线 + 对称箭头翼）——
    arr_top = int(220 * u)
    arr_end = int(600 * u)
    d.line([(cx, arr_top), (cx, arr_end)], fill=GOLD, width=lw)
    wing = int(150 * u)
    wing_up = int(150 * u)
    d.line([(cx - wing, arr_end - wing_up), (cx, arr_end)], fill=GOLD, width=lw)
    d.line([(cx + wing, arr_end - wing_up), (cx, arr_end)], fill=GOLD, width=lw)

    # 箭头上方两道对称短刻线（速度感，对称）
    tick_w = int(10 * u)
    for dy, hl in [(int(300 * u), int(46 * u)), (int(420 * u), int(70 * u))]:
        off = int(120 * u)
        d.line([(cx - off, dy - hl // 2), (cx - off, dy + hl // 2)], fill=GOLD_DK, width=tick_w)
        d.line([(cx + off, dy - hl // 2), (cx + off, dy + hl // 2)], fill=GOLD_DK, width=tick_w)

    return img

def main():
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
    os.makedirs(out, exist_ok=True)
    base = draw_icon()
    base.save(os.path.join(out, "icon-src-1024.png"))
    for s in (128, 48, 32, 16):
        base.resize((s, s), Image.LANCZOS).save(os.path.join(out, f"icon{s}.png"))
    print("icons done ->", os.path.abspath(out))

if __name__ == "__main__":
    main()
