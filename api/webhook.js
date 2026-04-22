// POST /api/webhook
// Handles Stripe checkout.session.completed events.
// Creates the corresponding order in Printful, emails the customer,
// and records discount code usage + affiliate commission.

const Stripe = require('stripe');
const nodemailer = require('nodemailer');
const products = require('./products-data');
const { getDb } = require('./_db');

function getProductInfo(productId, variantId) {
  const product = products.find(p => p.id === productId);
  if (!product) return { title: 'Item', variantTitle: '' };
  const variant = product.variants.find(v => v.id === Number(variantId));
  return {
    title: product.title,
    variantTitle: variant?.title || ''
  };
}

async function sendOrderConfirmationEmail({ to, name, cartItems, amountTotal, gmailUser, gmailPass }) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailPass }
  });

  const itemRows = cartItems.map(item => {
    const info = getProductInfo(item.productId, item.variantId);
    return `<tr>
      <td style="padding:8px 0;color:#fffce3;">${info.title}${info.variantTitle ? ' — ' + info.variantTitle : ''}</td>
      <td style="padding:8px 0;color:#fffce3;text-align:right;">x${item.quantity || 1}</td>
    </tr>`;
  }).join('');

  const total = (amountTotal / 100).toFixed(2);

  const html = `
    <div style="background:#3c5a74;padding:40px;font-family:sans-serif;max-width:560px;">
      <p style="color:#F7813E;font-size:22px;margin:0 0 24px;">Order confirmed.</p>
      <p style="color:#fffce3;margin:0 0 24px;">Hey ${name}, your order is in. Here's what's coming:</p>
      <table style="width:100%;border-top:1px solid #fffce355;margin-bottom:16px;">${itemRows}</table>
      <p style="color:#fffce3;border-top:1px solid #fffce355;padding-top:16px;margin:0 0 24px;">Total: $${total}</p>
      <p style="color:#fffce3;margin:0 0 24px;">Estimated delivery: 5–10 business days. You'll get a tracking number when it ships.</p>
      <p style="color:#F7813E;margin:0;">— Yeti Poop Ski Wax</p>
    </div>`;

  await transporter.sendMail({
    from: `"Yeti Poop Ski Wax" <${gmailUser}>`,
    to,
    subject: 'Your Yeti Poop order is confirmed',
    html
  });
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk.toString(); });
    req.on('end', () => { resolve(data); });
    req.on('error', reject);
  });
}

function getArtworkForVariant(variantId) {
  for (const product of products) {
    const variant = product.variants.find(v => v.id === variantId);
    if (variant) {
      const files = product.artworkFiles
        ? product.artworkFiles.map(f => ({ type: f.type, url: f.url }))
        : [{ type: product.artworkFileType, url: product.artworkUrl }];
      return {
        files,
        options: product.artworkOptions || []
      };
    }
  }
  return null;
}

// Record discount usage and affiliate commission (non-blocking — errors are logged, not thrown)
async function recordDiscountUsage(session) {
  const codeId = session.metadata?.discount_code_id;
  if (!codeId) return;

  const discountAmountCents = Number(session.metadata?.discount_amount_cents || 0);
  const cartSubtotalCents = Number(session.metadata?.cart_subtotal_cents || 0);
  const customerEmail = session.customer_details?.email || null;

  try {
    const sql = getDb();

    // Record usage
    const usageRows = await sql`
      INSERT INTO discount_code_usages
        (code_id, stripe_session_id, customer_email, order_subtotal_cents, discount_amount_cents)
      VALUES (${codeId}, ${session.id}, ${customerEmail}, ${cartSubtotalCents}, ${discountAmountCents})
      RETURNING id
    `;
    const usageId = usageRows[0]?.id;

    // Increment uses_count on the code
    await sql`
      UPDATE discount_codes SET uses_count = uses_count + 1 WHERE id = ${codeId}
    `;

    // Look up code to check if affiliate-linked
    const codeRows = await sql`
      SELECT dc.affiliate_id, dc.code, a.commission_rate
      FROM discount_codes dc
      LEFT JOIN affiliates a ON a.id = dc.affiliate_id
      WHERE dc.id = ${codeId}
    `;
    const code = codeRows[0];

    if (code?.affiliate_id && code?.commission_rate) {
      // Commission is on the net order total (subtotal minus discount, i.e. what we actually charged)
      const netRevenueCents = (session.amount_total || 0);
      const commissionCents = Math.round(netRevenueCents * Number(code.commission_rate));

      await sql`
        INSERT INTO commission_ledger
          (affiliate_id, usage_id, stripe_session_id, amount_cents, note)
        VALUES (
          ${code.affiliate_id},
          ${usageId},
          ${session.id},
          ${commissionCents},
          ${`Order via code ${code.code} — ${(commissionCents / 100).toFixed(2)} commission at ${(Number(code.commission_rate) * 100).toFixed(1)}%`}
        )
      `;

      console.log(`[WEBHOOK] Commission recorded: $${(commissionCents / 100).toFixed(2)} for affiliate ${code.affiliate_id}`);
    }

    console.log(`[WEBHOOK] Discount usage recorded: code ${codeId}, session ${session.id}`);
  } catch (e) {
    // Log but don't block the order — commission can be manually adjusted
    console.error('[WEBHOOK] Discount/commission recording error:', e.message);
  }
}

module.exports = async function handler(req, res) {
  console.log('[WEBHOOK] Received request:', { method: req.method, url: req.url });

  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const printfulToken = process.env.PRINTFUL_API_TOKEN;
  const printfulStoreId = process.env.PRINTFUL_STORE_ID;

  let rawBody;
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
    rawBody = req.body;
  } else {
    try {
      rawBody = await getRawBody(req);
    } catch (e) {
      console.error('[WEBHOOK] Failed to read raw body:', e.message);
      return res.status(400).json({ error: 'Cannot read request body' });
    }
  }

  console.log('[WEBHOOK] Config check:', {
    hasStripeSecret: !!webhookSecret,
    hasPrintfulToken: !!printfulToken,
    printfulStoreId,
    rawBodyLength: rawBody?.length
  });

  let event;
  try {
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    console.log('[WEBHOOK] Signature verified. Event type:', event.type);
  } catch (e) {
    console.error('[WEBHOOK] Signature error:', e.message);
    return res.status(400).json({ error: 'Invalid signature: ' + e.message });
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;

  try {
    const cartItems = JSON.parse(session.metadata?.cart || '[]');
    const shipping = session.shipping_details || session.collected_information?.shipping_details;
    const customer = session.customer_details;

    console.log('[WEBHOOK] Session data:', {
      sessionId: session.id,
      cartItemCount: cartItems.length,
      hasShipping: !!shipping?.address,
      customerEmail: customer?.email,
      discountCode: session.metadata?.discount_code || 'none'
    });

    if (!cartItems.length || !shipping?.address) {
      console.error('[WEBHOOK] Missing cart or shipping. Cart:', cartItems, 'Shipping:', shipping?.address);
      return res.status(200).json({ received: true });
    }

    const addr = shipping.address;

    const printfulOrder = {
      external_id: session.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32),
      recipient: {
        name: shipping.name || customer?.name || 'Customer',
        email: customer?.email || '',
        phone: customer?.phone || shipping?.phone || '',
        address1: addr.line1 || '',
        address2: addr.line2 || '',
        city: addr.city || '',
        state_code: addr.state || '',
        country_code: addr.country || 'US',
        zip: addr.postal_code || ''
      },
      items: cartItems.map((item, i) => {
        const variantId = Number(item.variantId);
        const artwork = getArtworkForVariant(variantId);

        if (!artwork) {
          console.warn(`[WEBHOOK] No artwork found for variantId ${variantId} — order item ${i} will be missing file`);
        }

        return {
          variant_id: variantId,
          quantity: item.quantity || 1,
          files: artwork ? artwork.files : [],
          ...(artwork?.options?.length ? { options: artwork.options } : {})
        };
      })
    };

    console.log('[WEBHOOK] Sending order to Printful:', JSON.stringify(printfulOrder, null, 2));

    const response = await fetch('https://api.printful.com/orders?confirm=true', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${printfulToken}`,
        'X-PF-Store-Id': printfulStoreId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(printfulOrder)
    });

    const result = await response.json();
    console.log('[WEBHOOK] Printful response:', { status: response.status, body: JSON.stringify(result) });

    if (!response.ok) {
      console.error('[WEBHOOK] Printful error:', response.status, result);
      return res.status(200).json({ received: true, printfulError: result });
    }

    console.log(`[WEBHOOK] Order created in Printful: ${result.result?.id} for session ${session.id}`);

    // Record discount usage + affiliate commission (non-blocking)
    recordDiscountUsage(session);

    // Send order confirmation email (non-blocking)
    const customerEmail = customer?.email;
    if (customerEmail && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      sendOrderConfirmationEmail({
        to: customerEmail,
        name: shipping.name || customer?.name || 'there',
        cartItems,
        amountTotal: session.amount_total || 0,
        gmailUser: process.env.GMAIL_USER,
        gmailPass: process.env.GMAIL_APP_PASSWORD
      }).then(() => {
        console.log(`[WEBHOOK] Confirmation email sent to ${customerEmail}`);
      }).catch(err => {
        console.error('[WEBHOOK] Confirmation email failed:', err.message);
      });
    }

    return res.status(200).json({ received: true, orderId: result.result?.id, status: result.result?.status });

  } catch (e) {
    console.error('[WEBHOOK] Processing error:', e.message, e.stack);
    return res.status(200).json({ received: true, error: e.message });
  }
};

module.exports.config = {
  api: { bodyParser: false }
};
