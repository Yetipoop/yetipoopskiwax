// GET /api/products/[id]
// Returns a single product by our internal ID.
// Enriches images with Printful mockup thumbnail, falls back to static artwork.

const products = require('../products-data');

// Returns { [catalogVariantId]: previewUrl } for all matched variants.
// Also returns firstThumb (the first preview found) for the main images array.
async function fetchPrintfulVariantImages(variantIds) {
  const token = process.env.PRINTFUL_API_TOKEN;
  const storeId = process.env.PRINTFUL_STORE_ID;
  if (!token || !storeId || !variantIds.length) return { variantImages: {}, firstThumb: null };

  const variantIdSet = new Set(variantIds);
  const variantImages = {};

  try {
    const res = await fetch('https://api.printful.com/sync/products?limit=100', {
      headers: { 'Authorization': `Bearer ${token}`, 'X-PF-Store-Id': storeId }
    });
    if (!res.ok) return { variantImages: {}, firstThumb: null };
    const data = await res.json();

    await Promise.all((data.result || []).map(async (sp) => {
      try {
        const detail = await fetch(`https://api.printful.com/sync/products/${sp.id}`, {
          headers: { 'Authorization': `Bearer ${token}`, 'X-PF-Store-Id': storeId }
        });
        if (!detail.ok) return;
        const d = await detail.json();
        for (const sv of (d.result?.sync_variants || [])) {
          if (!variantIdSet.has(sv.variant_id)) continue;
          const previewFile = sv.files?.find(f => f.type === 'preview');
          const url = previewFile?.preview_url || sp.thumbnail_url;
          if (url) variantImages[sv.variant_id] = url;
        }
      } catch (_) { /* skip */ }
    }));
  } catch (_) { /* fall through */ }

  const firstThumb = Object.values(variantImages)[0] || null;
  return { variantImages, firstThumb };
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

  // If any color option has static mockups baked in, use those directly —
  // no Printful API call needed. Otherwise fall back to fetching from Printful.
  const colorOption = trimmedOptions.find(o => o.type === 'color');
  const hasStaticMockups = colorOption?.values?.some(v => v.mockup?.front);

  let images = product.images;
  let variantImages = {};

  if (hasStaticMockups) {
    const firstColor = colorOption.values[0];
    images = [{ src: firstColor.mockup.front, view: 'front' }];
    if (firstColor.mockup.back) images.push({ src: firstColor.mockup.back, view: 'back' });
  } else {
    const variantIds = enabledVariants.map(v => v.id);
    const result = await fetchPrintfulVariantImages(variantIds);
    if (result.firstThumb) images = [{ src: result.firstThumb }, ...product.images];
    variantImages = result.variantImages;
  }

  return res.status(200).json({
    ...product,
    variants: enabledVariants,
    options: trimmedOptions,
    images,
    variantImages
  });
};
