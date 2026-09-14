"""Create a consistent iron/brass PNG token locally (Pillow required).

Pass an approved portrait or framed draft and an optional pixel crop box.
Never overwrites a file unless --force is explicitly supplied.
"""
import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps


def stamp(source, size=512, crop=None):
    source = ImageOps.exif_transpose(source).convert("RGBA")
    if crop:
        left, top, right, bottom = crop
        if not (0 <= left < right <= source.width and 0 <= top < bottom <= source.height):
            raise ValueError("Crop must stay within the source image")
        source = source.crop(crop)
    scale = 4
    width = size * scale
    art = ImageOps.fit(source, (width, width), method=Image.Resampling.LANCZOS)
    mask = Image.new("L", (width, width), 0)
    draw = ImageDraw.Draw(mask)
    margin = round(width * .025)
    draw.ellipse((margin, margin, width-margin-1, width-margin-1), fill=255)
    art.putalpha(mask)
    rim = ImageDraw.Draw(art)
    # Concentric bevels give every creature precisely the same stamped frame.
    for offset, thickness, color in [
        (0, .005, "#161514"), (.005, .006, "#b99b61"),
        (.011, .004, "#625039"), (.015, .022, "#303132"),
        (.037, .004, "#77736a"), (.041, .005, "#171615"),
        (.046, .003, "#ac8b50"),
    ]:
        inset = margin + round(width * offset)
        rim.ellipse((inset, inset, width-inset-1, width-inset-1),
                    outline=color, width=max(1, round(width * thickness)))
    return art.resize((size, size), Image.Resampling.LANCZOS)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--crop", nargs=4, type=int, metavar=("LEFT", "TOP", "RIGHT", "BOTTOM"))
    parser.add_argument("--size", type=int, default=512)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    if args.source.resolve() == args.output.resolve():
        parser.error("Source and output must differ")
    if args.output.exists() and not args.force:
        parser.error("Output exists; choose another filename or explicitly use --force")
    if args.output.suffix.lower() != ".png" or not 128 <= args.size <= 2048:
        parser.error("Use PNG output and a size between 128 and 2048")
    with Image.open(args.source) as source:
        result = stamp(source, args.size, args.crop)
    result.save(args.output)
    with Image.open(args.output) as check:
        assert check.mode == "RGBA"
        assert all(check.getpixel(p)[3] == 0 for p in [(0, 0), (0, args.size-1), (args.size-1, 0), (args.size-1, args.size-1)])
    print(f"Saved {args.output}: {args.size}px RGBA, transparent corners verified")


if __name__ == "__main__":
    main()
