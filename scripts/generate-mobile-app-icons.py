#!/usr/bin/env python3
"""Generate iOS + Android app icons from masters.

Sources:
  iOS:     public/app_icon.svg  (transparent mark — rasterize then --ios-full)
  Android: public/android_icon.svg

Usage:
  mkdir -p /tmp/mws-icon
  npx --yes @resvg/resvg-js-cli --fit-width 1024 public/app_icon.svg /tmp/mws-icon/app-icon-1024.png
  python3 scripts/generate-mobile-app-icons.py --ios /tmp/mws-icon/app-icon-1024.png --ios-full

  npx --yes @resvg/resvg-js-cli --fit-width 1024 public/android_icon.svg /tmp/mws-icon/android-1024.png
  python3 scripts/generate-mobile-app-icons.py --android /tmp/mws-icon/android-1024.png
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IOS_DIR = ROOT / 'mws-app/mws-ios/myweeklystock/myweeklystock/Assets.xcassets/AppIcon.appiconset'
AND_RES = ROOT / 'mws-app/mws-android/app/src/main/res'

LIGHT_BG = (255, 255, 255, 255)
DARK_BG = (11, 18, 32, 255)


def with_bg(src: Image.Image, bg: tuple[int, int, int, int], size: int) -> Image.Image:
    canvas = Image.new('RGBA', (size, size), bg)
    scaled = src.resize((size, size), Image.Resampling.LANCZOS)
    canvas.alpha_composite(scaled)
    return canvas.convert('RGB')


def adaptive_fg(src: Image.Image, size: int, scale: float = 0.70) -> Image.Image:
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    logo_size = int(size * scale)
    scaled = src.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
    off = (size - logo_size) // 2
    canvas.alpha_composite(scaled, (off, off))
    return canvas


def to_monochrome_white(src: Image.Image, size: int, scale: float = 0.70) -> Image.Image:
    fg = adaptive_fg(src, size, scale)
    _r, _g, _b, a = fg.split()
    white = Image.new('L', fg.size, 255)
    return Image.merge('RGBA', (white, white, white, a))


def flatten_on(src: Image.Image, plate_rgb: tuple[int, int, int], size: int) -> Image.Image:
    """Composite transparent artwork onto an opaque plate, then resize. Always copies."""
    rgba = src.convert('RGBA')
    if rgba.size != (size, size):
        rgba = rgba.resize((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (*plate_rgb, 255))
    canvas.alpha_composite(rgba)
    return canvas.convert('RGB')


def make_tinted(src: Image.Image, size: int) -> Image.Image:
    """Tinted / Liquid Glass template: white silhouette on black."""
    rgba = src.convert('RGBA')
    if rgba.size != (size, size):
        rgba = rgba.resize((size, size), Image.Resampling.LANCZOS)
    _r, _g, _b, a = rgba.split()
    white = Image.new('RGB', (size, size), (255, 255, 255))
    canvas = Image.new('RGB', (size, size), (0, 0, 0))
    canvas.paste(white, mask=a)
    return canvas


def write_ios(logo: Image.Image, *, full_bleed: bool = False) -> None:
    IOS_DIR.mkdir(parents=True, exist_ok=True)

    # Drop legacy multi-size files — modern catalog is single 1024 Any/Dark/Tinted.
    for old in IOS_DIR.glob('*.png'):
        old.unlink()

    size = 1024
    if full_bleed:
        # Source is mostly transparent (not opaque black). Plate must differ by appearance
        # or Light + Liquid Glass Clear always look the same washed-out icon.
        any_img = flatten_on(logo, (255, 255, 255), size)
        dark_img = flatten_on(logo, (0, 0, 0), size)
        tinted_img = make_tinted(logo, size)
    else:
        any_img = with_bg(logo, LIGHT_BG, size)
        dark_img = with_bg(logo, DARK_BG, size)
        tinted_img = make_tinted(logo, size)

    any_img.save(IOS_DIR / 'AppIcon.png', 'PNG')
    dark_img.save(IOS_DIR / 'AppIcon-dark.png', 'PNG')
    tinted_img.save(IOS_DIR / 'AppIcon-tinted.png', 'PNG')

    contents = {
        'images': [
            {
                'filename': 'AppIcon.png',
                'idiom': 'universal',
                'platform': 'ios',
                'size': '1024x1024',
            },
            {
                'appearances': [{'appearance': 'luminosity', 'value': 'dark'}],
                'filename': 'AppIcon-dark.png',
                'idiom': 'universal',
                'platform': 'ios',
                'size': '1024x1024',
            },
            {
                'appearances': [{'appearance': 'luminosity', 'value': 'tinted'}],
                'filename': 'AppIcon-tinted.png',
                'idiom': 'universal',
                'platform': 'ios',
                'size': '1024x1024',
            },
        ],
        'info': {'author': 'xcode', 'version': 1},
    }
    (IOS_DIR / 'Contents.json').write_text(json.dumps(contents, indent=2) + '\n')
    print(f'Wrote iOS icons → {IOS_DIR} (universal 1024 any/dark/tinted, full_bleed={full_bleed})')


def write_android(logo: Image.Image) -> None:
    densities = {
        'mdpi': 48,
        'hdpi': 72,
        'xhdpi': 96,
        'xxhdpi': 144,
        'xxxhdpi': 192,
    }
    for dens, launcher in densities.items():
        mip = AND_RES / f'mipmap-{dens}'
        mip.mkdir(parents=True, exist_ok=True)
        light = with_bg(logo, LIGHT_BG, launcher)
        light.save(mip / 'ic_launcher.png', 'PNG')
        light.save(mip / 'ic_launcher_round.png', 'PNG')

    draw = AND_RES / 'drawable'
    night = AND_RES / 'drawable-night'
    draw.mkdir(parents=True, exist_ok=True)
    night.mkdir(parents=True, exist_ok=True)
    fg = adaptive_fg(logo, 432, 0.70)
    fg.save(draw / 'ic_launcher_foreground.png', 'PNG')
    fg.save(night / 'ic_launcher_foreground.png', 'PNG')
    to_monochrome_white(logo, 432, 0.70).save(draw / 'ic_launcher_monochrome.png', 'PNG')
    Image.new('RGB', (432, 432), LIGHT_BG[:3]).save(draw / 'ic_launcher_background.png', 'PNG')
    Image.new('RGB', (432, 432), DARK_BG[:3]).save(night / 'ic_launcher_background.png', 'PNG')
    logo.resize((192, 192), Image.Resampling.LANCZOS).save(draw / 'mws_mark.png', 'PNG')
    print(f'Wrote Android icons → {AND_RES}')


def write_ios_brand_mark(logo: Image.Image) -> None:
    brand = IOS_DIR.parent / 'BrandMark.imageset'
    brand.mkdir(parents=True, exist_ok=True)
    # Keep transparency for in-app use on light screens
    for name, px in [('BrandMark.png', 48), ('BrandMark@2x.png', 96), ('BrandMark@3x.png', 144)]:
        logo.resize((px, px), Image.Resampling.LANCZOS).save(brand / name, 'PNG')
    (brand / 'Contents.json').write_text(
        '{\n'
        '  "images" : [\n'
        '    { "filename" : "BrandMark.png", "idiom" : "universal", "scale" : "1x" },\n'
        '    { "filename" : "BrandMark@2x.png", "idiom" : "universal", "scale" : "2x" },\n'
        '    { "filename" : "BrandMark@3x.png", "idiom" : "universal", "scale" : "3x" }\n'
        '  ],\n'
        '  "info" : { "author" : "xcode", "version" : 1 }\n'
        '}\n'
    )
    print(f'Wrote iOS BrandMark → {brand}')


def main() -> None:
    parser = argparse.ArgumentParser(description='Generate iOS/Android app icons from master PNGs')
    parser.add_argument('--ios', type=Path, help='Master PNG for iOS')
    parser.add_argument(
        '--ios-full',
        action='store_true',
        help='Transparent/full artwork: white Any plate, black Dark plate, tinted silhouette',
    )
    parser.add_argument('--android', type=Path, help='Master PNG for Android')
    parser.add_argument('legacy_master', nargs='?', type=Path)
    args = parser.parse_args()

    ios_path = args.ios
    android_path = args.android
    if args.legacy_master and not ios_path and not android_path:
        ios_path = android_path = args.legacy_master

    if not ios_path and not android_path:
        raise SystemExit('Pass --ios and/or --android master PNG paths')

    if ios_path:
        if not ios_path.exists():
            raise SystemExit(f'Missing iOS master PNG: {ios_path}')
        ios_logo = Image.open(ios_path).convert('RGBA')
        write_ios(ios_logo, full_bleed=args.ios_full)
        write_ios_brand_mark(ios_logo)

    if android_path:
        if not android_path.exists():
            raise SystemExit(f'Missing Android master PNG: {android_path}')
        write_android(Image.open(android_path).convert('RGBA'))


if __name__ == '__main__':
    main()
