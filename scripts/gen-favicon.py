#!/usr/bin/env python3
"""
Regenerates every raster favicon/PWA-icon asset from the same hand-authored
10x10 pixel grid already used for the live RobotHeadMark.tsx brand mark
(components/branding/RobotHeadMark.tsx) — so the browser tab icon, PWA
home-screen icon, and apple-touch-icon are pixel-identical to the in-app
sidebar/topbar logo instead of drifting out of sync with it.

Run: python3 scripts/gen-favicon.py
Then bump the ?v=N cache-busting query string in app/layout.tsx (icons
block) and public/manifest.json to force every client to refetch — see the
doc comment on metadata.icons in app/layout.tsx for why that step matters.
"""

from PIL import Image

ROWS = [
    "..........",
    "....OO....",
    "....OO....",
    "..DDDDDD..",
    ".DBBBBBBD.",
    ".DBOBBOBD.",
    ".DBBBBBBD.",
    ".DBBBBBBD.",
    "..DDDDDD..",
    "..........",
][:10]
# Fix: the source literal above must stay exactly 10 rows x 10 cols to match
# RobotHeadMark.tsx's ROWS constant. (Slicing to 10 is a no-op safeguard.)

COLORS = {
    "O": (255, 87, 34, 255),   # antenna + eyes — brand orange-coral (--primary)
    "D": (28, 29, 32, 255),    # bezel edge — matches --border hairline
    "B": (5, 5, 5, 255),       # head casing — near-black
}

GRID = len(ROWS)


def glyph_rgba(cell_px: int) -> Image.Image:
    """The robot head as a transparent-background RGBA square, cell_px per grid cell."""
    base = Image.new("RGBA", (GRID, GRID), (0, 0, 0, 0))
    for y, row in enumerate(ROWS):
        for x, code in enumerate(row):
            color = COLORS.get(code)
            if color:
                base.putpixel((x, y), color)
    return base.resize((cell_px * GRID, cell_px * GRID), Image.NEAREST)


def save_transparent(size: int, path: str) -> None:
    img = glyph_rgba(max(1, size // GRID)).resize((size, size), Image.NEAREST)
    img.save(path)
    print(f"wrote {path} ({size}x{size}, transparent)")


def save_on_background(size: int, path: str, bg_hex: str, scale: float) -> None:
    """Solid-background version (apple-touch-icon, maskable icons) — glyph
    scaled to `scale` of the canvas and centered, so OS-applied circular/
    squircle masks (maskable) or automatic corner rounding (apple-touch)
    never clip the head."""
    bg = tuple(int(bg_hex[i : i + 2], 16) for i in (1, 3, 5)) + (255,)
    canvas = Image.new("RGBA", (size, size), bg)
    glyph_size = int(size * scale)
    glyph = glyph_rgba(max(1, glyph_size // GRID)).resize((glyph_size, glyph_size), Image.NEAREST)
    offset = ((size - glyph_size) // 2, (size - glyph_size) // 2)
    canvas.alpha_composite(glyph, offset)
    canvas.convert("RGB").save(path)
    print(f"wrote {path} ({size}x{size}, bg {bg_hex})")


if __name__ == "__main__":
    # favicon.ico — multi-size, transparent (standard browser-tab convention).
    # Bug fix: this used to save FROM the smallest (16x16) frame with
    # `sizes=[...]` + `append_images=[...]` — Pillow's ICO writer doesn't
    # actually use append_images to embed extra frames; `sizes` tells it to
    # DOWNSCALE THE SOURCE IMAGE to each listed size. Saving from the
    # 16x16 source meant every "size" it wrote was just that same 16x16
    # image relabeled, and Pillow's own multi-size detection collapsed
    # them back down to a single (16,16) frame on read (confirmed via
    # `Image.open(...).info["sizes"]` after the old script ran). Fixed by
    # generating the LARGEST frame as the source and letting `sizes`
    # downscale from it, per Pillow's documented ICO usage — now produces
    # three genuinely distinct embedded resolutions.
    ico_sizes = [16, 32, 48]
    ico_source = glyph_rgba(max(1, max(ico_sizes) // GRID)).resize((max(ico_sizes), max(ico_sizes)), Image.NEAREST)
    ico_source.save("public/favicon.ico", sizes=[(s, s) for s in ico_sizes])
    print(f"wrote public/favicon.ico ({ico_sizes})")

    # "any"-purpose manifest icons — transparent, glyph fills the canvas
    save_transparent(192, "public/icons/icon-192-any.png")
    save_transparent(512, "public/icons/icon-512-any.png")

    # "maskable" manifest icons — opaque background matching
    # manifest.json's background_color, glyph confined to a safe zone so
    # Android's circular/squircle mask never crops it
    save_on_background(192, "public/icons/icon-192-maskable.png", "#0F131A", 0.6)
    save_on_background(512, "public/icons/icon-512-maskable.png", "#0F131A", 0.6)

    # legacy (pre "-any"/"-maskable" split) filenames — still present on
    # disk from before that split; keep them in sync rather than orphaned
    save_transparent(192, "public/icons/icon-192.png")
    save_transparent(512, "public/icons/icon-512.png")

    # apple-touch-icon — iOS doesn't render transparency reliably, opaque
    # background matching the app's dark theme color (viewport.themeColor
    # in app/layout.tsx), glyph fills most of the canvas
    save_on_background(180, "public/apple-touch-icon.png", "#1A1A1A", 0.82)

    # the standalone social-preview mark referenced nowhere in metadata
    # today but kept around from the earlier logo pass — refresh it too so
    # nothing on disk still shows the old logo
    save_on_background(512, "public/finlens-mark.png", "#1A1A1A", 0.82)
