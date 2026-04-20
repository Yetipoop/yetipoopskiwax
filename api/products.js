// GET /api/products
// Returns all products with at least one enabled variant.
// Attempts to enrich product images with Printful sync product thumbnails.
// Falls back to static artwork from products-data.js if Printful API is unavailable.

const products = require('./products-data');

// Build a map from Printful catalog variant_id -> thumbnail_url using sync products list
async function fetchPrintfulThumbnails() {
  const token = process.env.PRINTFUL_API_TOKEN;
  const storeId = process.env.PRINTFUL_STORE_ID;
  if (!token || !storeId) return null;

  try {
    const res = await fetch('https://api.printful.com/sync/products?limit=100', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-PF-Store-Id': storeId
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const syncProducts = data.result || [];

    // Map: variantId (number) -> thumbnail_url
    // Each sync product has a thumbnail_url; we fetch its variants to get catalog variant IDs
    // To avoid N+1 calls, fetch each sync product detail (only 3-4 active products)
    const variantToThumb = {};
    await Promise.all(syncProducts.map(async (sp) => {
      try {
        const detail = await fetch(`https://api.printful.com/sync/products/${sp.id}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-PF-Store-Id': storeId
          }
        });
        if (!detail.ok) return;
        const d = await detail.json();
        const syncVariants = d.result?.sync_variants || [];
        // Find the mockup preview URL from the first variant's files (type: "preview")
        const previewFile = syncVariants[0]?.files?.find(f => f.type === 'preview');
        const previewUrl = previewFile?.preview_url;
        for (const sv of syncVariants) {
          if (sv.variant_id) {
            variantToThumb[sv.variant_id] = previewUrl || sp.thumbnail_url;
          }
        }
      } catch (_) { /* skip on error */ }
    }));

    return variantToThumb;
  } catch (_) {
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    return res.status(200).end();
  }

  const visible = products
    .map(p => ({ ...p, variants: p.variants.filter(v => v.is_enabled) }))
    .filter(p => p.variants.length > 0);

  // For products with static mockups baked into color options, use those directly.
  // For others, fetch from Printful sync API.
  const needsPrintful = visible.filter(p => {
    const colorOpt = (p.options || []).find(o => o.type === 'color');
    return !colorOpt?.values?.some(v => v.mockup?.front);
  });

  // Apply static mockups
  for (const p of visible) {
    const colorOpt = (p.options || []).find(o => o.type === 'color');
    const firstMockup = colorOpt?.values?.find(v => v.mockup?.front)?.mockup?.front;
    if (firstMockup) p.images = [{ src: firstMockup }];
  }

  // Fetch Printful thumbnails only for products without static mockups
  if (needsPrintful.length > 0) {
    const variantToThumb = await fetchPrintfulThumbnails();
    if (variantToThumb) {
      for (const p of needsPrintful) {
        const thumb = p.variants.map(v => variantToThumb[v.id]).find(Boolean);
        if (thumb) p.images = [{ src: thumb }, ...p.images];
      }
    }
  }

  return res.status(200).json({ products: visible });
};
