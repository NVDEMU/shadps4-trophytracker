#!/usr/bin/env bash
set -euo pipefail

REPO="${1:-shadps4-trophy-tracker}"
VISIBILITY="${2:-public}"

gh repo create "NVDEMU/${REPO}" \
  --${VISIBILITY} \
  --source . \
  --remote origin \
  --push
