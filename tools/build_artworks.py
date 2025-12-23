import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]  # repo root
THUMBS = ROOT / "thumbs"
ASSETS = ROOT / "assets"
OUT = ROOT / "artworks.json"

def read_text_safe(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8").strip()
    except Exception:
        return ""

def read_tags(p: Path):
    raw = read_text_safe(p)
    if not raw:
        return []
    parts = [t.strip() for chunk in raw.splitlines() for t in chunk.split(",")]
    return [t for t in parts if t]

def find_case_insensitive(directory: Path, base_stem: str):
    base = base_stem.lower()
    for p in sorted(directory.glob("*")):
        if p.is_file() and p.stem.lower() == base:
            return p
    return None

def pick_by_stem(directory: Path, stem: str):
    if not directory.exists():
        return None
    stem_l = stem.lower()
    exts = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".m4v", ".webm"]
    for p in sorted(directory.glob("*")):
        if p.is_file() and p.stem.lower() == stem_l and p.suffix.lower() in exts:
            return p
    return None

def detect_video(dirpath: Path):
    if not dirpath.exists():
        return None
    for p in sorted(dirpath.glob("*")):
        if p.suffix.lower() in (".mp4", ".m4v", ".webm"):
            return p
    return None

def context_candidates(dirpath: Path, max_ctx: int = 12):
    if not dirpath.exists():
        return []
    candidates = []
    for n in range(1, max_ctx + 1):
        for name in (f"context{n}", f"context_{n}"):
            p = pick_by_stem(dirpath, name)
            if p:
                candidates.append(p)

    seen = set()
    out = []
    for p in candidates:
        if p and p.exists():
            key = str(p.resolve())
            if key not in seen:
                out.append(p)
                seen.add(key)
        if len(out) >= max_ctx:
            break
    return out

def build():
    if not ASSETS.exists() or not THUMBS.exists():
        print("ERROR: expected assets/ and thumbs/ at repo root.", file=sys.stderr)
        sys.exit(1)

    items = []

    # Build items from assets/<id>/ folders (id = folder name)
    for assets_dir in sorted(ASSETS.glob("*")):
        if not assets_dir.is_dir():
            continue

        id_ = assets_dir.name

        # hero image is assets/<id>/<id>.(png/jpg/webp)
        hero = None
        for ext in (".png", ".jpg", ".jpeg", ".webp"):
            p = assets_dir / f"{id_}{ext}"
            if p.exists():
                hero = p
                break
        if not hero:
            continue

        thumb = find_case_insensitive(THUMBS, id_)

        title = read_text_safe(assets_dir / "title.txt") or f"Untitled ({id_})"
        desc  = read_text_safe(assets_dir / "desc.txt")
        tags  = read_tags(assets_dir / "tags.txt")

        video = detect_video(assets_dir)
        ctx   = context_candidates(assets_dir, max_ctx=12)

        item = {
            "id": id_,
            "title": title,
            "src": f"assets/{id_}/{hero.name}",
            "thumb": f"thumbs/{thumb.name}" if thumb else f"assets/{id_}/{hero.name}",
            "tags": tags,
            "description": desc
        }

        if video:
            item["video"] = f"assets/{id_}/{video.name}"

        for i, p in enumerate(ctx, start=1):
            item[f"context{i}"] = f"assets/{id_}/{p.name}"

        opt = assets_dir / "options.json"
        if opt.exists():
            try:
                item["options"] = json.loads(opt.read_text(encoding="utf-8"))
            except Exception:
                pass

        items.append(item)

    # Stable sort: numeric-leading IDs first, otherwise lexical (never int vs str compare)
    def sort_key(it):
        s = it.get("id", "")
        m = re.match(r"^(\d+)", s)  # leading digits like "217-i"
        if m:
            return (0, int(m.group(1)), s)
        return (1, s)

    items.sort(key=sort_key)

    OUT.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT} with {len(items)} items.")

if __name__ == "__main__":
    build()
