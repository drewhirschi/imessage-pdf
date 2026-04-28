#!/usr/bin/env bash
# End-to-end test: POST several specs to /api/generate-cover and verify the
# generated PDF MediaBox is EXACTLY what was requested. The API also
# self-verifies before returning, so any mismatch should produce a 500 — but
# we double-check here from the outside too.
#
# Usage:
#   scripts/test-cover-dims.sh
#   BASE_URL=http://localhost:3000 scripts/test-cover-dims.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
TMPDIR="${TMPDIR:-/tmp}"

# Each scenario: name | trim_w | trim_h | spine | bleed | expected_total_w | expected_total_h
# The form passes (trim_w, trim_h, spine, bleed) computed from
# (total_w, total_h, spine, binding) — so this directly mirrors the API
# contract. expected_total = 2*trim + spine + 2*bleed; trim_h + 2*bleed.
SCENARIOS=(
  "A5_hardcover|5.83|8.27|0.625|0.875|14.035|10.020"
  "A5_paperback|5.83|8.27|0.500|0.125|12.410|8.520"
  "USTrade_hardcover|6.0|9.0|0.750|0.875|14.500|10.750"
  "USTrade_paperback|6.0|9.0|0.300|0.125|12.550|9.250"
  "Royal_paperback|6.14|9.21|0.625|0.125|13.155|9.460"
  "Letter_paperback|8.5|11.0|0.500|0.125|17.750|11.250"
)

passes=0
failures=0
results=()

for scen in "${SCENARIOS[@]}"; do
  IFS='|' read -r name trim_w trim_h spine bleed want_w want_h <<<"$scen"
  out="$TMPDIR/test-cover-$name.pdf"

  spec=$(cat <<JSON
{
  "dateLabel": "Dec 25, 2021, 8:00 AM",
  "messages": [{"text":"test","isFromMe":true}],
  "showTypingIndicator": false,
  "trimWidthIn": ${trim_w},
  "trimHeightIn": ${trim_h},
  "spineWidthIn": ${spine},
  "bleedIn": ${bleed},
  "spineColor": "#000000",
  "spineText": "",
  "spineTextColor": "#ffffff",
  "marginIn": 0.5,
  "columnWidthPx": 390,
  "bubbleScale": 1
}
JSON
)

  http_code=$(curl -s -o "$out" -w "%{http_code}" -X POST "$BASE_URL/api/generate-cover" -F "spec=$spec" --max-time 90)

  status="?"; got_w="?"; got_h="?"; pages="?"
  if [[ "$http_code" == "200" ]]; then
    pdfinfo_out=$(pdfinfo "$out" 2>/dev/null || true)
    pages=$(awk -F': *' '/^Pages:/ {print $2; exit}' <<<"$pdfinfo_out")
    size_pts=$(awk -F': *' '/^Page size:/ {print $2; exit}' <<<"$pdfinfo_out")
    got_w_pts=$(awk '{print $1}' <<<"$size_pts")
    got_h_pts=$(awk '{print $3}' <<<"$size_pts")
    got_w=$(python3 -c "print(round($got_w_pts/72, 4))")
    got_h=$(python3 -c "print(round($got_h_pts/72, 4))")
    # Exact match required: post-processed MediaBox must be the requested size
    # to <0.001 in. (pdf-lib lays the MediaBox down to exact 72 pt/in.)
    ok=$(python3 -c "print(int(abs($got_w - $want_w) < 0.001 and abs($got_h - $want_h) < 0.001 and int($pages) == 1))")
    if [[ "$ok" == "1" ]]; then
      status="PASS"
      passes=$((passes + 1))
    else
      status="FAIL"
      failures=$((failures + 1))
    fi
  else
    status="HTTP_$http_code"
    failures=$((failures + 1))
  fi

  results+=("$(printf '  %-22s want %-15s got %-15s pages=%s  [%s]' \
    "$name" "${want_w}×${want_h}" "${got_w}×${got_h}" "$pages" "$status")")
done

echo "── Cover dimension end-to-end test ──"
echo "Base URL: $BASE_URL"
echo
for line in "${results[@]}"; do echo "$line"; done
echo
echo "Summary: ${passes} passed, ${failures} failed"

if (( failures > 0 )); then
  exit 1
fi
