// GET /api/products
// Fetches all published products from Printify

const https = require('https');

function printifyGet(path, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.printify.com',
      path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'YetiPoopSkiWax/1.0'
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    return res.status(200).end();
  }

  const token = process.env.PRINTIFY_API_TOKEN;
  const shopId = process.env.PRINTIFY_SHOP_ID;

  if (!token || !shopId || shopId === 'TO_BE_FILLED') {
    return res.status(200).json({ products: [] });
  }

  try {
    const data = await printifyGet(`/v1/shops/${shopId}/products.json?limit=20`, token);

    // Printify's list endpoint does not reliably expose enabled/published state
    // for API-connected shops. We show all products by default and use the
    // HIDDEN_PRODUCT_IDS env var (comma-separated Printify product IDs) to
    // explicitly exclude products you don't want on the site.
    const hiddenIds = new Set(
      (process.env.HIDDEN_PRODUCT_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
    );
    const products = (data.data || []).filter(p => !hiddenIds.has(String(p.id)));

    return res.status(200).json({ products });
  } catch (e) {
    console.error('Printify products error:', e.message);
    return res.status(200).json({ products: [] });
  }
};
