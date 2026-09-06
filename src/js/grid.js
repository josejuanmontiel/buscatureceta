import * as RecentStore from "./modules/products/RecentStore.js";
import * as ProductStore from "./modules/products/ProductStore.js";
import { db, migrateFromLegacyDB } from './db/schema.js';
import * as CartStore from './modules/cart/CartStore.js';
import * as ShoppingAssistant from './modules/insights/ShoppingAssistant.js';
import * as ShoppingStore from './modules/shopping/ShoppingStore.js';
import {
    saveImageToPendingUploads,
    saveMetadataToPendingUploads,
    updateUpload,
    getUploadsByBarcode,
    deletePendingUpload,
    countPendingUploads,
    getOffStats
} from './api/openFoodFacts.js';
import { ImageCropper } from './modules/ui/ImageCropper.js';
import { Modal } from 'bootstrap';
import { showToast, confirmModal, triggerScanFeedback } from './modules/ui/UI.js';

let currentScannedProduct = null;
let capturedImageBlob = null;
let originalImageBlob = null;
let cropperInstance = null;
let currentEditingUploadId = null;
let currentCropConfig = null;
let unknownBarcode = null;

let currentCartTicketBlob = null;
let currentCartTicketThumbBlob = null;
let quickTicketBlob = null;
let quickTicketThumbBlob = null;

// Expose to allow Playwright tests to wait for product to be loaded
Object.defineProperty(window, 'currentScannedProduct', {
    get: () => currentScannedProduct,
    configurable: true
});


// Inicialización
export async function initView() {
    await migrateFromLegacyDB().catch(console.error);
    await updateCartUI();
    await updateShoppingListUI();
    
    // Cargar ticket pendiente persistido en IndexedDB si existe
    const pendingTicket = await CartStore.getPendingCartTicket();
    if (pendingTicket) {
        currentCartTicketBlob = pendingTicket.blob;
        currentCartTicketThumbBlob = pendingTicket.thumbBlob;
    } else {
        currentCartTicketBlob = null;
        currentCartTicketThumbBlob = null;
    }
    updateCartTicketUI();
    initTicketHandlers();

    document.getElementById('btn-close-shopping-list')?.addEventListener('click', async () => {
        const activeList = await ShoppingStore.getActiveList();
        if (activeList) {
            await ShoppingStore.archiveList(activeList.id);
            await updateShoppingListUI();
        }
    });

    document.getElementById("query-btn")?.addEventListener("click", handleSearch);
    document.getElementById("code-input")?.addEventListener("keypress", (e) => {
        if (e.key === 'Enter') handleSearch();
    });
    
    document.getElementById("btn-add-cart")?.addEventListener("click", handleAddToCart);
    document.getElementById("btn-checkout")?.addEventListener("click", handleCheckout);
    document.getElementById("scan-btn")?.addEventListener("click", () => {
        window.location.href = '/scan.html?return=%23grid';
    });

    // Botón para abrir modal de alta manual / a granel (Frutería)
    document.getElementById("btn-manual-bulk")?.addEventListener("click", openManualBulkModal);
    initManualBulkHandlers();

    document.getElementById("clear-db-btn")?.addEventListener("click", async () => {
        await db.delete();
        await db.open();
        console.log("Base de datos borrada con éxito.");
    });

    // Botones del panel de captura de foto y recorte OFF
    document.getElementById('btn-capture-photo')?.addEventListener('click', startCapture);
    document.getElementById('btn-take-snapshot')?.addEventListener('click', takeSnapshot);
    document.getElementById('btn-close-camera')?.addEventListener('click', stopCamera);
    document.getElementById('btn-upload-file')?.addEventListener('click', () => {
        document.getElementById('unknown-file-input')?.click();
    });
    document.getElementById('unknown-file-input')?.addEventListener('change', handleFileSelected);
    document.getElementById('btn-apply-crop')?.addEventListener('click', handleApplyCrop);
    document.getElementById('btn-skip-crop')?.addEventListener('click', handleSkipCrop);
    document.getElementById('btn-recrop-photo')?.addEventListener('click', handleReCrop);
    document.getElementById('btn-retake-photo')?.addEventListener('click', () => {
        resetCropAndCaptureNew();
    });
    document.getElementById('btn-crop-rotate')?.addEventListener('click', () => {
        if (cropperInstance) cropperInstance.rotateClockwise();
    });
    document.getElementById('btn-crop-reset')?.addEventListener('click', () => {
        if (cropperInstance) cropperInstance.resetCrop();
    });
    document.getElementById('crop-aspect-group')?.addEventListener('click', handleAspectClick);
    document.getElementById('btn-add-new-photo-for-code')?.addEventListener('click', () => {
        resetCropAndCaptureNew();
    });
    document.getElementById('btn-save-photo')?.addEventListener('click', handleSaveUnknownProduct);
    document.getElementById('btn-cancel-capture')?.addEventListener('click', hideUnknownPanel);

    // Mostrar badge inicial si existe en esta vista y actualizar banner de cola
    await updateSyncBadge();
    await updateCartOffBanner();

    // Leer parámetro URL si venimos del scanner
    const urlParams = new URLSearchParams(window.location.hash.includes('?') ? window.location.hash.split('?')[1] : window.location.search);
    const codeFromUrl = urlParams.get('code');
    if (codeFromUrl) {
        const cleanHash = window.location.hash.split('?')[0];
        window.history.replaceState({}, '', window.location.pathname + cleanHash);
        document.getElementById("code-input").value = codeFromUrl;
        handleSearch();
    }
}

function showUnknownBarcodeModal(barcode) {
    const modalEl = document.getElementById('modal-unknown-barcode');
    if (!modalEl) {
        addUnknownProductToCart(barcode);
        return;
    }
    const displayEl = document.getElementById('unknown-barcode-display');
    if (displayEl) displayEl.textContent = barcode;

    const modal = Modal.getOrCreateInstance(modalEl);

    const btnRescan = document.getElementById('btn-unknown-rescan');
    if (btnRescan) {
        btnRescan.onclick = () => {
            modal.hide();
            document.getElementById('code-input').value = '';
            window.location.href = '/scan.html?return=%23grid';
        };
    }

    const btnAdd = document.getElementById('btn-unknown-add-generic');
    if (btnAdd) {
        btnAdd.onclick = async () => {
            modal.hide();
            await addUnknownProductToCart(barcode);
        };
    }

    const btnCancel = document.getElementById('btn-unknown-cancel');
    if (btnCancel) {
        btnCancel.onclick = () => {
            modal.hide();
            document.getElementById('code-input').value = '';
        };
    }

    modal.show();
}

async function addUnknownProductToCart(query) {
    const isNumeric = /^\d+$/.test(query);
    const genericCode = isNumeric ? `GENERIC_${query}` : 'GENERIC_' + Date.now();
    const realBarcode = isNumeric ? query : null;

    await ProductStore.addCustomProduct({
        code: genericCode,
        real_code: realBarcode,
        product_name: isNumeric ? 'Producto ' + query : query,
        ingredients_text: '',
        nutriscore_grade: 'unknown'
    });
    // Añadir al carro directamente
    await CartStore.addToCart(genericCode, 1, 0, 'unidad');
    triggerScanFeedback();
    document.getElementById('code-input').value = '';
    await updateCartUI();
}

async function handleSearch() {
    let query = document.getElementById("code-input").value.trim();
    if (!query) return;

    const btn = document.getElementById("query-btn");
    const spinner = document.getElementById("search-spinner");
    btn.disabled = true;
    spinner.classList.remove("d-none");

    try {
        // Si no es un número (código), buscar por nombre en local
        if (!/^\d+$/.test(query)) {
            const res = await ProductStore.searchProducts(query, 1);
            const p = res.length > 0 ? res[0] : null;
            if (p) {
                query = p.code;
            } else {
                // Producto desconocido por texto, añadir como genérico al instante
                const genericCode = 'GENERIC_' + Date.now();
                await ProductStore.addCustomProduct({
                    code: genericCode,
                    product_name: query,
                    ingredients_text: '',
                    nutriscore_grade: 'unknown'
                });
                query = genericCode;
            }
        }

        const result = await ShoppingAssistant.analyzeProductForCart(query);
        
        if (result.status === 'not_found') {
            const isNumeric = /^\d+$/.test(query);
            if (isNumeric) {
                showUnknownBarcodeModal(query);
                return;
            }
            await addUnknownProductToCart(query);
            return;
        }

        // Si se encuentra, añadir directamente al carro
        currentScannedProduct = result.product;
        await CartStore.addToCart(result.product.code, 1, result.lastPrice || 0, 'unidad', result.product.package_units || null);
        RecentStore.markAsUsed(result.product.code);
        triggerScanFeedback();

        // Marcar en la lista de compra activa
        const activeList = await ShoppingStore.getActiveList();
        if (activeList) {
            const changed = await ShoppingStore.checkItem(activeList.id, result.product.code) || 
                            await ShoppingStore.checkItem(activeList.id, result.product.product_name);
            if (changed) await updateShoppingListUI();
        }

        // Limpiar input y refrescar UI
        document.getElementById('code-input').value = '';
        await updateCartUI();

        // Mostrar advertencias del asistente si las hay (pero el producto ya está en el carro)
        showProductWarnings(result);
    } finally {
        btn.disabled = false;
        spinner.classList.add("d-none");
    }
}

function showProductWarnings(analysis) {
    // Alertas
    const alertDiv = document.getElementById('assistant-alert');
    const warningText = document.getElementById('assistant-warning-text');
    const altsDiv = document.getElementById('assistant-alternatives');

    if (analysis.status === 'warning') {
        warningText.innerHTML = analysis.warnings.join('<br>');
        
        if (analysis.alternatives.length > 0) {
            altsDiv.innerHTML = analysis.alternatives.map(alt => `
                <button type="button" class="list-group-item list-group-item-action list-group-item-success" onclick="window.selectAlternative('${alt.code}')">
                    ${alt.product_name} <small>(${alt.nutriscore_grade ? alt.nutriscore_grade.toUpperCase() : '?'})</small>
                </button>
            `).join('');
        } else {
            altsDiv.innerHTML = '<div class="text-muted small">No se encontraron alternativas locales sin esos ingredientes.</div>';
        }
        
        alertDiv.classList.remove('d-none');
    } else {
        alertDiv.classList.add('d-none');
    }
}

window.selectAlternative = async function(code) {
    document.getElementById('code-input').value = code;
    await handleSearch();
};

// El panel ya no se usa para rellenar datos, el producto va directo al carro
async function handleAddToCart() {
    document.getElementById('add-to-cart-panel').classList.add('d-none');
}

async function updateCartUI() {
    const { items, total } = await CartStore.getCart();
    
    const totalEl = document.getElementById('cart-total');
    if (totalEl) totalEl.innerText = `${total.toFixed(2)} €`;

    const hasOFF = localStorage.getItem('off_user') && localStorage.getItem('off_user') !== 'off';

    const list = document.getElementById('cart-list');
    if (!list) return;

    if (items.length === 0) {
        list.innerHTML = '<div class="list-group-item bg-dark text-muted border-secondary text-center">Carro vacío</div>';
    } else {
        list.innerHTML = items.map(item => {
            const isGeneric = item.productCode.startsWith('GENERIC_');
            const showOFFButton = isGeneric && hasOFF;
            const lineTotal = ((item.price || 0) * (item.amount || 0)).toFixed(2);
            const safeProductName = (item.productName || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            return `
            <div class="list-group-item bg-dark text-white border-secondary d-flex flex-column gap-2">
                <div class="d-flex justify-content-between align-items-center gap-2">
                    <div class="d-flex align-items-center gap-1 text-truncate me-1 flex-grow-1 min-w-0" id="cart-name-wrapper-${item.id}">
                        <h6 class="mb-0 text-truncate ${isGeneric ? 'text-warning' : 'text-info'}" style="cursor:pointer;" onclick="window.showProductQuickDetail('${item.productCode}', '${safeProductName}')" id="cart-name-display-${item.id}">${item.productName}</h6>
                        <button class="btn btn-sm btn-outline-secondary border-0 py-0 px-1 flex-shrink-0 btn-rename-cart-item" onclick="window.startRenameCartItem(${item.id}, '${safeProductName}')" title="Renombrar producto" aria-label="Renombrar producto">✏️</button>
                        <span class="badge bg-secondary text-white-50 flex-shrink-0" id="cart-line-total-${item.id}" style="font-size:0.75rem;">${lineTotal} €</span>
                    </div>
                    <div class="d-flex gap-2 flex-shrink-0">
                        ${showOFFButton ? `<button class="btn btn-sm btn-outline-info" onclick="window.triggerOFFUpload('${item.productCode}')" title="Subir foto a OpenFoodFacts"><i class="bi bi-camera"></i> OFF</button>` : ''}
                        <button class="btn btn-sm btn-outline-danger" onclick="window.removeFromCart(${item.id})"><i class="bi bi-trash"></i></button>
                    </div>
                </div>
                <div class="d-flex align-items-center w-100 gap-2 flex-wrap" id="cart-item-${item.id}">
                    <div class="input-group input-group-sm" style="flex: 1 1 120px;">
                        <input type="number" class="form-control bg-dark text-white border-secondary cart-amount-input" value="${item.amount}" min="0" step="any" onchange="window.updateCartItem(${item.id})" oninput="window.updateCartItem(${item.id})">
                        <select class="form-select bg-secondary text-white border-secondary cart-unit-select" style="max-width: 75px;" onchange="window.updateCartItem(${item.id})">
                            <option value="kg" ${item.unit === 'kg' ? 'selected' : ''}>kg</option>
                            <option value="g" ${item.unit === 'g' ? 'selected' : ''}>g</option>
                            <option value="unidad" ${item.unit === 'unidad' || !item.unit ? 'selected' : ''}>ud</option>
                            <option value="pack" ${item.unit === 'pack' ? 'selected' : ''}>pack</option>
                            <option value="l" ${item.unit === 'l' ? 'selected' : ''}>l</option>
                            <option value="ml" ${item.unit === 'ml' ? 'selected' : ''}>ml</option>
                        </select>
                    </div>
                    <div class="input-group input-group-sm" style="flex: 1 1 90px;">
                        <input type="number" class="form-control bg-dark text-white border-secondary cart-price-input" value="${item.price}" min="0" step="0.01" onchange="window.updateCartItem(${item.id})" oninput="window.updateCartItem(${item.id})">
                        <span class="input-group-text bg-secondary text-white border-secondary">€</span>
                    </div>
                    <div class="input-group input-group-sm" style="flex: 1 1 90px;" title="Unidades por paquete (opcional)">
                        <input type="number" class="form-control bg-dark text-white border-secondary cart-pack-units-input" value="${item.packageUnits || ''}" placeholder="Uds/pack" min="1" step="1" onchange="window.updateCartItem(${item.id})">
                        <span class="input-group-text bg-secondary text-white-50 border-secondary small py-0 px-1">uds</span>
                    </div>
                </div>
            </div>
        `}).join('');
    }
}

async function updateShoppingListUI() {
    const activeList = await ShoppingStore.getActiveList();
    const container = document.getElementById('active-shopping-list-container');
    const pendingList = document.getElementById('shopping-list-pending');
    const checkedList = document.getElementById('shopping-list-checked');
    const title = document.getElementById('shopping-list-title');

    if (!container) return;

    if (!activeList) {
        container.classList.add('d-none');
        return;
    }

    container.classList.remove('d-none');
    if (title) title.textContent = `🛒 ${activeList.name || 'Lista Activa'}`;

    const pendingItems = activeList.items.filter(i => !i.checked);
    const checkedItems = activeList.items.filter(i => i.checked);

    pendingList.innerHTML = pendingItems.map((item, index) => `
        <div class="list-group-item bg-dark text-white border-secondary d-flex justify-content-between align-items-center">
            <span>
                <i class="bi bi-circle text-muted me-2" style="cursor:pointer;" onclick="window.toggleShoppingItem(${activeList.id}, '${item.code || item.name}')"></i>
                ${item.code
                  ? `<span class="text-info" style="cursor:pointer;" onclick="window.showProductQuickDetail('${item.code}', '${item.name?.replace(/'/g, "\\'")}')"> ${item.name}</span>`
                  : item.name
                } <small class="text-muted">x${item.amount || 1} ${item.unit || ''}</small>
            </span>
        </div>
    `).join('');

    checkedList.innerHTML = checkedItems.map((item, index) => `
        <div class="list-group-item bg-dark text-muted border-secondary d-flex justify-content-between align-items-center">
            <span>
                <i class="bi bi-check-circle-fill text-success me-2"></i>
                <del>${item.code
                  ? `<span class="text-info" style="cursor:pointer;" onclick="window.showProductQuickDetail('${item.code}', '${item.name?.replace(/'/g, "\\'")}')"> ${item.name}</span>`
                  : item.name
                }</del> <small>x${item.amount || 1} ${item.unit || ''}</small>
            </span>
        </div>
    `).join('');
}

window.toggleShoppingItem = async function(listId, codeOrName) {
    await ShoppingStore.checkItem(listId, codeOrName);
    await updateShoppingListUI();
};

window.triggerOFFUpload = async function(code) {
    capturedImageBlob = null;
    originalImageBlob = null;
    currentEditingUploadId = null;
    currentCropConfig = null;
    const p = await ProductStore.getProductByCode(code);
    const barcodeToUse = p?.real_code || (code.startsWith('GENERIC_') ? code.replace(/^GENERIC_/, '') : code);
    unknownBarcode = barcodeToUse;
    await showUnknownProductPanel(barcodeToUse);
    if (p && document.getElementById('unknown-product-name')) {
        document.getElementById('unknown-product-name').value = p.product_name.replace(/^Producto /, '');
    }
    document.getElementById('unknown-product-panel')?.scrollIntoView({ behavior: 'smooth' });
};

window.updateCartItem = async function(id) {
    const container = document.getElementById(`cart-item-${id}`);
    if (!container) return;
    const amountVal = container.querySelector('.cart-amount-input')?.value;
    const priceVal = container.querySelector('.cart-price-input')?.value;
    const amount = parseFloat(amountVal) || 0;
    const price = parseFloat(priceVal) || 0;
    const unitSelect = container.querySelector('.cart-unit-select');
    const unit = unitSelect ? unitSelect.value : undefined;
    const packUnitsInput = container.querySelector('.cart-pack-units-input');
    const packageUnits = packUnitsInput ? (parseInt(packUnitsInput.value, 10) || null) : undefined;

    // Actualizar badge de subtotal de línea sin re-renderizar todo el DOM
    const lineBadge = document.getElementById(`cart-line-total-${id}`);
    if (lineBadge) {
        lineBadge.textContent = `${(amount * price).toFixed(2)} €`;
    }

    await CartStore.updateCartItem(id, amount, price, unit, packageUnits);

    // Actualizar total general sin destruir los inputs ni perder foco
    const { total } = await CartStore.getCart();
    const totalEl = document.getElementById('cart-total');
    if (totalEl) totalEl.innerText = `${total.toFixed(2)} €`;
};

window.removeFromCart = async function(id) {
    await CartStore.removeFromCart(id);
    await updateCartUI();
};

/**
 * Muestra un input inline para renombrar un producto genérico del carrito.
 * Útil para frutas/verduras pesadas que tienen código de barras pero nombre genérico.
 */
window.startRenameCartItem = function(id, currentName) {
    const wrapper = document.getElementById(`cart-name-wrapper-${id}`);
    if (!wrapper) return;
    // Evitar doble activación
    if (wrapper.querySelector('.cart-rename-input')) return;
    wrapper.innerHTML = `
        <div class="input-group input-group-sm flex-grow-1">
            <input type="text" class="form-control bg-dark text-warning border-warning cart-rename-input"
                   id="cart-rename-input-${id}"
                   value="${currentName.replace(/&quot;/g, '"')}"
                   placeholder="Nombre del producto"
                   maxlength="80"
                   onkeydown="if(event.key==='Enter'){window.confirmRenameCartItem(${id});}else if(event.key==='Escape'){window.updateCartUI();}"
            >
            <button class="btn btn-warning btn-sm" onclick="window.confirmRenameCartItem(${id})" title="Guardar nombre"><i class="bi bi-check-lg"></i></button>
            <button class="btn btn-outline-secondary btn-sm" onclick="window.updateCartUI()" title="Cancelar"><i class="bi bi-x-lg"></i></button>
        </div>
    `;
    const input = document.getElementById(`cart-rename-input-${id}`);
    if (input) { input.focus(); input.select(); }
};

/**
 * Confirma el renombre: actualiza customProducts con el nuevo nombre y refresca el carrito.
 */
window.confirmRenameCartItem = async function(id) {
    const input = document.getElementById(`cart-rename-input-${id}`);
    if (!input) return;
    const newName = input.value.trim();
    if (!newName) { showToast('El nombre no puede estar vacío', 'warning'); return; }

    // Obtener el productCode del item del carrito
    const { items } = await CartStore.getCart();
    const cartItem = items.find(i => i.id === id);
    if (!cartItem) return;

    // Actualizar el nombre en customProducts
    await ProductStore.updateCustomProduct(cartItem.productCode, { product_name: newName });
    const existingOfficial = await db.products.get(cartItem.productCode);
    if (existingOfficial) {
        await db.products.update(cartItem.productCode, { product_name: newName });
    }

    // Encolar contribución comunitaria a OFF si tiene código de barras numérico
    const cleanBarcode = cartItem.productCode.replace(/^GENERIC_/, '');
    if (/^\d{8,14}$/.test(cleanBarcode)) {
        await saveMetadataToPendingUploads(cleanBarcode, {
            product_name: newName,
            lang: 'es'
        }, newName);
        await updateSyncBadge();
    }

    showToast(`✅ Renombrado: ${newName}`, 'success');
    await updateCartUI();
};

// ─────────────────────────────────────────────────────────────────────────────
// Alta Manual / A Granel (Frutería / Sin Códigos)
// ─────────────────────────────────────────────────────────────────────────────

function openManualBulkModal() {
    const modalEl = document.getElementById('modal-manual-bulk');
    if (!modalEl) return;
    
    // Reset form
    document.getElementById('form-manual-bulk').reset();
    document.getElementById('bulk-selected-code').value = '';
    document.getElementById('bulk-selected-source').value = '';
    document.getElementById('bulk-selected-category').value = '';
    document.getElementById('bulk-amount').value = '1';
    document.getElementById('bulk-unit').value = 'kg';
    const unitLabel = document.getElementById('bulk-unit-label');
    if (unitLabel) unitLabel.textContent = 'kg';
    document.getElementById('bulk-unit-price').value = '';
    document.getElementById('bulk-total-price').value = '';
    document.getElementById('bulk-save-custom').checked = true;
    document.getElementById('bulk-zone').value = 'food';
    document.getElementById('bulk-nutriscore').value = 'a';
    // Limpiar resultados de búsqueda previos
    const resultsContainer = document.getElementById('bulk-product-results');
    if (resultsContainer) { resultsContainer.innerHTML = ''; resultsContainer.classList.add('d-none'); }
    updateBulkPriceHint();

    const modal = Modal.getOrCreateInstance(modalEl);
    modal.show();

    setTimeout(() => {
        const nameInput = document.getElementById('bulk-product-name');
        if (nameInput) nameInput.focus();
    }, 400);
}

function initManualBulkHandlers() {
    // Los chips estáticos han sido reemplazados por el autocomplete BEDCA
    // Mantener retrocompatibilidad por si hay chips en versiones antiguas del HTML
    const chipsContainer = document.getElementById('bulk-quick-chips');
    if (chipsContainer) {
        chipsContainer.querySelectorAll('.bulk-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const name = chip.dataset.name;
                const unit = chip.dataset.unit || 'kg';
                document.getElementById('bulk-product-name').value = name;
                document.getElementById('bulk-unit').value = unit;
                const unitLabel = document.getElementById('bulk-unit-label');
                if (unitLabel) unitLabel.textContent = unit;
                document.getElementById('bulk-selected-code').value = '';
                const resultsContainer = document.getElementById('bulk-product-results');
                if (resultsContainer) resultsContainer.classList.add('d-none');
                ProductStore.searchProducts(name, 1).then(async results => {
                    if (results.length > 0 && results[0].product_name.toLowerCase() === name.toLowerCase()) {
                        const lastPrice = await CartStore.getLastKnownPrice(results[0].code);
                        if (lastPrice > 0) document.getElementById('bulk-unit-price').value = lastPrice.toFixed(2);
                    }
                    updateBulkPriceSync('unit');
                });
                document.getElementById('bulk-amount').focus();
            });
        });
    }

    // Mapa de categoría BEDCA → unidad por defecto
    const CATEGORY_UNIT = {
        fruit: 'kg', vegetable: 'kg', legume: 'kg', meat: 'kg',
        fish: 'kg', nut: 'g', cereal: 'g', dairy: 'unidad',
        oil: 'l', spice: 'g', condiment: 'g', other: 'unidad'
    };

    // Iconos por categoría BEDCA
    const CATEGORY_ICON = {
        fruit: '🍎', vegetable: '🥪', legume: '🫘', meat: '🥩',
        fish: '🐟', nut: '🥜', cereal: '🌾', dairy: '🧀',
        oil: '🍯', spice: '🌿', condiment: '🧄', other: '📦'
    };

    const nameInput = document.getElementById('bulk-product-name');
    const resultsContainer = document.getElementById('bulk-product-results');
    let searchTimeout = null;

    if (nameInput && resultsContainer) {
        nameInput.addEventListener('input', () => {
            const query = nameInput.value.trim();
            document.getElementById('bulk-selected-code').value = '';
            document.getElementById('bulk-selected-source').value = '';
            document.getElementById('bulk-selected-category').value = '';

            clearTimeout(searchTimeout);
            if (query.length < 2) {
                resultsContainer.classList.add('d-none');
                resultsContainer.innerHTML = '';
                return;
            }

            searchTimeout = setTimeout(async () => {
                const products = await ProductStore.searchProducts(query, 8);
                if (products.length === 0) {
                    resultsContainer.classList.add('d-none');
                    resultsContainer.innerHTML = '';
                    return;
                }

                resultsContainer.innerHTML = products.map(p => {
                    // Badge de origen
                    let sourceBadge = '';
                    if (p.isPrimaryFood) {
                        sourceBadge = '<span class="badge bg-success ms-1" style="font-size:0.6rem;">BEDCA</span>';
                    } else if (p.is_custom) {
                        sourceBadge = '<span class="badge bg-info text-dark ms-1" style="font-size:0.6rem;">Mio</span>';
                    } else {
                        sourceBadge = '<span class="badge bg-secondary ms-1" style="font-size:0.6rem;">OFF</span>';
                    }

                    // Calorías por 100g si disponibles
                    const kcal = p['energy-kcal_100g'];
                    const kcalText = kcal > 0 ? `<span class="text-muted" style="font-size:0.7rem;">${Math.round(kcal)} kcal/100g</span>` : '';

                    // Icono de categoría
                    const catIcon = p.categories_tags && p.categories_tags[0]
                        ? (CATEGORY_ICON[p.categories_tags[0]] || '📦')
                        : (p.pantryZone === 'nonfood' ? '🧴' : '📦');

                    const safeCode = (p.code || '').replace(/"/g, '&quot;');
                    const safeName = (p.product_name || '').replace(/"/g, '&quot;');
                    const safeZone = p.pantryZone || 'food';
                    const safeNutriscore = p.nutriscore_grade || 'a';
                    const safeCat = p.categories_tags && p.categories_tags[0] ? p.categories_tags[0] : '';
                    const safeSource = p.isPrimaryFood ? 'bedca' : (p.is_custom ? 'custom' : 'off');

                    return `<button type="button"
                        class="list-group-item list-group-item-action bg-dark text-white border-secondary py-2 px-3"
                        data-code="${safeCode}"
                        data-name="${safeName}"
                        data-zone="${safeZone}"
                        data-nutriscore="${safeNutriscore}"
                        data-category="${safeCat}"
                        data-source="${safeSource}">
                        <div class="d-flex align-items-center justify-content-between gap-2">
                            <div class="d-flex align-items-center gap-2 overflow-hidden">
                                <span style="font-size:1.1rem;">${catIcon}</span>
                                <span class="text-truncate fw-semibold">${p.product_name}</span>
                                ${sourceBadge}
                            </div>
                            <div class="flex-shrink-0">
                                ${kcalText}
                            </div>
                        </div>
                    </button>`;
                }).join('');
                resultsContainer.classList.remove('d-none');

                resultsContainer.querySelectorAll('button').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        nameInput.value = btn.dataset.name;
                        document.getElementById('bulk-selected-code').value = btn.dataset.code;
                        document.getElementById('bulk-selected-source').value = btn.dataset.source || '';
                        document.getElementById('bulk-selected-category').value = btn.dataset.category || '';
                        document.getElementById('bulk-zone').value = btn.dataset.zone || 'food';
                        document.getElementById('bulk-nutriscore').value = btn.dataset.nutriscore || 'a';
                        resultsContainer.classList.add('d-none');

                        // Auto-seleccionar unidad según categoría BEDCA
                        const cat = btn.dataset.category;
                        if (cat && CATEGORY_UNIT[cat]) {
                            const unitSelect = document.getElementById('bulk-unit');
                            if (unitSelect) {
                                unitSelect.value = CATEGORY_UNIT[cat];
                                const unitLabel = document.getElementById('bulk-unit-label');
                                if (unitLabel) unitLabel.textContent = CATEGORY_UNIT[cat];
                            }
                        }

                        const lastPrice = await CartStore.getLastKnownPrice(btn.dataset.code);
                        if (lastPrice > 0) {
                            document.getElementById('bulk-unit-price').value = lastPrice.toFixed(2);
                            updateBulkPriceSync('unit');
                        }

                        document.getElementById('bulk-amount').focus();
                    });
                });
            }, 200);
        });

        // Cerrar resultados si se hace click fuera
        document.addEventListener('click', (e) => {
            if (!nameInput.contains(e.target) && !resultsContainer.contains(e.target)) {
                resultsContainer.classList.add('d-none');
            }
        });
    }

    const amountInput = document.getElementById('bulk-amount');
    const unitSelect = document.getElementById('bulk-unit');
    const unitPriceInput = document.getElementById('bulk-unit-price');
    const totalPriceInput = document.getElementById('bulk-total-price');

    if (unitSelect) {
        unitSelect.addEventListener('change', () => {
            const unitLabel = document.getElementById('bulk-unit-label');
            if (unitLabel) unitLabel.textContent = unitSelect.value;
            updateBulkPriceHint();
        });
    }

    if (amountInput) {
        amountInput.addEventListener('input', () => updateBulkPriceSync('amount'));
    }

    if (unitPriceInput) {
        unitPriceInput.addEventListener('input', () => updateBulkPriceSync('unit'));
    }

    if (totalPriceInput) {
        totalPriceInput.addEventListener('input', () => updateBulkPriceSync('total'));
    }

    const btnSubmit = document.getElementById('btn-submit-bulk-item');
    if (btnSubmit) {
        btnSubmit.addEventListener('click', handleSaveBulkItem);
    }

    const form = document.getElementById('form-manual-bulk');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            handleSaveBulkItem();
        });
    }
}

function updateBulkPriceSync(source) {
    const amount = parseFloat(document.getElementById('bulk-amount').value) || 0;
    const unitPriceInput = document.getElementById('bulk-unit-price');
    const totalPriceInput = document.getElementById('bulk-total-price');

    if (source === 'unit' || source === 'amount') {
        const unitPrice = parseFloat(unitPriceInput.value);
        if (!isNaN(unitPrice) && amount > 0) {
            totalPriceInput.value = (amount * unitPrice).toFixed(2);
        }
    } else if (source === 'total') {
        const totalPrice = parseFloat(totalPriceInput.value);
        if (!isNaN(totalPrice) && amount > 0) {
            unitPriceInput.value = (totalPrice / amount).toFixed(2);
        }
    }
    updateBulkPriceHint();
}

function updateBulkPriceHint() {
    const amount = parseFloat(document.getElementById('bulk-amount').value) || 0;
    const unit = document.getElementById('bulk-unit')?.value || 'kg';
    const unitPrice = parseFloat(document.getElementById('bulk-unit-price').value) || 0;
    const total = amount * unitPrice;
    
    const hint = document.getElementById('bulk-price-calc-hint');
    if (hint) {
        hint.innerHTML = `💡 ${amount} ${unit} × ${unitPrice.toFixed(2)} €/${unit} = <strong>${total.toFixed(2)} €</strong>`;
    }
}

async function handleSaveBulkItem() {
    const nameInput = document.getElementById('bulk-product-name');
    const name = nameInput.value.trim();
    if (!name) {
        nameInput.focus();
        showToast('Introduce un nombre para el producto', 'warning');
        return;
    }

    const amount = parseFloat(document.getElementById('bulk-amount').value);
    if (isNaN(amount) || amount <= 0) {
        showToast('Introduce una cantidad válida mayor que 0', 'warning');
        return;
    }

    const unit = document.getElementById('bulk-unit').value || 'kg';
    let unitPrice = parseFloat(document.getElementById('bulk-unit-price').value) || 0;
    const totalPrice = parseFloat(document.getElementById('bulk-total-price').value);

    if (unitPrice === 0 && !isNaN(totalPrice) && totalPrice > 0 && amount > 0) {
        unitPrice = totalPrice / amount;
    }

    const zone = document.getElementById('bulk-zone').value || 'food';
    const nutriscore = document.getElementById('bulk-nutriscore').value || 'a';
    const saveCustom = document.getElementById('bulk-save-custom').checked;
    const packageUnitsInput = document.getElementById('bulk-package-units');
    const packageUnits = packageUnitsInput && packageUnitsInput.value ? parseInt(packageUnitsInput.value, 10) : null;

    let code = document.getElementById('bulk-selected-code').value;

    if (!code) {
        // Verificar si ya existe un producto con el mismo nombre exacto
        const existing = await ProductStore.searchProducts(name, 1);
        if (existing.length > 0 && existing[0].product_name.toLowerCase() === name.toLowerCase()) {
            code = existing[0].code;
        } else {
            // Crear código único para producto genérico/manual
            code = 'GENERIC_BULK_' + Date.now();
        }
    }

    if (saveCustom) {
        await ProductStore.addCustomProduct({
            code,
            product_name: name,
            pantryZone: zone,
            nutriscore_grade: nutriscore,
            ingredients_text: '',
            is_custom: true,
            package_units: packageUnits || undefined
        });
    }

    await CartStore.addToCart(code, amount, unitPrice, unit, packageUnits);
    RecentStore.markAsUsed(code);

    // Marcar en la lista de compra activa si coincide
    const activeList = await ShoppingStore.getActiveList();
    if (activeList) {
        const changed = await ShoppingStore.checkItem(activeList.id, code) || 
                        await ShoppingStore.checkItem(activeList.id, name);
        if (changed) await updateShoppingListUI();
    }

    // Ocultar modal
    const modalEl = document.getElementById('modal-manual-bulk');
    if (modalEl) {
        const modal = Modal.getInstance(modalEl) || Modal.getOrCreateInstance(modalEl);
        modal.hide();
    }

    await updateCartUI();
    showToast(`🛒 ${name} añadido al carro (${amount} ${unit})`);
}

async function handleCheckout() {
    const { items } = await CartStore.getCart();
    const pendingTicket = await CartStore.getPendingCartTicket();

    if (items.length === 0 && !pendingTicket && !currentCartTicketBlob) {
        return showToast('El carro está vacío. Escanea productos o adjunta un ticket.', 'warning');
    }

    if (items.length === 0) {
        // Carro sin productos pero con ticket adjunto
        await performCheckout(0);
        return;
    }

    const missingWeights = [];
    for (const item of items) {
        if (item.unit === 'unidad' && !item.productCode.startsWith('GENERIC_')) {
            const product = await ProductStore.getProductByCode(item.productCode);
            if (!product || !product.product_quantity || isNaN(parseFloat(product.product_quantity)) || parseFloat(product.product_quantity) <= 0) {
                missingWeights.push({ item, product });
            }
        }
    }

    const askWeightsPref = localStorage.getItem('setting_ask_weights') !== 'false';

    if (missingWeights.length > 0 && askWeightsPref) {
        const form = document.getElementById('missing-weights-form');
        form.innerHTML = missingWeights.map(mw => {
            const officialName = (mw.product?.product_name || '').trim();
            const brandFallback = mw.product?.brands ? `${mw.product.brands} (${mw.item.productCode})` : '';
            const isNameMissing = !officialName || officialName.startsWith('Producto ') || mw.item.productName === brandFallback || mw.item.productName === mw.item.productCode || (mw.item.productName && mw.item.productName.startsWith('Producto '));
            const displayName = officialName || mw.item.productName || (mw.product?.brands ? `${mw.product.brands} (${mw.item.productCode})` : `Producto ${mw.item.productCode}`);
            return `
            <div class="mb-3 p-2 rounded bg-black border border-secondary">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <span class="small text-info fw-bold font-monospace">Código: ${mw.item.productCode}</span>
                    ${isNameMissing ? '<span class="badge bg-warning text-dark small"><i class="bi bi-fonts me-1"></i>Falta nombre</span>' : ''}
                </div>
                ${isNameMissing ? `
                <div class="mb-2">
                    <label class="form-label small text-muted mb-1">Nombre del producto:</label>
                    <input type="text" class="form-control form-control-sm missing-name-input bg-dark text-white border-secondary" data-code="${mw.item.productCode}" placeholder="Ej: Couscous Hacendado" value="${mw.product?.brands ? mw.product.brands + ' ' : ''}">
                </div>
                ` : `
                <div class="small text-white mb-2 fw-bold">${displayName}</div>
                `}
                <div>
                    <label class="form-label small text-muted mb-1">Peso / Cantidad (en gramos):</label>
                    <div class="input-group input-group-sm">
                        <input type="number" class="form-control missing-weight-input bg-dark text-white border-secondary" data-code="${mw.item.productCode}" placeholder="Ej: 500" min="1">
                        <span class="input-group-text bg-secondary text-white border-secondary">g/ml</span>
                    </div>
                </div>
            </div>
            `;
        }).join('');

        const modalEl = document.getElementById('modal-missing-weights');
        const modal = Modal.getOrCreateInstance(modalEl);
        modal.show();

        // Evitar que Enter recargue la página
        form.onsubmit = (e) => {
            e.preventDefault();
            document.getElementById('btn-save-missing-weights').click();
        };

        // Botón Omitir: continuar sin guardar los pesos
        const btnSkip = document.getElementById('btn-skip-missing-weights');
        if (btnSkip) {
            // Clonar para eliminar listeners anteriores
            const newSkip = btnSkip.cloneNode(true);
            btnSkip.parentNode.replaceChild(newSkip, btnSkip);
            newSkip.addEventListener('click', async () => {
                modal.hide();
                await performCheckout(items.length);
            });
        }

        // Clonar botón guardar para limpiar listeners previos
        const btnSaveOld = document.getElementById('btn-save-missing-weights');
        const btnSave = btnSaveOld.cloneNode(true);
        btnSaveOld.parentNode.replaceChild(btnSave, btnSaveOld);

        btnSave.addEventListener('click', async () => {
            const inputs = form.querySelectorAll('.missing-weight-input');
            let allValid = true;
            for (const input of inputs) {
                const val = parseFloat(input.value);
                if (!input.value.trim() || isNaN(val) || val <= 0) {
                    allValid = false;
                    input.classList.add('is-invalid');
                } else {
                    input.classList.remove('is-invalid');
                }
            }

            if (!allValid) {
                return;
            }

            // Guardar pesos y nombres en la BD y encolar colaboración a OpenFoodFacts si procede
            for (const input of inputs) {
                const code = input.dataset.code;
                const weight = parseFloat(input.value);
                const weightStr = weight.toString();
                const nameInput = form.querySelector(`.missing-name-input[data-code="${code}"]`);
                const nameEntered = nameInput ? nameInput.value.trim() : '';

                try {
                    const p = await ProductStore.getProductByCode(code);
                    let prodName = nameEntered || '';
                    if (p) {
                        if (!prodName) {
                            prodName = p.product_name || (p.brands ? `${p.brands} (${code})` : '');
                        }
                        const updates = { product_quantity: weightStr };
                        if (nameEntered) {
                            updates.product_name = nameEntered;
                        }
                        if (p.is_custom) {
                            await db.customProducts.update(code, updates);
                        } else {
                            await db.products.where('code').equals(code).modify(updates);
                        }
                    } else {
                        prodName = nameEntered || ('Producto ' + code);
                        await ProductStore.addCustomProduct({ code, product_name: prodName, product_quantity: weightStr });
                    }

                    // Actualizar también el ítem en el carro en memoria si aplica
                    const cartItem = items.find(i => i.productCode === code);
                    if (cartItem && nameEntered) {
                        cartItem.productName = nameEntered;
                    }

                    // Encolar contribución comunitaria a OFF si es un código de barras numérico
                    const cleanBarcode = (p?.real_code || code).replace(/^GENERIC_/, '');
                    if (/^\d{8,14}$/.test(cleanBarcode)) {
                        const metadataFields = {
                            quantity: `${weightStr} g`,
                            product_quantity: weightStr
                        };
                        if (nameEntered) {
                            metadataFields.product_name = nameEntered;
                            metadataFields.lang = 'es';
                        }
                        await saveMetadataToPendingUploads(cleanBarcode, metadataFields, prodName);
                    }
                } catch(err) {
                    console.error('Error guardando peso/nombre para', code, err);
                }
            }
            await updateSyncBadge();

            modal.hide();
            await performCheckout(items.length);
        });
    } else {
        await performCheckout(items.length);
    }
}

async function performCheckout(itemCount) {
    const hasTicket = !!(currentCartTicketBlob || (await CartStore.getPendingCartTicket()));
    const promptMsg = itemCount > 0
        ? `¿Terminar compra y mover ${itemCount} productos a la despensa${hasTicket ? ' (con ticket adjunto)' : ''}?`
        : '¿Guardar compra con foto del ticket en el Historial?';

    if (confirm(promptMsg)) {
        const warnings = await CartStore.checkout('', '', currentCartTicketBlob, currentCartTicketThumbBlob);
        currentCartTicketBlob = null;
        currentCartTicketThumbBlob = null;
        await CartStore.clearPendingCartTicket();
        updateCartTicketUI();

        if (itemCount > 0) {
            let msg = '¡Compra guardada en Despensa!';
            if (warnings && warnings.length > 0) {
                msg += "\n\n⚠️ Atención:\n" + warnings.join("\n") + "\n\nSe ha asumido 1kg para los que no tenían peso.";
            }
            showToast(msg.replace(/\n/g, '<br>'));
            setTimeout(() => window.location.hash = '#pantry', 1000);
        } else {
            showToast('🧾 ¡Compra con ticket guardada en el Historial!');
            setTimeout(() => window.location.hash = '#cart-history', 1000);
        }
    }
}

function initTicketHandlers() {
    // Carrito activo: botón adjuntar ticket
    const btnAttach = document.getElementById('btn-attach-cart-ticket');
    const fileInput = document.getElementById('cart-ticket-file-input');
    const btnRemove = document.getElementById('btn-remove-cart-ticket');
    const thumbImg = document.getElementById('cart-ticket-thumb-img');

    if (btnAttach && fileInput) {
        btnAttach.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
                const { blob, thumbBlob } = await CartStore.processTicketImage(file);
                currentCartTicketBlob = blob;
                currentCartTicketThumbBlob = thumbBlob;
                await CartStore.savePendingCartTicket(blob, thumbBlob);
                updateCartTicketUI();
                showToast('🧾 Ticket adjuntado al carrito');
            } catch (err) {
                console.error(err);
                showToast('Error al procesar foto del ticket: ' + err.message, 'danger');
            }
        });
    }

    if (btnRemove) {
        btnRemove.addEventListener('click', async () => {
            currentCartTicketBlob = null;
            currentCartTicketThumbBlob = null;
            await CartStore.clearPendingCartTicket();
            if (fileInput) fileInput.value = '';
            updateCartTicketUI();
            showToast('Ticket eliminado del carrito');
        });
    }

    if (thumbImg) {
        thumbImg.addEventListener('click', () => {
            if (currentCartTicketBlob) {
                const url = URL.createObjectURL(currentCartTicketBlob);
                window.open(url, '_blank');
            }
        });
    }
}

function updateCartTicketUI() {
    const previewBox = document.getElementById('cart-ticket-preview-box');
    const thumbImg = document.getElementById('cart-ticket-thumb-img');
    const btnAttach = document.getElementById('btn-attach-cart-ticket');
    const statusTitle = document.getElementById('cart-ticket-status-title');
    const statusSub = document.getElementById('cart-ticket-status-subtitle');

    if (!previewBox) return;

    if (currentCartTicketThumbBlob) {
        thumbImg.src = URL.createObjectURL(currentCartTicketThumbBlob);
        previewBox.classList.remove('d-none');
        btnAttach.innerHTML = '<i class="bi bi-arrow-repeat"></i> Cambiar';
        statusTitle.textContent = '🧾 Ticket listo para adjuntar';
        statusSub.textContent = 'Se guardará junto a la compra al pasar por caja';
    } else {
        previewBox.classList.add('d-none');
        btnAttach.innerHTML = '<i class="bi bi-camera"></i> 📸 Adjuntar Ticket';
        statusTitle.textContent = 'Foto del Ticket de Compra';
        statusSub.textContent = 'Adjunta el ticket para guardar y consultar precios más tarde';
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel de producto desconocido / OFF: captura, recorte y re-edición
// ─────────────────────────────────────────────────────────────────────────────

let currentAspect = 'free';

async function showUnknownProductPanel(barcode) {
    unknownBarcode = barcode;
    document.getElementById('unknown-barcode-label').textContent = barcode;
    document.getElementById('unknown-product-panel').classList.remove('d-none');
    document.getElementById('add-to-cart-panel').classList.add('d-none');
    document.getElementById('assistant-alert').classList.add('d-none');

    // Resetear modos
    currentEditingUploadId = null;
    document.getElementById('unknown-edit-mode-badge').style.display = 'none';
    document.getElementById('unknown-panel-title').textContent = 'Contribuir foto a OpenFoodFacts';
    document.getElementById('btn-save-photo-text').textContent = '💾 Guardar en cola OFF';

    // Cargar fotos existentes en cola para este barcode si las hay
    await refreshExistingPhotosForBarcode(barcode);

    // Limpiar vistas de recorte/cámara
    resetCropAndCaptureNew();
}

async function refreshExistingPhotosForBarcode(barcode) {
    const existingSection = document.getElementById('unknown-existing-section');
    const existingList = document.getElementById('unknown-existing-list');
    if (!existingSection || !existingList) return;

    const items = await getUploadsByBarcode(barcode);
    if (!items || items.length === 0) {
        existingSection.classList.add('d-none');
        existingList.innerHTML = '';
        return;
    }

    existingSection.classList.remove('d-none');
    existingList.innerHTML = items.map(item => {
        const typeLabels = { front: 'Etiqueta', ingredients: 'Ingredientes', nutrition: 'Nutrición' };
        const typeLabel = typeLabels[item.type] || item.type;
        const statusBadge = item.status === 'done'
            ? '<span class="badge bg-success">Subida</span>'
            : item.status === 'failed'
            ? '<span class="badge bg-danger" title="' + (item.lastError || '') + '">Error</span>'
            : '<span class="badge bg-warning text-dark">Pendiente</span>';

        const blob = new Blob([item.imageData], { type: item.mimeType || 'image/jpeg' });
        const thumbUrl = URL.createObjectURL(blob);

        return `
            <div class="card bg-secondary text-white p-1 d-flex flex-row align-items-center gap-2" style="min-width: 220px; font-size: 0.8rem;">
                <img src="${thumbUrl}" alt="${typeLabel}" class="rounded" style="width: 50px; height: 50px; object-fit: cover; cursor: pointer;" onclick="window.open('${thumbUrl}', '_blank')">
                <div class="flex-grow-1 overflow-hidden">
                    <div class="fw-bold text-truncate">${typeLabel}</div>
                    <div class="mb-1">${statusBadge}</div>
                </div>
                <div class="d-flex flex-column gap-1">
                    <button type="button" class="btn btn-warning btn-xs py-0 px-1" onclick="window.editQueuedUpload(${item.id})" title="Editar / Re-recortar">
                        <i class="bi bi-crop"></i> Editar
                    </button>
                    <button type="button" class="btn btn-outline-danger btn-xs py-0 px-1" onclick="window.deleteQueuedUpload(${item.id})" title="Eliminar de la cola">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

window.editQueuedUpload = async function(id) {
    const { getUploadById } = await import('./api/openFoodFacts.js');
    const item = await getUploadById(id);
    if (!item) return;

    currentEditingUploadId = item.id;
    document.getElementById('unknown-edit-mode-badge').style.display = 'inline-block';
    document.getElementById('unknown-panel-title').textContent = `Editando foto (${item.type}) para ${item.barcode}`;
    document.getElementById('btn-save-photo-text').textContent = '💾 Actualizar foto';
    if (item.productName) {
        document.getElementById('unknown-product-name').value = item.productName;
    }
    if (item.type) {
        document.getElementById('unknown-image-type').value = item.type;
    }

    const imgBuffer = item.originalImageData || item.imageData;
    originalImageBlob = new Blob([imgBuffer], { type: item.mimeType || 'image/jpeg' });
    startCropper(originalImageBlob);
};

window.deleteQueuedUpload = async function(id) {
    if (!confirm('¿Eliminar esta foto de la cola de subidas?')) return;
    await deletePendingUpload(id);
    showToast('Foto eliminada de la cola', 'info');
    if (unknownBarcode) {
        await refreshExistingPhotosForBarcode(unknownBarcode);
    }
    await updateSyncBadge();
    await updateCartOffBanner();
};

function resetCropAndCaptureNew() {
    stopCamera();
    if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
    }
    capturedImageBlob = null;
    originalImageBlob = null;
    currentCropConfig = null;

    document.getElementById('unknown-source-buttons').classList.remove('d-none');
    document.getElementById('camera-container').classList.add('d-none');
    document.getElementById('unknown-cropper-container').classList.add('d-none');
    document.getElementById('photo-preview-container').classList.add('d-none');
    document.getElementById('btn-save-photo').classList.add('d-none');
}

function hideUnknownPanel() {
    document.getElementById('unknown-product-panel').classList.add('d-none');
    resetCropAndCaptureNew();
    unknownBarcode = null;
    currentEditingUploadId = null;
}

let stream = null;

async function startCapture() {
    const videoEl = document.getElementById('capture-video');
    const cameraContainer = document.getElementById('camera-container');

    try {
        stopCamera();
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        videoEl.srcObject = stream;
        cameraContainer.classList.remove('d-none');
        document.getElementById('unknown-source-buttons').classList.add('d-none');
        document.getElementById('unknown-cropper-container').classList.add('d-none');
        document.getElementById('photo-preview-container').classList.add('d-none');
    } catch (err) {
        showToast('No se pudo acceder a la cámara: ' + err.message, 'warning');
        // Si falla la cámara, sugerir subir archivo
        document.getElementById('unknown-file-input')?.click();
    }
}

function takeSnapshot() {
    const videoEl = document.getElementById('capture-video');
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth || 800;
    canvas.height = videoEl.videoHeight || 600;
    canvas.getContext('2d').drawImage(videoEl, 0, 0);

    stopCamera();
    document.getElementById('camera-container').classList.add('d-none');

    canvas.toBlob((blob) => {
        if (!blob) {
            showToast('Error al capturar la imagen', 'danger');
            return;
        }
        originalImageBlob = blob;
        startCropper(blob);
    }, 'image/jpeg', 0.92);
}

function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    originalImageBlob = file;
    e.target.value = ''; // Reset input
    startCropper(file);
}

function startCropper(imageSource) {
    document.getElementById('unknown-source-buttons').classList.add('d-none');
    document.getElementById('camera-container').classList.add('d-none');
    document.getElementById('photo-preview-container').classList.add('d-none');
    document.getElementById('btn-save-photo').classList.add('d-none');

    const cropperContainer = document.getElementById('unknown-cropper-container');
    cropperContainer.classList.remove('d-none');

    const canvas = document.getElementById('unknown-crop-canvas');
    if (cropperInstance) cropperInstance.destroy();

    cropperInstance = new ImageCropper({
        canvas,
        image: imageSource,
        aspectRatio: currentAspect
    });
}

function handleAspectClick(e) {
    const btn = e.target.closest('button[data-aspect]');
    if (!btn) return;
    const aspect = btn.getAttribute('data-aspect');
    currentAspect = aspect;

    document.querySelectorAll('#crop-aspect-group button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (cropperInstance) {
        cropperInstance.setAspectRatio(aspect);
    }
}

async function handleApplyCrop() {
    if (!cropperInstance) return;
    try {
        capturedImageBlob = await cropperInstance.getCroppedBlob('image/jpeg', 0.88);
        currentCropConfig = cropperInstance.getCropData();
        showCroppedPreview(capturedImageBlob, true);
    } catch (err) {
        console.error('Error aplicando recorte:', err);
        showToast('Error al recortar la imagen', 'danger');
    }
}

function handleSkipCrop() {
    if (!originalImageBlob) return;
    capturedImageBlob = originalImageBlob;
    currentCropConfig = null;
    showCroppedPreview(capturedImageBlob, false);
}

function handleReCrop() {
    if (!originalImageBlob) return;
    startCropper(originalImageBlob);
}

function showCroppedPreview(blob, isCropped) {
    document.getElementById('unknown-cropper-container').classList.add('d-none');
    const preview = document.getElementById('photo-preview');
    preview.src = URL.createObjectURL(blob);
    const badge = document.getElementById('photo-preview-badge');
    if (badge) {
        badge.textContent = isCropped ? 'Recortada' : 'Original';
        badge.className = `badge ${isCropped ? 'bg-success' : 'bg-secondary'} position-absolute top-0 start-0 m-1`;
    }
    document.getElementById('photo-preview-container').classList.remove('d-none');
    document.getElementById('btn-save-photo').classList.remove('d-none');
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
    }
    const cameraContainer = document.getElementById('camera-container');
    if (cameraContainer) cameraContainer.classList.add('d-none');
    const sourceButtons = document.getElementById('unknown-source-buttons');
    if (sourceButtons && document.getElementById('unknown-cropper-container')?.classList.contains('d-none') && document.getElementById('photo-preview-container')?.classList.contains('d-none')) {
        sourceButtons.classList.remove('d-none');
    }
}

async function handleSaveUnknownProduct() {
    if (!capturedImageBlob || !unknownBarcode) {
        showToast('Debes tomar o recortar una foto antes de guardar', 'warning');
        return;
    }

    const nameInput = document.getElementById('unknown-product-name').value.trim();
    const imageType = document.getElementById('unknown-image-type').value;

    try {
        if (currentEditingUploadId) {
            await updateUpload(currentEditingUploadId, {
                barcode: unknownBarcode,
                productName: nameInput,
                type: imageType,
                imageBlob: capturedImageBlob,
                originalBlob: originalImageBlob,
                cropConfig: currentCropConfig,
                status: 'pending' // Reestablecer a pendiente tras editar
            });
            showToast('✅ Foto actualizada en la cola OFF', 'success');
        } else {
            await saveImageToPendingUploads(
                unknownBarcode,
                capturedImageBlob,
                imageType,
                nameInput,
                originalImageBlob,
                currentCropConfig
            );
            showToast('✅ Foto guardada en la cola de subidas OFF', 'success');
        }

        await updateSyncBadge();
        await updateCartOffBanner();

        // Actualizar la lista de fotos para este producto y resetear cropper
        await refreshExistingPhotosForBarcode(unknownBarcode);
        resetCropAndCaptureNew();

        // El producto ya está en local, permitir que el usuario lo busque en el carrito
        document.getElementById('code-input').value = unknownBarcode;
    } catch (err) {
        showToast('Error al guardar: ' + err.message, 'danger');
    }
}

async function updateSyncBadge() {
    const count = await countPendingUploads();
    const badge = document.getElementById('sync-badge');
    if (badge) {
        if (count > 0) {
            badge.textContent = count;
            badge.classList.remove('d-none');
        } else {
            badge.classList.add('d-none');
        }
    }
}

async function updateCartOffBanner() {
    const banner = document.getElementById('cart-off-banner');
    const text = document.getElementById('cart-off-banner-text');
    if (!banner || !text) return;

    try {
        const stats = await getOffStats();
        if (stats.pending > 0 || stats.failed > 0) {
            banner.classList.remove('d-none');
            text.innerHTML = `<strong>${stats.pending} foto(s) pendiente(s)</strong>${stats.failed > 0 ? ` y <strong class="text-danger">${stats.failed} con error</strong>` : ''}`;
        } else {
            banner.classList.add('d-none');
        }
    } catch (err) {
        console.warn('Error actualizando banner OFF:', err);
    }
}

/**
 * Muestra un modal rápido con info local del producto + enlace a OFF.
 * Compartido con cart-history y lista de compra activa.
 */
window.showProductQuickDetail = async function(code, name) {
    const product = await ProductStore.getProductByCode(code);
    const modal = document.getElementById('quickDetailModal');
    if (!modal) return;

    document.getElementById('qd-product-name').textContent = product?.product_name || name;
    document.getElementById('qd-product-code').textContent = code;

    let badges = '';
    if (product?.nutriscore_grade) {
        const bg = ['a','b'].includes(product.nutriscore_grade.toLowerCase()) ? 'bg-success' : product.nutriscore_grade.toLowerCase() === 'e' ? 'bg-danger' : 'bg-warning text-dark';
        badges += `<span class="badge ${bg} me-1">Nutriscore: ${product.nutriscore_grade.toUpperCase()}</span>`;
    }
    if (product?.nova_group) {
        badges += `<span class="badge ${product.nova_group <= 2 ? 'bg-success' : 'bg-danger'}">Nova: ${product.nova_group}</span>`;
    }
    document.getElementById('qd-badges').innerHTML = badges || '<span class="text-muted small">Sin clasificación</span>';

    if (product?.['energy-kcal_100g'] !== undefined) {
        document.getElementById('qd-nutrition').innerHTML = `
            <li class="list-group-item bg-dark text-white d-flex justify-content-between"><span>Calorías</span><span>${product['energy-kcal_100g']} kcal</span></li>
            <li class="list-group-item bg-dark text-white d-flex justify-content-between"><span>Proteínas</span><span>${product['proteins_100g'] || 0} g</span></li>
            <li class="list-group-item bg-dark text-white d-flex justify-content-between"><span>Carbohidratos</span><span>${product['carbohydrates_100g'] || 0} g</span></li>
            <li class="list-group-item bg-dark text-white d-flex justify-content-between"><span>Grasas</span><span>${product['fat_100g'] || 0} g</span></li>
        `;
    } else {
        document.getElementById('qd-nutrition').innerHTML = '<li class="list-group-item bg-dark text-muted">Datos nutricionales no disponibles</li>';
    }

    const extractedCode = code.startsWith('GENERIC_') ? code.replace(/^GENERIC_/, '') : code;
    const realCode = product?.real_code || (/^\d+$/.test(extractedCode) ? extractedCode : null);
    const offLink = document.getElementById('qd-off-link');
    if (realCode && /^\d+$/.test(realCode)) {
        offLink.href = `https://world.openfoodfacts.org/product/${realCode}`;
        offLink.classList.remove('d-none');
    } else {
        offLink.classList.add('d-none');
    }

    Modal.getOrCreateInstance(modal).show();
};
