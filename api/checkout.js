// POST /api/checkout
// Creates a Stripe Checkout session and returns the redirect URL.
// Optionally applies a discount code (validated server-side).

const Stripe = require('stripe');
const { getDb } = require('./_db');

// Validate discount code server-side (mirrors /api/discount/validate logic)
async function validateCode(sql, code, cartTotalCents) {
  if (!code) return null;
  const upperCode = code.trim().toUpperCase();

  const rows = await sql`
    SELECT * FROM discount_codes
    WHERE UPPER(code) = ${upperCode}
    LIMIT 1
  `;
  if (!rows.length) return null;

  const dc = rows[0];
  if (!dc.is_active) return null;
  if (dc.expires_at && new Date(dc.expires_at) < new Date()) return null;
  if (dc.max_uses !== null && dc.uses_count >= dc.max_uses) return null;
  if (dc.min_order_cents !== null && cartTotalCents < dc.min_order_cents) return null;

  return dc;
}

function calcDiscountCents(dc, cartTotalCents) {
  if (dc.type === 'percentage') return Math.round(cartTotalCents * (Number(dc.value) / 100));
  if (dc.type === 'fixed') return Math.min(Math.round(Number(dc.value) * 100), cartTotalCents);
  return 0; // free_shipping: no line-item discount
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const siteUrl = process.env.SITE_URL || 'https://yetipoopskiwax.com';
  const { items, discountCode } = req.body;

  if (!items || !items.length) {
    return res.status(400).json({ error: 'No items in cart' });
  }

  try {
    const lineItems = items.map(item => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.title,
          description: item.variant || undefined,
          images: item.image ? [item.image] : undefined,
          metadata: {
            printful_product_id: item.productId,
            printful_variant_id: String(item.variantId)
          }
        },
        unit_amount: item.price
      },
      quantity: item.quantity
    }));

    // Cart subtotal in cents (before shipping)
    const cartTotalCents = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);

    // Validate discount code if provided
    let appliedCode = null;
    let discountAmountCents = 0;
    let isFreeShipping = false;

    // Stripe coupon ID to attach (created dynamically below if code is valid)
    let stripeCouponId = null;

    if (discountCode) {
      try {
        const sql = getDb();
        appliedCode = await validateCode(sql, discountCode, cartTotalCents);
        if (appliedCode) {
          discountAmountCents = calcDiscountCents(appliedCode, cartTotalCents);
          isFreeShipping = appliedCode.type === 'free_shipping';

          // Create a one-time Stripe Coupon for this session
          // (Stripe Checkout doesn't support negative line items)
          if (discountAmountCents > 0) {
            const couponParams = {
              duration: 'once',
              max_redemptions: 1,
              name: `${appliedCode.code}`
            };
            if (appliedCode.type === 'percentage') {
              couponParams.percent_off = Number(appliedCode.value);
            } else {
              couponParams.amount_off = discountAmountCents;
              couponParams.currency = 'usd';
            }
            const coupon = await stripe.coupons.create(couponParams);
            stripeCouponId = coupon.id;
          }
        }
      } catch (e) {
        // DB or Stripe error — proceed without discount rather than blocking checkout
        console.error('[checkout] Discount error:', e.message);
      }
    }

    // Shipping options — free if code is free_shipping type
    const shippingOptions = isFreeShipping
      ? [
          {
            shipping_rate_data: {
              type: 'fixed_amount',
              fixed_amount: { amount: 0, currency: 'usd' },
              display_name: 'Free Shipping',
              delivery_estimate: {
                minimum: { unit: 'business_day', value: 5 },
                maximum: { unit: 'business_day', value: 10 }
              }
            }
          }
        ]
      : [
          {
            shipping_rate_data: {
              type: 'fixed_amount',
              fixed_amount: { amount: 599, currency: 'usd' },
              display_name: 'Standard Shipping',
              delivery_estimate: {
                minimum: { unit: 'business_day', value: 5 },
                maximum: { unit: 'business_day', value: 10 }
              }
            }
          }
        ];

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      ...(stripeCouponId ? { discounts: [{ coupon: stripeCouponId }] } : {}),
      shipping_address_collection: {
        allowed_countries: ['US', 'CA', 'GB', 'AU', 'NZ', 'DE', 'FR', 'NL', 'SE', 'NO', 'CH']
      },
      shipping_options: shippingOptions,
      success_url: `${siteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/shop.html`,
      metadata: {
        cart: JSON.stringify(items.map(i => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity
        }))),
        discount_code: appliedCode ? appliedCode.code : '',
        discount_code_id: appliedCode ? String(appliedCode.id) : '',
        discount_amount_cents: String(discountAmountCents),
        cart_subtotal_cents: String(cartTotalCents)
      }
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('Stripe checkout error:', e.message);
    return res.status(500).json({ error: 'Checkout failed. Please try again.' });
  }
};
