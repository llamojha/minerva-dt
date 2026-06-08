// checkout-service — the instrumented demo service Minerva investigates.
//
// Two planted opportunities, both visible to OneAgent as real spans:
//   1. POST /pay  — p95 dominated by ONE unindexed seq-scan on `orders` (the hero).
//   2. GET  /cart — an N+1: one query per cart item instead of a single IN/join.
//
// OneAgent auto-instruments the Node runtime and the `pg` client, so each DB call
// shows up as a client span carrying db.statement — which is exactly what the
// "65% of p95 is one query" finding is built on.

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  host: process.env.PGHOST ?? "db",
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? "minerva",
  password: process.env.PGPASSWORD ?? "minerva",
  database: process.env.PGDATABASE ?? "minerva",
  max: 10,
});

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

// HERO HOTSPOT: a non-sargable predicate (lower(email)) + ORDER BY over the large,
// unindexed `orders` table forces a full seq-scan + sort. This single statement is
// what dominates /pay latency and what Minerva should surface as opportunity #1.
app.post("/pay", async (c) => {
  const customer = `user${Math.floor(Math.random() * 50000)}@example.com`;

  // (fast) record the payment attempt
  await pool.query(
    "INSERT INTO orders (customer_id, email, status, amount_cents, created_at) VALUES ($1, $2, 'pending', $3, now())",
    [Math.floor(Math.random() * 50000), customer, Math.floor(Math.random() * 20000)],
  );

  // (SLOW — the hotspot) recompute the customer's lifetime spend with an unindexed,
  // non-sargable filter. ~65%+ of the endpoint's time lives here.
  const { rows } = await pool.query(
    `SELECT count(*) AS orders, coalesce(sum(amount_cents), 0) AS lifetime_cents
       FROM orders
      WHERE lower(email) = lower($1)
        AND status <> 'failed'
      ORDER BY 1`,
    [customer],
  );

  return c.json({ ok: true, customer, history: rows[0] });
});

// N+1: fetch the cart, then loop a query per item. Opportunity #2.
app.get("/cart", async (c) => {
  const cartId = Math.floor(Math.random() * 2000);
  const { rows: items } = await pool.query(
    "SELECT id, sku, qty FROM cart_items WHERE cart_id = $1",
    [cartId],
  );

  const enriched = [];
  for (const item of items) {
    // one round-trip per item instead of a single set-based query
    const { rows } = await pool.query(
      "SELECT count(*) AS times_ordered FROM orders WHERE customer_id = $1",
      [item.id % 50000],
    );
    enriched.push({ ...item, timesOrdered: rows[0].times_ordered });
  }

  return c.json({ ok: true, cartId, items: enriched });
});

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port }, () =>
  console.log(`checkout-service listening on :${port}`),
);
