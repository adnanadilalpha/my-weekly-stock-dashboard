#!/usr/bin/env python3
"""Generate iOS + Android app icons from SVG masters.

Sources:
  iOS:     public/app_icon.svg
  Android: public/android_icon.svg

Usage:
  mkdir -p /tmp/mws-icon
  npx --yes @resvg/resvg-js-cli --fit-width 1024 public/app_icon.svg /tmp/mws-icon/ios-1024.png
  npx --yes @resvg/resvg-js-cli --fit-width 1024 public/android_icon.svg /tmp/mws-icon/android-1024.png
  python3 scripts/generate-mobile-app-icons.py \\
    --ios /tmp/mws-icon/ios-1024.png \\
    --android /tmp/mws-icon/android-1024.png

  # Android only:
  python3 scripts/generate-mobile-app-icons.py --android /tmp/mws-icon/android-1024.png
"""
from __future__ import annotations

import argparse
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


def write_ios(logo: Image.Image) -> None:
    IOS_DIR.mkdir(parents=True, exist_ok=True)
    ios_any = [
        ('AppIcon-20.png', 20),
        ('AppIcon-20@2x.png', 40),
        ('AppIcon-20@3x.png', 60),
        ('AppIcon-29.png', 29),
        ('AppIcon-29@2x.png', 58),
        ('AppIcon-29@3x.png', 87),
        ('AppIcon-40.png', 40),
        ('AppIcon-40@2x.png', 80),
        ('AppIcon-40@3x.png', 120),
        ('AppIcon-60@2x.png', 120),
        ('AppIcon-60@3x.png', 180),
        ('AppIcon-76.png', 76),
        ('AppIcon-76@2x.png', 152),
        ('AppIcon-83.5@2x.png', 167),
        ('AppIcon-1024.png', 1024),
    ]
    for name, px in ios_any:
        with_bg(logo, LIGHT_BG, px).save(IOS_DIR / name, 'PNG')
        with_bg(logo, DARK_BG, px).save(IOS_DIR / name.replace('AppIcon-', 'AppIcon-dark-'), 'PNG')
    print(f'Wrote iOS icons → {IOS_DIR}')


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
    # In-app onboarding / brand mark (transparent, no launcher plate)
    logo.resize((192, 192), Image.Resampling.LANCZOS).save(draw / 'mws_mark.png', 'PNG')
    print(f'Wrote Android icons → {AND_RES}')


def write_ios_brand_mark(logo: Image.Image) -> None:
    brand = IOS_DIR.parent / 'BrandMark.imageset'
    brand.mkdir(parents=True, exist_ok=True)
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
    parser.add_argument(
        '--ios',
        type=Path,
        help='Master PNG for iOS (from public/app_icon.svg)',
    )
    parser.add_argument(
        '--android',
        type=Path,
        help='Master PNG for Android (from public/android_icon.svg)',
    )
    parser.add_argument(
        'legacy_master',
        nargs='?',
        type=Path,
        help='Deprecated: single master used for both platforms',
    )
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
        write_ios(ios_logo)
        write_ios_brand_mark(ios_logo)

    if android_path:
        if not android_path.exists():
            raise SystemExit(f'Missing Android master PNG: {android_path}')
        write_android(Image.open(android_path).convert('RGBA'))


if __name__ == '__main__':
    main()
