// POST /api/webhook
// Handles Stripe payment_intent.succeeded events
// Creates the corresponding order in Printify automatically

const Stripe = require('stripe');
const https = require('https');

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
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const printifyToken = process.env.PRINTIFY_API_TOKEN;
  const shopId = process.env.PRINTIFY_SHOP_ID;

  // Verify Stripe signature
  let event;
  try {
    const sig = req.headers['stripe-signature'];
    const rawBody = req.body; // Vercel provides raw body for webhooks
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (e) {
    console.error('Webhook signature error:', e.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;

  try {
    // Parse cart from session metadata
    const cartItems = JSON.parse(session.metadata?.cart || '[]');
    const shipping = session.shipping_details;
    const customer = session.customer_details;

    if (!cartItems.length || !shipping?.address) {
      console.error('Missing cart or shipping info');
      return res.status(200).json({ received: true });
    }

    // Build Printify order
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
        email: customer?.email || '',
        phone: customer?.phone || '',
        country: shipping.address.country,
        region: shipping.address.state || '',
        address1: shipping.address.line1,
        address2: shipping.address.line2 || '',
        city: shipping.address.city,
        zip: shipping.address.postal_code
      }
    };

    const result = await printifyPost(
      `/v1/shops/${shopId}/orders.json`,
      order,
      printifyToken
    );

    console.log(`Printify order created: ${result.body?.id} for session ${session.id}`);
    return res.status(200).json({ received: true, orderId: result.body?.id });

  } catch (e) {
    console.error('Webhook processing error:', e.message);
    // Still return 200 so Stripe doesn't retry
    return res.status(200).json({ received: true, error: e.message });
  }
};

// Required for Stripe webhook signature verification
export const config = {
  api: { bodyParser: false }
};
