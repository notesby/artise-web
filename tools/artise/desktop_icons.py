#!/usr/bin/env python3
#
# Copyright 2026 Artise.
#
# SPDX-License-Identifier: AGPL-3.0-only
#
"""Writes the desktop app's icons (apps/desktop/artise/icons/) from the web's Artise icon.

The source is apps/web/res/vector-icons/1024.png, the same icon chat.<workspace> uses, so the apps never
drift apart. Run it after the icon changes:

    python3 tools/artise/desktop_icons.py

It writes:
- icon.png (512 px) for Linux, the window and the tray;
- icon.ico (16-256 px) for Windows;
- icon.icon/, an Icon Composer bundle for macOS. macOS draws its own rounded shape around it, so the
  layer is the full square.

The PNG and ICO get rounded corners with a small margin, as Windows and Linux don't round icons themselves.
Needs Pillow (`pip install pillow`).
"""

from __future__ import annotations

import json
import pathlib
import sys

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCE = ROOT / "apps/web/res/vector-icons/1024.png"
OUTPUT = ROOT / "apps/desktop/artise/icons"

ICO_SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
# Margin and corner radius as a share of the icon's side, close to Windows 11's app icons.
MARGIN = 0.04
RADIUS = 0.2

# Icon Composer's file, as Element's build/icon.icon/icon.json has it, with Artise's layer.
ICON_JSON = {
    "fill": "automatic",
    "groups": [
        {
            "layers": [{"glass": False, "image-name": "artise.png", "name": "artise"}],
            "name": "Artise",
            "shadow": {"kind": "none", "opacity": 0.5},
            "specular": False,
            "translucency": {"enabled": False, "value": 0.5},
        }
    ],
    "supported-platforms": {"squares": ["macOS"]},
}


def rounded(square: Image.Image) -> Image.Image:
    """The square icon shrunk by the margin, with rounded corners on a transparent background."""
    side = square.width
    inner = round(side * (1 - 2 * MARGIN))
    offset = (side - inner) // 2
    mask = Image.new("L", (inner, inner), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, inner - 1, inner - 1), radius=round(inner * RADIUS), fill=255)
    out = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    out.paste(square.resize((inner, inner), Image.LANCZOS), (offset, offset), mask)
    return out


def main() -> int:
    square = Image.open(SOURCE).convert("RGBA")
    if square.size != (1024, 1024):
        print(f"{SOURCE.relative_to(ROOT)} must be 1024x1024, not {square.size}", file=sys.stderr)
        return 1
    OUTPUT.mkdir(parents=True, exist_ok=True)

    shaped = rounded(square)
    shaped.resize((512, 512), Image.LANCZOS).save(OUTPUT / "icon.png")
    shaped.save(OUTPUT / "icon.ico", sizes=ICO_SIZES)

    bundle = OUTPUT / "icon.icon"
    (bundle / "Assets").mkdir(parents=True, exist_ok=True)
    square.save(bundle / "Assets" / "artise.png")
    # As oxfmt formats it (short arrays on one line), so the repo's format check passes.
    text = json.dumps(ICON_JSON, indent=4).replace('[\n            "macOS"\n        ]', '["macOS"]')
    (bundle / "icon.json").write_text(text + "\n", encoding="utf-8")

    print(f"Wrote {OUTPUT.relative_to(ROOT)}: icon.png, icon.ico, icon.icon/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
