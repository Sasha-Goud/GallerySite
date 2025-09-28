#!/usr/bin/env bash
set -euo pipefail

git add .
git commit -m "Update site" || echo "No changes to commit"
git push
