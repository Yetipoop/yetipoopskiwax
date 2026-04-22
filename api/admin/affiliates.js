// /api/admin/affiliates
//
// GET    — list all affiliates with outstanding balance
// POST   — create affiliate
// PATCH  — update affiliate (?id=N)
// DELETE — deactivate affiliate (?id=N)

const { getDb } = require('../_db');
const { checkAdminAuth } = require('../_admin-auth');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const authError = checkAdminAuth(req);
  if (authError) return res.status(401).json({ error: authError });

  const sql = getDb();

  // GET — list all affiliates with balance summary
  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT
          a.*,
          COALESCE(SUM(cl.amount_cents), 0) AS total_earned_cents,
          COALESCE(SUM(cp.amount_cents), 0) AS total_paid_cents,
          COALESCE(SUM(cl.amount_cents), 0) - COALESCE(SUM(cp.amount_cents), 0) AS outstanding_cents
        FROM affiliates a
        LEFT JOIN commission_ledger cl ON cl.affiliate_id = a.id
        LEFT JOIN commission_payments cp ON cp.affiliate_id = a.id
        GROUP BY a.id
        ORDER BY a.created_at DESC
      `;
      return res.status(200).json({ affiliates: rows });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST — create
  if (req.method === 'POST') {
    const { name, email, commission_rate, notes } = req.body || {};

    if (!name || commission_rate === undefined) {
      return res.status(400).json({ error: 'name and commission_rate are required' });
    }
    if (commission_rate < 0 || commission_rate > 1) {
      return res.status(400).json({ error: 'commission_rate must be between 0 and 1 (e.g. 0.10 for 10%)' });
    }

    try {
      const rows = await sql`
        INSERT INTO affiliates (name, email, commission_rate, notes)
        VALUES (${name}, ${email || null}, ${commission_rate}, ${notes || null})
        RETURNING *
      `;
      return res.status(201).json({ affiliate: rows[0] });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // PATCH — update
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
        WHERE id = ${id}
        RETURNING *
      `;
      if (!rows.length) return res.status(404).json({ error: 'Affiliate not found' });
      return res.status(200).json({ affiliate: rows[0] });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // DELETE — soft delete (deactivate)
  if (req.method === 'DELETE') {
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: 'id query param required' });

    try {
      await sql`UPDATE affiliates SET is_active = false WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).end();
};
