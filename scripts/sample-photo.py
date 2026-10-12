# Samples a photo into the three-tone dot grid the render uses for the closing scene.
#   python3 scripts/sample-photo.py path/to/photo.jpg [left top right bottom]
# Writes data/dog-dots.json. The photo itself is not needed afterwards and stays out of the repo.
import json, sys
from PIL import Image, ImageOps, ImageFilter
src = sys.argv[1]
box = tuple(int(v) for v in sys.argv[2:6]) if len(sys.argv) >= 6 else None
cols, rows, lo, hi = 40, 50, 0.34, 0.66          # grid and the two tone thresholds
im = Image.open(src).convert('L')
im = ImageOps.exif_transpose(im)
if box: im = im.crop(box)
im = ImageOps.autocontrast(im, cutoff=1).filter(ImageFilter.MedianFilter(9))
small = im.resize((cols, rows), Image.LANCZOS)
pts = []
for r in range(rows):
    for c in range(cols):
        l = small.getpixel((c, r)) / 255
        if l < lo: continue                       # background, eyes, nose: no dot
        if l < hi: pts.append({'c': c, 'r': r, 'k': 'mid', 't': round((l - lo) / (hi - lo), 2)})
        else:      pts.append({'c': c, 'r': r, 'k': 'hi',  't': round(min(1, (l - hi) / (1 - hi)), 2)})
json.dump({'cols': cols, 'rows': rows, 'pts': pts}, open('data/dog-dots.json', 'w'))
print(f'{len(pts)} dots (needs to stay under 1000)')
