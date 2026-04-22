// POST /api/admin/setup-db
// One-time endpoint to create all discount/affiliate tables.
// Protected by ADMIN_PASSWORD. Safe to re-run (uses IF NOT EXISTS).

const { getDb } = require('../_db');
const { checkAdminAuth } = require('../_admin-auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const authError = checkAdminAuth(req);
  if (authError) return res.status(401).json({ error: authError });

  const sql = getDb();

  try {
    // affiliates must be created before discount_codes (FK reference)
    await sql`
      CREATE TABLE IF NOT EXISTS affiliates (
        id              SERIAL PRIMARY KEY,
        name            TEXT NOT NULL,
        email           TEXT,
        commission_rate NUMERIC(5,4) NOT NULL,
        notes           TEXT,
        is_active       BOOLEAN NOT NULL DEFAULT true,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS discount_codes (
        id                    SERIAL PRIMARY KEY,
        code                  TEXT UNIQUE NOT NULL,
        type                  TEXT NOT NULL CHECK (type IN ('percentage','fixed','free_shipping')),
        value                 NUMERIC(10,2) NOT NULL DEFAULT 0,
        scope                 TEXT NOT NULL DEFAULT 'sitewide' CHECK (scope IN ('sitewide','product','collection')),
        scope_ids             TEXT[],
        min_order_cents       INTEGER,
        max_uses              INTEGER,
        max_uses_per_customer INTEGER,
        uses_count            INTEGER NOT NULL DEFAULT 0,
        is_active             BOOLEAN NOT NULL DEFAULT true,
        is_stackable          BOOLEAN NOT NULL DEFAULT false,
        expires_at            TIMESTAMPTZ,
        affiliate_id          INTEGER REFERENCES affiliates(id),
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS discount_code_usages (
        id                    SERIAL PRIMARY KEY,
        code_id               INTEGER NOT NULL REFERENCES discount_codes(id),
        stripe_session_id     TEXT NOT NULL,
        customer_email        TEXT,
        order_subtotal_cents  INTEGER NOT NULL,
        discount_amount_cents INTEGER NOT NULL,
        used_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS commission_ledger (
        id                SERIAL PRIMARY KEY,
        affiliate_id      INTEGER NOT NULL REFERENCES affiliates(id),
        usage_id          INTEGER REFERENCES discount_code_usages(id),
        stripe_session_id TEXT,
        amount_cents      INTEGER NOT NULL,
        note              TEXT,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS commission_payments (
        id           SERIAL PRIMARY KEY,
        affiliate_id INTEGER NOT NULL REFERENCES affiliates(id),
        amount_cents INTEGER NOT NULL,
        note         TEXT,
        paid_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // Index for fast code lookups at checkout
    await sql`
      CREATE INDEX IF NOT EXISTS idx_discount_codes_code
      ON discount_codes (UPPER(code))
    `;

    // Index for per-customer usage checks
    await sql`
      CREATE INDEX IF NOT EXISTS idx_discount_code_usages_email_code
      ON discount_code_usages (customer_email, code_id)
    `;

    return res.status(200).json({ ok: true, message: 'All tables created (or already existed).' });
  } catch (e) {
    console.error('[setup-db] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
