import json, re, os, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]  # repo root
IMAGES = ROOT / "images"
THUMBS = ROOT / "thumbs"
ASSETS = ROOT / "assets"
OUT = ROOT / "artworks.json"

# helpers
def first_existing(*candidates):
    for p in candidates:
        if p and p.exists():
            return p
    return None

def read_text_safe(p):
    try:
        return p.read_text(encoding="utf-8").strip()
    except Exception:
        return ""

def read_tags(p):
    raw = read_text_safe(p)
    if not raw: return []
    parts = [t.strip() for chunk in raw.splitlines() for t in chunk.split(",")]
    return [t for t in parts if t]

def find_case_insensitive(directory: Path, base_stem: str):
    # return the first file whose stem (without ext) matches base_stem case-insensitively
    base = base_stem.lower()
    for p in sorted(directory.glob("*")):
        if p.is_file() and p.stem.lower() == base:
            return p
    return None

def pick_by_stem(directory: Path, stem: str):
    """Return a file in directory named stem with any common image/video extension."""
    if not directory.exists(): return None
    stem_l = stem.lower()
    exts = [".jpg",".jpeg",".png",".webp",".gif",".mp4",".m4v",".webm"]
    for p in sorted(directory.glob("*")):
        if p.is_file() and p.stem.lower() == stem_l and p.suffix.lower() in exts:
            return p
    return None

def detect_video(dirpath: Path):
    if not dirpath.exists(): return None
    for p in sorted(dirpath.glob("*")):
        if p.suffix.lower() in (".mp4",".m4v",".webm"):
            return p
    return None

def context_candidates(dirpath: Path):
    if not dirpath.exists(): return []
    candidates = []
    # accept context1..6 and context_1..6
    for n in range(1,7):
        for name in (f"context{n}", f"context_{n}"):
            p = pick_by_stem(dirpath, name)
            if p: candidates.append(p)
    # keep order, unique, at most 6
    seen = set()
    out = []
    for p in candidates:
        if p and p.exists():
            key = p.resolve()
            if key not in seen:
                out.append(p); seen.add(key)
        if len(out) >= 6: break
    return out

def build():
    if not IMAGES.exists() or not THUMBS.exists():
        print("ERROR: expected images/ and thumbs/ at repo root.", file=sys.stderr)
        sys.exit(1)

    items = []
    # hero IDs come from files named image_<N>.* in images/
    for hero in sorted(IMAGES.glob("*")):
        if not hero.is_file(): continue
        if hero.suffix.lower() not in (".jpg",".jpeg",".png",".webp"): continue
        m = re.match(r"image[_-](\d+)$", hero.stem, re.IGNORECASE)
        if not m: 
            # allow names like image_foo too; map to id = stem with underscore
            if not hero.stem.lower().startswith("image"): 
                continue
            id_ = hero.stem.replace("-", "_")
        else:
            id_ = f"image_{m.group(1)}"

        thumb = find_case_insensitive(THUMBS, id_)
        assets_dir = ASSETS / id_

        title = read_text_safe(assets_dir / "title.txt") or f"Untitled ({id_})"
        desc  = read_text_safe(assets_dir / "desc.txt")
        tags  = read_tags(assets_dir / "tags.txt")

        video = detect_video(assets_dir)
        ctx   = context_candidates(assets_dir)

        # paths must be repo-relative for GitHub Pages
        item = {
            "id": id_,
            "title": title,
            "src": f"images/{hero.name}",
            "thumb": f"thumbs/{thumb.name}" if thumb else f"images/{hero.name}",
            "tags": tags,
            "description": desc
        }
        if video:
            item["video"] = f"assets/{id_}/{video.name}"
        # add context1..6 if found
        for i, p in enumerate(ctx, start=1):
            item[f"context{i}"] = f"assets/{id_}/{p.name}"

        # optional: options.json passthrough
        opt = assets_dir / "options.json"
        if opt.exists():
            try:
                item["options"] = json.loads(opt.read_text(encoding="utf-8"))
            except Exception:
                pass

        items.append(item)

    # stable sort by numeric suffix if possible
    def sort_key(it):
        m = re.search(r"(\d+)$", it["id"])
        return int(m.group(1)) if m else it["id"]
    items.sort(key=sort_key)

    OUT.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT} with {len(items)} items.")

if __name__ == "__main__":
    build()