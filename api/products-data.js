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
    title: 'Grom tee',
    description: 'Groms stuck in the glue? Slap on some slick blue poo. 100% heavy cotton tee keeps comfy and steezy too!',
    images: [{ src: `${SITE}/artwork/tee-logo-dark.png` }],
    artworkUrl: `${SITE}/artwork/tee-logo-dark.png`,
    artworkFileType: 'front',
    sizeChart: {
      note: 'Measurements in inches, laid flat — Gildan 5000B',
      columns: ['Size', 'Width', 'Length'],
      rows: [
        ['XS', '16"', '20.5"'],
        ['S',  '17"', '22"'],
        ['M',  '18"', '23.5"'],
        ['L',  '19"', '25"'],
        ['XL', '20"', '26.5"'],
      ]
    },
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
    title: 'Adult tee',
    description: 'Dryblend moisture-wicking tees, so grownups can double their steeze!',
    images: [{ src: `${SITE}/artwork/tee-logo-dark.png` }],
    artworkUrl: `${SITE}/artwork/tee-logo-dark.png`,
    artworkFileType: 'front_dtf',
    sizeChart: {
      note: 'Measurements in inches, laid flat — Gildan 8000',
      columns: ['Size', 'Width', 'Length'],
      rows: [
        ['S',   '18"', '28"'],
        ['M',   '20"', '29"'],
        ['L',   '22"', '30"'],
        ['XL',  '24"', '31"'],
        ['2XL', '26"', '32"'],
        ['3XL', '28"', '33"'],
        ['4XL', '30"', '34"'],
        ['5XL', '32"', '35"'],
      ]
    },
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
    title: 'Helmet sticker',
    description: 'Slap this waterproof 3x3 kiss cut sticker on your dome, and flaunt your blue poo steeze wherever you roam!',
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
    title: 'Adult hoodie',
    description: 'Pull this 50/50 poly/cotton blend hoodie from your pack. Show your blue poo steeze front and back!',
    sizeChart: {
      note: 'Measurements in inches, laid flat — Gildan 18500',
      columns: ['Size', 'Width', 'Length'],
      rows: [
        ['S',   '20"', '26"'],
        ['M',   '22"', '27"'],
        ['L',   '24"', '28"'],
        ['XL',  '26"', '29"'],
        ['2XL', '28"', '30"'],
        ['3XL', '30"', '31"'],
        ['4XL', '32"', '32"'],
        ['5XL', '34"', '33"'],
      ]
    },
    images: [{ src: `${SITE}/artwork/hoodie-adult-navy-front.jpg` }],
    artworkFiles: [
      { type: 'default', url: `${SITE}/artwork/hoodie-adult-front.png` },
      { type: 'back',    url: `${SITE}/artwork/hoodie-adult-back.png` },
    ],
    // Color value IDs: Navy=1, Indigo Blue=2, Graphite Heather=3, Military Green=4
    // Size value IDs:  S=5, M=6, L=7, XL=8, 2XL=9, 3XL=10, 4XL=11, 5XL=12
    options: [
      {
        id: 1,
        name: 'Color',
        type: 'color',
        values: [
          { id: 1, title: 'Navy',             mockup: { front: `${SITE}/artwork/hoodie-adult-navy-front.jpg`,     back: `${SITE}/artwork/hoodie-adult-navy-back.jpg`     } },
          { id: 2, title: 'Indigo Blue',      mockup: { front: `${SITE}/artwork/hoodie-adult-indigo-front.jpg`,   back: `${SITE}/artwork/hoodie-adult-indigo-back.jpg`   } },
          { id: 3, title: 'Graphite Heather', mockup: { front: `${SITE}/artwork/hoodie-adult-graphite-front.jpg`, back: `${SITE}/artwork/hoodie-adult-graphite-back.jpg` } },
          { id: 4, title: 'Military Green',   mockup: { front: `${SITE}/artwork/hoodie-adult-military-front.jpg`, back: `${SITE}/artwork/hoodie-adult-military-back.jpg` } },
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
    title: 'Grom hoodie',
    description: 'We think you should…buy your kids this hood(ie). 50/50 poly/cotton blend. Comfort and blue poo steeze for days.',
    sizeChart: {
      note: 'Measurements in inches, laid flat — Gildan 18500B',
      columns: ['Size', 'Width', 'Length'],
      rows: [
        ['XS', '16"', '19.75"'],
        ['S',  '17"', '21"'],
        ['M',  '18"', '22.5"'],
        ['L',  '19"', '24"'],
        ['XL', '20"', '25.5"'],
      ]
    },
    images: [{ src: `${SITE}/artwork/hoodie-youth-navy-front.jpg` }],
    artworkFiles: [
      { type: 'default', url: `${SITE}/artwork/hoodie-youth-front.png` },
      { type: 'back',    url: `${SITE}/artwork/hoodie-youth-back.png` },
    ],
    // Color value IDs: Navy=1, Dark Heather=2
    // Size value IDs:  XS=3, S=4, M=5, L=6, XL=7
    options: [
      {
        id: 1,
        name: 'Color',
        type: 'color',
        values: [
          { id: 1, title: 'Navy',         mockup: { front: `${SITE}/artwork/hoodie-youth-navy-front.jpg`,        back: `${SITE}/artwork/hoodie-youth-navy-back.jpg`        } },
          { id: 2, title: 'Dark Heather', mockup: { front: `${SITE}/artwork/hoodie-youth-darkheather-front.jpg`, back: `${SITE}/artwork/hoodie-youth-darkheather-back.jpg` } },
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
    id: 'yeti-bumper-bluepoo',
    title: 'Blue poo bumper sticker',
    description: 'For your car, your favorite bar, or your topsheets. Show that blue poo pride!',
    images: [{ src: `${SITE}/artwork/sticker-bumper-bluepoo.png` }],
    artworkUrl: `${SITE}/artwork/sticker-bumper-bluepoo.png`,
    artworkFileType: 'default',
    imageContain: true,
    options: [],
    variants: [
      { id: 16362, price: 699, is_enabled: true, title: '15″ × 3.75″', options: [] }
    ]
  },
  {
    id: 'yeti-bumper-steeze',
    title: 'Steeze bumper sticker',
    description: 'For your car, your favorite bar, or your topsheets. Show your steeze!',
    images: [{ src: `${SITE}/artwork/sticker-bumper-steeze.png` }],
    artworkUrl: `${SITE}/artwork/sticker-bumper-steeze.png`,
    artworkFileType: 'default',
    imageContain: true,
    options: [],
    variants: [
      { id: 16362, price: 699, is_enabled: true, title: '15″ × 3.75″', options: [] }
    ]
  },
  {
    id: 'yeti-hat',
    title: 'Dad hat',
    description: 'Do you want to be the only dad not flaunting his superior taste in scatalogical ski wax after Father\'s Day? We didn\'t think so.',
    sizeChart: {
      note: 'Adjustable strap — Otto Cap 18-772',
      columns: ['Size', 'Head Circumference'],
      rows: [
        ['One Size', '21.65″ – 25.19″'],
      ]
    },
    images: [{ src: `${SITE}/artwork/hat-mockup-navy.jpg` }],
    artworkUrl: `${SITE}/artwork/hat-logo-dark.png`,
    artworkFileType: 'front_dtf_hat',
    options: [],
    variants: [
      { id: 24540, price: 2499, is_enabled: true, title: 'Navy / One Size', options: [] }
    ]
  }
];

module.exports = products;
