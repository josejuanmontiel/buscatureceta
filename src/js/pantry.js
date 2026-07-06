import { Modal } from 'bootstrap';
import { db } from './db/schema.js';
import * as PantryStore from './modules/pantry/PantryStore.js';

let addStockModal, consumeStockModal;

document.addEventListener('DOMContentLoaded', async () => {
  addStockModal = new Modal(document.getElementById('addStockModal'));
  consumeStockModal = new Modal(document.getElementById('consumeStockModal'));
  
  await loadPantry();

  document.getElementById('pantry-search').addEventListener('input', (e) => {
    loadPantry(e.target.value);
  });

  document.getElementById('btn-search-stock-product').addEventListener('click', searchProduct);
  document.getElementById('btn-save-stock').addEventListener('click', saveStock);
  document.getElementById('btn-confirm-consume').addEventListener('click', confirmConsume);
});

async function loadPantry(query = '') {
  const items = await PantryStore.getPantryInventory();
  const container = document.getElementById('pantry-list');
  
  const filtered = query 
    ? items.filter(i => i.productName.toLowerCase().includes(query.toLowerCase()) || i.productCode.includes(query))
    : items;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="col-12 text-center mt-5"><p class="text-muted">La despensa está vacía.</p></div>`;
    return;
  }

  container.innerHTML = filtered.map(item => `
    <div class="col-md-6 col-lg-4">
      <div class="pantry-card d-flex justify-content-between align-items-center">
        <div class="text-truncate me-3" style="max-width: 60%;" title="${item.productName}">
          <h5 class="mb-1">${item.productName}</h5>
          <small class="text-muted">${item.productCode}</small>
        </div>
        <div class="text-end">
          <h4 class="mb-0 text-success">${item.amount} <small class="fs-6">${item.unit}</small></h4>
          <button class="btn btn-sm btn-outline-warning mt-2" onclick="window.openConsumeModal('${item.productCode}', '${item.productName?.replace(/'/g, "\\'")}', ${item.amount}, '${item.unit}')">Retirar</button>
        </div>
      </div>
    </div>
  `).join('');
}

async function searchProduct() {
  const query = document.getElementById('stock-product-search').value.trim();
  if (!query) return;

  const qLower = query.toLowerCase();
  const results = await db.products
    .filter(p => p.product_name && p.product_name.toLowerCase().includes(qLower) || p.code === query)
    .limit(10)
    .toArray();

  const container = document.getElementById('stock-product-results');
  container.innerHTML = results.map(p => `
    <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
            onclick="window.selectProduct('${p.code}', '${p.product_name?.replace(/'/g, "\\'")}')">
      ${p.product_name || 'Sin nombre'} <small class="text-muted">${p.code}</small>
    </button>
  `).join('');
}

window.selectProduct = function(code, name) {
  document.getElementById('stock-product-selected').value = code;
  document.getElementById('stock-product-search').value = name;
  document.getElementById('stock-product-results').innerHTML = '';
};

async function saveStock() {
  const code = document.getElementById('stock-product-selected').value;
  const amount = parseFloat(document.getElementById('stock-amount').value);
  const unit = document.getElementById('stock-unit').value;
  
  if (!code) return alert('Selecciona un producto primero');
  if (!amount || amount <= 0) return alert('Cantidad inválida');

  await PantryStore.addStock(code, amount, unit);
  
  addStockModal.hide();
  document.getElementById('add-stock-form').reset();
  await loadPantry();
}

window.openConsumeModal = function(code, name, maxAmount, unit) {
  document.getElementById('consume-product-code').value = code;
  document.getElementById('consume-product-name').innerText = name;
  document.getElementById('consume-product-stock').innerText = `${maxAmount} ${unit}`;
  
  const amountInput = document.getElementById('consume-amount');
  amountInput.max = maxAmount;
  amountInput.value = maxAmount;

  consumeStockModal.show();
};

async function confirmConsume() {
  const code = document.getElementById('consume-product-code').value;
  const reason = document.getElementById('consume-reason').value;
  const amount = parseFloat(document.getElementById('consume-amount').value);
  
  if (!code || !amount || amount <= 0) return;

  await PantryStore.consumeStock(code, amount, reason);
  
  consumeStockModal.hide();
  await loadPantry();
}
