// POST /api/printful-webhook
// Handles Printful webhook events
// Currently handles: package_shipped — sends tracking email to customer

const nodemailer = require('nodemailer');

async function sendShippingEmail({ to, name, carrier, trackingNumber, trackingUrl, gmailUser, gmailPass }) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailPass }
  });

  const trackingLine = trackingUrl
    ? `<a href="${trackingUrl}" style="color:#F7813E;">${trackingNumber}</a>`
    : `<span style="color:#fffce3;">${trackingNumber}</span>`;

  const html = `
    <div style="background:#3c5a74;padding:40px;font-family:sans-serif;max-width:560px;">
      <p style="color:#F7813E;font-size:22px;margin:0 0 24px;">Your order shipped.</p>
      <p style="color:#fffce3;margin:0 0 24px;">Hey ${name}, it's on its way.</p>
      <p style="color:#fffce3;margin:0 0 8px;">Carrier: ${carrier || 'See tracking link'}</p>
      <p style="color:#fffce3;margin:0 0 24px;">Tracking: ${trackingLine}</p>
      <p style="color:#fffce3;margin:0 0 24px;">Delivery typically takes 2–5 business days from ship date.</p>
      <p style="color:#F7813E;margin:0;">— Yeti Poop Ski Wax</p>
    </div>`;

  await transporter.sendMail({
    from: `"Yeti Poop Ski Wax" <${gmailUser}>`,
    to,
    subject: 'Your Yeti Poop order shipped',
    html
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).end(); }
  }

  const eventType = body?.type;
  console.log('[PRINTFUL-WEBHOOK] Event:', eventType);

  if (eventType !== 'package_shipped') {
    return res.status(200).json({ received: true });
  }

  const shipment = body?.data?.shipment;
  const order = body?.data?.order;
  const recipient = order?.recipient;

  if (!shipment || !recipient?.email) {
    console.error('[PRINTFUL-WEBHOOK] Missing shipment or recipient email', { shipment: !!shipment, email: recipient?.email });
    return res.status(200).json({ received: true });
  }

  const { GMAIL_USER: gmailUser, GMAIL_APP_PASSWORD: gmailPass } = process.env;

  if (!gmailUser || !gmailPass) {
    console.error('[PRINTFUL-WEBHOOK] Missing Gmail env vars');
    return res.status(200).json({ received: true });
  }

  try {
    await sendShippingEmail({
      to: recipient.email,
      name: recipient.name || 'there',
      carrier: shipment.carrier,
      trackingNumber: shipment.tracking_number,
      trackingUrl: shipment.tracking_url,
      gmailUser,
      gmailPass
    });
    console.log(`[PRINTFUL-WEBHOOK] Shipping email sent to ${recipient.email}, tracking: ${shipment.tracking_number}`);
  } catch (err) {
    console.error('[PRINTFUL-WEBHOOK] Email failed:', err.message);
  }

  return res.status(200).json({ received: true });
};
