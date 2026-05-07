// POST /api/submit-claim
// Accepts a customer claim, stores it as pending, and emails Mike approve/reject links.
// Nothing is charged or shipped until Mike approves.
//
// Issue types:
//   wrong_item    → reorder (photo optional)
//   damaged       → reorder (photo required)
//   print_quality → reorder (photo required)
//   lost          → refund  (no photo)

const Stripe = require('stripe');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const products = require('./products-data');
const { getDb } = require('./_db');

const ISSUE_TYPES = {
  wrong_item:    { label: 'Wrong item received',   resolution: 'reorder', requiresPhoto: false },
  damaged:       { label: 'Item arrived damaged',  resolution: 'reorder', requiresPhoto: true  },
  print_quality: { label: 'Print quality defect',  resolution: 'reorder', requiresPhoto: true  },
  lost:          { label: 'Never arrived',          resolution: 'refund',  requiresPhoto: false }
};

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
  // Add columns if table existed before this version
  await sql`ALTER TABLE order_claims ADD COLUMN IF NOT EXISTS token TEXT`.catch(() => {});
  await sql`ALTER TABLE order_claims ADD COLUMN IF NOT EXISTS customer_name TEXT NOT NULL DEFAULT ''`.catch(() => {});
  await sql`ALTER TABLE order_claims ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'`.catch(() => {});
  await sql`ALTER TABLE order_claims ADD COLUMN IF NOT EXISTS has_photo BOOLEAN DEFAULT FALSE`.catch(() => {});
  await sql`ALTER TABLE order_claims ADD COLUMN IF NOT EXISTS actioned_at TIMESTAMPTZ`.catch(() => {});
}

function getProductLabel(productId, variantId) {
  const product = products.find(p => p.id === productId);
  if (!product) return 'Unknown item';
  const variant = product.variants.find(v => v.id === Number(variantId));
  return `${product.title}${variant?.title ? ' — ' + variant.title : ''}`;
}

async function emailMikeForReview({ token, issueLabel, resolution, sessionId, customerEmail, customerName, itemLines, photoBase64, orderDate }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return;

  const siteUrl = process.env.SITE_URL || 'https://yetipoopskiwax.com';
  const approveUrl = `${siteUrl}/api/claim-action?token=${token}&action=approve`;
  const rejectUrl  = `${siteUrl}/api/claim-action?token=${token}&action=reject`;

  const resolutionText = resolution === 'reorder'
    ? 'Approving will create a replacement Printful order (you can then claim reimbursement from Printful if it\'s their error).'
    : 'Approving will issue a full Stripe refund to the customer.';

  const itemHtml = itemLines.map(l => `<li style="color:#fffce3;padding:4px 0;">${l}</li>`).join('');

  const html = `
    <div style="background:#3c5a74;padding:40px;font-family:sans-serif;max-width:600px;">
      <p style="color:#F7813E;font-size:20px;margin:0 0 20px;">Claim Review Required</p>

      <table style="width:100%;margin-bottom:20px;">
        <tr><td style="color:#fffce3;opacity:0.6;width:140px;padding:4px 0;">Issue</td><td style="color:#fffce3;padding:4px 0;">${issueLabel}</td></tr>
        <tr><td style="color:#fffce3;opacity:0.6;padding:4px 0;">Customer</td><td style="color:#fffce3;padding:4px 0;">${customerName} &lt;${customerEmail}&gt;</td></tr>
        <tr><td style="color:#fffce3;opacity:0.6;padding:4px 0;">Order date</td><td style="color:#fffce3;padding:4px 0;">${orderDate}</td></tr>
        <tr><td style="color:#fffce3;opacity:0.6;padding:4px 0;">Resolution</td><td style="color:#fffce3;padding:4px 0;">${resolution === 'reorder' ? 'Replacement order' : 'Stripe refund'}</td></tr>
      </table>

      <p style="color:#fffce3;opacity:0.6;font-size:13px;margin:0 0 6px;">Items:</p>
      <ul style="margin:0 0 20px;padding-left:20px;">${itemHtml}</ul>

      <p style="color:#fffce3;font-size:13px;opacity:0.7;margin:0 0 28px;">${resolutionText}</p>

      <table style="width:100%;border-spacing:12px;">
        <tr>
          <td style="width:50%;">
            <a href="${approveUrl}" style="display:block;background:#27ae60;color:#fff;text-align:center;padding:14px;border-radius:6px;text-decoration:none;font-size:16px;">
              ✓ Approve
            </a>
          </td>
          <td style="width:50%;">
            <a href="${rejectUrl}" style="display:block;background:#c0392b;color:#fff;text-align:center;padding:14px;border-radius:6px;text-decoration:none;font-size:16px;">
              ✗ Reject
            </a>
          </td>
        </tr>
      </table>

      <p style="color:#fffce3;opacity:0.4;font-size:11px;margin:24px 0 0;">Stripe session: ${sessionId}</p>
    </div>`;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
  });

  const mailOptions = {
    from: `"Yeti Poop Ski Wax" <${process.env.GMAIL_USER}>`,
    to: 'yetipoopskiwax@gmail.com',
    subject: `[Claim] ${issueLabel} — ${customerEmail}`,
    html
  };

  // Attach photo if provided
  if (photoBase64) {
    const matches = photoBase64.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      const mimeType = matches[1];
      const ext = mimeType.split('/')[1] || 'jpg';
      mailOptions.attachments = [{
        filename: `claim-photo.${ext}`,
        content: Buffer.from(matches[2], 'base64'),
        contentType: mimeType
      }];
    }
  }

  await transporter.sendMail(mailOptions);
}

async function emailCustomerPending({ to, name, issueLabel }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return;
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
  });

  const html = `
    <div style="background:#3c5a74;padding:40px;font-family:sans-serif;max-width:560px;">
      <p style="color:#F7813E;font-size:22px;margin:0 0 24px;">Claim received.</p>
      <p style="color:#fffce3;margin:0 0 16px;">Hey ${name},</p>
      <p style="color:#fffce3;margin:0 0 16px;">We've received your claim for: <strong style="color:#fffce3;">${issueLabel}</strong></p>
      <p style="color:#fffce3;margin:0 0 24px;">We're reviewing it now and will follow up within 1 business day with next steps.</p>
      <p style="color:#fffce3;margin:0 0 24px;">Questions? <a href="mailto:yetipoopskiwax@gmail.com" style="color:#F7813E;">yetipoopskiwax@gmail.com</a></p>
      <p style="color:#F7813E;margin:0;">— Yeti Poop Ski Wax</p>
    </div>`;

  await transporter.sendMail({
    from: `"Yeti Poop Ski Wax" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Your Yeti Poop claim is under review',
    html
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sessionId, email, issueType, photoBase64 } = req.body || {};

  if (!sessionId || !email || !issueType) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const issueConfig = ISSUE_TYPES[issueType];
  if (!issueConfig) return res.status(400).json({ error: 'Invalid issue type.' });

  if (issueConfig.requiresPhoto && !photoBase64) {
    return res.status(400).json({ error: 'A photo is required for this issue type.' });
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  // Verify the session
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (e) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  const sessionEmail = session.customer_details?.email || session.customer_email || '';
  if (sessionEmail.toLowerCase() !== email.trim().toLowerCase()) {
    return res.status(403).json({ error: 'Email does not match this order.' });
  }

  if (session.status !== 'complete' && session.payment_status !== 'paid') {
    return res.status(400).json({ error: 'Order is not eligible for a claim.' });
  }

  // Check for duplicate
  const sql = getDb();
  await ensureClaimsTable(sql);

  const existing = await sql`SELECT id, status FROM order_claims WHERE stripe_session_id = ${sessionId}`;
  if (existing.length) {
    return res.status(409).json({
      error: 'A claim already exists for this order. Contact yetipoopskiwax@gmail.com if you need further help.'
    });
  }

  // Parse order data
  let cartItems = [];
  try { cartItems = JSON.parse(session.metadata?.cart || '[]'); } catch (_) {}
  const shipping = session.shipping_details || session.collected_information?.shipping_details;
  const customerName = shipping?.name || session.customer_details?.name || 'Customer';
  const orderDate = new Date(session.created * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const itemLines = cartItems.map(item => getProductLabel(item.productId, item.variantId));

  // Generate secure token
  const token = crypto.randomBytes(32).toString('hex');

  // Store pending claim
  await sql`
    INSERT INTO order_claims (token, stripe_session_id, customer_email, customer_name, issue_type, resolution, status, has_photo)
    VALUES (${token}, ${sessionId}, ${sessionEmail}, ${customerName}, ${issueType}, ${issueConfig.resolution}, 'pending', ${!!photoBase64})
  `;

  // Email Mike + customer (non-blocking)
  Promise.all([
    emailMikeForReview({ token, issueLabel: issueConfig.label, resolution: issueConfig.resolution, sessionId, customerEmail: sessionEmail, customerName, itemLines, photoBase64, orderDate }),
    emailCustomerPending({ to: sessionEmail, name: customerName, issueLabel: issueConfig.label })
  ]).catch(e => console.error('[CLAIM] Email error:', e.message));

  return res.status(200).json({ success: true, status: 'pending' });
};
