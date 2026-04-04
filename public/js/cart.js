// ============================================
// YETI POOP SKI WAX — CART
// ============================================

let cart = JSON.parse(sessionStorage.getItem('ypsw_cart') || '[]');

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
  cart = cart.filter(i => i.variantId !== variantId);
  saveCart();
  renderCart();
}

function renderCart() {
  const itemsEl = document.getElementById('cart-items');
  const footerEl = document.getElementById('cart-footer');
  if (!itemsEl) return;

  if (!cart.length) {
    itemsEl.innerHTML = '<div class="cart-empty">Your cart is empty.</div>';
    if (footerEl) footerEl.style.display = 'none';
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

  const total = cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
  const totalEl = document.getElementById('cart-total');
  if (totalEl) totalEl.textContent = '$' + (total / 100).toFixed(2);
  if (footerEl) footerEl.style.display = 'block';
}

function openCart() {
  document.getElementById('cart-drawer')?.classList.add('open');
  document.getElementById('cart-overlay')?.classList.add('open');
  renderCart();
}

function closeCart() {
  document.getElementById('cart-drawer')?.classList.remove('open');
  document.getElementById('cart-overlay')?.classList.remove('open');
}

async function checkout() {
  if (!cart.length) return;
  const btn = document.querySelector('.cart-footer .btn-primary');
  if (btn) { btn.textContent = 'Loading...'; btn.disabled = true; }

  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cart })
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
