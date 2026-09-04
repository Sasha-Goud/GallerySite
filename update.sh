#!/usr/bin/env bash
set -euo pipefail

# Publish GallerySite media to Cloudflare R2, then publish metadata to GitHub.
cd "$(dirname "$0")"

R2_ENDPOINT="https://b06fba81d4e7be4455886479c978c69d.r2.cloudflarestorage.com"
R2_BUCKET="s3://50and-gallery"

command -v aws >/dev/null || {
  echo "❌ The AWS upload tool is not installed."
  exit 1
}

if ! git diff --cached --quiet; then
  echo "❌ Other changes are already staged in Git. Commit or unstage them first."
  exit 1
fi

echo "🔎 Checking that media folder and file names are lowercase..."
python3 - <<'PY'
from pathlib import Path

extensions = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".m4v", ".webm"}
bad = []
for root in (Path("assets"), Path("thumbs")):
    for path in root.rglob("*"):
        if path.is_file() and path.suffix.lower() in extensions:
            relative = path.as_posix()
            if relative != relative.lower():
                bad.append(relative)

if bad:
    print("❌ These media paths contain capital letters:")
    for path in bad:
        print(f"   {path}")
    raise SystemExit(1)
PY

echo "☁️  Uploading new or changed artwork media to Cloudflare..."
aws s3 sync assets "$R2_BUCKET/assets" \
  --endpoint-url "$R2_ENDPOINT" \
  --exclude "*" \
  --include "*.jpg" --include "*.jpeg" --include "*.png" --include "*.webp" \
  --include "*.gif" --include "*.mp4" --include "*.m4v" --include "*.webm"

aws s3 sync thumbs "$R2_BUCKET/thumbs" \
  --endpoint-url "$R2_ENDPOINT" \
  --exclude "*" \
  --include "*.jpg" --include "*.jpeg" --include "*.png" --include "*.webp" \
  --include "*.gif" --include "*.mp4" --include "*.m4v" --include "*.webm"

echo "🔄 Rebuilding artworks.json..."
python3 tools/build_artworks.py

echo "📂 Preparing gallery metadata for GitHub..."
git add artworks.json assets update.sh

echo "📝 Committing gallery changes..."
git commit -m "Update artworks $(date +'%Y-%m-%d %H:%M:%S')" || echo "No metadata changes to commit."

echo "⬆️  Pushing to GitHub..."
git push origin main

echo "✅ Done. Cloudflare media and GitHub metadata are published."
