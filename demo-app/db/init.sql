-- Minerva demo DB — the planted hero hotspot.
--
-- `orders` is seeded large and DELIBERATELY UNINDEXED on the columns /pay filters by.
-- The /pay query therefore does a full seq-scan + sort over millions of rows, which
-- OneAgent attributes to a single db.statement that dominates checkout p95.
--
-- Row count is tunable via ORDERS_ROWS (default 3,000,000), passed in as the psql var
-- :rows by seed.sh. Bump it if p95 lands below the ~4s hero target on your VM; lower
-- it if seeding is too slow.

CREATE TABLE IF NOT EXISTS orders (
  id           bigserial PRIMARY KEY,
  customer_id  bigint        NOT NULL,
  email        text          NOT NULL,
  status       text          NOT NULL,
  amount_cents bigint        NOT NULL,
  created_at   timestamptz   NOT NULL
);

-- Fast bulk seed via generate_series. NOTE: no index on customer_id / email / status —
-- that omission IS the planted opportunity. Do not add one here.
INSERT INTO orders (customer_id, email, status, amount_cents, created_at)
SELECT
  (random() * 50000)::bigint,
  'user' || (random() * 50000)::int || '@example.com',
  (ARRAY['paid','pending','refunded','failed'])[1 + (random() * 3)::int],
  (random() * 20000)::bigint,
  now() - (random() * interval '90 days')
FROM generate_series(1, :rows);

ANALYZE orders;

-- cart_items backs the N+1 in GET /cart (opportunity #2). Small + indexed; the N+1 is
-- in the app's query pattern, not the schema.
CREATE TABLE IF NOT EXISTS cart_items (
  id         bigserial PRIMARY KEY,
  cart_id    bigint  NOT NULL,
  sku        text    NOT NULL,
  qty        int     NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items (cart_id);

INSERT INTO cart_items (cart_id, sku, qty)
SELECT
  (random() * 2000)::bigint,
  'SKU-' || (random() * 9999)::int,
  1 + (random() * 4)::int
FROM generate_series(1, 20000);

ANALYZE cart_items;
