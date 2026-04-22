// /api/admin/codes
//
// GET    — list all discount codes (with usage stats)
// POST   — create a new discount code
// PATCH  — update a code (?id=N)
// DELETE — delete a code (?id=N)

const { getDb } = require('../_db');
const { checkAdminAuth } = require('../_admin-auth');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const authError = checkAdminAuth(req);
  if (authError) return res.status(401).json({ error: authError });

  const sql = getDb();

  // GET — list all codes
  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT
          dc.*,
          a.name AS affiliate_name,
          a.commission_rate
        FROM discount_codes dc
        LEFT JOIN affiliates a ON a.id = dc.affiliate_id
        ORDER BY dc.created_at DESC
      `;
      return res.status(200).json({ codes: rows });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST — create
  if (req.method === 'POST') {
    const {
      code, type, value, scope, scope_ids,
      min_order_cents, max_uses, max_uses_per_customer,
      is_active, is_stackable, expires_at, affiliate_id
    } = req.body || {};

    if (!code || !type) {
      return res.status(400).json({ error: 'code and type are required' });
    }
    if (!['percentage', 'fixed', 'free_shipping'].includes(type)) {
      return res.status(400).json({ error: 'type must be percentage, fixed, or free_shipping' });
    }

    try {
      const rows = await sql`
        INSERT INTO discount_codes
          (code, type, value, scope, scope_ids, min_order_cents, max_uses,
           max_uses_per_customer, is_active, is_stackable, expires_at, affiliate_id)
        VALUES (
          ${code.trim().toUpperCase()},
          ${type},
          ${value || 0},
          ${scope || 'sitewide'},
          ${scope_ids || null},
          ${min_order_cents || null},
          ${max_uses || null},
          ${max_uses_per_customer || null},
          ${is_active !== false},
          ${is_stackable || false},
          ${expires_at || null},
          ${affiliate_id || null}
        )
        RETURNING *
      `;
      return res.status(201).json({ code: rows[0] });
    } catch (e) {
      if (e.message.includes('unique')) {
        return res.status(409).json({ error: 'Code already exists.' });
      }
      return res.status(500).json({ error: e.message });
    }
  }

  // PATCH — update
  if (req.method === 'PATCH') {
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: 'id query param required' });

    const {
      code, type, value, scope, scope_ids,
      min_order_cents, max_uses, max_uses_per_customer,
      is_active, is_stackable, expires_at, affiliate_id
    } = req.body || {};

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
        WHERE id = ${id}
        RETURNING *
      `;
      if (!rows.length) return res.status(404).json({ error: 'Code not found' });
      return res.status(200).json({ code: rows[0] });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // DELETE
  if (req.method === 'DELETE') {
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: 'id query param required' });

    try {
      await sql`DELETE FROM discount_codes WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).end();
};
