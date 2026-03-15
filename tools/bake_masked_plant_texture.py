#!/usr/bin/env python
"""将 UE 遮罩植物材质烘焙为单张 RGBA 贴图。"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def bake_tint_mask(mask_path: Path, output_path: Path, colors: list[tuple[float, float, float, float]]) -> None:
    """使用两组颜色参数和遮罩贴图生成带 alpha 的底色。"""
    mask = Image.open(mask_path).convert("RGBA")
    width, height = mask.size
    output = Image.new("RGBA", (width, height))
    source_pixels = mask.load()
    output_pixels = output.load()
    color_a = colors[0]
    color_b = colors[1] if len(colors) > 1 else colors[0]

    for y in range(height):
        for x in range(width):
            red, green, blue, _alpha = source_pixels[x, y]
            alpha = blue
            blend = red / 255.0
            shade = green / 255.0
            mixed_red = (color_a[0] * (1 - blend) + color_b[0] * blend) * shade
            mixed_green = (color_a[1] * (1 - blend) + color_b[1] * blend) * shade
            mixed_blue = (color_a[2] * (1 - blend) + color_b[2] * blend) * shade
            output_pixels[x, y] = (
                max(0, min(255, round(mixed_red * 255))),
                max(0, min(255, round(mixed_green * 255))),
                max(0, min(255, round(mixed_blue * 255))),
                alpha,
            )

    output.save(output_path)


def bake_diffuse_mask(diffuse_path: Path, mask_path: Path, output_path: Path) -> None:
    """使用真实底色贴图和遮罩贴图生成带 alpha 的底色。"""
    diffuse = Image.open(diffuse_path).convert("RGBA")
    mask = Image.open(mask_path).convert("RGBA")
    width, height = diffuse.size
    output = Image.new("RGBA", (width, height))
    diffuse_pixels = diffuse.load()
    mask_pixels = mask.load()
    output_pixels = output.load()

    for y in range(height):
        for x in range(width):
            red, green, blue, _alpha = diffuse_pixels[x, y]
            mask_red, mask_green, mask_blue, _mask_alpha = mask_pixels[x, y]
            alpha = max(mask_red, mask_green, mask_blue)
            output_pixels[x, y] = (red, green, blue, alpha)

    output.save(output_path)


def main() -> None:
    """命令行入口。"""
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["tint-mask", "diffuse-mask"], required=True)
    parser.add_argument("--mask", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--diffuse")
    parser.add_argument("--color", action="append", default=[])
    args = parser.parse_args()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if args.mode == "tint-mask":
        if not args.color:
            raise SystemExit("tint-mask 需要至少一个 --color=r,g,b,a")
        colors = []
        for item in args.color:
            parts = [float(part) for part in item.split(",")]
            if len(parts) != 4:
                raise SystemExit(f"非法颜色参数: {item}")
            colors.append((parts[0], parts[1], parts[2], parts[3]))
        bake_tint_mask(Path(args.mask), output_path, colors)
        return

    if not args.diffuse:
        raise SystemExit("diffuse-mask 需要 --diffuse")
    bake_diffuse_mask(Path(args.diffuse), Path(args.mask), output_path)


if __name__ == "__main__":
    main()
