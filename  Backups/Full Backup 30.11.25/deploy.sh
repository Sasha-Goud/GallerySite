#!/usr/bin/env bash
set -euo pipefail

# Step 1: Stage all changes
git add .

# Step 2: Commit with a default message
git commit -m "Update site" || echo "No changes to commit"

# Step 3: Sync with remote before pushing
git pull --rebase origin main

# Step 4: Push changes
git push
