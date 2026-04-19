// GET /api/products/[id]
// Returns a single product by our internal ID.
// Replaces live Printify API call with static products-data.js

const products = require('../products-data');

module.exports = async function handler(req, res) {
  const { id } = req.query;

  const product = products.find(p => p.id === id);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const enabledVariants = product.variants.filter(v => v.is_enabled);

  // Build trimmed options — only include values that appear in an enabled variant
  const enabledValueIds = new Set(enabledVariants.flatMap(v => v.options || []));
  const trimmedOptions = (product.options || [])
    .map(opt => ({
      ...opt,
      values: opt.values.filter(val => enabledValueIds.has(val.id))
    }))
    .filter(opt => opt.values.length > 0);

  return res.status(200).json({
    ...product,
    variants: enabledVariants,
    options: trimmedOptions
  });
};
