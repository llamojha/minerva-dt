# Minerva demo app (M2)

The seeded microservice app that emits real Dynatrace telemetry for Minerva to investigate.
Two planted opportunities:

1. **Hero hotspot** — `POST /pay` p95 is dominated by **one unindexed seq-scan** on `orders`
   (`SELECT … WHERE lower(email) = …`). This is the signature finding (p95 ≈ 4.2s → 1.5s).
2. **N+1** — `GET /cart` issues one query per cart item. Opportunity #2.

OneAgent on the host auto-instruments the Node runtime and the `pg` client, so each DB call
surfaces as a client span with `db.statement` — no in-app SDK needed.

## Stack
- `db/` — Postgres 16, seeded large + **deliberately unindexed** (`init.sql`, `seed.sh`).
- `checkout/` — TS + Hono service (`server.ts`), the two endpoints above.
- `traffic/` — steady RED load generator (`generate.sh`).
- `docker-compose.yml` — ties them together.

## Run it (on a Linux VM with OneAgent installed)

### 1. Create the smallest viable VM
```sh
gcloud compute instances create minerva-demo \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --zone us-central1-a \
  --machine-type e2-small \
  --image-family debian-12 --image-project debian-cloud \
  --boot-disk-size 20GB
gcloud compute ssh minerva-demo --zone us-central1-a
```

### 2. Install Docker + OneAgent on the VM
```sh
# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER" && newgrp docker
```
Then install OneAgent: in your tenant open **Deploy Dynatrace → Start installation → Linux**,
copy the generated `wget … && sudo /bin/sh Dynatrace-OneAgent-Linux.sh …` command, and run it
on the VM. (The command embeds your env URL + a one-time PaaS token — it's tenant-specific, so
it isn't checked in here.) Within ~2 min the host appears under Hosts in the tenant.

### 3. Bring up the app
```sh
git clone <repo> && cd minerva-dynatrace/demo-app
ORDERS_ROWS=3000000 docker compose up -d --build
```
First boot seeds the DB (a minute or two for 3M rows), then traffic starts automatically.

### 4. Verify telemetry locally
```sh
curl -s localhost:8080/health
curl -s -X POST localhost:8080/pay   # should take a couple seconds
```

## Verify the planted hotspot lands in Dynatrace
From your laptop (where `dtctl` context `minerva` is set up), after ~5 min of traffic:
```sh
../demo-app/verify.sh      # see verify.sh — runs the RED + DB-hotspot DQL
```

## Tuning
- p95 too low? Raise `ORDERS_ROWS` (e.g. `5000000`) and `docker compose down -v && … up`.
- Seeding too slow / disk pressure? Lower it (e.g. `1000000`) — the *proportion* of time in the
  one query is what matters for the demo, not the absolute number.
- More load: bump `PAY_CONCURRENCY` on the `traffic` service.

## Teardown (do this after recording fixtures)
```sh
gcloud compute instances delete minerva-demo --zone us-central1-a
```
