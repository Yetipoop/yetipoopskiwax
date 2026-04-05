// GET /api/products/[id]
// Fetches a single product from Printify

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
  const { id } = req.query;
  const token = process.env.PRINTIFY_API_TOKEN;
  const shopId = process.env.PRINTIFY_SHOP_ID;

  if (!token || !shopId || shopId === 'TO_BE_FILLED') {
    return res.status(404).json({ error: 'Product not found' });
  }

  try {
    const product = await printifyGet(`/v1/shops/${shopId}/products/${id}.json`, token);

    // Strip variants the merchant has disabled in Printify
    const enabledVariants = (product.variants || []).filter(v => v.enabled === true);

    // Collect the option-value IDs that actually appear in an enabled variant
    const enabledValueIds = new Set(enabledVariants.flatMap(v => v.options || []));

    // Trim each option's value list to only enabled values
    const trimmedOptions = (product.options || []).map(opt => ({
      ...opt,
      values: (opt.values || []).filter(val => enabledValueIds.has(val.id))
    })).filter(opt => opt.values.length > 0);

    return res.status(200).json({
      ...product,
      variants: enabledVariants,
      options: trimmedOptions
    });
  } catch (e) {
    console.error('Printify product error:', e.message);
    return res.status(404).json({ error: 'Product not found' });
  }
};
