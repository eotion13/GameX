#!/usr/bin/env python3
"""Erzeugt die App-Icons als PNG - ohne externe Abhaengigkeiten.

Zeichnet dieselbe Grafik wie icons/icon.svg mit 3-fachem Supersampling.
    python3 tools/make-icons.py
"""
import math, struct, zlib, pathlib

BG      = (0x0f, 0x14, 0x20)
KANTE   = (0x38, 0x43, 0x5c)
KNOTEN  = (0x2b, 0x33, 0x50)
RAND    = (0x7a, 0x6a, 0x3a)
AKZENT  = (0xff, 0xd1, 0x66)
S = 512.0                      # Koordinatensystem der SVG-Vorlage
SS = 3                         # Supersampling


def zeichne(groesse):
    n = groesse * SS
    k = n / S                                   # Skalierung SVG -> Pixel
    buf = [[(0, 0, 0, 0)] * n for _ in range(n)]

    def setz(x, y, farbe):
        if 0 <= x < n and 0 <= y < n:
            buf[y][x] = farbe + (255,)

    def scheibe(cx, cy, r, farbe, r_innen=0.0):
        cx, cy, r, r_innen = cx * k, cy * k, r * k, r_innen * k
        for y in range(max(0, int(cy - r - 1)), min(n, int(cy + r + 2))):
            for x in range(max(0, int(cx - r - 1)), min(n, int(cx + r + 2))):
                d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
                if r_innen <= d <= r:
                    setz(x, y, farbe)

    def strecke(x1, y1, x2, y2, breite, farbe):
        x1, y1, x2, y2, breite = x1 * k, y1 * k, x2 * k, y2 * k, breite * k
        dx, dy = x2 - x1, y2 - y1
        laenge = math.hypot(dx, dy)
        schritte = max(1, int(laenge * 2))
        for i in range(schritte + 1):
            t = i / schritte
            scheibe((x1 + dx * t) / k, (y1 + dy * t) / k, breite / 2 / k, farbe)

    def rundes_rechteck(x0, y0, x1, y1, r, farbe):
        x0, y0, x1, y1, r = x0 * k, y0 * k, x1 * k, y1 * k, r * k
        for y in range(n):
            for x in range(n):
                px, py = x + 0.5, y + 0.5
                if not (x0 <= px <= x1 and y0 <= py <= y1):
                    continue
                cx = min(max(px, x0 + r), x1 - r)
                cy = min(max(py, y0 + r), y1 - r)
                if math.hypot(px - cx, py - cy) <= r:
                    setz(x, y, farbe)

    def raute(cx, cy, r, farbe):
        cx, cy, r = cx * k, cy * k, r * k
        for y in range(max(0, int(cy - r - 1)), min(n, int(cy + r + 2))):
            for x in range(max(0, int(cx - r - 1)), min(n, int(cx + r + 2))):
                if abs(x + 0.5 - cx) + abs(y + 0.5 - cy) <= r:
                    setz(x, y, farbe)

    rundes_rechteck(0, 0, S, S, 112, BG)

    # Ringe und Speichen
    scheibe(256, 256, 155, KANTE, 145)
    strecke(256, 106, 256, 406, 10, KANTE)
    strecke(126, 181, 386, 331, 10, KANTE)
    strecke(126, 331, 386, 181, 10, KANTE)

    # Aeussere Knoten
    for gx, gy in [(256, 106), (386, 181), (386, 331), (256, 406), (126, 331), (126, 181)]:
        scheibe(gx, gy, 38, RAND)
        scheibe(gx, gy, 32, KNOTEN)

    # Knotenpunkt
    scheibe(256, 256, 52, AKZENT)
    raute(256, 256, 28, BG)

    # Herunterrechnen (Supersampling aufloesen)
    px = bytearray()
    for y in range(groesse):
        px.append(0)
        for x in range(groesse):
            r = g = b = 0
            for dy in range(SS):
                for dx in range(SS):
                    c = buf[y * SS + dy][x * SS + dx]
                    r += c[0]; g += c[1]; b += c[2]
            m = SS * SS
            px += bytes((r // m, g // m, b // m))
    return bytes(px)


def png(groesse, daten):
    def chunk(typ, nutz):
        c = typ + nutz
        return struct.pack('>I', len(nutz)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    kopf = struct.pack('>IIBBBBB', groesse, groesse, 8, 2, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', kopf)
            + chunk(b'IDAT', zlib.compress(daten, 9)) + chunk(b'IEND', b''))


if __name__ == '__main__':
    ziel = pathlib.Path(__file__).resolve().parent.parent / 'icons'
    for g in (180, 192, 512):
        (ziel / f'icon-{g}.png').write_bytes(png(g, zeichne(g)))
        print(f'icons/icon-{g}.png geschrieben')
