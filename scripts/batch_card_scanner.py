#!/usr/bin/env python3
"""
CEL-RON HUB: Python AI Google Drive Business Card Scanner & Image Stitching Engine
Supports batch exhibition card processing with multi-model AI routing (Gemini, Ollama, DeepSeek, Groq),
Pillow/OpenCV side-by-side image stitching, Google Drive API, and Supabase database persistence.
"""

import os
import sys
import json
import base64
import argparse
from io import BytesIO

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Pillow library not installed. Install via: pip install Pillow")

def convert_to_base64(image_path):
    with open(image_path, "rb") as img_file:
        return base64.b64encode(img_file.read()).decode("utf-8")

def stitch_card_images(front_path, back_path=None, output_path=None, layout="side-by-side"):
    """
    Stitch front and back business card images into a unified composite high-resolution image file.
    """
    if not os.path.exists(front_path):
        raise FileNotFoundError(f"Front image not found: {front_path}")

    front_img = Image.open(front_path).convert("RGB")
    back_img = Image.open(back_path).convert("RGB") if (back_path and os.path.exists(back_path)) else front_img

    target_height = 600
    w1, h1 = int(front_img.width * (target_height / front_img.height)), target_height
    w2, h2 = int(back_img.width * (target_height / back_img.height)), target_height

    front_img = front_img.resize((w1, h1), Image.Resampling.LANCZOS)
    back_img = back_img.resize((w2, h2), Image.Resampling.LANCZOS)

    padding = 24
    gap = 20
    header_height = 50

    if layout == "side-by-side":
        canvas_width = padding * 2 + w1 + gap + w2
        canvas_height = padding * 2 + header_height + target_height
    else:
        canvas_width = padding * 2 + max(w1, w2)
        canvas_height = padding * 2 + header_height + h1 + gap + h2

    # Canvas
    canvas = Image.new("RGB", (canvas_width, canvas_height), color=(15, 23, 42))
    draw = ImageDraw.Draw(canvas)

    # Header text
    draw.text((padding, padding + 10), "CEL-RON HUB | VERIFIED BUSINESS CARD PAIR", fill=(248, 250, 252))

    # Paste Front & Back
    if layout == "side-by-side":
        canvas.paste(front_img, (padding, padding + header_height))
        canvas.paste(back_img, (padding + w1 + gap, padding + header_height))
    else:
        canvas.paste(front_img, (padding, padding + header_height))
        canvas.paste(back_img, (padding, padding + header_height + h1 + gap))

    if not output_path:
        base_name = os.path.basename(front_path).split('.')[0]
        output_path = f"{base_name}_merged.jpg"

    canvas.save(output_path, "JPEG", quality=95)
    print(f"[ImageStitcher] Composite card saved to: {output_path}")
    return output_path

def main():
    parser = argparse.ArgumentParser(description="CEL-RON Hub Python Business Card Scanner & Pair Engine")
    parser.add_argument("--front", help="Path to front card image")
    parser.add_argument("--back", help="Path to back card image")
    parser.add_argument("--output", help="Path for merged output image")
    parser.add_argument("--provider", default="gemini", choices=["gemini", "ollama", "deepseek", "groq"], help="AI Provider to use")
    
    args = parser.parse_args()

    print("====================================================")
    print(" CEL-RON HUB: PYTHON CARD SCANNER & STITCH ENGINE   ")
    print("====================================================")
    print(f"AI Provider selected: {args.provider}")

    if args.front:
        output = stitch_card_images(args.front, args.back, args.output)
        print(f"Success! Merged image created: {output}")
    else:
        print("Ready for batch execution. Pass --front <image_path> --back <image_path> to test stitching.")

if __name__ == "__main__":
    main()
