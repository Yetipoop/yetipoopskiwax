// ============================================
// YETI POOP SKI WAX — CART
// ============================================

let cart = JSON.parse(sessionStorage.getItem('ypsw_cart') || '[]');

// Active discount state
let appliedDiscount = null;
// { code, type, discountAmountCents, isFreeShipping, message }

function saveCart() {
  sessionStorage.setItem('ypsw_cart', JSON.stringify(cart));
  updateCartCount();
}

function updateCartCount() {
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  document.querySelectorAll('#cart-count').forEach(el => el.textContent = count);
}

function addItemToCart(item) {
  const existing = cart.find(i => i.variantId === item.variantId);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push(item);
  }
  saveCart();
  renderCart();
}

function removeFromCart(variantId) {
  cart = cart.filter(i => String(i.variantId) !== String(variantId));
  saveCart();
  renderCart();
}

function cartSubtotalCents() {
  return cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
}

function renderCart() {
  const itemsEl = document.getElementById('cart-items');
  const footerEl = document.getElementById('cart-footer');
  if (!itemsEl) return;

  if (!cart.length) {
    itemsEl.innerHTML = '<div class="cart-empty">Your cart is empty.</div>';
    if (footerEl) footerEl.style.display = 'none';
    appliedDiscount = null;
    return;
  }

  itemsEl.innerHTML = cart.map(item => `
    <div class="cart-item">
      <img class="cart-item-img" src="${item.image}" alt="${item.title}">
      <div style="flex:1;">
        <div class="cart-item-name">${item.title}</div>
        <div class="cart-item-variant">${item.variant}</div>
        <div class="cart-item-price">$${(item.price / 100).toFixed(2)} × ${item.quantity}</div>
      </div>
      <button onclick="removeFromCart('${item.variantId}')"
        style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.1rem;padding:0.25rem;">&times;</button>
    </div>
  `).join('');

  if (footerEl) footerEl.style.display = 'block';
  updateCartTotals();
}

function updateCartTotals() {
  const subtotalCents = cartSubtotalCents();
  const subtotalEl = document.getElementById('cart-subtotal-display');
  const subtotalRowEl = document.getElementById('cart-subtotal-row');
  const discountRowEl = document.getElementById('cart-discount-row');
  const discountLabelEl = document.getElementById('cart-discount-label');
  const discountDisplayEl = document.getElementById('cart-discount-display');
  const totalEl = document.getElementById('cart-total');

  if (appliedDiscount && (appliedDiscount.discountAmountCents > 0 || appliedDiscount.isFreeShipping)) {
    const discountCents = appliedDiscount.discountAmountCents || 0;
    const netCents = Math.max(0, subtotalCents - discountCents);

    if (subtotalRowEl) { subtotalRowEl.style.display = 'flex'; }
    if (subtotalEl) subtotalEl.textContent = '$' + (subtotalCents / 100).toFixed(2);

    if (discountRowEl) { discountRowEl.style.display = 'flex'; }
    if (discountLabelEl) {
      discountLabelEl.textContent = appliedDiscount.isFreeShipping
        ? 'Free Shipping'
        : `Discount (${appliedDiscount.code})`;
    }
    if (discountDisplayEl) {
      discountDisplayEl.textContent = appliedDiscount.isFreeShipping
        ? 'Applied'
        : '-$' + (discountCents / 100).toFixed(2);
    }
    if (totalEl) totalEl.textContent = '$' + (netCents / 100).toFixed(2);
  } else {
    if (subtotalRowEl) subtotalRowEl.style.display = 'none';
    if (discountRowEl) discountRowEl.style.display = 'none';
    if (totalEl) totalEl.textContent = '$' + (subtotalCents / 100).toFixed(2);
  }
}

// ── DISCOUNT CODE ──────────────────────────────────────────────────────────

async function applyDiscount() {
  const inputEl = document.getElementById('discount-input');
  const msgEl = document.getElementById('discount-msg');
  const appliedRowEl = document.getElementById('discount-applied-row');
  const appliedLabelEl = document.getElementById('discount-applied-label');

  if (!inputEl || !msgEl) return;
  const code = inputEl.value.trim().toUpperCase();
  if (!code) return;

  msgEl.style.color = 'rgba(255,252,227,0.5)';
  msgEl.textContent = 'Checking…';

  try {
    const subtotalCents = cartSubtotalCents();
    const res = await fetch('/api/discount/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, cartTotalCents: subtotalCents })
    });
    const data = await res.json();

    if (data.valid) {
      appliedDiscount = {
        code,
        type: data.type,
        discountAmountCents: data.discountAmountCents || 0,
        isFreeShipping: data.isFreeShipping || false,
        message: data.message
      };
      msgEl.textContent = '';
      if (appliedRowEl) {
        appliedRowEl.style.display = 'flex';
        if (appliedLabelEl) appliedLabelEl.textContent = data.message;
      }
      // Hide input row, show applied state
      const inputRowEl = document.getElementById('discount-input-row');
      if (inputRowEl) inputRowEl.style.display = 'none';
      updateCartTotals();
    } else {
      appliedDiscount = null;
      msgEl.style.color = '#e08080';
      msgEl.textContent = data.message || 'Invalid code.';
      updateCartTotals();
    }
  } catch (e) {
    msgEl.style.color = '#e08080';
    msgEl.textContent = 'Could not validate code. Please try again.';
  }
}

function removeDiscount() {
  appliedDiscount = null;
  const inputEl = document.getElementById('discount-input');
  const msgEl = document.getElementById('discount-msg');
  const appliedRowEl = document.getElementById('discount-applied-row');
  const inputRowEl = document.getElementById('discount-input-row');

  if (inputEl) inputEl.value = '';
  if (msgEl) msgEl.textContent = '';
  if (appliedRowEl) appliedRowEl.style.display = 'none';
  if (inputRowEl) inputRowEl.style.display = 'flex';
  updateCartTotals();
}

// ── CART OPEN / CLOSE ──────────────────────────────────────────────────────

function openCart() {
  document.getElementById('cart-drawer')?.classList.add('open');
  document.getElementById('cart-overlay')?.classList.add('open');
  renderCart();
}

function closeCart() {
  document.getElementById('cart-drawer')?.classList.remove('open');
  document.getElementById('cart-overlay')?.classList.remove('open');
}

// ── CHECKOUT ───────────────────────────────────────────────────────────────

async function checkout() {
  if (!cart.length) return;
  const btn = document.querySelector('.cart-footer .btn-primary');
  if (btn) { btn.textContent = 'Loading...'; btn.disabled = true; }

  try {
    const body = { items: cart };
    if (appliedDiscount?.code) body.discountCode = appliedDiscount.code;

    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert('Something went wrong. Please try again.');
      if (btn) { btn.textContent = 'Checkout'; btn.disabled = false; }
    }
  } catch (e) {
    alert('Something went wrong. Please try again.');
    if (btn) { btn.textContent = 'Checkout'; btn.disabled = false; }
  }
}

// Init
updateCartCount();
