#!/usr/bin/env bash

# Bootstrap the required MVP branches securely.
set -euo pipefail

MAIN_WORKING_BRANCH="feature/mvp-2026-03"
SUB_BRANCHES=(
  "feature/intelligence-cluster-pack"
  "feature/orchestrator-signal-gate"
  "feature/connectors-stub"
  "feature/ingest-matrix-worker"
)

echo "Starting MVP branch bootstrap..."

# Ensure we have main and fetch latest
git fetch origin || echo "Could not fetch from origin. Continuing locally."

# Check if main working branch exists
if git show-ref --verify --quiet "refs/heads/$MAIN_WORKING_BRANCH"; then
  echo "=> Branch '$MAIN_WORKING_BRANCH' already exists."
else
  echo "=> Creating '$MAIN_WORKING_BRANCH' from current HEAD."
  git branch "$MAIN_WORKING_BRANCH"
fi

# Create sub-branches based on the main working branch
for BRANCH in "${SUB_BRANCHES[@]}"; do
  if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    echo "=> Branch '$BRANCH' already exists."
  else
    echo "=> Creating '$BRANCH' off '$MAIN_WORKING_BRANCH'."
    git branch "$BRANCH" "$MAIN_WORKING_BRANCH"
  fi
done

echo "Done! The recommended branches are available."
echo "You can switch to the main working branch with:"
echo "  git checkout $MAIN_WORKING_BRANCH"
