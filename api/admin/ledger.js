// /api/admin/ledger
//
// GET  — ledger entries + payments for an affiliate (?affiliate_id=N)
//         or all affiliates if no param
// POST — record a manual payment (?action=payment)
//         body: { affiliate_id, amount_cents, note }
//       — manual ledger adjustment (?action=adjustment)
//         body: { affiliate_id, amount_cents, note }

const { getDb } = require('../_db');
const { checkAdminAuth } = require('../_admin-auth');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const authError = checkAdminAuth(req);
  if (authError) return res.status(401).json({ error: authError });

  const sql = getDb();
  const affiliateId = req.query?.affiliate_id;

  // GET — full ledger for one or all affiliates
  if (req.method === 'GET') {
    try {
      const whereClause = affiliateId
        ? sql`WHERE cl.affiliate_id = ${affiliateId}`
        : sql``;

      const ledger = await sql`
        SELECT
          cl.*,
          a.name AS affiliate_name,
          dcu.stripe_session_id AS usage_session_id,
          dcu.order_subtotal_cents,
          dcu.discount_amount_cents,
          dc.code AS discount_code
        FROM commission_ledger cl
        JOIN affiliates a ON a.id = cl.affiliate_id
        LEFT JOIN discount_code_usages dcu ON dcu.id = cl.usage_id
        LEFT JOIN discount_codes dc ON dc.id = dcu.code_id
        ${whereClause}
        ORDER BY cl.created_at DESC
      `;

      const paymentsWhere = affiliateId
        ? sql`WHERE affiliate_id = ${affiliateId}`
        : sql``;

      const payments = await sql`
        SELECT cp.*, a.name AS affiliate_name
        FROM commission_payments cp
        JOIN affiliates a ON a.id = cp.affiliate_id
        ${paymentsWhere}
        ORDER BY cp.paid_at DESC
      `;

      // Balance summary per affiliate
      const summary = await sql`
        SELECT
          a.id,
          a.name,
          a.commission_rate,
          COALESCE(SUM(cl.amount_cents), 0) AS total_earned_cents,
          COALESCE(SUM(cp.amount_cents), 0) AS total_paid_cents,
          COALESCE(SUM(cl.amount_cents), 0) - COALESCE(SUM(cp.amount_cents), 0) AS outstanding_cents
        FROM affiliates a
        LEFT JOIN commission_ledger cl ON cl.affiliate_id = a.id
        LEFT JOIN commission_payments cp ON cp.affiliate_id = a.id
        ${affiliateId ? sql`WHERE a.id = ${affiliateId}` : sql``}
        GROUP BY a.id, a.name, a.commission_rate
      `;

      return res.status(200).json({ ledger, payments, summary });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST — record payment or manual adjustment
  if (req.method === 'POST') {
    const action = req.query?.action;
    const { affiliate_id, amount_cents, note } = req.body || {};

    if (!affiliate_id || !amount_cents) {
      return res.status(400).json({ error: 'affiliate_id and amount_cents required' });
    }

    if (action === 'payment') {
      try {
        const rows = await sql`
          INSERT INTO commission_payments (affiliate_id, amount_cents, note)
          VALUES (${affiliate_id}, ${amount_cents}, ${note || null})
          RETURNING *
        `;
        return res.status(201).json({ payment: rows[0] });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    if (action === 'adjustment') {
      try {
        const rows = await sql`
          INSERT INTO commission_ledger (affiliate_id, amount_cents, note)
          VALUES (${affiliate_id}, ${amount_cents}, ${note || 'Manual adjustment'})
          RETURNING *
        `;
        return res.status(201).json({ entry: rows[0] });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    return res.status(400).json({ error: 'action must be payment or adjustment' });
  }

  return res.status(405).end();
};
