// /api/admin/[...path]
// Single catch-all handler for all admin routes.
// Routes based on path segments:
//   POST   /api/admin/setup-db         — create DB tables (one-time)
//   GET    /api/admin/codes            — list discount codes
//   POST   /api/admin/codes            — create discount code
//   PATCH  /api/admin/codes?id=N       — update discount code
//   DELETE /api/admin/codes?id=N       — delete discount code
//   GET    /api/admin/affiliates       — list affiliates with balances
//   POST   /api/admin/affiliates       — create affiliate
//   PATCH  /api/admin/affiliates?id=N  — update affiliate
//   DELETE /api/admin/affiliates?id=N  — deactivate affiliate
//   GET    /api/admin/ledger           — ledger + payments (?affiliate_id=N optional)
//   POST   /api/admin/ledger?action=payment    — record payment
//   POST   /api/admin/ledger?action=adjustment — manual adjustment

const { getDb } = require('../_db');
const { checkAdminAuth } = require('../_admin-auth');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const authError = checkAdminAuth(req);
  if (authError) return res.status(401).json({ error: authError });

  // Parse route from URL directly (more reliable than req.query.path with rewrites)
  const urlPath = (req.url || '').split('?')[0];
  const parts = urlPath.split('/').filter(Boolean);
  // URL is /api/admin/<route>, so route is parts[2]
  const route = parts[2] || parts[parts.length - 1];

  const sql = getDb();

  // ── SETUP DB ──────────────────────────────────────────────────────────────

  if (route === 'setup-db') {
    if (req.method !== 'POST') return res.status(405).end();
    try {
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
      await sql`CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON discount_codes (UPPER(code))`;
      await sql`CREATE INDEX IF NOT EXISTS idx_discount_code_usages_email_code ON discount_code_usages (customer_email, code_id)`;
      return res.status(200).json({ ok: true, message: 'All tables created (or already existed).' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── DISCOUNT CODES ────────────────────────────────────────────────────────

  if (route === 'codes') {
    if (req.method === 'GET') {
      try {
        const rows = await sql`
          SELECT dc.*, a.name AS affiliate_name, a.commission_rate
          FROM discount_codes dc
          LEFT JOIN affiliates a ON a.id = dc.affiliate_id
          ORDER BY dc.created_at DESC
        `;
        return res.status(200).json({ codes: rows });
      } catch (e) { return res.status(500).json({ error: e.message }); }
    }

    if (req.method === 'POST') {
      const { code, type, value, scope, scope_ids, min_order_cents, max_uses,
              max_uses_per_customer, is_active, is_stackable, expires_at, affiliate_id } = req.body || {};
      if (!code || !type) return res.status(400).json({ error: 'code and type are required' });
      if (!['percentage','fixed','free_shipping'].includes(type))
        return res.status(400).json({ error: 'type must be percentage, fixed, or free_shipping' });
      try {
        const rows = await sql`
          INSERT INTO discount_codes
            (code, type, value, scope, scope_ids, min_order_cents, max_uses,
             max_uses_per_customer, is_active, is_stackable, expires_at, affiliate_id)
          VALUES (
            ${code.trim().toUpperCase()}, ${type}, ${value || 0},
            ${scope || 'sitewide'}, ${scope_ids || null}, ${min_order_cents || null},
            ${max_uses || null}, ${max_uses_per_customer || null}, ${is_active !== false},
            ${is_stackable || false}, ${expires_at || null}, ${affiliate_id || null}
          ) RETURNING *
        `;
        return res.status(201).json({ code: rows[0] });
      } catch (e) {
        if (e.message.includes('unique')) return res.status(409).json({ error: 'Code already exists.' });
        return res.status(500).json({ error: e.message });
      }
    }

    if (req.method === 'PATCH') {
      const id = req.query?.id;
      if (!id) return res.status(400).json({ error: 'id query param required' });
      const { code, type, value, scope, scope_ids, min_order_cents, max_uses,
              max_uses_per_customer, is_active, is_stackable, expires_at, affiliate_id } = req.body || {};
      try {
        const rows = await sql`
          UPDATE discount_codes SET
            code                  = COALESCE(${code ? code.trim().toUpperCase() : null}, code),
            type                  = COALESCE(${type || null}, type),
            value                 = COALESCE(${value !== undefined ? value : null}, value),
            scope                 = COALESCE(${scope || null}, scope),
            scope_ids             = COALESCE(${scope_ids || null}, scope_ids),
            min_order_cents       = COALESCE(${min_order_cents !== undefined ? min_order_cents : null}, min_order_cents),
            max_uses              = COALESCE(${max_uses !== undefined ? max_uses : null}, max_uses),
            max_uses_per_customer = COALESCE(${max_uses_per_customer !== undefined ? max_uses_per_customer : null}, max_uses_per_customer),
            is_active             = COALESCE(${is_active !== undefined ? is_active : null}, is_active),
            is_stackable          = COALESCE(${is_stackable !== undefined ? is_stackable : null}, is_stackable),
            expires_at            = COALESCE(${expires_at || null}, expires_at),
            affiliate_id          = COALESCE(${affiliate_id !== undefined ? affiliate_id : null}, affiliate_id)
          WHERE id = ${id} RETURNING *
        `;
        if (!rows.length) return res.status(404).json({ error: 'Code not found' });
        return res.status(200).json({ code: rows[0] });
      } catch (e) { return res.status(500).json({ error: e.message }); }
    }

    if (req.method === 'DELETE') {
      const id = req.query?.id;
      if (!id) return res.status(400).json({ error: 'id query param required' });
      try {
        await sql`DELETE FROM discount_codes WHERE id = ${id}`;
        return res.status(200).json({ ok: true });
      } catch (e) { return res.status(500).json({ error: e.message }); }
    }

    return res.status(405).end();
  }

  // ── AFFILIATES ────────────────────────────────────────────────────────────

  if (route === 'affiliates') {
    if (req.method === 'GET') {
      try {
        const rows = await sql`
          SELECT a.*,
            COALESCE(SUM(cl.amount_cents), 0) AS total_earned_cents,
            COALESCE(SUM(cp.amount_cents), 0) AS total_paid_cents,
            COALESCE(SUM(cl.amount_cents), 0) - COALESCE(SUM(cp.amount_cents), 0) AS outstanding_cents
          FROM affiliates a
          LEFT JOIN commission_ledger cl ON cl.affiliate_id = a.id
          LEFT JOIN commission_payments cp ON cp.affiliate_id = a.id
          GROUP BY a.id ORDER BY a.created_at DESC
        `;
        return res.status(200).json({ affiliates: rows });
      } catch (e) { return res.status(500).json({ error: e.message }); }
    }

    if (req.method === 'POST') {
      const { name, email, commission_rate, notes } = req.body || {};
      if (!name || commission_rate === undefined)
        return res.status(400).json({ error: 'name and commission_rate are required' });
      if (commission_rate < 0 || commission_rate > 1)
        return res.status(400).json({ error: 'commission_rate must be between 0 and 1' });
      try {
        const rows = await sql`
          INSERT INTO affiliates (name, email, commission_rate, notes)
          VALUES (${name}, ${email || null}, ${commission_rate}, ${notes || null})
          RETURNING *
        `;
        return res.status(201).json({ affiliate: rows[0] });
      } catch (e) { return res.status(500).json({ error: e.message }); }
    }

    if (req.method === 'PATCH') {
      const id = req.query?.id;
      if (!id) return res.status(400).json({ error: 'id query param required' });
      const { name, email, commission_rate, notes, is_active } = req.body || {};
      try {
        const rows = await sql`
          UPDATE affiliates SET
            name            = COALESCE(${name || null}, name),
            email           = COALESCE(${email || null}, email),
            commission_rate = COALESCE(${commission_rate !== undefined ? commission_rate : null}, commission_rate),
            notes           = COALESCE(${notes || null}, notes),
            is_active       = COALESCE(${is_active !== undefined ? is_active : null}, is_active)
          WHERE id = ${id} RETURNING *
        `;
        if (!rows.length) return res.status(404).json({ error: 'Affiliate not found' });
        return res.status(200).json({ affiliate: rows[0] });
      } catch (e) { return res.status(500).json({ error: e.message }); }
    }

    if (req.method === 'DELETE') {
      const id = req.query?.id;
      if (!id) return res.status(400).json({ error: 'id query param required' });
      try {
        await sql`UPDATE affiliates SET is_active = false WHERE id = ${id}`;
        return res.status(200).json({ ok: true });
      } catch (e) { return res.status(500).json({ error: e.message }); }
    }

    return res.status(405).end();
  }

  // ── LEDGER ────────────────────────────────────────────────────────────────

  if (route === 'ledger') {
    const affiliateId = req.query?.affiliate_id;

    if (req.method === 'GET') {
      try {
        const ledger = affiliateId
          ? await sql`
              SELECT cl.*, a.name AS affiliate_name, dcu.stripe_session_id AS usage_session_id,
                dcu.order_subtotal_cents, dcu.discount_amount_cents, dc.code AS discount_code
              FROM commission_ledger cl
              JOIN affiliates a ON a.id = cl.affiliate_id
              LEFT JOIN discount_code_usages dcu ON dcu.id = cl.usage_id
              LEFT JOIN discount_codes dc ON dc.id = dcu.code_id
              WHERE cl.affiliate_id = ${affiliateId}
              ORDER BY cl.created_at DESC`
          : await sql`
              SELECT cl.*, a.name AS affiliate_name, dcu.stripe_session_id AS usage_session_id,
                dcu.order_subtotal_cents, dcu.discount_amount_cents, dc.code AS discount_code
              FROM commission_ledger cl
              JOIN affiliates a ON a.id = cl.affiliate_id
              LEFT JOIN discount_code_usages dcu ON dcu.id = cl.usage_id
              LEFT JOIN discount_codes dc ON dc.id = dcu.code_id
              ORDER BY cl.created_at DESC`;

        const payments = affiliateId
          ? await sql`
              SELECT cp.*, a.name AS affiliate_name FROM commission_payments cp
              JOIN affiliates a ON a.id = cp.affiliate_id
              WHERE cp.affiliate_id = ${affiliateId} ORDER BY cp.paid_at DESC`
          : await sql`
              SELECT cp.*, a.name AS affiliate_name FROM commission_payments cp
              JOIN affiliates a ON a.id = cp.affiliate_id ORDER BY cp.paid_at DESC`;

        const summary = affiliateId
          ? await sql`
              SELECT a.id, a.name, a.commission_rate,
                COALESCE(SUM(cl.amount_cents), 0) AS total_earned_cents,
                COALESCE(SUM(cp.amount_cents), 0) AS total_paid_cents,
                COALESCE(SUM(cl.amount_cents), 0) - COALESCE(SUM(cp.amount_cents), 0) AS outstanding_cents
              FROM affiliates a
              LEFT JOIN commission_ledger cl ON cl.affiliate_id = a.id
              LEFT JOIN commission_payments cp ON cp.affiliate_id = a.id
              WHERE a.id = ${affiliateId}
              GROUP BY a.id, a.name, a.commission_rate`
          : await sql`
              SELECT a.id, a.name, a.commission_rate,
                COALESCE(SUM(cl.amount_cents), 0) AS total_earned_cents,
                COALESCE(SUM(cp.amount_cents), 0) AS total_paid_cents,
                COALESCE(SUM(cl.amount_cents), 0) - COALESCE(SUM(cp.amount_cents), 0) AS outstanding_cents
              FROM affiliates a
              LEFT JOIN commission_ledger cl ON cl.affiliate_id = a.id
              LEFT JOIN commission_payments cp ON cp.affiliate_id = a.id
              GROUP BY a.id, a.name, a.commission_rate`;

        return res.status(200).json({ ledger, payments, summary });
      } catch (e) { return res.status(500).json({ error: e.message }); }
    }

    if (req.method === 'POST') {
      const action = req.query?.action;
      const { affiliate_id, amount_cents, note } = req.body || {};
      if (!affiliate_id || !amount_cents)
        return res.status(400).json({ error: 'affiliate_id and amount_cents required' });

      if (action === 'payment') {
        try {
          const rows = await sql`
            INSERT INTO commission_payments (affiliate_id, amount_cents, note)
            VALUES (${affiliate_id}, ${amount_cents}, ${note || null}) RETURNING *
          `;
          return res.status(201).json({ payment: rows[0] });
        } catch (e) { return res.status(500).json({ error: e.message }); }
      }

      if (action === 'adjustment') {
        try {
          const rows = await sql`
            INSERT INTO commission_ledger (affiliate_id, amount_cents, note)
            VALUES (${affiliate_id}, ${amount_cents}, ${note || 'Manual adjustment'}) RETURNING *
          `;
          return res.status(201).json({ entry: rows[0] });
        } catch (e) { return res.status(500).json({ error: e.message }); }
      }

      return res.status(400).json({ error: 'action must be payment or adjustment' });
    }

    return res.status(405).end();
  }

  return res.status(404).json({ error: `Unknown admin route: ${route}` });
};
