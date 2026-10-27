#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-local}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

if [ "${DEPLOY_DRY_RUN:-1}" = "1" ]; then
  echo "Dry-run provisioning for $ENVIRONMENT complete."
  echo "Wire provider credentials into this script for real environment creation."
  exit 0
fi

echo "Provisioning hooks complete for $ENVIRONMENT."
echo "Managed site and database resources are handled by the command center for supported nodes."
