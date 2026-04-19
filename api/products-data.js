// Static product catalog — replaces live Printify API calls
// Printful variant IDs are used directly as variant `id` values.
// The webhook reads artworkUrl and artworkFileType from here.
//
// To add/remove a product variant: set is_enabled true/false
// To change prices: update `price` (in cents)
// To add a new product: add a new object following the same shape

const SITE = 'https://yetipoopskiwax.com';

const products = [
  {
    id: 'yeti-youth-tee',
    title: 'Youth Classic Tee',
    description: 'Classic Yeti Poop Ski Wax tee for kids. Gildan 5000B, 100% heavy cotton.',
    images: [{ src: `${SITE}/artwork/tee-logo-dark.png` }],
    artworkUrl: `${SITE}/artwork/tee-logo-dark.png`,
    artworkFileType: 'front',
    // Options drive the selector UI on the product page
    options: [
      {
        id: 1,
        name: 'Size',
        type: 'size',
        values: [
          { id: 1, title: 'XS' },
          { id: 2, title: 'S' },
          { id: 3, title: 'M' },
          { id: 4, title: 'L' },
          { id: 5, title: 'XL' }
        ]
      }
    ],
    // variant `id` = Printful catalog variant_id (passed straight to Printful orders API)
    // variant `options` = array of option value IDs from above (used by frontend to match selection)
    variants: [
      { id: 18705, price: 1999, is_enabled: true, title: 'Navy / XS', options: [1] },
      { id: 18706, price: 1999, is_enabled: true, title: 'Navy / S',  options: [2] },
      { id: 18707, price: 1999, is_enabled: true, title: 'Navy / M',  options: [3] },
      { id: 18708, price: 1999, is_enabled: true, title: 'Navy / L',  options: [4] },
      { id: 18709, price: 1999, is_enabled: true, title: 'Navy / XL', options: [5] }
    ]
  },
  {
    id: 'yeti-sports-tee',
    title: 'Unisex Sports Tee',
    description: 'Yeti Poop Ski Wax moisture-wicking sports tee. Gildan DryBlend 8000.',
    images: [{ src: `${SITE}/artwork/tee-logo-dark.png` }],
    artworkUrl: `${SITE}/artwork/tee-logo-dark.png`,
    artworkFileType: 'front_dtf',
    options: [
      {
        id: 1,
        name: 'Size',
        type: 'size',
        values: [
          { id: 1, title: 'S' },
          { id: 2, title: 'M' },
          { id: 3, title: 'L' },
          { id: 4, title: 'XL' },
          { id: 5, title: '2XL' },
          { id: 6, title: '3XL' },
          { id: 7, title: '4XL' },
          { id: 8, title: '5XL' }
        ]
      }
    ],
    variants: [
      { id: 19909, price: 2499, is_enabled: true, title: 'Navy / S',   options: [1] },
      { id: 19926, price: 2499, is_enabled: true, title: 'Navy / M',   options: [2] },
      { id: 19943, price: 2499, is_enabled: true, title: 'Navy / L',   options: [3] },
      { id: 19960, price: 2499, is_enabled: true, title: 'Navy / XL',  options: [4] },
      { id: 19977, price: 2499, is_enabled: true, title: 'Navy / 2XL', options: [5] },
      { id: 19994, price: 2499, is_enabled: true, title: 'Navy / 3XL', options: [6] },
      { id: 20011, price: 2499, is_enabled: true, title: 'Navy / 4XL', options: [7] },
      { id: 20028, price: 2499, is_enabled: true, title: 'Navy / 5XL', options: [8] }
    ]
  },
  {
    id: 'yeti-helmet-sticker',
    title: 'Helmet Sticker',
    description: 'Yeti Poop Ski Wax kiss-cut vinyl sticker. 3″ × 3″. Waterproof, durable.',
    images: [{ src: `${SITE}/artwork/sticker-helmet.png` }],
    artworkUrl: `${SITE}/artwork/sticker-helmet.png`,
    artworkFileType: 'default',
    options: [],   // No options — frontend enables Add to Cart immediately
    variants: [
      { id: 10163, price: 499, is_enabled: true, title: '3″ × 3″', options: [] }
    ]
  },
  {
    id: 'yeti-hoodie-adult',
    title: 'Yeti Poop Hoodie — Adult',
    description: 'Yeti Poop Ski Wax hoodie. Gildan Heavy Blend 18500, 50/50 cotton-poly. Small logo on front left chest, large logo on back.',
    images: [{ src: `${SITE}/artwork/tee-logo-dark.png` }],
    artworkFiles: [
      { type: 'front', url: `${SITE}/artwork/tee-logo-dark.png` },
      { type: 'back',  url: `${SITE}/artwork/tee-logo-dark.png` },
    ],
    // Color value IDs: Navy=1, Indigo Blue=2, Graphite Heather=3, Military Green=4
    // Size value IDs:  S=5, M=6, L=7, XL=8, 2XL=9, 3XL=10, 4XL=11, 5XL=12
    options: [
      {
        id: 1,
        name: 'Color',
        type: 'color',
        values: [
          { id: 1, title: 'Navy' },
          { id: 2, title: 'Indigo Blue' },
          { id: 3, title: 'Graphite Heather' },
          { id: 4, title: 'Military Green' },
        ]
      },
      {
        id: 2,
        name: 'Size',
        type: 'size',
        values: [
          { id: 5,  title: 'S' },
          { id: 6,  title: 'M' },
          { id: 7,  title: 'L' },
          { id: 8,  title: 'XL' },
          { id: 9,  title: '2XL' },
          { id: 10, title: '3XL' },
          { id: 11, title: '4XL' },
          { id: 12, title: '5XL' },
        ]
      }
    ],
    variants: [
      // Navy (S–5XL)
      { id: 5594,  price: 4499, is_enabled: true, title: 'Navy / S',                options: [1, 5]  },
      { id: 5595,  price: 4499, is_enabled: true, title: 'Navy / M',                options: [1, 6]  },
      { id: 5596,  price: 4499, is_enabled: true, title: 'Navy / L',                options: [1, 7]  },
      { id: 5597,  price: 4499, is_enabled: true, title: 'Navy / XL',               options: [1, 8]  },
      { id: 5598,  price: 4499, is_enabled: true, title: 'Navy / 2XL',              options: [1, 9]  },
      { id: 5599,  price: 4499, is_enabled: true, title: 'Navy / 3XL',              options: [1, 10] },
      { id: 5600,  price: 4499, is_enabled: true, title: 'Navy / 4XL',              options: [1, 11] },
      { id: 5601,  price: 4499, is_enabled: true, title: 'Navy / 5XL',              options: [1, 12] },
      // Indigo Blue (S–3XL only — not available in 4XL/5XL)
      { id: 5562,  price: 4499, is_enabled: true, title: 'Indigo Blue / S',         options: [2, 5]  },
      { id: 5563,  price: 4499, is_enabled: true, title: 'Indigo Blue / M',         options: [2, 6]  },
      { id: 5564,  price: 4499, is_enabled: true, title: 'Indigo Blue / L',         options: [2, 7]  },
      { id: 5565,  price: 4499, is_enabled: true, title: 'Indigo Blue / XL',        options: [2, 8]  },
      { id: 5566,  price: 4499, is_enabled: true, title: 'Indigo Blue / 2XL',       options: [2, 9]  },
      { id: 5567,  price: 4499, is_enabled: true, title: 'Indigo Blue / 3XL',       options: [2, 10] },
      // Graphite Heather (S–5XL)
      { id: 20546, price: 4499, is_enabled: true, title: 'Graphite Heather / S',    options: [3, 5]  },
      { id: 20549, price: 4499, is_enabled: true, title: 'Graphite Heather / M',    options: [3, 6]  },
      { id: 20552, price: 4499, is_enabled: true, title: 'Graphite Heather / L',    options: [3, 7]  },
      { id: 20555, price: 4499, is_enabled: true, title: 'Graphite Heather / XL',   options: [3, 8]  },
      { id: 20558, price: 4499, is_enabled: true, title: 'Graphite Heather / 2XL',  options: [3, 9]  },
      { id: 20561, price: 4499, is_enabled: true, title: 'Graphite Heather / 3XL',  options: [3, 10] },
      { id: 20564, price: 4499, is_enabled: true, title: 'Graphite Heather / 4XL',  options: [3, 11] },
      { id: 20567, price: 4499, is_enabled: true, title: 'Graphite Heather / 5XL',  options: [3, 12] },
      // Military Green (S–5XL)
      { id: 12989, price: 4499, is_enabled: true, title: 'Military Green / S',      options: [4, 5]  },
      { id: 12990, price: 4499, is_enabled: true, title: 'Military Green / M',      options: [4, 6]  },
      { id: 12991, price: 4499, is_enabled: true, title: 'Military Green / L',      options: [4, 7]  },
      { id: 12992, price: 4499, is_enabled: true, title: 'Military Green / XL',     options: [4, 8]  },
      { id: 12993, price: 4499, is_enabled: true, title: 'Military Green / 2XL',    options: [4, 9]  },
      { id: 12994, price: 4499, is_enabled: true, title: 'Military Green / 3XL',    options: [4, 10] },
      { id: 12995, price: 4499, is_enabled: true, title: 'Military Green / 4XL',    options: [4, 11] },
      { id: 12996, price: 4499, is_enabled: true, title: 'Military Green / 5XL',    options: [4, 12] },
    ]
  },
  {
    id: 'yeti-hoodie-youth',
    title: 'Yeti Poop Hoodie — Youth',
    description: 'Yeti Poop Ski Wax hoodie for kids. Gildan Heavy Blend 18500B, 50/50 cotton-poly. Small logo on front left chest, large logo on back.',
    images: [{ src: `${SITE}/artwork/tee-logo-dark.png` }],
    artworkFiles: [
      { type: 'front', url: `${SITE}/artwork/tee-logo-dark.png` },
      { type: 'back',  url: `${SITE}/artwork/tee-logo-dark.png` },
    ],
    // Color value IDs: Navy=1, Dark Heather=2
    // Size value IDs:  XS=3, S=4, M=5, L=6, XL=7
    options: [
      {
        id: 1,
        name: 'Color',
        type: 'color',
        values: [
          { id: 1, title: 'Navy' },
          { id: 2, title: 'Dark Heather' },
        ]
      },
      {
        id: 2,
        name: 'Size',
        type: 'size',
        values: [
          { id: 3, title: 'XS' },
          { id: 4, title: 'S' },
          { id: 5, title: 'M' },
          { id: 6, title: 'L' },
          { id: 7, title: 'XL' },
        ]
      }
    ],
    variants: [
      // Navy (XS–XL)
      { id: 17266, price: 3999, is_enabled: true, title: 'Navy / XS',          options: [1, 3] },
      { id: 17265, price: 3999, is_enabled: true, title: 'Navy / S',           options: [1, 4] },
      { id: 17267, price: 3999, is_enabled: true, title: 'Navy / M',           options: [1, 5] },
      { id: 17268, price: 3999, is_enabled: true, title: 'Navy / L',           options: [1, 6] },
      { id: 17269, price: 3999, is_enabled: true, title: 'Navy / XL',          options: [1, 7] },
      // Dark Heather (XS–XL)
      { id: 22311, price: 3999, is_enabled: true, title: 'Dark Heather / XS',  options: [2, 3] },
      { id: 22313, price: 3999, is_enabled: true, title: 'Dark Heather / S',   options: [2, 4] },
      { id: 22315, price: 3999, is_enabled: true, title: 'Dark Heather / M',   options: [2, 5] },
      { id: 22317, price: 3999, is_enabled: true, title: 'Dark Heather / L',   options: [2, 6] },
      { id: 22319, price: 3999, is_enabled: true, title: 'Dark Heather / XL',  options: [2, 7] },
    ]
  },
  {
    id: 'yeti-hat',
    title: 'Garment-Washed Baseball Cap',
    description: 'Yeti Poop Ski Wax dad hat. Otto Cap 18-772, garment-washed cotton twill.',
    images: [{ src: `${SITE}/artwork/hat-logo-dark.png` }],
    artworkUrl: `${SITE}/artwork/hat-logo-dark.png`,
    artworkFileType: 'embroidery_front',
    artworkOptions: [{ id: 'thread_colors', value: ['#333366'] }],
    options: [],
    variants: [
      { id: 24540, price: 2499, is_enabled: true, title: 'Navy / One Size', options: [] }
    ]
  }
];

module.exports = products;
