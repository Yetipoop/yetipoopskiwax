// /api/claims
//
// Handles all customer claim operations in one function (Vercel function limit).
//
// POST  { type: 'lookup', sessionId, email }
//   → Verifies order exists and email matches. Returns order details.
//
// POST  { type: 'submit', sessionId, email, issueType, photoBase64? }
//   → Stores pending claim, emails Mike approve/reject links + photo.
//
// GET   ?token=xxx&action=approve|reject
//   → One-click action from Mike's email. Returns HTML page.

const Stripe = require('stripe');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const products = require('./products-data');
const { getDb } = require('./_db');

// ─── Constants ────────────────────────────────────────────────────────────────

const ISSUE_TYPES = {
  wrong_item:    { label: 'Wrong item received',  resolution: 'reorder', requiresPhoto: false },
  damaged:       { label: 'Item arrived damaged', resolution: 'reorder', requiresPhoto: true  },
  print_quality: { label: 'Print quality defect', resolution: 'reorder', requiresPhoto: true  },
  lost:          { label: 'Never arrived',         resolution: 'refund',  requiresPhoto: false }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getProductLabel(productId, variantId) {
  const product = products.find(p => p.id === productId);
  if (!product) return 'Unknown item';
  const variant = product.variants.find(v => v.id === Number(variantId));
  return `${product.title}${variant?.title ? ' — ' + variant.title : ''}`;
}

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

async function ensureClaimsTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS order_claims (
      id                SERIAL PRIMARY KEY,
      token             TEXT NOT NULL UNIQUE,
      stripe_session_id TEXT NOT NULL UNIQUE,
      customer_email    TEXT NOT NULL,
      customer_name     TEXT NOT NULL DEFAULT '',
      issue_type        TEXT NOT NULL,
      resolution        TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'pending',
      printful_order_id INT,
      stripe_refund_id  TEXT,
      has_photo         BOOLEAN DEFAULT FALSE,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      actioned_at       TIMESTAMPTZ
    )
  `;
  // Migrate if table existed before this version
  for (const stmt of [
    `ALTER TABLE order_claims ADD COLUMN IF NOT EXISTS token TEXT`,
    `ALTER TABLE order_claims ADD COLUMN IF NOT EXISTS customer_name TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE order_claims ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'`,
    `ALTER TABLE order_claims ADD COLUMN IF NOT EXISTS has_photo BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE order_claims ADD COLUMN IF NOT EXISTS actioned_at TIMESTAMPTZ`
  ]) {
    await sql.unsafe(stmt).catch(() => {});
  }
}

function mailer() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
  });
}

function htmlPage(title, color, heading, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Yeti Poop Ski Wax</title>
<link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400&display=swap" rel="stylesheet">
<style>body{margin:0;background:#3c5a74;font-family:'Quicksand',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;}
.card{background:#4a6a87;border-radius:12px;padding:40px;max-width:480px;width:90%;text-align:center;}
h1{color:${color};font-size:26px;margin:0 0 16px;}p{color:#fffce3;margin:0 0 12px;line-height:1.6;font-size:15px;}
.dim{color:#fffce3;opacity:0.6;font-size:13px;}a{color:#F7813E;}</style></head>
<body><div class="card"><h1>${heading}</h1>${body}
<p style="margin-top:24px;"><a href="https://yetipoopskiwax.com">yetipoopskiwax.com</a></p></div></body></html>`;
}

// ─── Lookup ───────────────────────────────────────────────────────────────────

async function handleLookup(req, res) {
  const { sessionId, email } = req.body || {};
  if (!sessionId || !email) return res.status(400).json({ error: 'Order reference and email are required.' });

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  let session;
  try {
    const cleanId = String(sessionId).trim().replace(/^.*session_id=/, '').split('&')[0];
    session = await stripe.checkout.sessions.retrieve(cleanId);
  } catch (e) {
    return res.status(404).json({ error: 'Order not found. Please check your order reference and try again.' });
  }

  const sessionEmail = session.customer_details?.email || session.customer_email || '';
  if (sessionEmail.toLowerCase() !== email.trim().toLowerCase()) {
    return res.status(403).json({ error: 'Email does not match this order.' });
  }
  if (session.status !== 'complete' && session.payment_status !== 'paid') {
    return res.status(400).json({ error: 'This order is not eligible for a claim.' });
  }

  let cartItems = [];
  try { cartItems = JSON.parse(session.metadata?.cart || '[]'); } catch (_) {}

  const itemDescriptions = cartItems.map(item => getProductLabel(item.productId, item.variantId));
  const shipping = session.shipping_details || session.collected_information?.shipping_details;

  return res.status(200).json({
    sessionId: session.id,
    customerName: shipping?.name || session.customer_details?.name || '',
    email: sessionEmail,
    amountTotal: session.amount_total,
    items: itemDescriptions,
    createdAt: new Date(session.created * 1000).toISOString()
  });
}

// ─── Submit ───────────────────────────────────────────────────────────────────

async function handleSubmit(req, res) {
  const { sessionId, email, issueType, photoBase64 } = req.body || {};
  if (!sessionId || !email || !issueType) return res.status(400).json({ error: 'Missing required fields.' });

  const issueConfig = ISSUE_TYPES[issueType];
  if (!issueConfig) return res.status(400).json({ error: 'Invalid issue type.' });
  if (issueConfig.requiresPhoto && !photoBase64) return res.status(400).json({ error: 'A photo is required for this issue type.' });

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  let session;
  try { session = await stripe.checkout.sessions.retrieve(sessionId); }
  catch (e) { return res.status(404).json({ error: 'Order not found.' }); }

  const sessionEmail = session.customer_details?.email || session.customer_email || '';
  if (sessionEmail.toLowerCase() !== email.trim().toLowerCase()) return res.status(403).json({ error: 'Email does not match this order.' });
  if (session.status !== 'complete' && session.payment_status !== 'paid') return res.status(400).json({ error: 'Order not eligible for a claim.' });

  const sql = getDb();
  await ensureClaimsTable(sql);

  const existing = await sql`SELECT id FROM order_claims WHERE stripe_session_id = ${sessionId}`;
  if (existing.length) return res.status(409).json({ error: 'A claim already exists for this order. Contact yetipoopskiwax@gmail.com if you need further help.' });

  let cartItems = [];
  try { cartItems = JSON.parse(session.metadata?.cart || '[]'); } catch (_) {}
  const shipping = session.shipping_details || session.collected_information?.shipping_details;
  const customerName = shipping?.name || session.customer_details?.name || 'Customer';
  const orderDate = new Date(session.created * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const itemLines = cartItems.map(item => getProductLabel(item.productId, item.variantId));

  const token = crypto.randomBytes(32).toString('hex');
  await sql`
    INSERT INTO order_claims (token, stripe_session_id, customer_email, customer_name, issue_type, resolution, status, has_photo)
    VALUES (${token}, ${sessionId}, ${sessionEmail}, ${customerName}, ${issueType}, ${issueConfig.resolution}, 'pending', ${!!photoBase64})
  `;

  const siteUrl = process.env.SITE_URL || 'https://yetipoopskiwax.com';
  const approveUrl = `${siteUrl}/api/claims?token=${token}&action=approve`;
  const rejectUrl  = `${siteUrl}/api/claims?token=${token}&action=reject`;
  const itemHtml = itemLines.map(l => `<li style="color:#fffce3;padding:4px 0;">${l}</li>`).join('');
  const resolutionText = issueConfig.resolution === 'reorder'
    ? "Approving will create a replacement Printful order. If it's a Printful error, claim reimbursement at printful.com/dashboard."
    : "Approving will issue a full Stripe refund to the customer.";

  const reviewHtml = `
    <div style="background:#3c5a74;padding:40px;font-family:sans-serif;max-width:600px;">
      <p style="color:#F7813E;font-size:20px;margin:0 0 20px;">Claim Review Required</p>
      <table style="width:100%;margin-bottom:20px;">
        <tr><td style="color:#fffce3;opacity:0.6;width:140px;padding:4px 0;">Issue</td><td style="color:#fffce3;padding:4px 0;">${issueConfig.label}</td></tr>
        <tr><td style="color:#fffce3;opacity:0.6;padding:4px 0;">Customer</td><td style="color:#fffce3;padding:4px 0;">${customerName} &lt;${sessionEmail}&gt;</td></tr>
        <tr><td style="color:#fffce3;opacity:0.6;padding:4px 0;">Order date</td><td style="color:#fffce3;padding:4px 0;">${orderDate}</td></tr>
        <tr><td style="color:#fffce3;opacity:0.6;padding:4px 0;">Resolution</td><td style="color:#fffce3;padding:4px 0;">${issueConfig.resolution === 'reorder' ? 'Replacement order' : 'Stripe refund'}</td></tr>
      </table>
      <p style="color:#fffce3;opacity:0.6;font-size:13px;margin:0 0 6px;">Items:</p>
      <ul style="margin:0 0 20px;padding-left:20px;">${itemHtml}</ul>
      <p style="color:#fffce3;font-size:13px;opacity:0.7;margin:0 0 28px;">${resolutionText}</p>
      <table style="width:100%;border-spacing:12px;"><tr>
        <td style="width:50%;"><a href="${approveUrl}" style="display:block;background:#27ae60;color:#fff;text-align:center;padding:14px;border-radius:6px;text-decoration:none;font-size:16px;">✓ Approve</a></td>
        <td style="width:50%;"><a href="${rejectUrl}" style="display:block;background:#c0392b;color:#fff;text-align:center;padding:14px;border-radius:6px;text-decoration:none;font-size:16px;">✗ Reject</a></td>
      </tr></table>
      <p style="color:#fffce3;opacity:0.4;font-size:11px;margin:24px 0 0;">Stripe session: ${sessionId}</p>
    </div>`;

  const pendingHtml = `
    <div style="background:#3c5a74;padding:40px;font-family:sans-serif;max-width:560px;">
      <p style="color:#F7813E;font-size:22px;margin:0 0 24px;">Claim received.</p>
      <p style="color:#fffce3;margin:0 0 16px;">Hey ${customerName},</p>
      <p style="color:#fffce3;margin:0 0 16px;">We've received your claim for: <strong>${issueConfig.label}</strong></p>
      <p style="color:#fffce3;margin:0 0 24px;">We're reviewing it now and will follow up within 1 business day.</p>
      <p style="color:#F7813E;margin:0;">— Yeti Poop Ski Wax</p>
    </div>`;

  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    const transport = mailer();
    const reviewMail = {
      from: `"Yeti Poop Ski Wax" <${process.env.GMAIL_USER}>`,
      to: 'yetipoopskiwax@gmail.com',
      subject: `[Claim] ${issueConfig.label} — ${sessionEmail}`,
      html: reviewHtml
    };
    if (photoBase64) {
      const m = photoBase64.match(/^data:([^;]+);base64,(.+)$/);
      if (m) reviewMail.attachments = [{ filename: `claim.${m[1].split('/')[1]||'jpg'}`, content: Buffer.from(m[2], 'base64'), contentType: m[1] }];
    }
    Promise.all([
      transport.sendMail(reviewMail),
      transport.sendMail({ from: `"Yeti Poop Ski Wax" <${process.env.GMAIL_USER}>`, to: sessionEmail, subject: 'Your Yeti Poop claim is under review', html: pendingHtml })
    ]).catch(e => console.error('[CLAIMS] Email error:', e.message));
  }

  return res.status(200).json({ success: true, status: 'pending' });
}

// ─── Action (Mike's one-click approve/reject) ─────────────────────────────────

async function handleAction(req, res) {
  const { token, action } = req.query;
  if (!token || !['approve', 'reject'].includes(action)) {
    return res.status(400).send(htmlPage('Invalid', '#c0392b', 'Invalid link', '<p>This link is invalid or malformed.</p>'));
  }

  const sql = getDb();
  await ensureClaimsTable(sql);
  const rows = await sql`SELECT * FROM order_claims WHERE token = ${token} LIMIT 1`;
  if (!rows.length) return res.status(404).send(htmlPage('Not found', '#c0392b', 'Not found', '<p>This link has expired or is invalid.</p>'));

  const claim = rows[0];
  if (claim.status !== 'pending') {
    const already = claim.status === 'approved' ? 'approved' : 'rejected';
    return res.status(200).send(htmlPage('Already processed', '#F7813E', 'Already processed',
      `<p>This claim was already <strong>${already}</strong>.</p><p class="dim">${claim.customer_email}</p>`));
  }

  if (action === 'reject') {
    await sql`UPDATE order_claims SET status = 'rejected', actioned_at = NOW() WHERE token = ${token}`;
    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      mailer().sendMail({
        from: `"Yeti Poop Ski Wax" <${process.env.GMAIL_USER}>`,
        to: claim.customer_email,
        subject: 'Update on your Yeti Poop claim',
        html: `<div style="background:#3c5a74;padding:40px;font-family:sans-serif;max-width:560px;">
          <p style="color:#F7813E;font-size:22px;margin:0 0 24px;">Claim update.</p>
          <p style="color:#fffce3;margin:0 0 16px;">Hey ${claim.customer_name},</p>
          <p style="color:#fffce3;margin:0 0 16px;">After reviewing your claim for <strong>${claim.issue_type.replace(/_/g,' ')}</strong>, we weren't able to approve it.</p>
          <p style="color:#fffce3;margin:0 0 24px;">Questions? <a href="mailto:yetipoopskiwax@gmail.com" style="color:#F7813E;">yetipoopskiwax@gmail.com</a></p>
          <p style="color:#F7813E;margin:0;">— Yeti Poop Ski Wax</p></div>`
      }).catch(() => {});
    }
    return res.status(200).send(htmlPage('Rejected', '#c0392b', 'Claim rejected',
      `<p>The customer has been notified.</p><p class="dim">${claim.customer_email}</p>`));
  }

  // Approve
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  let printfulOrderId = null, stripeRefundId = null, errorMsg = null;

  try {
    if (claim.resolution === 'reorder') {
      const session = await stripe.checkout.sessions.retrieve(claim.stripe_session_id);
      let cartItems = [];
      try { cartItems = JSON.parse(session.metadata?.cart || '[]'); } catch (_) {}
      const shipping = session.shipping_details || session.collected_information?.shipping_details;
      const addr = shipping?.address || {};

      const pfRes = await fetch('https://api.printful.com/orders?confirm=true', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.PRINTFUL_API_TOKEN}`, 'X-PF-Store-Id': process.env.PRINTFUL_STORE_ID, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          external_id: `REORDER_${claim.stripe_session_id.replace(/[^a-zA-Z0-9]/g,'').slice(0,24)}`,
          recipient: { name: claim.customer_name, email: claim.customer_email, address1: addr.line1||'', address2: addr.line2||'', city: addr.city||'', state_code: addr.state||'', country_code: addr.country||'US', zip: addr.postal_code||'' },
          items: cartItems.map(item => {
            const vId = Number(item.variantId);
            const art = getArtworkForVariant(vId);
            return { variant_id: vId, quantity: item.quantity||1, files: art?art.files:[], ...(art?.options?.length?{options:art.options}:{}) };
          })
        })
      });
      const pfData = await pfRes.json();
      if (!pfRes.ok) throw new Error(pfData?.error?.message || `Printful error ${pfRes.status}`);
      printfulOrderId = pfData.result?.id;

    } else {
      const session = await stripe.checkout.sessions.retrieve(claim.stripe_session_id);
      if (!session.payment_intent) throw new Error('No payment intent on session');
      const refund = await stripe.refunds.create({ payment_intent: session.payment_intent });
      stripeRefundId = refund.id;
    }
  } catch (e) {
    console.error('[CLAIMS] Approve error:', e.message);
    errorMsg = e.message;
  }

  if (errorMsg) {
    return res.status(500).send(htmlPage('Error', '#c0392b', 'Processing failed',
      `<p>Could not process automatically:</p><p class="dim">${errorMsg}</p><p>Handle manually and contact <a href="mailto:${claim.customer_email}">${claim.customer_email}</a>.</p>`));
  }

  await sql`UPDATE order_claims SET status='approved', actioned_at=NOW(), printful_order_id=${printfulOrderId}, stripe_refund_id=${stripeRefundId} WHERE token=${token}`;

  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    const resText = claim.resolution === 'reorder'
      ? "A replacement order has been created and will ship to your original address within 5–10 business days."
      : "A full refund has been issued to your original payment method. It typically appears within 5–10 business days.";
    mailer().sendMail({
      from: `"Yeti Poop Ski Wax" <${process.env.GMAIL_USER}>`,
      to: claim.customer_email,
      subject: 'Your Yeti Poop claim has been approved',
      html: `<div style="background:#3c5a74;padding:40px;font-family:sans-serif;max-width:560px;">
        <p style="color:#F7813E;font-size:22px;margin:0 0 24px;">Claim approved.</p>
        <p style="color:#fffce3;margin:0 0 16px;">Hey ${claim.customer_name},</p>
        <p style="color:#fffce3;margin:0 0 24px;">${resText}</p>
        <p style="color:#F7813E;margin:0;">— Yeti Poop Ski Wax</p></div>`
    }).catch(() => {});
  }

  const detailLine = claim.resolution === 'reorder' ? `Printful order ID: ${printfulOrderId}` : `Stripe refund ID: ${stripeRefundId}`;
  const printfulNote = claim.resolution === 'reorder'
    ? '<p style="margin-top:16px;font-size:13px;color:#fffce3;opacity:0.7;">If this was a Printful error, file a reimbursement at printful.com/dashboard → Orders → Report a problem.</p>' : '';

  return res.status(200).send(htmlPage('Approved', '#27ae60', 'Claim approved ✓',
    `<p>${claim.resolution === 'reorder' ? 'Replacement order created in Printful.' : 'Stripe refund issued.'}</p>
     <p class="dim">${detailLine}</p><p class="dim">Customer notified: ${claim.customer_email}</p>${printfulNote}`));
}

// ─── Router ───────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  // GET = Mike's approve/reject action from email
  if (req.method === 'GET') return handleAction(req, res);

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type } = req.body || {};
  if (type === 'lookup') return handleLookup(req, res);
  if (type === 'submit') return handleSubmit(req, res);
  return res.status(400).json({ error: 'Missing type field (lookup or submit).' });
};
