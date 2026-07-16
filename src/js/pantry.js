import { Modal } from 'bootstrap';
import { db } from './db/schema.js';
import * as PantryStore from './modules/pantry/PantryStore.js';

let addStockModal, consumeStockModal, productDetailModal;

document.addEventListener('DOMContentLoaded', async () => {
  addStockModal = new Modal(document.getElementById('addStockModal'));
  consumeStockModal = new Modal(document.getElementById('consumeStockModal'));
  productDetailModal = new Modal(document.getElementById('productDetailModal'));
  
  const urlParams = new URLSearchParams(window.location.search);
  const codeFromUrl = urlParams.get('code');
  const actionFromUrl = urlParams.get('action');
  if (codeFromUrl && actionFromUrl !== 'addStock') {
    document.getElementById("pantry-search").value = codeFromUrl;
    await loadPantry(codeFromUrl);
  } else {
    await loadPantry();
  }

  if (codeFromUrl && actionFromUrl === 'addStock') {
    addStockModal.show();
    document.getElementById('stock-product-search').value = codeFromUrl;
    setTimeout(searchProduct, 500);
  }

  document.getElementById('pantry-search').addEventListener('input', (e) => {
    loadPantry(e.target.value);
  });

  const scanPantryBtn = document.getElementById('scan-pantry-btn');
  if (scanPantryBtn) {
    scanPantryBtn.addEventListener('click', () => {
      window.location.href = "/scan.html?return=pantry.html";
    });
  }

  document.getElementById('btn-scan-stock')?.addEventListener('click', () => {
    window.location.href = "/scan.html?return=pantry.html&action=addStock";
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
      <div class="pantry-card d-flex justify-content-between align-items-center" style="cursor: pointer;" onclick="window.openProductDetail(event, '${item.productCode}', ${item.amount}, '${item.unit}')">
        <div class="me-3" style="flex: 1; min-width: 0;" title="${item.productName}">
          <h5 class="mb-1 text-wrap text-break">${item.productName}</h5>
          <small class="text-muted">${item.productCode}</small>
        </div>
        <div class="text-end" style="flex-shrink: 0;">
          <h4 class="mb-0 text-success">${item.amount} <small class="fs-6">${item.unit}</small></h4>
          <button class="btn btn-sm btn-outline-warning mt-2" onclick="event.stopPropagation(); window.openConsumeModal('${item.productCode}', '${item.productName?.replace(/'/g, "\\'")}', ${item.amount}, '${item.unit}')">Retirar</button>
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

window.openProductDetail = async function(event, code, amount, unit) {
  // Ignorar si se ha hecho clic en el botón de "Retirar"
  if (event.target.tagName === 'BUTTON' || event.target.closest('button')) {
    return;
  }
  
  const product = await db.products.get(code);
  const movements = await db.pantryLog.where('productCode').equals(code).reverse().sortBy('date');

  document.getElementById('detail-product-name').innerText = product && product.product_name ? product.product_name : 'Producto Desconocido';
  document.getElementById('detail-product-code').innerText = code;
  document.getElementById('detail-product-stock').innerText = `${amount} ${unit}`;

  let nutriscoreHtml = '';
  if (product) {
    if (product.nutriscore_grade) {
      let badgeClass = product.nutriscore_grade.toLowerCase() === 'a' || product.nutriscore_grade.toLowerCase() === 'b' ? 'bg-success' : (product.nutriscore_grade.toLowerCase() === 'e' ? 'bg-danger' : 'bg-warning text-dark');
      nutriscoreHtml += `<span class="badge ${badgeClass} me-2">Nutriscore: ${product.nutriscore_grade.toUpperCase()}</span>`;
    }
    if (product.nova_group) {
      let novaClass = product.nova_group <= 2 ? 'bg-success' : 'bg-danger';
      nutriscoreHtml += `<span class="badge ${novaClass}">Nova: ${product.nova_group}</span>`;
    }
  }
  document.getElementById('detail-nutriscore-nova').innerHTML = nutriscoreHtml;

  const nutritionList = document.getElementById('detail-nutrition-list');
  if (product && product['energy-kcal_100g'] !== undefined) {
    nutritionList.innerHTML = `
      <li class="list-group-item bg-dark text-white d-flex justify-content-between"><span>Calorías</span> <span>${product['energy-kcal_100g']} kcal</span></li>
      <li class="list-group-item bg-dark text-white d-flex justify-content-between"><span>Proteínas</span> <span>${product['proteins_100g'] || 0} g</span></li>
      <li class="list-group-item bg-dark text-white d-flex justify-content-between"><span>Carbohidratos</span> <span>${product['carbohydrates_100g'] || 0} g</span></li>
      <li class="list-group-item bg-dark text-white d-flex justify-content-between"><span>Grasas</span> <span>${product['fat_100g'] || 0} g</span></li>
    `;
  } else {
    nutritionList.innerHTML = `<li class="list-group-item bg-dark text-white text-muted">Datos nutricionales no disponibles</li>`;
  }

  const movementsList = document.getElementById('detail-movements-list');
  if (movements.length > 0) {
    const reasonLabels = {
      purchase: 'Compra',
      consumed_me: 'Consumido (Yo)',
      consumed_family: 'Consumido (Familia)',
      expired: 'Caducado',
      trashed: 'Tirado a la basura'
    };
    movementsList.innerHTML = movements.map(m => `
      <div class="list-group-item bg-dark text-white d-flex justify-content-between align-items-center">
        <div>
          <small class="text-muted">${new Date(m.date).toLocaleDateString()} ${new Date(m.date).toLocaleTimeString()}</small><br>
          ${reasonLabels[m.reason] || m.reason}
        </div>
        <span class="badge ${m.delta > 0 ? 'bg-success' : 'bg-danger'}">${m.delta > 0 ? '+' : ''}${m.delta}</span>
      </div>
    `).join('');
  } else {
    movementsList.innerHTML = `<div class="list-group-item bg-dark text-white text-muted">Sin movimientos registrados</div>`;
  }

  productDetailModal.show();
};

