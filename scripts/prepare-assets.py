#!/usr/bin/env python3
"""Prepare browser-ready artwork from art-source/.

Everything expensive or fragile happens here, once, on a developer machine:
checkerboard removal on the Coyote sprite sheets, cutting the sheets into
registered animation frames, trimming and resizing obstacles, cropping the
stadium plate, and writing compact WebP files. The game itself only decodes
images. The "COYOTE 2!" jersey lettering is part of the brand and is kept.

Usage: python3 scripts/prepare-assets.py   (requires Pillow with WebP)
"""
from __future__ import annotations

import json
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "art-source"
OUTPUT = ROOT / "src" / "assets" / "sprites"

# ---------------------------------------------------------------------------
# Sprite sheets: (file, columns, rows, frame order to keep)
# ---------------------------------------------------------------------------
RUN_SHEET = ("coyote_run_sheet_v7_cartoon.png", 4, 2)
SLIDE_SHEET = ("coyote_slide_sheet_v6_clean_matched.png", 3, 2)

# Single images: (file, output name, max size, keep-top fraction)
SINGLES = {
    "coyote_intro_frame_v1.png": ("hero", (384, 512), 1.0),
    "defender_dummy_red_noentry_v1.png": ("defender", (512, 560), 1.0),
    "cone_clean_v1.png": ("cone", (420, 520), 1.0),
    "slide_gate_v1.png": ("gate", (720, 520), 1.0),
    "special_bone_v1.png": ("bone", (400, 400), 1.0),
    "lane_barrier_source.png": ("barrier", (240, 200), 0.82),
}

STADIUM = "arena_stadium_depth_v2.png"
STADIUM_TOP_CROP = 0.207  # fraction of the plate above the game's horizon
VIEW_ASPECT = 430 / 780
WEBP_QUALITY = 92


# ---------------------------------------------------------------------------
# Checkerboard removal (the algorithm the prototype ran in the browser)
# ---------------------------------------------------------------------------
def is_neutral(pixel: tuple[int, int, int, int], low: int = 204, chroma: int = 22) -> bool:
    r, g, b, _ = pixel
    return min(r, g, b) > low and max(r, g, b) - min(r, g, b) < chroma


def remove_checkerboard(image: Image.Image, columns: int) -> Image.Image:
    """Flood the pale checkerboard from the sheet edges and from seed points
    inside the lower body of every frame, where the legs enclose pockets."""
    result = image.convert("RGBA")
    pixels = result.load()
    width, height = result.size
    seen = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def add(x: int, y: int) -> None:
        if x < 0 or x >= width or y < 0 or y >= height:
            return
        index = y * width + x
        if seen[index] or not is_neutral(pixels[x, y]):
            return
        seen[index] = 1
        queue.append((x, y))

    for x in range(width):
        add(x, 0)
        add(x, height - 1)
    for y in range(1, height - 1):
        add(0, y)
        add(width - 1, y)
    frame_w = width / columns
    frame_h = height / 2
    for row in range(2):
        for column in range(columns):
            for y in range(315, int(frame_h) - 4, 9):
                for x in range(64, int(frame_w) - 64, 9):
                    add(int(column * frame_w + x), int(row * frame_h + y))

    while queue:
        x, y = queue.popleft()
        r, g, b, _ = pixels[x, y]
        pixels[x, y] = (r, g, b, 0)
        add(x - 1, y)
        add(x + 1, y)
        add(x, y - 1)
        add(x, y + 1)

    for _ in range(3):
        peel = []
        for y in range(height):
            for x in range(width):
                p = pixels[x, y]
                if p[3] == 0 or not is_neutral(p, 184, 34):
                    continue
                if any(
                    0 <= nx < width and 0 <= ny < height and pixels[nx, ny][3] == 0
                    for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))
                ):
                    peel.append((x, y))
        for x, y in peel:
            r, g, b, _ = pixels[x, y]
            pixels[x, y] = (r, g, b, 0)
    return result


# ---------------------------------------------------------------------------
# Edge quality and framing
# ---------------------------------------------------------------------------
def smooth_edges(image: Image.Image) -> Image.Image:
    """Spread colour into transparent pixels, then soften the alpha edge."""
    rgb = image.convert("RGB")
    alpha = image.getchannel("A")
    solid = alpha.point(lambda a: 255 if a > 0 else 0)
    for _ in range(3):
        spread = rgb.filter(ImageFilter.BoxBlur(1))
        rgb = Image.composite(rgb, spread, solid)
        solid = solid.filter(ImageFilter.MaxFilter(3))
    soft = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    out = rgb.convert("RGBA")
    out.putalpha(Image.blend(alpha, soft, 0.85))
    return out


def despeckle(image: Image.Image, minimum: int = 60) -> int:
    """Delete small islands of opaque pixels: checkerboard leftovers."""
    pixels = image.load()
    width, height = image.size
    seen: set[tuple[int, int]] = set()
    removed = 0
    for y in range(height):
        for x in range(width):
            if (x, y) in seen or pixels[x, y][3] == 0:
                continue
            component = {(x, y)}
            stack = [(x, y)]
            seen.add((x, y))
            while stack:
                cx, cy = stack.pop()
                for n in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= n[0] < width and 0 <= n[1] < height and n not in seen and pixels[n][3] > 0:
                        seen.add(n)
                        component.add(n)
                        stack.append(n)
            if len(component) < minimum:
                for p in component:
                    pixels[p] = (0, 0, 0, 0)
                removed += 1
    return removed


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    """Bounding box of solid pixels, ignoring soft edge alpha."""
    box = image.getchannel("A").point(lambda a: 255 if a > 40 else 0).getbbox()
    return box or (0, 0, image.width, image.height)


def head_center_x(image: Image.Image, box: tuple[int, int, int, int]) -> float:
    """Horizontal centre of the top third of the figure: the head, which is
    stable across a run cycle while the ball and arms swing."""
    left, top, right, bottom = box
    cut = top + (bottom - top) // 3
    sub = image.crop((left, top, right, cut))
    sb = alpha_bbox(sub)
    return left + (sb[0] + sb[2]) / 2


def cut_frames(sheet: Image.Image, columns: int, rows: int) -> list[Image.Image]:
    fw, fh = sheet.width // columns, sheet.height // rows
    return [sheet.crop((c * fw, r * fh, (c + 1) * fw, (r + 1) * fh)) for r in range(rows) for c in range(columns)]


def register(frames: list[Image.Image], anchor: str, margin: int = 8) -> tuple[Image.Image, dict]:
    """Place every frame on one shared canvas: same width and height, the
    lowest opaque pixel on the same ground row, and the anchor (head centre
    for running, figure centre for sliding) on the same vertical line."""
    boxes = [alpha_bbox(f) for f in frames]
    anchors = []
    for f, b in zip(frames, boxes):
        anchors.append(head_center_x(f, b) if anchor == "head" else (b[0] + b[2]) / 2)
    left_reach = max(a - b[0] for a, b in zip(anchors, boxes))
    right_reach = max(b[2] - a for a, b in zip(anchors, boxes))
    tallest = max(b[3] - b[1] for b in boxes)
    cell_w = int(left_reach + right_reach) + margin * 2
    cell_h = tallest + margin * 2
    strip = Image.new("RGBA", (cell_w * len(frames), cell_h), (0, 0, 0, 0))
    for i, (f, b, a) in enumerate(zip(frames, boxes, anchors)):
        crop = f.crop(b)
        x = i * cell_w + int(margin + left_reach - (a - b[0]))
        y = cell_h - margin - crop.height
        strip.paste(crop, (x, y), crop)
    return strip, {"frames": len(frames), "width": cell_w, "height": cell_h, "groundMargin": margin}


def save(image: Image.Image, name: str) -> Path:
    path = OUTPUT / f"{name}.webp"
    image.save(path, "WEBP", quality=WEBP_QUALITY, method=6, exact=True)
    return path


def prepare_sheet(spec: tuple[str, int, int], anchor: str, name: str) -> dict:
    file, columns, rows = spec
    sheet = remove_checkerboard(Image.open(SOURCE / file), columns)
    frames = cut_frames(sheet, columns, rows)
    cleaned = []
    for frame in frames:
        specks = despeckle(frame)
        cleaned.append(smooth_edges(frame))
        print(f"  {name}: frame {len(cleaned)} specks removed: {specks}")
    strip, meta = register(cleaned, anchor)
    path = save(strip, name)
    print(f"{name}: {meta} -> {path.name} {path.stat().st_size // 1024} kB")
    return meta


def prepare_single(file: str, name: str, maximum: tuple[int, int], keep_top: float) -> None:
    image = Image.open(SOURCE / file).convert("RGBA")
    if keep_top < 1.0:
        image = image.crop((0, 0, image.width, int(image.height * keep_top)))
    despeckle(image)
    image = image.crop(alpha_bbox(image))
    padded = Image.new("RGBA", (image.width + 8, image.height + 8), (0, 0, 0, 0))
    padded.paste(image, (4, 4))
    padded = smooth_edges(padded)
    padded.thumbnail(maximum, Image.Resampling.LANCZOS)
    if name == "gate":
        # Drawn as the artist intended: a low, wide hurdle. The game stands its
        # posts on the lane lines and draws it in front of the sliding player.
        padded, spacing = center_on_posts(padded)
        print(f"gate post spacing: {spacing:.4f} of image width (GATE_POST_SPACING in config.ts)")
    path = save(padded, name)
    print(f"{name}: {padded.size} -> {path.name} {path.stat().st_size // 1024} kB")


def center_on_posts(image: Image.Image, row_fraction: float = 0.55) -> tuple[Image.Image, float]:
    """Pad the gate so the midpoint between its two posts is the image centre,
    and return the post spacing as a fraction of the padded width. The game
    uses that fraction to stand the posts exactly on the lane lines."""
    pixels = image.load()
    y = int(image.height * row_fraction)
    columns = [x for x in range(image.width) if pixels[x, y][3] > 128]
    runs: list[tuple[int, int]] = []
    start = prev = columns[0]
    for x in columns[1:]:
        if x != prev + 1:
            runs.append((start, prev))
            start = x
        prev = x
    runs.append((start, prev))
    left = (runs[0][0] + runs[0][1]) / 2
    right = (runs[-1][0] + runs[-1][1]) / 2
    midpoint = (left + right) / 2
    shift = image.width / 2 - midpoint
    pad_left = max(0, int(round(2 * shift)))
    pad_right = max(0, int(round(-2 * shift)))
    out = Image.new("RGBA", (image.width + pad_left + pad_right, image.height), (0, 0, 0, 0))
    out.paste(image, (pad_left, 0))
    return out, (right - left) / out.width


def prepare_stadium() -> None:
    """Crop the plate so its far court meets the game's horizon and its
    aspect matches the 430x780 view."""
    image = Image.open(SOURCE / STADIUM).convert("RGB")
    top = int(image.height * STADIUM_TOP_CROP)
    height = image.height - top
    width = int(height * VIEW_ASPECT)
    left = (image.width - width) // 2
    crop = image.crop((left, top, left + width, top + height))
    path = OUTPUT / "stadium.webp"
    crop.save(path, "WEBP", quality=88, method=6)
    print(f"stadium: {crop.size} -> {path.name} {path.stat().st_size // 1024} kB")


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for old in OUTPUT.iterdir():
        if old.is_file():
            old.unlink()
    meta = {
        "run": prepare_sheet(RUN_SHEET, "head", "run"),
        "slide": prepare_sheet(SLIDE_SHEET, "center", "slide"),
    }
    for file, (name, maximum, keep_top) in SINGLES.items():
        prepare_single(file, name, maximum, keep_top)
    prepare_stadium()
    (OUTPUT / "strips.json").write_text(json.dumps(meta, indent=2) + "\n")


if __name__ == "__main__":
    main()
