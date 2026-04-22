// POST /api/discount/validate
// Public endpoint. Validates a discount code and returns the discount amount.
// Called by the checkout UI before creating the Stripe session.
//
// Request body:
//   { code: string, cartTotalCents: number, customerEmail?: string }
//
// Response (valid):
//   { valid: true, type, value, discountAmountCents, message }
//
// Response (invalid):
//   { valid: false, message }

const { getDb } = require('../_db');

function calcDiscountAmount(code, cartTotalCents) {
  if (code.type === 'percentage') {
    return Math.round(cartTotalCents * (Number(code.value) / 100));
  }
  if (code.type === 'fixed') {
    // value stored as dollars, convert to cents
    return Math.min(Math.round(Number(code.value) * 100), cartTotalCents);
  }
  if (code.type === 'free_shipping') {
    return 0; // shipping discount handled separately at checkout
  }
  return 0;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { code, cartTotalCents, customerEmail } = req.body || {};

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ valid: false, message: 'No code provided.' });
  }
  if (!cartTotalCents || cartTotalCents < 0) {
    return res.status(400).json({ valid: false, message: 'Invalid cart total.' });
  }

  const sql = getDb();
  const upperCode = code.trim().toUpperCase();

  try {
    const rows = await sql`
      SELECT * FROM discount_codes
      WHERE UPPER(code) = ${upperCode}
      LIMIT 1
    `;

    if (!rows.length) {
      return res.status(200).json({ valid: false, message: 'Code not found.' });
    }

    const dc = rows[0];

    if (!dc.is_active) {
      return res.status(200).json({ valid: false, message: 'This code is no longer active.' });
    }

    if (dc.expires_at && new Date(dc.expires_at) < new Date()) {
      return res.status(200).json({ valid: false, message: 'This code has expired.' });
    }

    if (dc.max_uses !== null && dc.uses_count >= dc.max_uses) {
      return res.status(200).json({ valid: false, message: 'This code has reached its usage limit.' });
    }

    if (dc.min_order_cents !== null && cartTotalCents < dc.min_order_cents) {
      const minDollars = (dc.min_order_cents / 100).toFixed(2);
      return res.status(200).json({ valid: false, message: `Minimum order of $${minDollars} required.` });
    }

    // Per-customer limit check (only if email provided)
    if (dc.max_uses_per_customer !== null && customerEmail) {
      const usageRows = await sql`
        SELECT COUNT(*) as cnt FROM discount_code_usages
        WHERE code_id = ${dc.id} AND LOWER(customer_email) = ${customerEmail.toLowerCase()}
      `;
      const usageCount = Number(usageRows[0]?.cnt || 0);
      if (usageCount >= dc.max_uses_per_customer) {
        return res.status(200).json({ valid: false, message: 'You have already used this code.' });
      }
    }

    const discountAmountCents = calcDiscountAmount(dc, cartTotalCents);

    return res.status(200).json({
      valid: true,
      codeId: dc.id,
      type: dc.type,
      value: dc.value,
      discountAmountCents,
      isFreeShipping: dc.type === 'free_shipping',
      message: dc.type === 'free_shipping'
        ? 'Free shipping applied!'
        : `Code applied — $${(discountAmountCents / 100).toFixed(2)} off`
    });

  } catch (e) {
    console.error('[discount/validate] Error:', e.message);
    return res.status(500).json({ valid: false, message: 'Error validating code. Please try again.' });
  }
};
