# Extracts the ReactSMP logo's crown (top) and spark (bottom underline star)
# into 32x32 transparent item textures for the CivGui resource pack.
#   - Crops by detecting colored (saturated) pixels in each region
#   - Resizes with LANCZOS, black background -> alpha from brightness
#   - Prints an ASCII preview of each result for sanity-checking
# Run: python tools/gen_gui_textures.py "<path-to-logo.png>" [plugin-root]
import sys, os
from PIL import Image

def colored_bbox(img, x0, y0, x1, y1, sat_min=0.22, val_min=0.28):
    """Bounding box of saturated (non-gray-text, non-black) pixels in a region."""
    region = img.crop((x0, y0, x1, y1)).convert("HSV")
    w, h = region.size
    px = region.load()
    minx, miny, maxx, maxy = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            s, v = px[x, y][1] / 255.0, px[x, y][2] / 255.0
            if s > sat_min and v > val_min:
                minx, miny = min(minx, x), min(miny, y)
                maxx, maxy = max(maxx, x), max(maxy, y)
    if maxx < 0:
        return None
    return (x0 + minx, y0 + miny, x0 + maxx + 1, y0 + maxy + 1)

def to_sprite(img, bbox, size=32, pad_ratio=0.015):
    """Crop -> square -> resize -> RGBA with alpha from brightness."""
    l, t, r, b = bbox
    pw = int((r - l) * pad_ratio); ph = int((b - t) * pad_ratio)
    crop = img.crop((max(0, l - pw), max(0, t - ph), min(img.width, r + pw), min(img.height, b + ph)))
    side = max(crop.size)
    canvas = Image.new("RGB", (side, side), (0, 0, 0))
    canvas.paste(crop, ((side - crop.width) // 2, (side - crop.height) // 2))
    small = canvas.resize((size, size), Image.LANCZOS).convert("RGB")
    out = Image.new("RGBA", (size, size))
    src, dst = small.load(), out.load()
    peak = 1
    for y in range(size):
        for x in range(size):
            peak = max(peak, max(src[x, y]))
    for y in range(size):
        for x in range(size):
            r8, g8, b8 = src[x, y]
            lum = max(r8, g8, b8)
            a = min(255, int(((lum / peak) ** 0.65) * 290))  # gamma boost, headroom clip
            # Un-premultiply-ish: push colors away from black so the glow stays vivid
            k = 1.25 if lum > 24 else 1.0
            dst[x, y] = (min(255, int(r8 * k)), min(255, int(g8 * k)), min(255, int(b8 * k)), a)
    return out

def ascii_preview(img, label):
    print(label)
    px = img.load()
    ramp = " .:-=+*#%@"
    for y in range(img.height):
        row = ""
        for x in range(img.width):
            row += ramp[min(9, px[x, y][3] * 10 // 256)]
        print("  " + row)

def main():
    logo_path = sys.argv[1]
    plugin = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..")
    out_dir = os.path.join(plugin, "src", "main", "resources", "civbridge-pack", "assets", "minecraft", "textures", "item")
    os.makedirs(out_dir, exist_ok=True)

    img = Image.open(logo_path).convert("RGB")
    W, H = img.size
    print(f"logo: {W}x{H}")

    # Crown: sits above the lettering — tight x-range skips the logo frame's
    # side peaks, y-range stops before the lettering starts.
    crown_box = colored_bbox(img, int(W * 0.43), int(H * 0.185), int(W * 0.585), int(H * 0.325))
    # Spark: the 4-point star centered on the underline — narrow column, and
    # stop above the diagonal slash-glow that sweeps under the star.
    spark_box = colored_bbox(img, int(W * 0.485), int(H * 0.585), int(W * 0.515), int(H * 0.675))
    print("crown bbox:", crown_box)
    print("spark bbox:", spark_box)
    assert crown_box and spark_box, "could not locate the marks automatically"

    crown = to_sprite(img, crown_box)
    spark = to_sprite(img, spark_box)

    crown_path = os.path.join(out_dir, "reactsmp_crown.png")
    spark_path = os.path.join(out_dir, "reactsmp_spark.png")
    crown.save(crown_path)
    spark.save(spark_path)
    ascii_preview(crown, "crown preview:")
    ascii_preview(spark, "spark preview:")
    print("wrote:", os.path.normpath(crown_path))
    print("wrote:", os.path.normpath(spark_path))

main()
