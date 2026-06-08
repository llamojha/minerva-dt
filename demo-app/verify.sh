#!/bin/sh
# Confirms the M2 seeded app is reporting and the planted hotspot is visible in Grail.
# Run from your laptop after ~5 min of traffic. Uses dtctl context `minerva`.
# Queries mirror docs/dynatrace-reference.md (the verified DQL layer).
set -eu

CTX="${DT_CONTEXT:-minerva}"
run() { echo "\n=== $1 ==="; dtctl --context "$CTX" query "$2"; }

# 1. Is the host reporting at all?
run "hosts reporting" \
  'fetch dt.entity.host | fields entity.name | limit 5'

# 2. Service RED — checkout should show real latency/throughput (response_time = microseconds)
run "service RED (last 30m)" \
  'timeseries {
     p95 = percentile(dt.service.request.response_time, 95, rollup: avg),
     reqs = sum(dt.service.request.count)
   }, by: {dt.service.name}, from: now()-30m
   | fieldsAdd p95_ms = p95[] / 1000'

# 3. THE HERO QUERY — DB hotspots by statement; the unindexed orders scan should top this
run "DB hotspots by statement" \
  'fetch spans, from: now()-30m
   | filter span.kind == "client" and isNotNull(db.statement)
   | summarize p95_ns = percentile(duration, 95, rollup: avg), calls = count(), by: { db.statement }
   | fieldsAdd p95_ms = p95_ns / 1000000
   | sort p95_ns desc
   | limit 10'

echo "\nIf #3 shows the 'SELECT ... WHERE lower(email) ...' statement near the top, the hotspot is planted. Record fixtures next."
