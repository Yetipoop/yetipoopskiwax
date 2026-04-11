// POST /api/webhook
// Handles Stripe checkout.session.completed events
// Creates the corresponding order in Printify automatically

const Stripe = require('stripe');
const https = require('https');

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk.toString();
    });
    req.on('end', () => {
      resolve(data);
    });
    req.on('error', reject);
  });
}

function printifyPost(path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: 'api.printify.com',
      path,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'YetiPoopSkiWax/1.0'
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  console.log('[WEBHOOK] Received request:', { method: req.method, url: req.url });

  if (req.method !== 'POST') {
    console.log('[WEBHOOK] Not a POST request, returning 405');
    return res.status(405).end();
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const printifyToken = process.env.PRINTIFY_API_TOKEN;
  const shopId = process.env.PRINTIFY_SHOP_ID;

  // Get raw body for signature verification
  // In Vercel with bodyParser: false, req.body might be a Buffer or string
  // If it's an object, we need to read from the request stream
  let rawBody;
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
    rawBody = req.body;
    console.log('[WEBHOOK] Using req.body as raw body, type:', typeof req.body, 'length:', rawBody.length);
  } else {
    // Body was already parsed — try to read from stream
    console.log('[WEBHOOK] Body is parsed object, attempting to read raw stream...');
    try {
      rawBody = await getRawBody(req);
      console.log('[WEBHOOK] Read raw body from stream, length:', rawBody.length);
    } catch (e) {
      console.error('[WEBHOOK] Failed to read raw body:', e.message);
      return res.status(400).json({ error: 'Cannot read request body' });
    }
  }

  console.log('[WEBHOOK] Config check:', {
    hasSecret: !!webhookSecret,
    hasPrintifyToken: !!printifyToken,
    shopId,
    rawBodyLength: rawBody?.length
  });

  // Verify Stripe signature
  let event;
  try {
    const sig = req.headers['stripe-signature'];
    console.log('[WEBHOOK] Attempting signature verification...');
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    console.log('[WEBHOOK] Signature verified successfully. Event type:', event.type);
  } catch (e) {
    console.error('[WEBHOOK] Signature error:', e.message);
    return res.status(400).json({ error: 'Invalid signature: ' + e.message });
  }

  if (event.type !== 'checkout.session.completed') {
    console.log('[WEBHOOK] Ignoring event type:', event.type);
    return res.status(200).json({ received: true });
  }

  console.log('[WEBHOOK] Processing checkout.session.completed');
  const session = event.data.object;

  try {
    // Parse cart from session metadata
    const cartItems = JSON.parse(session.metadata?.cart || '[]');
    // Shipping can be in two places depending on Stripe API response
    const shipping = session.shipping_details || session.collected_information?.shipping_details;
    const customer = session.customer_details;

    console.log('[WEBHOOK] Session data:', {
      sessionId: session.id,
      cartItemCount: cartItems.length,
      hasShipping: !!shipping?.address,
      customerEmail: customer?.email,
      shippingSource: shipping?.address ? (session.shipping_details ? 'shipping_details' : 'collected_information') : 'none'
    });

    if (!cartItems.length || !shipping?.address) {
      console.error('[WEBHOOK] Missing cart or shipping info. Cart:', cartItems, 'Shipping:', shipping?.address);
      return res.status(200).json({ received: true });
    }

    // Build Printify order
    const addr = shipping.address;
    const phone = customer?.phone || shipping.phone || '';
    const order = {
      external_id: session.id,
      label: `Order from ${customer?.email || 'customer'}`,
      line_items: cartItems.map(item => ({
        product_id: item.productId,
        variant_id: item.variantId,
        quantity: item.quantity
      })),
      shipping_method: 1,
      send_shipping_notification: true,
      address_to: {
        first_name: shipping.name?.split(' ')[0] || 'Customer',
        last_name: shipping.name?.split(' ').slice(1).join(' ') || '',
        email: customer?.email || shipping.email || '',
        phone: phone || '+1', // Printify requires phone; use placeholder if missing
        country: addr?.country || 'US',
        region: addr?.state || '',
        address1: addr?.line1 || '',
        address2: addr?.line2 || '',
        city: addr?.city || '',
        zip: addr?.postal_code || ''
      }
    };

    console.log('[WEBHOOK] Sending order to Printify:', JSON.stringify(order, null, 2));
    const createResult = await printifyPost(
      `/v1/shops/${shopId}/orders.json`,
      order,
      printifyToken
    );

    console.log('[WEBHOOK] Printify create response:', { status: createResult.status, orderId: createResult.body?.id });

    if (createResult.status >= 400) {
      console.error('[WEBHOOK] Printify create error:', createResult.status, createResult.body);
      return res.status(200).json({ received: true, printifyError: createResult.body });
    }

    const printifyOrderId = createResult.body?.id;
    console.log(`[WEBHOOK] DRAFT order created: ${printifyOrderId}, now confirming...`);

    // CRITICAL: Confirm the order to submit for production and trigger Printify charging
    const confirmResult = await printifyPost(
      `/v1/shops/${shopId}/orders/${printifyOrderId}/confirm`,
      {},
      printifyToken
    );

    console.log('[WEBHOOK] Printify confirm response:', { status: confirmResult.status, body: JSON.stringify(confirmResult.body) });

    if (confirmResult.status >= 400) {
      console.error('[WEBHOOK] Printify confirm error:', confirmResult.status, confirmResult.body);
      return res.status(200).json({ received: true, orderId: printifyOrderId, confirmError: confirmResult.body });
    }

    console.log(`[WEBHOOK] Order fully processed: ${printifyOrderId} for session ${session.id}`);
    return res.status(200).json({ received: true, orderId: printifyOrderId, status: 'confirmed' });

  } catch (e) {
    console.error('[WEBHOOK] Webhook processing error:', e.message, e.stack);
    // Still return 200 so Stripe doesn't retry
    return res.status(200).json({ received: true, error: e.message });
  }
};

// Required for Stripe webhook signature verification
export const config = {
  api: { bodyParser: false }
};
