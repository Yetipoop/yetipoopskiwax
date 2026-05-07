// POST /api/order-lookup
// Verifies a Stripe checkout session by ID + email.
// Returns order details if the email matches.

const Stripe = require('stripe');
const products = require('./products-data');

function getProductInfo(productId, variantId) {
  const product = products.find(p => p.id === productId);
  if (!product) return { title: 'Item', variantTitle: '' };
  const variant = product.variants.find(v => v.id === Number(variantId));
  return {
    title: product.title,
    variantTitle: variant?.title || ''
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionId, email } = req.body || {};

  if (!sessionId || !email) {
    return res.status(400).json({ error: 'Order reference and email are required.' });
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  let session;
  try {
    // Normalize: strip whitespace, handle if they pasted full URL param
    const cleanId = String(sessionId).trim().replace(/^.*session_id=/, '').split('&')[0];
    session = await stripe.checkout.sessions.retrieve(cleanId);
  } catch (e) {
    return res.status(404).json({ error: 'Order not found. Please check your order reference and try again.' });
  }

  // Verify email matches
  const sessionEmail = session.customer_details?.email || session.customer_email || '';
  if (sessionEmail.toLowerCase() !== email.trim().toLowerCase()) {
    return res.status(403).json({ error: 'Email does not match this order.' });
  }

  // Must be a completed session
  if (session.status !== 'complete' && session.payment_status !== 'paid') {
    return res.status(400).json({ error: 'This order is not eligible for a claim (not completed).' });
  }

  // Parse cart items
  let cartItems = [];
  try {
    cartItems = JSON.parse(session.metadata?.cart || '[]');
  } catch (_) {}

  const itemDescriptions = cartItems.map(item => {
    const info = getProductInfo(item.productId, item.variantId);
    return `${info.title}${info.variantTitle ? ' — ' + info.variantTitle : ''}${item.quantity > 1 ? ' x' + item.quantity : ''}`;
  });

  const shipping = session.shipping_details || session.collected_information?.shipping_details;

  return res.status(200).json({
    sessionId: session.id,
    orderRef: session.id.slice(-12).toUpperCase(),
    customerName: shipping?.name || session.customer_details?.name || '',
    email: sessionEmail,
    amountTotal: session.amount_total,
    items: itemDescriptions,
    hasShipping: !!(shipping?.address),
    createdAt: new Date(session.created * 1000).toISOString()
  });
};
