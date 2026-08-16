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


def save_opaque_fullbleed(size: int, path: str, bg_hex: str) -> None:
    """QA fix (live report, repeated across several rounds): PWA/home-screen
    icons kept showing a white box/backdrop behind the robot head even
    though every transparent PNG was independently pixel-verified to have
    alpha=0 at its corners. Root cause isn't a bug in these files — it's
    that many Android launchers (and some browsers) don't reliably honor
    transparency OR the declared "maskable" icon for a PWA shortcut, and
    silently composite the "any"-purpose icon onto a default WHITE
    backdrop when creating the home-screen icon. The only way to guarantee
    the visible result is never white, regardless of what backdrop-filling
    behavior the OS applies, is for the file itself to have no transparency
    left to fill. Same full-bleed layout as the old save_transparent (glyph
    already fills ~100% of the grid per ROWS — this doesn't shrink/pad it
    like save_on_background's maskable safe-zone treatment), just composited
    onto a solid canvas first instead of staying RGBA-transparent."""
    bg = tuple(int(bg_hex[i : i + 2], 16) for i in (1, 3, 5)) + (255,)
    canvas = Image.new("RGBA", (size, size), bg)
    glyph = glyph_rgba(max(1, size // GRID)).resize((size, size), Image.NEAREST)
    canvas.alpha_composite(glyph, (0, 0))
    canvas.convert("RGB").save(path)
    print(f"wrote {path} ({size}x{size}, opaque bg {bg_hex}, full-bleed)")


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
    ICON_BG = "#0F131A"  # matches manifest.json's background_color

    # favicon.ico — multi-size, OPAQUE (see save_opaque_fullbleed doc
    # comment: eliminates any chance of an OS/launcher filling transparent
    # regions with white). Bug fix, still relevant: this used to save FROM
    # the smallest (16x16) frame with `sizes=[...]` + `append_images=[...]`
    # — Pillow's ICO writer doesn't actually use append_images to embed
    # extra frames; `sizes` downscales THE SOURCE IMAGE to each listed
    # size. Saving from 16x16 meant every "size" was that same 16x16 image
    # relabeled, collapsing to a single (16,16) frame on read (confirmed
    # via `Image.open(...).info["sizes"]`). Fixed by generating the
    # LARGEST frame as the source and letting `sizes` downscale from it —
    # now produces three genuinely distinct embedded resolutions, each
    # built via the opaque full-bleed canvas rather than glyph_rgba direct.
    ico_sizes = [16, 32, 48]
    ico_bg = tuple(int(ICON_BG[i : i + 2], 16) for i in (1, 3, 5)) + (255,)
    ico_max = max(ico_sizes)
    ico_canvas = Image.new("RGBA", (ico_max, ico_max), ico_bg)
    ico_canvas.alpha_composite(glyph_rgba(max(1, ico_max // GRID)).resize((ico_max, ico_max), Image.NEAREST), (0, 0))
    # Composited onto an opaque bg above, so alpha is already 255 everywhere
    # — no RGB round-trip needed, this is just saved as-is (ICO supports RGBA).
    ico_canvas.save("public/favicon.ico", sizes=[(s, s) for s in ico_sizes])
    print(f"wrote public/favicon.ico ({ico_sizes}, opaque bg {ICON_BG})")

    # "any"-purpose manifest icons — QA fix: switched from transparent to
    # opaque full-bleed (see save_opaque_fullbleed doc comment) after
    # repeated live reports of a white backdrop behind the robot head on
    # phone home screens despite the transparent files themselves always
    # pixel-verifying correct. These are also what app/layout.tsx's
    # openGraph/twitter `images` fields point at — a solid dark background
    # is the more standard choice for social-preview cards anyway (many
    # platforms composite transparent PNGs onto a white canvas of their
    # own for link previews, same failure mode as the home-screen case).
    save_opaque_fullbleed(192, "public/icons/icon-192-any.png", ICON_BG)
    save_opaque_fullbleed(512, "public/icons/icon-512-any.png", ICON_BG)

    # "maskable" manifest icons — already opaque (unchanged), glyph
    # confined to a safe zone so Android's circular/squircle mask never
    # crops it. Kept as its own save_on_background call (different
    # scale/padding treatment than the full-bleed icons above).
    save_on_background(192, "public/icons/icon-192-maskable.png", ICON_BG, 0.6)
    save_on_background(512, "public/icons/icon-512-maskable.png", ICON_BG, 0.6)

    # legacy (pre "-any"/"-maskable" split) filenames — still present on
    # disk from before that split; keep them in sync (same opaque
    # treatment as the "-any" icons above, not orphaned as transparent).
    save_opaque_fullbleed(192, "public/icons/icon-192.png", ICON_BG)
    save_opaque_fullbleed(512, "public/icons/icon-512.png", ICON_BG)

    # apple-touch-icon — iOS doesn't render transparency reliably, opaque
    # background matching the app's dark theme color (viewport.themeColor
    # in app/layout.tsx), glyph fills most of the canvas
    save_on_background(180, "public/apple-touch-icon.png", "#1A1A1A", 0.82)

    # the standalone social-preview mark referenced nowhere in metadata
    # today but kept around from the earlier logo pass — refresh it too so
    # nothing on disk still shows the old logo
    save_on_background(512, "public/finlens-mark.png", "#1A1A1A", 0.82)
