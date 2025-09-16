#!/bin/bash
# Update script for GallerySite
# Rebuild artworks.json and push changes to GitHub

cd "$(dirname "$0")" || exit 1

echo "🔄 Rebuilding artworks.json..."
python3 tools/build_artworks.py || { echo "❌ build failed"; exit 1; }

echo "📂 Adding changes to git..."
git add -A

echo "📝 Committing..."
git commit -m "Update artworks $(date +'%Y-%m-%d %H:%M:%S')" || echo "No changes to commit."

echo "⬆️ Pushing to GitHub..."
git push

echo "✅ Done. Check live site in a minute."
