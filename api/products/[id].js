// GET /api/products/[id]
// Returns a single product by our internal ID.
// Enriches images with Printful mockup thumbnail, falls back to static artwork.

const products = require('../products-data');

async function fetchPrintfulThumbForVariants(variantIds) {
  const token = process.env.PRINTFUL_API_TOKEN;
  const storeId = process.env.PRINTFUL_STORE_ID;
  if (!token || !storeId || !variantIds.length) return null;

  try {
    const res = await fetch('https://api.printful.com/sync/products?limit=100', {
      headers: { 'Authorization': `Bearer ${token}`, 'X-PF-Store-Id': storeId }
    });
    if (!res.ok) return null;
    const data = await res.json();

    for (const sp of (data.result || [])) {
      const detail = await fetch(`https://api.printful.com/sync/products/${sp.id}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'X-PF-Store-Id': storeId }
      });
      if (!detail.ok) continue;
      const d = await detail.json();
      const syncVariants = d.result?.sync_variants || [];
      const match = syncVariants.find(sv => variantIds.includes(sv.variant_id));
      if (match) {
        const previewFile = match.files?.find(f => f.type === 'preview');
        return previewFile?.preview_url || sp.thumbnail_url || null;
      }
    }
  } catch (_) { /* fall through */ }
  return null;
}

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

  // Enrich images with Printful mockup thumbnail
  const variantIds = enabledVariants.map(v => v.id);
  const thumb = await fetchPrintfulThumbForVariants(variantIds);
  const images = thumb
    ? [{ src: thumb }, ...product.images]
    : product.images;

  return res.status(200).json({
    ...product,
    variants: enabledVariants,
    options: trimmedOptions,
    images
  });
};
