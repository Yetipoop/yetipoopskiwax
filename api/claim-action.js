// GET /api/claim-action?token=xxx&action=approve|reject
// Called when Mike clicks Approve or Reject in the claim review email.
// Returns a styled HTML page — no login required, token acts as auth.

const Stripe = require('stripe');
const nodemailer = require('nodemailer');
const products = require('./products-data');
const { getDb } = require('./_db');

function getArtworkForVariant(variantId) {
  for (const product of products) {
    const variant = product.variants.find(v => v.id === variantId);
    if (variant) {
      const files = product.artworkFiles
        ? product.artworkFiles.map(f => ({ type: f.type, url: f.url }))
        : [{ type: product.artworkFileType, url: product.artworkUrl }];
      return { files, options: product.artworkOptions || [] };
    }
  }
  return null;
}

function htmlPage(title, color, heading, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Yeti Poop Ski Wax</title>
  <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400&display=swap" rel="stylesheet">
  <style>
    body { margin:0; background:#3c5a74; font-family:'Quicksand',sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; }
    .card { background:#4a6a87; border-radius:12px; padding:40px; max-width:480px; width:90%; text-align:center; }
    h1 { color:${color}; font-size:26px; margin:0 0 16px; }
    p { color:#fffce3; margin:0 0 12px; line-height:1.6; font-size:15px; }
    .detail { color:#fffce3; opacity:0.6; font-size:13px; }
    a { color:#F7813E; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${heading}</h1>
    ${body}
    <p style="margin-top:24px;"><a href="https://yetipoopskiwax.com">yetipoopskiwax.com</a></p>
  </div>
</body>
</html>`;
}

async function emailCustomerResolved({ to, name, issueLabel, resolution, approved }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return;
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
  });

  let bodyHtml;
  if (approved) {
    const resText = resolution === 'reorder'
      ? 'A replacement order has been created and will ship to your original address within the standard 5–10 business day window. You\'ll receive a shipping confirmation email.'
      : 'A full refund has been issued to your original payment method. It typically appears within 5–10 business days.';
    bodyHtml = `
      <p style="color:#fffce3;margin:0 0 16px;">Hey ${name},</p>
      <p style="color:#fffce3;margin:0 0 16px;">Your claim for <strong>${issueLabel}</strong> has been approved.</p>
      <p style="color:#fffce3;margin:0 0 24px;">${resText}</p>`;
  } else {
    bodyHtml = `
      <p style="color:#fffce3;margin:0 0 16px;">Hey ${name},</p>
      <p style="color:#fffce3;margin:0 0 16px;">After reviewing your claim for <strong>${issueLabel}</strong>, we weren't able to approve it.</p>
      <p style="color:#fffce3;margin:0 0 24px;">If you think this is a mistake or have additional info, please reply to this email or reach us at yetipoopskiwax@gmail.com.</p>`;
  }

  const html = `
    <div style="background:#3c5a74;padding:40px;font-family:sans-serif;max-width:560px;">
      <p style="color:#F7813E;font-size:22px;margin:0 0 24px;">Claim ${approved ? 'approved' : 'update'}.</p>
      ${bodyHtml}
      <p style="color:#F7813E;margin:0;">— Yeti Poop Ski Wax</p>
    </div>`;

  await transporter.sendMail({
    from: `"Yeti Poop Ski Wax" <${process.env.GMAIL_USER}>`,
    to,
    subject: approved ? 'Your Yeti Poop claim has been approved' : 'Update on your Yeti Poop claim',
    html
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { token, action } = req.query;

  if (!token || !['approve', 'reject'].includes(action)) {
    return res.status(400).send(htmlPage('Invalid link', '#c0392b', 'Invalid link', '<p>This link is invalid or malformed.</p>'));
  }

  const sql = getDb();

  // Look up claim
  const rows = await sql`SELECT * FROM order_claims WHERE token = ${token} LIMIT 1`;
  if (!rows.length) {
    return res.status(404).send(htmlPage('Not found', '#c0392b', 'Claim not found', '<p>This link has expired or is invalid.</p>'));
  }

  const claim = rows[0];

  if (claim.status !== 'pending') {
    const already = claim.status === 'approved' ? 'approved' : 'rejected';
    return res.status(200).send(htmlPage(
      'Already processed', '#F7813E', 'Already processed',
      `<p>This claim was already <strong>${already}</strong>.</p><p class="detail">Customer: ${claim.customer_email}</p>`
    ));
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  if (action === 'reject') {
    await sql`UPDATE order_claims SET status = 'rejected', actioned_at = NOW() WHERE token = ${token}`;
    emailCustomerResolved({ to: claim.customer_email, name: claim.customer_name, issueLabel: claim.issue_type.replace(/_/g, ' '), resolution: claim.resolution, approved: false })
      .catch(e => console.error('[CLAIM-ACTION] Email error:', e.message));

    return res.status(200).send(htmlPage(
      'Rejected', '#c0392b', 'Claim rejected',
      `<p>The customer has been notified.</p><p class="detail">${claim.customer_email}</p>`
    ));
  }

  // action === 'approve'
  let printfulOrderId = null;
  let stripeRefundId = null;
  let errorMsg = null;

  try {
    if (claim.resolution === 'reorder') {
      const printfulToken = process.env.PRINTFUL_API_TOKEN;
      const printfulStoreId = process.env.PRINTFUL_STORE_ID;

      // Fetch original session to get cart + shipping
      const session = await stripe.checkout.sessions.retrieve(claim.stripe_session_id);
      let cartItems = [];
      try { cartItems = JSON.parse(session.metadata?.cart || '[]'); } catch (_) {}
      const shipping = session.shipping_details || session.collected_information?.shipping_details;
      const addr = shipping?.address || {};

      const printfulOrder = {
        external_id: `REORDER_${claim.stripe_session_id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`,
        recipient: {
          name: claim.customer_name,
          email: claim.customer_email,
          address1: addr.line1 || '',
          address2: addr.line2 || '',
          city: addr.city || '',
          state_code: addr.state || '',
          country_code: addr.country || 'US',
          zip: addr.postal_code || ''
        },
        items: cartItems.map(item => {
          const variantId = Number(item.variantId);
          const artwork = getArtworkForVariant(variantId);
          return {
            variant_id: variantId,
            quantity: item.quantity || 1,
            files: artwork ? artwork.files : [],
            ...(artwork?.options?.length ? { options: artwork.options } : {})
          };
        })
      };

      const pfRes = await fetch('https://api.printful.com/orders?confirm=true', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${printfulToken}`,
          'X-PF-Store-Id': printfulStoreId,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(printfulOrder)
      });

      const pfData = await pfRes.json();
      if (!pfRes.ok) {
        throw new Error(pfData?.error?.message || `Printful error ${pfRes.status}`);
      }
      printfulOrderId = pfData.result?.id;

    } else if (claim.resolution === 'refund') {
      const session = await stripe.checkout.sessions.retrieve(claim.stripe_session_id);
      if (!session.payment_intent) throw new Error('No payment intent on session');
      const refund = await stripe.refunds.create({ payment_intent: session.payment_intent });
      stripeRefundId = refund.id;
    }
  } catch (e) {
    console.error('[CLAIM-ACTION] Processing error:', e.message);
    errorMsg = e.message;
  }

  if (errorMsg) {
    return res.status(500).send(htmlPage(
      'Error', '#c0392b', 'Processing failed',
      `<p>The claim could not be processed automatically:</p><p class="detail">${errorMsg}</p><p>Please handle this manually and contact <a href="mailto:${claim.customer_email}">${claim.customer_email}</a>.</p>`
    ));
  }

  // Mark approved
  await sql`
    UPDATE order_claims
    SET status = 'approved', actioned_at = NOW(), printful_order_id = ${printfulOrderId}, stripe_refund_id = ${stripeRefundId}
    WHERE token = ${token}
  `;

  // Email customer
  emailCustomerResolved({
    to: claim.customer_email,
    name: claim.customer_name,
    issueLabel: claim.issue_type.replace(/_/g, ' '),
    resolution: claim.resolution,
    approved: true
  }).catch(e => console.error('[CLAIM-ACTION] Customer email error:', e.message));

  const detailLine = claim.resolution === 'reorder'
    ? `Printful order ID: ${printfulOrderId}`
    : `Stripe refund ID: ${stripeRefundId}`;

  return res.status(200).send(htmlPage(
    'Approved', '#27ae60', 'Claim approved ✓',
    `<p>${claim.resolution === 'reorder' ? 'Replacement order created in Printful.' : 'Stripe refund issued.'}</p>
     <p class="detail">${detailLine}</p>
     <p class="detail">Customer notified: ${claim.customer_email}</p>
     ${claim.resolution === 'reorder' ? '<p style="margin-top:16px;font-size:13px;color:#fffce3;opacity:0.7;">Remember: if this was a Printful error, file a reimbursement request at printful.com/dashboard → Orders → Report a problem.</p>' : ''}`
  ));
};
