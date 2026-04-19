// Debug: inspect Printful sync products raw response
// Visit /api/debug-products to see what Printful returns
// DELETE or clear this file once debugging is done

module.exports = async function handler(req, res) {
  const token = process.env.PRINTFUL_API_TOKEN;
  const storeId = process.env.PRINTFUL_STORE_ID;

  if (!token || !storeId) {
    return res.status(500).json({ error: 'Missing env vars', token: !!token, storeId: !!storeId });
  }

  try {
    // Step 1: List sync products
    const listRes = await fetch('https://api.printful.com/sync/products?limit=100', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-PF-Store-Id': storeId
      }
    });
    const listData = await listRes.json();

    if (!listRes.ok) {
      return res.status(200).json({ step: 'list_failed', status: listRes.status, body: listData });
    }

    const syncProducts = listData.result || [];

    // Step 2: Fetch detail for first sync product to inspect structure
    let firstDetail = null;
    if (syncProducts.length > 0) {
      const detRes = await fetch(`https://api.printful.com/sync/products/${syncProducts[0].id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-PF-Store-Id': storeId
        }
      });
      firstDetail = await detRes.json();
    }

    return res.status(200).json({
      syncProductCount: syncProducts.length,
      syncProducts: syncProducts.map(sp => ({
        id: sp.id,
        name: sp.name,
        thumbnail_url: sp.thumbnail_url,
        variants: sp.variants
      })),
      firstProductDetail: firstDetail
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
