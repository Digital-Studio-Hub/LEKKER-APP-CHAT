#!/usr/bin/env bash
# Build + submit Lekker Chat Android to Google Play production.
# Prerequisites:
#   1. eas login   (once)
#   2. eas init    (once — real projectId in app.json)
#   3. Play SA granted (grok-play@…) + google-play-service-account.json present
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Checking EAS login"
if ! eas whoami >/dev/null 2>&1; then
  echo "Not logged in to Expo. Run:  eas login"
  exit 1
fi
eas whoami

if ! test -f google-play-service-account.json; then
  echo "Missing google-play-service-account.json (Play API key symlink)"
  exit 1
fi

# Ensure versionCode is above Play production (currently 14)
CODE=$(node -p "require('./app.json').expo.android.versionCode")
if [ "${CODE:-0}" -le 14 ]; then
  echo "versionCode $CODE must be > 14 (Play production). Bump app.json first."
  exit 1
fi
echo "version $(node -p "require('./app.json').expo.version") code $CODE"

echo "==> EAS build Android production (AAB, cloud)"
eas build --platform android --profile production --non-interactive --wait

echo "==> Submit latest Android build to Play production"
eas submit --platform android --profile production --latest --non-interactive

echo "==> Done. Check Play Console → Production for review / rollout."
echo "    After submit, production may still need manual rollout if draft."
