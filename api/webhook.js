// POST /api/webhook
// Handles Stripe checkout.session.completed events
// Creates the corresponding order in Printful
//
// TESTING MODE: Orders are created as DRAFTS (no ?confirm=true).
// To go live: change the fetch URL below from '/orders' to '/orders?confirm=true'

const Stripe = require('stripe');
const products = require('./products-data');

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk.toString(); });
    req.on('end', () => { resolve(data); });
    req.on('error', reject);
  });
}

// Look up artwork info by Printful variant_id
function getArtworkForVariant(variantId) {
  for (const product of products) {
    const variant = product.variants.find(v => v.id === variantId);
    if (variant) {
      return {
        url: product.artworkUrl,
        type: product.artworkFileType
      };
    }
  }
  return null;
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

  // Read raw body for Stripe signature verification
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

  // Verify Stripe signature
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
      customerEmail: customer?.email
    });

    if (!cartItems.length || !shipping?.address) {
      console.error('[WEBHOOK] Missing cart or shipping. Cart:', cartItems, 'Shipping:', shipping?.address);
      return res.status(200).json({ received: true });
    }

    const addr = shipping.address;

    // Build Printful order
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
          files: artwork ? [{ type: artwork.type, url: artwork.url }] : []
        };
      })
    };

    console.log('[WEBHOOK] Sending order to Printful:', JSON.stringify(printfulOrder, null, 2));

    // TESTING: omit ?confirm=true to create as draft (no production, no charge to Printful account)
    // GO LIVE:  change '/orders' to '/orders?confirm=true' below
    const response = await fetch('https://api.printful.com/orders', {
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
      // Return 200 so Stripe does not retry — log error for manual review
      return res.status(200).json({ received: true, printfulError: result });
    }

    console.log(`[WEBHOOK] Order created in Printful: ${result.result?.id} for session ${session.id}`);
    return res.status(200).json({ received: true, orderId: result.result?.id, status: result.result?.status });

  } catch (e) {
    console.error('[WEBHOOK] Processing error:', e.message, e.stack);
    return res.status(200).json({ received: true, error: e.message });
  }
};

// Required for Stripe webhook signature verification
export const config = {
  api: { bodyParser: false }
};
