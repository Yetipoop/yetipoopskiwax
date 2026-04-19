// GET /api/products
// Returns all products with at least one enabled variant.
// Replaces live Printify API call with static products-data.js

const products = require('./products-data');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    return res.status(200).end();
  }

  const visible = products
    .map(p => ({ ...p, variants: p.variants.filter(v => v.is_enabled) }))
    .filter(p => p.variants.length > 0);

  return res.status(200).json({ products: visible });
};
