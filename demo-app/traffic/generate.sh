#!/bin/sh
# Steady RED traffic so checkout-service reports continuous metrics + traces.
# Weighted toward /pay (the hero path) with a slower /cart trickle.
set -eu

TARGET="${TARGET:-http://checkout:8080}"
PAY_CONCURRENCY="${PAY_CONCURRENCY:-4}"

echo "traffic -> $TARGET (pay concurrency=$PAY_CONCURRENCY)"

# wait for the service to come up
until wget -q -O /dev/null "$TARGET/health" 2>/dev/null; do
  echo "waiting for checkout..."; sleep 2
done
echo "checkout is up; generating load"

pay_loop() {
  while true; do
    wget -q -O /dev/null --post-data='' "$TARGET/pay" || true
    sleep 0.2
  done
}

cart_loop() {
  while true; do
    wget -q -O /dev/null "$TARGET/cart" || true
    sleep 1.5
  done
}

i=1
while [ "$i" -le "$PAY_CONCURRENCY" ]; do
  pay_loop &
  i=$((i + 1))
done
cart_loop &

wait
