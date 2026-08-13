#!/usr/bin/env python3
"""Rasterize the app icon to PNG at the sizes PWA installs need.

Pure stdlib — no Pillow on the build image — so this hand-rolls a tiny
RGBA PNG encoder (zlib + the four mandatory chunks).
"""
import os, struct, zlib

BG   = (0x1b, 0x1a, 0x18, 255)
GOLD = (0xd9, 0x8b, 0x6a, 255)
BASE = (0x8a, 0x42, 0x30, 255)

# Geometry in a 512-unit design space, matching icons/icon.svg.
RECTS = [
    ((118, 214, 174, 396), GOLD), ((338, 214, 394, 396), GOLD),
    ((222, 168, 290, 396), GOLD), ((96, 400, 416, 426), BASE),
    ((136, 250, 156, 280), BG),   ((356, 250, 376, 280), BG),
    ((246, 212, 266, 244), BG),
]
TRIS = [
    (((110, 214), (182, 214), (146, 168)), GOLD),
    (((330, 214), (402, 214), (366, 168)), GOLD),
    (((212, 168), (300, 168), (256, 112)), GOLD),
]

def blend(dst, src):
    a = src[3] / 255
    return tuple(round(src[i] * a + dst[i] * (1 - a)) for i in range(3)) + (255,)

def in_tri(px, py, t):
    (x1, y1), (x2, y2), (x3, y3) = t
    d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3)
    if d == 0:
        return False
    a = ((y2 - y3) * (px - x3) + (x3 - x2) * (py - y3)) / d
    b = ((y3 - y1) * (px - x3) + (x1 - x3) * (py - y3)) / d
    return a >= 0 and b >= 0 and a + b <= 1

def render(size):
    s = size / 512
    r = 96 * s                                   # corner radius
    px = [[(0, 0, 0, 0)] * size for _ in range(size)]
    for y in range(size):
        for x in range(size):
            cx = min(max(x + .5, r), size - r)
            cy = min(max(y + .5, r), size - r)
            if (x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 <= r * r + 1e-9:
                px[y][x] = BG
    for (x0, y0, x1, y1), col in RECTS:
        for y in range(int(y0 * s), int(y1 * s)):
            for x in range(int(x0 * s), int(x1 * s)):
                if 0 <= x < size and 0 <= y < size and px[y][x][3]:
                    px[y][x] = blend(px[y][x], col)
    for tri, col in TRIS:
        t = tuple((vx * s, vy * s) for vx, vy in tri)
        ys = [v[1] for v in t]; xs = [v[0] for v in t]
        for y in range(int(min(ys)), int(max(ys)) + 1):
            for x in range(int(min(xs)), int(max(xs)) + 1):
                if 0 <= x < size and 0 <= y < size and px[y][x][3] and in_tri(x + .5, y + .5, t):
                    px[y][x] = blend(px[y][x], col)
    return px

def write_png(path, px):
    size = len(px)
    raw = b''.join(b'\x00' + bytes(v for p in row for v in p) for row in px)
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'wb').write(png)
    return len(png)

if __name__ == '__main__':
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for n in (180, 192, 512):
        p = os.path.join(here, 'site', 'icons', f'icon-{n}.png')
        print(f'  icon-{n}.png  {write_png(p, render(n)):,} bytes')
