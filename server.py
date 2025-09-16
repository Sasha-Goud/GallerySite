from flask import Flask, jsonify, send_from_directory, request
from pathlib import Path
import re
import json
from PIL import Image
import uuid

# Serve static files from the project root
app = Flask(__name__, static_folder='.', static_url_path='')

# ---- Project paths
ASSETS_DIR = Path('assets')   # source of images & metadata (title/tags/desc/contexts/video/options)
THUMBS_DIR = Path('thumbs')   # generated thumbnails (served by /thumbs)
IMAGES_DIR = Path('images')   # (kept only for backward compatibility on /images/*)

IMAGE_EXTS = {
    '.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif',
    '.JPG', '.JPEG', '.PNG', '.WEBP', '.GIF', '.AVIF'
}
VIDEO_EXTS = {'.mp4', '.webm', '.mov', '.m4v', '.MP4', '.WEBM', '.MOV', '.M4V'}

THUMBS_DIR.mkdir(exist_ok=True)

# ---- Canonical pricing (unchanged)
PRICING = {
    "A4":  { "Matte":{"Print":45,"Framed":95,"Canvas":110}, "Glossy":{"Print":49,"Framed":99,"Canvas":115}, "Archival":{"Print":59,"Framed":115,"Canvas":135} },
    "A3":  { "Matte":{"Print":65,"Framed":135,"Canvas":155},"Glossy":{"Print":69,"Framed":139,"Canvas":165},"Archival":{"Print":79,"Framed":155,"Canvas":185} },
    "A2":  { "Matte":{"Print":95,"Framed":185,"Canvas":215},"Glossy":{"Print":99,"Framed":189,"Canvas":225},"Archival":{"Print":115,"Framed":215,"Canvas":255} }
}

def price_for(size, paper, kind):
    try:
        return float(PRICING[size][paper][kind])
    except Exception:
        return None

def round2(n): return round(float(n) + 1e-9, 2)

def nice_title(stem: str) -> str:
    t = re.sub(r'[-_]+', ' ', stem).strip()
    return t[:1].upper() + t[1:] if t else stem

def read_text_file(p: Path) -> str | None:
    try:
        txt = p.read_text(encoding='utf-8').strip()
        return txt if txt else None
    except Exception:
        return None

def read_json_file(p: Path):
    """Return parsed JSON from p, or None if file missing/invalid."""
    try:
        if not p.exists():
            return None
        return json.loads(p.read_text(encoding='utf-8'))
    except Exception:
        return None

def parse_tags_file(p: Path):
    try:
        raw = p.read_text(encoding='utf-8')
    except Exception:
        return []
    parts = [s.strip() for s in re.split(r'[,\n\r]+', raw)]
    seen, out = set(), []
    for t in parts:
        if not t: continue
        key = t.lower()
        if key not in seen:
            seen.add(key); out.append(t)
    return out

def ensure_thumb_for(image_path: Path) -> Path | None:
    """
    Create (or reuse) a thumbnail in /thumbs for the given image.
    The output filename mirrors the source filename (extension may change to .jpg for non-png/jpeg).
    """
    try:
        target = THUMBS_DIR / image_path.name
        ext = image_path.suffix.lower()
        if ext not in ('.jpg', '.jpeg', '.png'):
            target = target.with_suffix('.jpg')
        if target.exists():
            return target

        with Image.open(image_path) as im:
            if im.mode in ('P', 'RGBA'):
                im = im.convert('RGB')
            im.thumbnail((480, 480))
            if target.suffix.lower() == '.png':
                im.save(target, format='PNG', optimize=True)
            else:
                im.save(target, format='JPEG', quality=82, optimize=True)
        return target
    except Exception as e:
        print(f"[thumbs] Could not create thumbnail for {image_path}: {e}")
        return None

def find_main_image_in_asset_dir(folder: Path) -> Path | None:
    """
    Prefer file named <folder.name>.<ext>. If not found, pick the first image file in the folder.
    """
    if not folder.is_dir():
        return None
    expected_base = folder.name
    for ext in IMAGE_EXTS:
        candidate = folder / f"{expected_base}{ext}"
        if candidate.exists():
            return candidate
    for p in sorted(folder.iterdir(), key=lambda x: x.name.lower()):
        if p.is_file() and p.suffix in IMAGE_EXTS:
            return p
    return None

@app.route('/')
def root():
    return send_from_directory('.', 'index.html')

# --------- Artworks list from /assets/<id>/ ----------
@app.route('/api/artworks')
def api_artworks():
    items = []
    if ASSETS_DIR.exists():
        for folder in sorted(ASSETS_DIR.iterdir(), key=lambda x: x.name.lower()):
            if not folder.is_dir():
                continue
            art_id = folder.name
            base_img = find_main_image_in_asset_dir(folder)
            if not base_img:
                continue

            title_txt = read_text_file(folder / 'title.txt')
            title = title_txt if title_txt is not None else nice_title(art_id)
            tags = parse_tags_file(folder / 'tags.txt') if (folder / 'tags.txt').exists() else []

            src_rel = (folder / base_img.name).as_posix()
            thumb_path = ensure_thumb_for(base_img)
            thumb_rel = thumb_path.as_posix() if thumb_path else None
            if thumb_rel and THUMBS_DIR.name not in thumb_rel:
                thumb_rel = (THUMBS_DIR / Path(thumb_rel).name).as_posix()

            items.append({
                "id": art_id,
                "title": title,
                "src": src_rel.replace('\\', '/'),
                "thumb": (thumb_rel if thumb_rel else f"thumbs/{base_img.name}").replace('\\', '/'),
                "tags": tags
            })
    return jsonify(items)

# --------- Artwork detail from /assets/<id>/ ----------
@app.route('/api/artwork/<art_id>')
def api_artwork_detail(art_id: str):
    folder = ASSETS_DIR / art_id
    if not folder.exists() or not folder.is_dir():
        return jsonify({"error": "Artwork not found"}), 404

    base_img = find_main_image_in_asset_dir(folder)
    if not base_img:
        return jsonify({"error": "Artwork image not found"}), 404

    # Title/desc/tags
    title_txt = read_text_file(folder / 'title.txt')
    title = title_txt if title_txt is not None else nice_title(art_id)

    desc_txt = read_text_file(folder / 'desc.txt')
    desc = desc_txt if desc_txt is not None else f"{title}: archival-quality print available. See contextual previews and a paper demo video."

    tags = parse_tags_file(folder / 'tags.txt') if (folder / 'tags.txt').exists() else []

    # Context images
    ctx1 = ctx2 = None
    for ext in IMAGE_EXTS:
        p = folder / f"context-1{ext}"
        if p.exists(): ctx1 = p.as_posix(); break
    for ext in IMAGE_EXTS:
        p = folder / f"context-2{ext}"
        if p.exists(): ctx2 = p.as_posix(); break

    # Paper demo video
    video = None
    for ext in VIDEO_EXTS:
        p = folder / f"paper-demo{ext}"
        if p.exists(): video = p.as_posix(); break

    # Options (NEW)
    options = read_json_file(folder / 'options.json')

    # Thumb for detail (for consistency)
    thumb_path = ensure_thumb_for(base_img)
    thumb_rel = thumb_path.as_posix() if thumb_path else None
    if thumb_rel and THUMBS_DIR.name not in thumb_rel:
        thumb_rel = (THUMBS_DIR / Path(thumb_rel).name).as_posix()

    data = {
        "id": art_id,
        "title": title,
        "src": (folder / base_img.name).as_posix().replace('\\', '/'),
        "thumb": (thumb_rel if thumb_rel else f"thumbs/{base_img.name}").replace('\\', '/'),
        "context1": ctx1.replace('\\', '/') if ctx1 else None,
        "context2": ctx2.replace('\\', '/') if ctx2 else None,
        "video": video.replace('\\', '/') if video else None,
        "description": desc,
        "tags": tags,
        "options": options  # <- will be dict or None
    }
    return jsonify(data)

# --------- Price quote with quoteId (unchanged) ----------
@app.route('/api/price-quote', methods=['POST'])
def api_price_quote():
    """
    Accepts: { "items": [ { "id": "...", "title":"...", "size":"A4", "paper":"Matte", "kind":"Print", "qty": 2 }, ... ] }
    Returns server-priced items and a unique quoteId for reconciliation.
    """
    try:
        payload = request.get_json(silent=True) or {}
        raw_items = payload.get('items', [])
        validated = []
        for it in raw_items:
            size  = str(it.get('size','')).strip()
            paper = str(it.get('paper','')).strip()
            kind  = str(it.get('kind','')).strip()
            try: qty = int(it.get('qty', 1))
            except Exception: qty = 1
            qty = max(1, qty)

            unit = price_for(size, paper, kind)
            if unit is None:
                continue

            title = str(it.get('title') or it.get('id') or '').strip()[:127]
            art_id = str(it.get('id') or '').strip()

            line_total = round2(unit * qty)
            validated.append({
                "id": art_id,
                "title": title,
                "size": size,
                "paper": paper,
                "kind": kind,
                "qty": qty,
                "unitPrice": round2(unit),
                "lineTotal": line_total
            })

        subtotal = round2(sum(i['lineTotal'] for i in validated))
        shipping = 0.0
        tax = 0.0
        discount = 0.0
        total = round2(subtotal + shipping + tax - discount)

        return jsonify({
            "quoteId": "q-" + uuid.uuid4().hex[:12],
            "items": validated,
            "currency": "GBP",
            "subtotal": subtotal,
            "shipping": shipping,
            "tax": tax,
            "discount": discount,
            "total": total
        })
    except Exception as e:
        return jsonify({"error": "bad_request", "detail": str(e)}), 400

# --------- Static file helpers (compatibility) ----------
@app.route('/images/<path:filename>')
def serve_image(filename):
    return send_from_directory(IMAGES_DIR, filename)

@app.route('/thumbs/<path:filename>')
def serve_thumb(filename):
    return send_from_directory(THUMBS_DIR, filename)

@app.route('/assets/<art_id>/<path:filename>')
def serve_asset(art_id, filename):
    return send_from_directory(ASSETS_DIR / art_id, filename)



def export_artworks_json(dest="artworks.json"):
    """Scan assets/* and write artworks.json with src, thumb, tags, description, video, and context1..6."""
    items = []

    def find_first_matching(folder: Path, base: str, exts: set[str]) -> str | None:
        # Try exact basenames (with any ext/case)
        for ext in exts:
            p = folder / f"{base}{ext}"
            if p.exists():
                return p.as_posix()
        return None

    def find_contexts(folder: Path) -> list[str]:
        out = []
        name_patterns = []
        for i in range(1, 7):
            name_patterns.extend([f"context{i}", f"context_{i}", f"context-{i}"])
        for base in name_patterns:
            hit = find_first_matching(folder, base, IMAGE_EXTS)
            if hit:
                out.append(hit)
        return out[:6]

    if ASSETS_DIR.exists():
        for folder in sorted(ASSETS_DIR.iterdir(), key=lambda x: x.name.lower()):
            if not folder.is_dir():
                continue

            art_id   = folder.name
            base_img = find_main_image_in_asset_dir(folder)
            if not base_img:
                continue

            title_txt = read_text_file(folder / 'title.txt')
            title     = title_txt if title_txt is not None else nice_title(art_id)
            tags      = parse_tags_file(folder / 'tags.txt') if (folder / 'tags.txt').exists() else []
            desc_txt  = read_text_file(folder / 'desc.txt')
            desc      = desc_txt if desc_txt is not None else ""

            # main src + thumb (preserve actual filename case)
            src_rel     = (folder / base_img.name).as_posix()
            thumb_path  = ensure_thumb_for(base_img)
            thumb_rel   = thumb_path.as_posix() if thumb_path else None
            if thumb_rel and THUMBS_DIR.name not in thumb_rel:
                thumb_rel = (THUMBS_DIR / Path(thumb_rel).name).as_posix()

            # video: paper-demo.* (any common video ext, any case)
            video_rel = None
            for ext in VIDEO_EXTS:
                p = folder / f"paper-demo{ext}"
                if p.exists():
                    video_rel = p.as_posix()
                    break

            # contexts: support context1 / context_1 / context-1 … up to 6
            ctxs = find_contexts(folder)

            # options.json passthrough (if present/valid)
            options = read_json_file(folder / 'options.json')

            item = {
                "id":    art_id,
                "title": title,
                "src":   src_rel.replace('\\', '/'),
                "thumb": (thumb_rel if thumb_rel else f"thumbs/{base_img.name}").replace('\\', '/'),
                "tags":  tags,
                "description": desc,
            }
            if video_rel:
                item["video"] = video_rel.replace('\\', '/')
            # add context1..6 keys in order
            for i, c in enumerate(ctxs, 1):
                item[f"context{i}"] = c.replace('\\', '/')
            if options is not None:
                item["options"] = options

            items.append(item)

    Path(dest).write_text(json.dumps(items, indent=2), encoding="utf-8")
    print(f"Wrote {dest} with {len(items)} items.")
  
  
  
        
if __name__ == '__main__':
    import sys
    if '--build' in sys.argv or '--export-json' in sys.argv:
        export_artworks_json('artworks.json')
    else:
        app.run(debug=True)
