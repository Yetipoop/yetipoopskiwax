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
    artworkFileType: 'front',
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
    id: 'yeti-hat',
    title: 'Garment-Washed Baseball Cap',
    description: 'Yeti Poop Ski Wax dad hat. Otto Cap 18-772, garment-washed cotton twill.',
    images: [{ src: `${SITE}/artwork/hat-logo-dark.png` }],
    artworkUrl: `${SITE}/artwork/hat-logo-dark.png`,
    artworkFileType: 'embroidery',
    options: [],
    // NOTE: Hat variant colors are unconfirmed — all disabled until verified.
    // Printful variant IDs 24534–24541 correspond to 8 colors (unknown mapping).
    // To enable: identify the correct variant ID for the desired color in Printful dashboard,
    // set is_enabled: true, and add a matching option value if offering multiple colors.
    variants: [
      { id: 24534, price: 2499, is_enabled: false, title: 'TBD color 1', options: [] },
      { id: 24535, price: 2499, is_enabled: false, title: 'TBD color 2', options: [] },
      { id: 24536, price: 2499, is_enabled: false, title: 'TBD color 3', options: [] },
      { id: 24537, price: 2499, is_enabled: false, title: 'TBD color 4', options: [] },
      { id: 24538, price: 2499, is_enabled: false, title: 'TBD color 5', options: [] },
      { id: 24539, price: 2499, is_enabled: false, title: 'TBD color 6', options: [] },
      { id: 24540, price: 2499, is_enabled: false, title: 'TBD color 7', options: [] },
      { id: 24541, price: 2499, is_enabled: false, title: 'TBD color 8', options: [] }
    ]
  }
];

module.exports = products;
