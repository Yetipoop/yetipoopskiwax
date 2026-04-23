// _accounting.js — Google Sheets + Stripe/Printful sync helpers for accounting routes
const { google } = require('googleapis');

const SHEET_ID  = process.env.ACCOUNTING_SHEET_ID;
const STORE_ID  = '18012081';

// ── Sheets auth ───────────────────────────────────────────────────────────────

function getSheets() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ── Read / write ──────────────────────────────────────────────────────────────

async function getRows() {
  const sheets = getSheets();
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Transactions!A:H',
  });
  const raw = r.data.values || [];
  if (raw.length <= 1) return [];
  return raw.slice(1).map(row => ({
    date:        row[0] || '',
    source:      row[1] || '',
    type:        row[2] || '',
    category:    row[3] || '',
    description: row[4] || '',
    amount:      parseFloat(row[5]) || 0,
    ext_id:      row[6] || '',
  }));
}

async function appendRows(rows) {
  if (!rows.length) return;
  const sheets = getSheets();
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Transactions!A:H',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: rows.map(r => [
        r.date, r.source, r.type, r.category,
        r.description, r.amount, r.ext_id, now,
      ]),
    },
  });
}

// ── Stripe sync ───────────────────────────────────────────────────────────────

function tsToDate(ts) {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

async function syncStripe(seen) {
  const Stripe = require('stripe');
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const newRows = [];

  for await (const charge of stripe.charges.list({
    limit: 100,
    expand: ['data.balance_transaction'],
  })) {
    if (charge.status !== 'succeeded') continue;

    const date   = tsToDate(charge.created);
    const amount = charge.amount / 100;
    const desc   = charge.description || charge.receipt_email || 'Stripe sale';

    if (!seen.has(charge.id)) {
      newRows.push({ date, source: 'stripe', type: 'revenue', category: 'Sales',
                     description: desc, amount, ext_id: charge.id });
    }

    const bt  = charge.balance_transaction;
    const fee = (bt && typeof bt === 'object') ? bt.fee / 100 : 0;
    const feeId = charge.id + '_fee';
    if (fee > 0 && !seen.has(feeId)) {
      newRows.push({ date, source: 'stripe', type: 'expense', category: 'Stripe Fees',
                     description: `Fee for ${charge.id}`, amount: fee, ext_id: feeId });
    }
  }

  return newRows;
}

// ── Printful sync ─────────────────────────────────────────────────────────────

async function syncPrintful(seen) {
  const newRows = [];
  let offset = 0;

  while (true) {
    const r = await fetch(
      `https://api.printful.com/orders?status=fulfilled&limit=100&offset=${offset}`,
      { headers: {
          Authorization: `Bearer ${process.env.PRINTFUL_API_TOKEN}`,
          'X-PF-Store-Id': STORE_ID,
      }}
    );
    const data = await r.json();
    const batch = data.result || [];
    if (!batch.length) break;

    for (const o of batch) {
      const extId = `pf_${o.id}`;
      if (seen.has(extId)) continue;
      const costs = o.costs || {};
      const total = parseFloat(costs.total || 0);
      const items = (o.items || []).slice(0, 3).map(i => i.name || 'item').join(', ');
      const date  = (o.updated || o.created || '').slice(0, 10);
      newRows.push({ date, source: 'printful', type: 'cogs', category: 'Printful COGS',
                     description: items || 'Printful order', amount: total, ext_id: extId });
    }

    if (batch.length < 100) break;
    offset += 100;
  }

  return newRows;
}

// ── Report computation ────────────────────────────────────────────────────────

function computeReport(rows, { period, year } = {}) {
  let filtered = rows;
  if (period)      filtered = rows.filter(r => r.date.startsWith(period));
  else if (year)   filtered = rows.filter(r => r.date.startsWith(String(year)));

  const sum = type => filtered.filter(r => r.type === type)
                              .reduce((s, r) => s + r.amount, 0);

  const revenue  = sum('revenue');
  const cogs     = sum('cogs');
  const expenses = sum('expense');
  const r2 = n => Math.round(n * 100) / 100;

  // By category
  const by_category = {};
  for (const r of filtered) {
    if (r.type === 'expense' || r.type === 'cogs') {
      by_category[r.category] = r2((by_category[r.category] || 0) + r.amount);
    }
  }

  // By month
  const by_month = {};
  for (const r of filtered) {
    const m = r.date.slice(0, 7);
    if (!by_month[m]) by_month[m] = { revenue: 0, cogs: 0, expenses: 0, net: 0 };
    if (r.type === 'revenue') by_month[m].revenue += r.amount;
    else if (r.type === 'cogs')    by_month[m].cogs     += r.amount;
    else if (r.type === 'expense') by_month[m].expenses += r.amount;
  }
  for (const m of Object.keys(by_month)) {
    const mo = by_month[m];
    mo.net = r2(mo.revenue - mo.cogs - mo.expenses);
    mo.revenue  = r2(mo.revenue);
    mo.cogs     = r2(mo.cogs);
    mo.expenses = r2(mo.expenses);
  }

  return {
    summary: {
      revenue:      r2(revenue),
      cogs:         r2(cogs),
      gross_profit: r2(revenue - cogs),
      expenses:     r2(expenses),
      net_profit:   r2(revenue - cogs - expenses),
    },
    by_category,
    by_month,
    row_count: filtered.length,
  };
}

module.exports = { getRows, appendRows, syncStripe, syncPrintful, computeReport };
