import * as RecentStore from "./modules/products/RecentStore.js";
import * as ProductStore from "./modules/products/ProductStore.js";
import { Modal } from 'bootstrap';
import { db } from './db/schema.js';
import * as PantryStore from './modules/pantry/PantryStore.js';
import { showToast } from './modules/ui/UI.js';

let addStockModal, consumeStockModal, productDetailModal, moveZoneModal;
let currentZone = 'food'; // zona activa por defecto

export async function initView() {
  currentZone = 'food';
  document.querySelectorAll('#pantry-zone-tabs button').forEach(b => {
    b.classList.toggle('active', b.dataset.zone === 'food');
  });

  addStockModal = new Modal(document.getElementById('addStockModal'));
  consumeStockModal = new Modal(document.getElementById('consumeStockModal'));
  productDetailModal = new Modal(document.getElementById('productDetailModal'));

  const moveZoneEl = document.getElementById('moveZoneModal');
  if (moveZoneEl) {
    moveZoneModal = new Modal(moveZoneEl);
  }

  const urlParams = new URLSearchParams(window.location.hash.includes('?') ? window.location.hash.split('?')[1] : window.location.search);
  const codeFromUrl = urlParams.get('code');
  const actionFromUrl = urlParams.get('action');

  if (codeFromUrl && actionFromUrl === 'addStock') {
    window.history.replaceState({}, '', '/#pantry');
    addStockModal.show();
    resolveScannedCodeForStock(codeFromUrl);
  } else if (codeFromUrl) {
    document.getElementById("pantry-search").value = codeFromUrl;
    await loadPantry(codeFromUrl);
  } else {
    await loadPantry();
  }

  // Buscador filtro despensa
  document.getElementById('pantry-search').addEventListener('input', (e) => {
    loadPantry(e.target.value);
  });

  // Escáner general despensa
  const scanPantryBtn = document.getElementById('scan-pantry-btn');
  if (scanPantryBtn) {
    scanPantryBtn.addEventListener('click', () => {
      window.location.href = '/scan.html?return=%23pantry';
    });
  }

  // Escáner directo desde cabecera para añadir stock
  document.getElementById('btn-quick-scan-stock')?.addEventListener('click', () => {
    window.location.href = '/scan.html?return=%23pantry&action=addStock';
  });

  // Escáner dentro del modal Añadir Stock
  document.getElementById('btn-scan-stock')?.addEventListener('click', () => {
    window.location.href = '/scan.html?return=%23pantry&action=addStock';
  });

  // Limpiar selección de producto
  document.getElementById('btn-clear-selected-stock')?.addEventListener('click', clearSelectedProduct);

  // Limpiar formulario al cerrar modal
  document.getElementById('addStockModal')?.addEventListener('hidden.bs.modal', () => {
    clearSelectedProduct();
    document.getElementById('stock-product-results').innerHTML = '';
  });

  // Buscador del modal Añadir Stock (tiempo real + Enter)
  let stockSearchTimeout;
  document.getElementById('btn-search-stock-product').addEventListener('click', () => {
    clearTimeout(stockSearchTimeout);
    searchProduct();
  });
  const stockInput = document.getElementById('stock-product-search');
  stockInput.addEventListener('input', () => {
    clearTimeout(stockSearchTimeout);
    stockSearchTimeout = setTimeout(() => searchProduct(), 400);
  });
  stockInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(stockSearchTimeout);
      searchProduct();
    }
  });

  document.getElementById('btn-save-stock').addEventListener('click', saveStock);
  document.getElementById('btn-confirm-consume').addEventListener('click', confirmConsume);

  // Pestañas de zona
  document.querySelectorAll('#pantry-zone-tabs button').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('#pantry-zone-tabs button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentZone = btn.dataset.zone;
      await loadPantry(document.getElementById('pantry-search').value.trim());
    });
  });

  // Modal mover zona
  if (moveZoneEl) {
    document.getElementById('btn-move-to-food')?.addEventListener('click', async () => {
      const code = document.getElementById('move-zone-product-code').value;
      await PantryStore.moveToZone(code, 'food');
      moveZoneModal.hide();
      await loadPantry(document.getElementById('pantry-search').value.trim());
    });
    document.getElementById('btn-move-to-nonfood')?.addEventListener('click', async () => {
      const code = document.getElementById('move-zone-product-code').value;
      await PantryStore.moveToZone(code, 'nonfood');
      moveZoneModal.hide();
      await loadPantry(document.getElementById('pantry-search').value.trim());
    });
  }
}

async function loadPantry(query = '') {
  const items = await PantryStore.getPantryInventory(currentZone);
  const container = document.getElementById('pantry-list');
  const qTrim = query ? query.trim() : '';
  
  const filtered = qTrim 
    ? items.filter(i => i.productName.toLowerCase().includes(qTrim.toLowerCase()) || i.productCode.includes(qTrim))
    : items;

  if (filtered.length === 0) {
    const zoneLabel = currentZone === 'food' ? 'alimentos' : 'artículos no alimentarios';
    if (qTrim) {
      container.innerHTML = `
        <div class="col-12 text-center mt-4">
          <div class="card p-4 mx-auto border-secondary" style="max-width: 480px; background: rgba(255,255,255,0.04);">
            <i class="bi bi-box-seam fs-1 text-warning mb-2"></i>
            <h5>Sin existencias en la despensa</h5>
            <p class="text-muted small mb-3">No se encontraron ${zoneLabel} con la búsqueda "<strong>${qTrim}</strong>".</p>
            <button class="btn btn-primary" onclick="window.openAddStockForCode('${qTrim.replace(/'/g, "\\'")}')">
              <i class="bi bi-plus-lg me-1"></i> Añadir a mi Despensa
            </button>
          </div>
        </div>
      `;
    } else {
      container.innerHTML = `<div class="col-12 text-center mt-5"><p class="text-muted">Sin ${zoneLabel} en la despensa.</p></div>`;
    }
    return;
  }

  container.innerHTML = filtered.map(item => `
    <div class="col-12 col-md-6 col-xl-4 mb-3">
      <div class="pantry-card d-flex flex-column gap-2 h-100" style="cursor: pointer;" onclick="window.openProductDetail(event, '${item.productCode}', ${item.amount}, '${item.unit}')">
        <!-- Línea superior: Nombre del producto a todo el ancho y stock destacado -->
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div class="flex-grow-1 min-w-0" title="${item.productName}">
            <h5 class="mb-1 text-light fw-bold text-break lh-sm">${item.productName}</h5>
            <div class="text-muted small d-flex flex-wrap gap-2 align-items-center mt-1">
              <span>🏷️ ${item.productCode}</span>
              ${item.productQuantity ? `<span>· ${item.productQuantity}</span>` : ''}
              <span class="badge ${item.pantryZone === 'nonfood' ? 'bg-secondary' : 'bg-success bg-opacity-25 text-success'} border border-opacity-25">
                ${item.pantryZone === 'nonfood' ? '🧴 No alimento' : '🥦 Alimento'}
              </span>
              ${item.packageUnits ? `<span class="badge bg-info bg-opacity-10 text-info border border-info border-opacity-25">📦 ${item.packageUnits} uds/pack${item.unitWeight ? ` (~${item.unitWeight}g/ud)` : ''}</span>` : ''}
            </div>
          </div>
          <!-- Stock actual visible -->
          <div class="text-end flex-shrink-0 ms-2">
            <div class="fs-4 fw-bold text-success lh-1">${item.amount} <small class="fs-6 text-muted">${item.unit}</small></div>
          </div>
        </div>

        <!-- Línea inferior: Controles de ajuste rápido y botones de acción -->
        <div class="d-flex justify-content-between align-items-center pt-2 border-top border-secondary border-opacity-50 mt-auto flex-wrap gap-2">
          <div class="d-flex align-items-center gap-1">
            <button class="btn btn-sm btn-outline-secondary py-0 px-2 fw-bold" title="-100g / -1 ud" onclick="event.stopPropagation(); window.quickAdjust('${item.productCode}', -1, '${item.unit}')">−</button>
            <span class="text-muted small px-1">Rápido</span>
            <button class="btn btn-sm btn-outline-secondary py-0 px-2 fw-bold" title="+100g / +1 ud" onclick="event.stopPropagation(); window.quickAdjust('${item.productCode}', 1, '${item.unit}')">+</button>
          </div>
          <div class="d-flex gap-2">
            <button class="btn btn-sm btn-outline-info py-1 px-2" onclick="event.stopPropagation(); window.openMoveModal('${item.productCode}', '${item.productName?.replace(/'/g, "\\'")}')" title="Mover de zona">↔ Zona</button>
            <button class="btn btn-sm btn-outline-warning py-1 px-2" onclick="event.stopPropagation(); window.openConsumeModal('${item.productCode}', '${item.productName?.replace(/'/g, "\\'")}', ${item.amount}, '${item.unit}')" title="Detalles o retirar">Detalles / Retirar</button>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

let activeStockLookupPromise = null;

async function resolveScannedCodeForStock(code) {
  if (!code) return;
  document.getElementById('stock-product-search').value = code;
  const container = document.getElementById('stock-product-results');
  container.innerHTML = `
    <div class="list-group-item text-center py-3 text-info">
      <div class="spinner-border spinner-border-sm me-2" role="status"></div>
      Buscando producto en catálogo y Open Food Facts...
    </div>
  `;

  const btnSave = document.getElementById('btn-save-stock');
  if (btnSave) {
    btnSave.disabled = true;
    btnSave.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span> Obteniendo producto...';
  }

  activeStockLookupPromise = (async () => {
    try {
      const product = await ProductStore.getProductByCode(code);
      if (product) {
        await window.selectProduct(product.code, product.product_name, product);
      } else {
        renderUncataloguedProductUI(code);
      }
    } catch (err) {
      console.error('Error al resolver código:', err);
      renderUncataloguedProductUI(code);
    } finally {
      if (btnSave) {
        btnSave.disabled = false;
        btnSave.innerHTML = 'Añadir';
      }
      activeStockLookupPromise = null;
    }
  })();

  await activeStockLookupPromise;
}

function renderUncataloguedProductUI(code) {
  const container = document.getElementById('stock-product-results');
  container.innerHTML = `
    <div class="list-group-item list-group-item-warning p-3">
      <div class="d-flex align-items-center mb-2">
        <i class="bi bi-exclamation-triangle-fill text-warning me-2 fs-5"></i>
        <div>
          <strong>Producto no encontrado en catálogo</strong>
          <div class="text-muted small">Código: <code>${code}</code></div>
        </div>
      </div>
      <p class="small text-muted mb-2">No se encontró en Open Food Facts ni en tu base de datos. Asigna un nombre para añadirlo a tu despensa:</p>
      <div class="input-group input-group-sm">
        <input type="text" id="input-new-custom-name" class="form-control" placeholder="Ej: Leche desnatada, Manzanas..." value="Producto ${code}">
        <button class="btn btn-success" type="button" id="btn-create-custom-product">
          <i class="bi bi-check-lg"></i> Asignar
        </button>
      </div>
    </div>
  `;
  document.getElementById('btn-create-custom-product')?.addEventListener('click', async () => {
    const btnCreate = document.getElementById('btn-create-custom-product');
    if (btnCreate) {
      btnCreate.disabled = true;
      btnCreate.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span> Asignando...';
    }
    const inputEl = document.getElementById('input-new-custom-name');
    const name = inputEl ? inputEl.value.trim() || `Producto ${code}` : `Producto ${code}`;
    activeStockLookupPromise = window.createAndSelectCustomProduct(code, name);
    try {
      await activeStockLookupPromise;
    } finally {
      activeStockLookupPromise = null;
    }
  });
}

window.createAndSelectCustomProduct = async function(code, name) {
  const custom = await ProductStore.addCustomProduct({
    code: code,
    product_name: name,
    nutriscore_grade: 'unknown'
  });
  await window.selectProduct(custom.code, custom.product_name, custom);
};

window.openAddStockForCode = function(code) {
  addStockModal.show();
  resolveScannedCodeForStock(code);
};

async function searchProduct() {
  const query = document.getElementById('stock-product-search').value.trim();
  if (!query) {
    document.getElementById('stock-product-results').innerHTML = '';
    return;
  }

  const container = document.getElementById('stock-product-results');
  container.innerHTML = `
    <div class="list-group-item text-center py-2 text-info">
      <div class="spinner-border spinner-border-sm me-2" role="status"></div>
      Buscando...
    </div>
  `;

  const qLower = query.toLowerCase();
  const results = await ProductStore.searchProducts(qLower, 10);

  if (results.length === 0) {
    if (/^\d{4,16}$/.test(query)) {
      renderUncataloguedProductUI(query);
    } else {
      container.innerHTML = `
        <div class="list-group-item text-center text-muted small py-2">
          No se encontraron productos coincidentes.
        </div>
      `;
    }
    return;
  }

  // Si es un código numérico exacto y coincide exactamente el código
  const exactMatch = results.find(p => p.code === query || p.real_code === query);
  if (exactMatch && /^\d{4,16}$/.test(query)) {
    await window.selectProduct(exactMatch.code, exactMatch.product_name, exactMatch);
    return;
  }

  container.innerHTML = results.map(p => `
    <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
            onclick="window.selectProduct('${p.code}', '${(p.product_name || 'Sin nombre').replace(/'/g, "\\'")}')">
      <div class="text-truncate me-2 text-start">
        <strong>${p.product_name || 'Sin nombre'}</strong>
        ${p.brands ? `<small class="text-muted d-block">${p.brands}</small>` : ''}
      </div>
      <small class="text-muted text-nowrap">${p.code}</small>
    </button>
  `).join('');
}

window.selectProduct = async function(code, name, product = null) {
  document.getElementById('stock-product-selected').value = code;
  document.getElementById('stock-product-search').value = name || '';
  document.getElementById('stock-product-results').innerHTML = '';

  if (!product) {
    product = await ProductStore.getProductByCode(code);
  }

  const card = document.getElementById('stock-product-selected-card');
  const nameEl = document.getElementById('stock-selected-name');
  const detailsEl = document.getElementById('stock-selected-details');

  if (card && nameEl && detailsEl) {
    nameEl.textContent = name || product?.product_name || `Producto ${code}`;
    const details = [];
    if (product?.brands) details.push(product.brands);
    if (code) details.push(`Ref: ${code}`);
    if (product?.quantity) details.push(`Envase: ${product.quantity}`);
    detailsEl.textContent = details.join(' • ');
    card.classList.remove('d-none');
  }

  if (product) {
    suggestStockAmountAndUnit(product);
  }

  RecentStore.markAsUsed(code);
};

function suggestStockAmountAndUnit(product) {
  const amountInput = document.getElementById('stock-amount');
  const unitSelect = document.getElementById('stock-unit');
  if (!amountInput || !unitSelect) return;

  const qStr = (product.quantity || '').toLowerCase();
  const pq = parseFloat(product.product_quantity);

  if (qStr.includes('ml') || qStr.includes('cl') || qStr.includes('l')) {
    unitSelect.value = 'ml';
    if (!isNaN(pq) && pq > 0) {
      amountInput.value = pq < 10 && qStr.includes('l') ? pq * 1000 : pq;
    } else if (qStr.includes('1 l') || qStr.includes('1l')) {
      amountInput.value = 1000;
    }
  } else if (qStr.includes('kg') || qStr.includes('g')) {
    unitSelect.value = 'g';
    if (!isNaN(pq) && pq > 0) {
      amountInput.value = pq < 10 && qStr.includes('kg') ? pq * 1000 : pq;
    } else if (qStr.includes('1 kg') || qStr.includes('1kg')) {
      amountInput.value = 1000;
    }
  } else if (qStr.includes('ud') || qStr.includes('unid') || qStr.includes('pack')) {
    unitSelect.value = 'unidad';
    amountInput.value = 1;
  }
}

function clearSelectedProduct() {
  document.getElementById('stock-product-selected').value = '';
  document.getElementById('stock-product-search').value = '';
  const card = document.getElementById('stock-product-selected-card');
  if (card) card.classList.add('d-none');
  const btnSave = document.getElementById('btn-save-stock');
  if (btnSave) {
    btnSave.disabled = false;
    btnSave.innerHTML = 'Añadir';
  }
}

async function saveStock() {
  // Si hay una búsqueda activa en curso (ej. acabamos de volver de escanear), esperamos a que termine
  if (activeStockLookupPromise) {
    const btnSave = document.getElementById('btn-save-stock');
    if (btnSave) {
      btnSave.disabled = true;
      btnSave.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span> Añadiendo...';
    }
    await activeStockLookupPromise;
  }

  let code = document.getElementById('stock-product-selected').value;
  const amount = parseFloat(document.getElementById('stock-amount').value);
  const unit = document.getElementById('stock-unit').value;
  
  if (!code) {
    // Si se mostró la interfaz de producto no catalogado y el usuario escribió nombre directo:
    const uncataloguedInput = document.getElementById('input-new-custom-name');
    const searchVal = document.getElementById('stock-product-search').value.trim();
    if (uncataloguedInput && searchVal) {
      const customName = uncataloguedInput.value.trim() || `Producto ${searchVal}`;
      const custom = await ProductStore.addCustomProduct({
        code: searchVal,
        product_name: customName,
        nutriscore_grade: 'unknown'
      });
      code = custom.code;
    } else if (searchVal) {
      if (/^\d{4,16}$/.test(searchVal)) {
        const p = await ProductStore.getProductByCode(searchVal);
        if (p) {
          code = p.code;
        } else {
          await ProductStore.addCustomProduct({
            code: searchVal,
            product_name: `Producto ${searchVal}`,
            nutriscore_grade: 'unknown'
          });
          code = searchVal;
        }
      }
    }
  }

  if (!code) return showToast('Selecciona o busca un producto primero', 'warning');
  if (!amount || amount <= 0) return showToast('Cantidad inválida', 'warning');

  const packageUnitsInput = document.getElementById('stock-package-units');
  const packageUnits = packageUnitsInput && packageUnitsInput.value ? parseInt(packageUnitsInput.value, 10) : null;

  // El stock añadido manualmente respeta la zona activa
  await PantryStore.addStock(code, amount, unit, currentZone, packageUnits);
  showToast('Stock añadido correctamente a la despensa', 'success');
  
  addStockModal.hide();
  clearSelectedProduct();
  document.getElementById('add-stock-form').reset();
  if (packageUnitsInput) packageUnitsInput.value = '';
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

window.openMoveModal = function(code, name) {
  if (!moveZoneModal) return;
  document.getElementById('move-zone-product-code').value = code;
  document.getElementById('move-zone-product-name').textContent = name;
  moveZoneModal.show();
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
  
  const product = await ProductStore.getProductByCode(code);
  const movements = await db.pantryLog.where('productCode').equals(code).reverse().sortBy('date');

  document.getElementById('detail-product-name').innerText = product && product.product_name ? product.product_name : 'Producto Desconocido';
  
  let productQuantity = '';
  if (product) {
    productQuantity = product.quantity || (product.product_quantity ? product.product_quantity + 'g' : '');
  }
  document.getElementById('detail-product-code').innerText = code + (productQuantity ? ` - ${productQuantity}` : '');
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

  // Manejo de unidades por paquete y peso unitario estimado
  const pantryItem = await db.pantry.where('productCode').equals(code).first();
  const currentUnits = pantryItem?.packageUnits || product?.package_units || null;
  const currentWeight = pantryItem?.unitWeight || product?.unit_weight || null;

  const packageUnitsBadge = document.getElementById('detail-package-units-badge');
  const packageUnitsInput = document.getElementById('detail-input-package-units');
  const unitWeightHint = document.getElementById('detail-unit-weight-hint');

  if (packageUnitsBadge) {
    if (currentUnits) {
      packageUnitsBadge.className = 'badge bg-info text-dark';
      packageUnitsBadge.textContent = `${currentUnits} uds/pack${currentWeight ? ` (~${currentWeight}g/ud)` : ''}`;
    } else {
      packageUnitsBadge.className = 'badge bg-secondary';
      packageUnitsBadge.textContent = 'Sin definir';
    }
  }
  if (packageUnitsInput) {
    packageUnitsInput.value = currentUnits || '';
  }
  if (unitWeightHint) {
    if (currentUnits && currentWeight) {
      unitWeightHint.textContent = `Cada unidad equivale aprox. a ${currentWeight}g/ml para conversiones en recetas.`;
    } else {
      unitWeightHint.textContent = 'Indica cuántas unidades contiene el envase para poder descontarlo por unidades en las recetas.';
    }
  }

  const btnSaveUnits = document.getElementById('btn-save-detail-package-units');
  if (btnSaveUnits) {
    btnSaveUnits.onclick = async () => {
      const val = parseInt(packageUnitsInput.value, 10);
      if (!val || val <= 0) {
        showToast('Introduce un número de unidades válido', 'warning');
        return;
      }
      await PantryStore.updatePackageUnits(code, val);
      showToast('Unidades por paquete actualizadas', 'success');

      const updatedItem = await db.pantry.where('productCode').equals(code).first();
      if (packageUnitsBadge) {
        packageUnitsBadge.className = 'badge bg-info text-dark';
        packageUnitsBadge.textContent = `${val} uds/pack${updatedItem?.unitWeight ? ` (~${updatedItem.unitWeight}g/ud)` : ''}`;
      }
      if (unitWeightHint && updatedItem?.unitWeight) {
        unitWeightHint.textContent = `Cada unidad equivale aprox. a ${updatedItem.unitWeight}g/ml para conversiones en recetas.`;
      }
      await loadPantry(document.getElementById('pantry-search')?.value.trim() || '');
    };
  }

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

  // Enlace a OpenFoodFacts
  const extractedCode = code.startsWith('GENERIC_') ? code.replace(/^GENERIC_/, '') : code;
  const realCode = product?.real_code || (/^\d+$/.test(extractedCode) ? extractedCode : null);
  const offLink = document.getElementById('detail-off-link');
  if (offLink) {
    if (realCode && /^\d+$/.test(realCode)) {
      offLink.href = `https://world.openfoodfacts.org/product/${realCode}`;
      offLink.classList.remove('d-none');
    } else {
      offLink.classList.add('d-none');
    }
  }

  productDetailModal.show();
};

window.quickAdjust = async function(code, direction, unit) {
  // Ajustar 1 unidad o 100g dependiendo de la unidad
  let delta = (unit === 'g' || unit === 'ml') ? 100 : 1;
  delta *= direction;
  
  if (delta > 0) {
    await PantryStore.addStock(code, delta, unit, currentZone);
  } else {
    // Para consumo silencioso rápido
    await PantryStore.consumeStock(code, Math.abs(delta), 'consumed_me');
  }
  
  await loadPantry(document.getElementById('pantry-search').value.trim());
};
