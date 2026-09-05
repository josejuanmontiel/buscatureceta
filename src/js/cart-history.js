import { db } from './db/schema.js';
import * as PantryStore from './modules/pantry/PantryStore.js';
import * as ShoppingStore from './modules/shopping/ShoppingStore.js';
import * as ProductStore from './modules/products/ProductStore.js';
import * as CartStore from './modules/cart/CartStore.js';
import { showToast } from './modules/ui/UI.js';
import { Modal } from 'bootstrap';
import { saveImageToPendingUploads } from './api/openFoodFacts.js';
import { ImageCropper } from './modules/ui/ImageCropper.js';

let currentZoom = 1;
let currentRotation = 0;
let historyQuickTicketBlob = null;
let historyQuickTicketThumbBlob = null;
let targetCartIdForTicket = null;

let historyCropperInstance = null;
let historyOriginalBlob = null;
let historyAspect = 'free';
let historyModalStream = null;

export async function initView() {
    initHistoryTicketHandlers();
    initTicketViewerControls();
    initHistoryOffHandlers();
    await renderHistory();
    await renderChart();
}

function initTicketViewerControls() {
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    const btnZoomReset = document.getElementById('btn-zoom-reset');
    const btnRotate = document.getElementById('btn-rotate-ticket');
    const container = document.getElementById('ticket-zoom-container');

    function applyTransform() {
        if (container) {
            container.style.transform = `scale(${currentZoom}) rotate(${currentRotation}deg)`;
        }
    }

    if (btnZoomIn) {
        btnZoomIn.addEventListener('click', () => {
            currentZoom = Math.min(currentZoom + 0.25, 3.5);
            applyTransform();
        });
    }

    if (btnZoomOut) {
        btnZoomOut.addEventListener('click', () => {
            currentZoom = Math.max(currentZoom - 0.25, 0.5);
            applyTransform();
        });
    }

    if (btnZoomReset) {
        btnZoomReset.addEventListener('click', () => {
            currentZoom = 1;
            currentRotation = 0;
            applyTransform();
        });
    }

    if (btnRotate) {
        btnRotate.addEventListener('click', () => {
            currentRotation = (currentRotation + 90) % 360;
            applyTransform();
        });
    }
}

function getBlobUrl(blobOrData) {
    if (!blobOrData) return null;
    if (typeof blobOrData === 'string') {
        if (blobOrData.startsWith('data:') || blobOrData.startsWith('http') || blobOrData.startsWith('blob:')) {
            return blobOrData;
        }
        return `data:image/jpeg;base64,${blobOrData}`;
    }
    if (blobOrData instanceof Blob) {
        return URL.createObjectURL(blobOrData);
    }
    if (blobOrData.buffer) {
        const b = new Blob([blobOrData], { type: 'image/jpeg' });
        return URL.createObjectURL(b);
    }
    return null;
}

function initHistoryTicketHandlers() {
    // 1. Input para adjuntar/cambiar ticket en compra existente
    const existingTicketInput = document.getElementById('cart-item-ticket-file-input');
    if (existingTicketInput) {
        existingTicketInput.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file || !targetCartIdForTicket) return;
            try {
                const { blob, thumbBlob } = await CartStore.processTicketImage(file);
                await CartStore.updateCartHistoryTicket(targetCartIdForTicket, blob, thumbBlob);
                showToast('🧾 Ticket adjuntado a la compra');
                await renderHistory();
            } catch (err) {
                console.error(err);
                showToast('Error al procesar foto del ticket: ' + err.message, 'danger');
            } finally {
                existingTicketInput.value = '';
                targetCartIdForTicket = null;
            }
        });
    }

    // 2. Modal de añadir producto a compra histórica
    const btnSaveAddProduct = document.getElementById('btn-save-history-add-product');
    const modalAddProductEl = document.getElementById('modal-history-add-product');
    if (btnSaveAddProduct && modalAddProductEl) {
        btnSaveAddProduct.addEventListener('click', async () => {
            const cartId = parseInt(document.getElementById('history-add-cart-id').value, 10);
            const name = document.getElementById('history-add-product-name').value.trim();
            const amount = parseFloat(document.getElementById('history-add-amount').value) || 1;
            const unit = document.getElementById('history-add-unit').value || 'unidad';
            const price = parseFloat(document.getElementById('history-add-price').value) || 0;
            const scannedCode = document.getElementById('history-add-product-code').value.trim();

            if (!name) {
                showToast('Introduce un nombre de producto', 'warning');
                return;
            }

            try {
                await CartStore.addCartHistoryItem(cartId, {
                    productCode: scannedCode || 'GENERIC_HIST_' + Date.now(),
                    productName: name,
                    amount,
                    unit,
                    price
                });

                const modal = Modal.getInstance(modalAddProductEl) || Modal.getOrCreateInstance(modalAddProductEl);
                modal.hide();

                showToast(`➕ ${name} añadido a la compra`);
                await renderHistory();
                await renderChart();
            } catch (err) {
                console.error(err);
                showToast('Error al añadir producto: ' + err.message, 'danger');
            }
        });
    }

    // 3. Escáner inline en el modal de añadir producto
    initInlineScannerForAddModal();
}

let inlineQrCode = null;

/**
 * Carga html5-qrcode dinámicamente la primera vez que se necesita.
 * El Router no ejecuta los <script> de los HTMLs parciales, así que
 * hay que inyectar el script directamente en el <head> del documento real.
 */
function loadHtml5QrCode() {
    return new Promise((resolve, reject) => {
        if (window.Html5Qrcode) { resolve(); return; }
        const existing = document.getElementById('html5-qrcode-cdn');
        if (existing) {
            // El script ya fue inyectado pero aún cargando: esperar
            existing.addEventListener('load', resolve);
            existing.addEventListener('error', reject);
            return;
        }
        const script = document.createElement('script');
        script.id = 'html5-qrcode-cdn';
        script.src = 'https://unpkg.com/html5-qrcode';
        script.onload = resolve;
        script.onerror = () => reject(new Error('No se pudo cargar html5-qrcode desde CDN. Comprueba la conexión.'));
        document.head.appendChild(script);
    });
}

function initInlineScannerForAddModal() {
    const btnToggle = document.getElementById('btn-scan-inline-toggle');
    const btnStop = document.getElementById('btn-scan-inline-stop');
    const wrapper = document.getElementById('scan-inline-wrapper');
    const statusEl = document.getElementById('scan-inline-status');
    const modalEl = document.getElementById('modal-history-add-product');

    if (!btnToggle || !wrapper || !modalEl) return;

    async function stopScanner() {
        if (inlineQrCode) {
            try {
                if (inlineQrCode.isScanning) await inlineQrCode.stop();
            } catch (e) { /* ignorar */ }
        }
        wrapper.style.display = 'none';
        if (statusEl) statusEl.textContent = '';
        btnToggle.innerHTML = '<i class="bi bi-upc-scan"></i>';
        btnToggle.classList.remove('active');
    }

    btnToggle.addEventListener('click', async () => {
        if (wrapper.style.display !== 'none') {
            await stopScanner();
            return;
        }
        wrapper.style.display = 'block';
        if (statusEl) statusEl.textContent = 'Iniciando cámara…';
        btnToggle.innerHTML = '<i class="bi bi-stop-circle"></i>';
        btnToggle.classList.add('active');

        try {
            // Cargar la librería dinámicamente si aún no está disponible
            await loadHtml5QrCode();

            // Crear instancia si no existe o si la anterior quedó en mal estado
            if (!inlineQrCode) {
                inlineQrCode = new window.Html5Qrcode('qr-reader-inline');
            }

            await inlineQrCode.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 250, height: 150 } },
                async (decodedText) => {
                    // Código detectado
                    if (inlineQrCode && inlineQrCode.isScanning) {
                        try { await inlineQrCode.stop(); } catch (e) { /* ignorar */ }
                    }
                    wrapper.style.display = 'none';
                    btnToggle.innerHTML = '<i class="bi bi-upc-scan"></i>';
                    btnToggle.classList.remove('active');

                    // Guardar el código
                    document.getElementById('history-add-product-code').value = decodedText;

                    if (statusEl) statusEl.textContent = '';
                    showToast('🔍 Código detectado: ' + decodedText);

                    // Buscar nombre en DB local
                    try {
                        const product = await ProductStore.getProductByCode(decodedText);
                        if (product && product.product_name) {
                            document.getElementById('history-add-product-name').value = product.product_name;
                            showToast('✅ Producto encontrado: ' + product.product_name, 'success');
                        } else {
                            showToast('⚠️ Producto no encontrado en la base de datos local. Introduce el nombre manualmente.', 'warning');
                            document.getElementById('history-add-product-name').focus();
                        }
                    } catch (err) {
                        console.warn('Error buscando producto por código:', err);
                        document.getElementById('history-add-product-name').focus();
                    }
                },
                () => { /* fallos continuos de escaneo - ignorar */ }
            );
            if (statusEl) statusEl.textContent = 'Apunta al código de barras del producto';
        } catch (err) {
            // Limpiar instancia rota para que el siguiente intento la recree
            inlineQrCode = null;
            wrapper.style.display = 'none';
            btnToggle.innerHTML = '<i class="bi bi-upc-scan"></i>';
            btnToggle.classList.remove('active');
            if (statusEl) statusEl.textContent = '';
            showToast('Error al iniciar la cámara: ' + (err.message || err), 'danger');
            console.error('[InlineScanner]', err);
        }
    });

    if (btnStop) {
        btnStop.addEventListener('click', stopScanner);
    }

    // Parar la cámara automáticamente al cerrar el modal
    modalEl.addEventListener('hide.bs.modal', stopScanner);
}

async function renderHistory() {
    window.renderHistory = renderHistory;
    const carts = await db.cartHistory.orderBy('date').reverse().toArray();
    const list = document.getElementById('cart-history-list');

    if (carts.length === 0) {
        list.innerHTML = '<div class="alert alert-secondary text-center">No hay compras registradas.</div>';
        return;
    }

    // Mapa de fotos en cola de OpenFoodFacts agrupadas por código de barras
    const allUploads = await db.pendingUploads.toArray();
    const uploadsByBarcode = new Map();
    allUploads.forEach(u => {
        if (!uploadsByBarcode.has(u.barcode)) {
            uploadsByBarcode.set(u.barcode, []);
        }
        uploadsByBarcode.get(u.barcode).push(u);
    });

    list.innerHTML = carts.map((cart, index) => {
        const dateStr = new Date(cart.date).toLocaleDateString();
        const timeStr = new Date(cart.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const isExpanded = index === 0 ? 'true' : 'false';
        const collapseClass = index === 0 ? 'show' : '';
        const btnClass = index === 0 ? '' : 'collapsed';

        const supermarket = cart.supermarket || 'Sin supermercado';
        const hasTicket = !!(cart.ticketBlob || cart.ticketThumbBlob);
        const ticketBadge = hasTicket ? '<span class="badge bg-warning text-dark me-2">🧾 Ticket</span>' : '';
        const ticketThumbUrl = getBlobUrl(cart.ticketThumbBlob || cart.ticketBlob);

        const items = cart.items || [];
        
        return `
        <div class="accordion-item bg-dark border-secondary mb-2">
            <h2 class="accordion-header" id="heading-${cart.id}">
                <button class="accordion-button bg-dark text-white ${btnClass}" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-${cart.id}" aria-expanded="${isExpanded}" aria-controls="collapse-${cart.id}">
                    <div class="d-flex justify-content-between align-items-center w-100 me-3">
                        <span><strong>${dateStr}</strong> ${timeStr} - ${supermarket}</span>
                        <div class="d-flex align-items-center">
                            ${ticketBadge}
                            <span class="text-info fw-bold" id="cart-total-badge-${cart.id}">${(cart.total || 0).toFixed(2)} €</span>
                        </div>
                    </div>
                </button>
            </h2>
            <div id="collapse-${cart.id}" class="accordion-collapse collapse ${collapseClass}" aria-labelledby="heading-${cart.id}" data-bs-parent="#cart-history-list">
                <div class="accordion-body text-white p-3">
                    
                    <!-- Sección de Ticket -->
                    <div class="card bg-black border-secondary mb-3 p-2">
                        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                            <div class="d-flex align-items-center gap-2">
                                ${ticketThumbUrl ? `
                                    <img src="${ticketThumbUrl}" class="rounded border border-warning" style="width: 44px; height: 44px; object-fit: cover; cursor: pointer;" title="Ver ticket ampliado" onclick="window.viewCartTicket(${cart.id})">
                                    <div>
                                        <div class="fw-bold small text-warning">🧾 Ticket de compra adjunto</div>
                                        <div class="text-muted small">Haz clic en la foto para ampliarla y revisar precios</div>
                                    </div>
                                ` : `
                                    <span class="fs-4">🧾</span>
                                    <div>
                                        <div class="fw-bold small text-white">Sin foto de ticket</div>
                                        <div class="text-muted small">Puedes adjuntar la foto del ticket físico para guardarlo</div>
                                    </div>
                                `}
                            </div>
                            <div class="d-flex gap-1">
                                ${hasTicket ? `
                                    <button class="btn btn-sm btn-outline-warning" onclick="window.viewCartTicket(${cart.id})" title="Ver foto ampliada con zoom"><i class="bi bi-zoom-in"></i> Ver Ticket</button>
                                    <button class="btn btn-sm btn-outline-light" onclick="window.attachTicketToCart(${cart.id})" title="Cambiar foto de ticket">🔄 Cambiar</button>
                                    <button class="btn btn-sm btn-outline-danger" onclick="window.removeCartTicket(${cart.id})" title="Quitar ticket">✕</button>
                                ` : `
                                    <button class="btn btn-sm btn-outline-info" onclick="window.attachTicketToCart(${cart.id})"><i class="bi bi-camera"></i> 📸 Adjuntar Ticket</button>
                                `}
                            </div>
                        </div>
                    </div>

                    <div class="mb-3">
                        <label class="form-label small">Supermercado</label>
                        <div class="input-group input-group-sm mb-2">
                            <input type="text" class="form-control bg-secondary text-white border-secondary" id="supermarket-${cart.id}" value="${cart.supermarket || ''}" placeholder="Ej: Mercadona">
                        </div>
                        <label class="form-label small">Notas extras</label>
                        <textarea class="form-control form-control-sm bg-secondary text-white border-secondary mb-2" id="notes-${cart.id}" rows="2" placeholder="Notas sobre la compra...">${cart.notes || ''}</textarea>
                        <div class="d-flex flex-wrap gap-2">
                            <button class="btn btn-sm btn-success flex-grow-1" onclick="window.saveCartMeta(${cart.id})">Guardar Cambios</button>
                            <button class="btn btn-sm btn-outline-warning" onclick="window.openUnpackingAssistant(${cart.id})" title="Desempacar compra y aportar fotos a OpenFoodFacts"><i class="bi bi-box-seam me-1"></i>📦 Desempacar OFF</button>
                            <button class="btn btn-sm btn-outline-info" onclick="window.createListFromHistory(${cart.id})" title="Crear Lista de Compra">🛒 Lista</button>
                        </div>
                    </div>
                    
                    <hr class="border-secondary">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h6 class="mb-0">Productos desglosados:</h6>
                        <button class="btn btn-sm btn-outline-success" onclick="window.openAddProductToHistoryModal(${cart.id})">
                            ➕ Añadir Producto
                        </button>
                    </div>

                    ${items.length === 0 ? `
                        <div class="alert alert-secondary py-2 small mb-3">
                            ℹ️ Compra registrada por ticket (sin productos desglosados). Puedes desglosar productos mirando el ticket con el botón "➕ Añadir Producto".
                        </div>
                    ` : `
                        <ul class="list-group list-group-flush mb-3">
                            ${items.map((item, itemIdx) => {
                                const isGeneric = item.productCode.startsWith('GENERIC_');
                                const zoneBadge = isGeneric
                                  ? '<span class="badge bg-secondary ms-1" title="No alimentario">🧹</span>'
                                  : '';
                                const safeItemName = (item.productName || item.productCode).replace(/'/g, "\\'").replace(/"/g, '&quot;');
                                const histItemKey = `hist-${cart.id}-${itemIdx}`;

                                // Calcular código de barras real para OFF
                                const rawCode = item.productCode || '';
                                const cleanCode = rawCode.startsWith('GENERIC_') ? rawCode.replace(/^GENERIC_/, '') : rawCode;
                                const isNumeric = /^\d{8,14}$/.test(cleanCode);
                                const effectiveBarcode = isNumeric ? cleanCode : (rawCode.startsWith('GENERIC_') ? rawCode : '');
                                const uploads = (effectiveBarcode && uploadsByBarcode.get(effectiveBarcode)) || [];

                                let offBadge = '';
                                if (uploads.length > 0) {
                                    const doneCount = uploads.filter(u => u.status === 'done').length;
                                    const pendingCount = uploads.length - doneCount;
                                    const goOffLink = `<a href="javascript:void(0)" onclick="window.navigateToOFFZone('${effectiveBarcode}')" class="ms-1 text-decoration-none" title="Ver en zona OFF" style="font-size:0.65rem;">🌍↗</a>`;
                                    if (doneCount > 0 && pendingCount === 0) {
                                        offBadge = `<span class="badge bg-success" style="cursor:pointer; font-size: 0.7rem;" onclick="window.historyContributeToOFF('${effectiveBarcode}', '${safeItemName}', 'ingredients')" title="Subido a OpenFoodFacts (${doneCount} foto${doneCount > 1 ? 's' : ''}). Clic para añadir más">✅ OFF (${doneCount})</span>${goOffLink}`;
                                    } else {
                                        offBadge = `<span class="badge bg-warning text-dark" style="cursor:pointer; font-size: 0.7rem;" onclick="window.historyContributeToOFF('${effectiveBarcode}', '${safeItemName}', 'ingredients')" title="${uploads.length} foto(s) en cola OFF. Clic para añadir más">⏳ OFF (${uploads.length})</span>${goOffLink}`;
                                    }
                                } else if (effectiveBarcode) {
                                    offBadge = `<button type="button" class="btn btn-outline-info btn-sm py-0 px-1" style="font-size: 0.7rem;" onclick="window.historyContributeToOFF('${effectiveBarcode}', '${safeItemName}', 'front')" title="Aportar fotos de este producto a OpenFoodFacts"><i class="bi bi-camera me-1"></i>📷 OFF</button>`;
                                }

                                // Nombre: genéricos muestran botón de edición, otros van a quickDetail
                                const nameSpan = isGeneric
                                    ? `<span class="text-truncate text-warning" id="hname-display-${histItemKey}">${item.productName || item.productCode}</span>
                                       <button class="btn btn-outline-warning border-0 py-0 px-1 flex-shrink-0" style="font-size:0.65rem;" onclick="window.startRenameHistoryItem('${histItemKey}', '${safeItemName}', '${item.productCode}', ${cart.id})" title="Renombrar"><i class="bi bi-pencil-fill"></i></button>`
                                    : `<span class="text-truncate text-info" style="cursor:pointer;" onclick="window.showProductQuickDetail('${item.productCode}', '${safeItemName}')">${item.productName || item.productCode}</span>`;
                                return `
                                <li class="list-group-item bg-dark text-white px-0 py-2 d-flex justify-content-between align-items-center small border-secondary flex-wrap gap-1">
                                    <div class="d-flex align-items-center gap-1 flex-wrap" style="max-width: 52%; min-width: 0;" id="hname-wrapper-${histItemKey}">
                                      ${nameSpan}
                                      ${zoneBadge}
                                      ${offBadge}
                                    </div>
                                    <div class="d-flex align-items-center gap-2" style="flex-shrink:0;">
                                      <span class="small text-muted">${item.amount}${item.unit} ×</span>
                                      <div class="input-group input-group-sm" style="width: 85px;">
                                        <input type="number" step="0.01" min="0" class="form-control form-control-sm bg-secondary text-white border-0 text-end py-0 px-1 history-item-price" value="${(item.price || 0).toFixed(2)}" onchange="window.handleItemPriceChange(${cart.id}, ${itemIdx}, this.value)" title="Modificar precio unitario">
                                        <span class="input-group-text bg-secondary text-white border-0 py-0 px-1 small">€</span>
                                      </div>
                                      <span class="small fw-bold text-info" style="min-width: 55px; text-align: right;">= ${(item.amount * item.price).toFixed(2)}€</span>
                                      <button class="btn btn-outline-info btn-sm py-0 px-1" title="Mover zona en despensa" onclick="window.moveItemZone('${item.productCode}', '${safeItemName}')">
                                        ↔
                                      </button>
                                      <button class="btn btn-outline-danger btn-sm py-0 px-1" title="Eliminar producto de esta compra" onclick="window.handleRemoveHistoryItem(${cart.id}, ${itemIdx})">
                                        ✕
                                      </button>
                                    </div>
                                </li>`;
                            }).join('')}
                        </ul>
                    `}
                </div>
            </div>
        </div>`;
    }).join('');
}

window.saveCartMeta = async function(id) {
    const supermarket = document.getElementById(`supermarket-${id}`).value.trim();
    const notes = document.getElementById(`notes-${id}`).value.trim();
    
    await db.cartHistory.update(id, { supermarket, notes });
    showToast('Metadatos guardados');
    await renderHistory();
};

window.viewCartTicket = async function(cartId) {
    const cart = await db.cartHistory.get(cartId);
    if (!cart || (!cart.ticketBlob && !cart.ticketThumbBlob)) {
        showToast('Esta compra no tiene ticket adjunto', 'warning');
        return;
    }

    const url = getBlobUrl(cart.ticketBlob || cart.ticketThumbBlob);

    const img = document.getElementById('ticket-viewer-img');
    const title = document.getElementById('ticket-viewer-title');
    const meta = document.getElementById('ticket-viewer-meta');

    if (img) img.src = url;
    if (title) title.textContent = `🧾 Ticket: ${cart.supermarket || 'Compra'} (${new Date(cart.date).toLocaleDateString()})`;
    if (meta) meta.textContent = `Total: ${(cart.total || 0).toFixed(2)} € | ${cart.items?.length || 0} productos registrados`;

    currentZoom = 1;
    currentRotation = 0;
    const container = document.getElementById('ticket-zoom-container');
    if (container) container.style.transform = 'scale(1) rotate(0deg)';

    const modalEl = document.getElementById('modal-ticket-viewer');
    if (modalEl) {
        const modal = Modal.getOrCreateInstance(modalEl);
        modal.show();
    }
};

window.attachTicketToCart = function(cartId) {
    targetCartIdForTicket = cartId;
    const input = document.getElementById('cart-item-ticket-file-input');
    if (input) input.click();
};

window.removeCartTicket = async function(cartId) {
    if (confirm('¿Eliminar la foto del ticket de esta compra?')) {
        await CartStore.removeCartHistoryTicket(cartId);
        showToast('Ticket eliminado de la compra');
        await renderHistory();
    }
};

window.handleItemPriceChange = async function(cartId, itemIndex, newPriceStr) {
    const newPrice = parseFloat(newPriceStr) || 0;
    await CartStore.updateCartHistoryItem(cartId, itemIndex, { price: newPrice });
    showToast('💰 Precio actualizado e integrado en el histórico de precios');
    await renderHistory();
    await renderChart();
};

window.handleRemoveHistoryItem = async function(cartId, itemIndex) {
    if (confirm('¿Eliminar este producto de la compra?')) {
        await CartStore.removeCartHistoryItem(cartId, itemIndex);
        showToast('Producto eliminado');
        await renderHistory();
        await renderChart();
    }
};

window.openAddProductToHistoryModal = function(cartId) {
    document.getElementById('history-add-cart-id').value = cartId;
    document.getElementById('history-add-product-code').value = '';
    document.getElementById('form-history-add-product').reset();
    document.getElementById('history-add-amount').value = '1';
    document.getElementById('history-add-unit').value = 'unidad';

    // Ocultar el área del escáner al abrir el modal
    const wrapper = document.getElementById('scan-inline-wrapper');
    if (wrapper) wrapper.style.display = 'none';
    const toggleBtn = document.getElementById('btn-scan-inline-toggle');
    if (toggleBtn) {
        toggleBtn.innerHTML = '<i class="bi bi-upc-scan"></i>';
        toggleBtn.classList.remove('active');
    }

    const modalEl = document.getElementById('modal-history-add-product');
    if (modalEl) {
        const modal = Modal.getOrCreateInstance(modalEl);
        modal.show();
    }
};

/**
 * Mueve un producto (por código) a otra zona de despensa.
 */
window.moveItemZone = async function(code, name) {
    const pantryItem = await db.pantry.where({ productCode: code }).first();
    if (!pantryItem) {
        alert(`"${name}" no está en la despensa actualmente.`);
        return;
    }

    const currentZone = pantryItem.pantryZone || 'food';
    const targetZone = currentZone === 'food' ? 'nonfood' : 'food';
    const targetLabel = targetZone === 'food' ? '🍎 Alimentos' : '🧹 Otros';
    const currentLabel = currentZone === 'food' ? '🍎 Alimentos' : '🧹 Otros';

    if (confirm(`"${name}" está ahora en ${currentLabel}.\n¿Moverlo a ${targetLabel}?`)) {
        await PantryStore.moveToZone(code, targetZone);
        await renderHistory();
    }
};

/**
 * Muestra un modal rápido con info local del producto + enlace a OFF.
 */
window.showProductQuickDetail = async function(code, name) {
    const product = await ProductStore.getProductByCode(code);
    const modal = document.getElementById('quickDetailModal');
    if (!modal) return;

    document.getElementById('qd-product-name').textContent = product?.product_name || name;
    document.getElementById('qd-product-code').textContent = code;

    // Badges nutriscore / nova
    let badges = '';
    if (product?.nutriscore_grade) {
        const bg = ['a','b'].includes(product.nutriscore_grade.toLowerCase()) ? 'bg-success' : product.nutriscore_grade.toLowerCase() === 'e' ? 'bg-danger' : 'bg-warning text-dark';
        badges += `<span class="badge ${bg} me-1">Nutriscore: ${product.nutriscore_grade.toUpperCase()}</span>`;
    }
    if (product?.nova_group) {
        badges += `<span class="badge ${product.nova_group <= 2 ? 'bg-success' : 'bg-danger'}">Nova: ${product.nova_group}</span>`;
    }
    document.getElementById('qd-badges').innerHTML = badges || '<span class="text-muted small">Sin clasificación</span>';

    // Nutrición
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

    // Enlace OFF (solo si tiene código numérico real)
    const extractedCode = code.startsWith('GENERIC_') ? code.replace(/^GENERIC_/, '') : code;
    const realCode = product?.real_code || (/^\d+$/.test(extractedCode) ? extractedCode : null);
    const offLink = document.getElementById('qd-off-link');
    if (realCode && /^\d+$/.test(realCode)) {
        offLink.href = `https://world.openfoodfacts.org/product/${realCode}`;
        offLink.classList.remove('d-none');
    } else {
        offLink.classList.add('d-none');
    }

    // Botón Aportar fotos a OFF
    const offContributeBtn = document.getElementById('qd-off-contribute-btn');
    if (offContributeBtn) {
        if (realCode) {
            offContributeBtn.classList.remove('d-none');
            offContributeBtn.onclick = () => {
                Modal.getInstance(modal)?.hide();
                window.historyContributeToOFF(realCode, product?.product_name || name, 'front');
            };
        } else {
            offContributeBtn.classList.add('d-none');
        }
    }

    Modal.getOrCreateInstance(modal).show();
};

async function renderChart() {
    const carts = await db.cartHistory.orderBy('date').toArray();
    const ctx = document.getElementById('cart-chart');
    if (!ctx) return;

    if (carts.length === 0) {
        if (window.cartChartInstance) {
            window.cartChartInstance.destroy();
            window.cartChartInstance = null;
        }
        return;
    }

    // Agrupar por mes
    const monthlyTotals = {};
    for (const cart of carts) {
        const date = new Date(cart.date);
        const monthYear = date.toLocaleDateString([], { month: 'short', year: 'numeric' });
        if (!monthlyTotals[monthYear]) monthlyTotals[monthYear] = 0;
        monthlyTotals[monthYear] += (cart.total || 0);
    }

    const labels = Object.keys(monthlyTotals);
    const data = Object.values(monthlyTotals);

    if (window.cartChartInstance) {
        window.cartChartInstance.destroy();
    }

    if (typeof Chart !== 'undefined') {
        window.cartChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Gastos por mes (€)',
                    data: data,
                    backgroundColor: 'rgba(54, 162, 235, 0.5)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#ccc' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' }
                    },
                    x: {
                        ticks: { color: '#ccc' },
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: { labels: { color: '#fff' } }
                }
            }
        });
    }
}

window.createListFromHistory = async function(cartId) {
    const cart = await db.cartHistory.get(cartId);
    if (!cart || !cart.items || cart.items.length === 0) {
        showToast('El carro está vacío o no tiene productos', 'warning');
        return;
    }
    
    const dateStr = new Date(cart.date).toLocaleDateString();
    const name = `Compra ${dateStr} ${cart.supermarket || ''}`.trim();
    
    const items = cart.items.map(item => ({
        name: item.productName || item.productCode,
        code: item.productCode,
        amount: item.amount,
        unit: item.unit
    }));
    
    try {
        await ShoppingStore.createList(name, items);
        showToast('Lista de compra creada. Ve al carro para verla.', 'success');
        setTimeout(() => { window.location.hash = '#grid'; }, 1000);
    } catch (e) {
        showToast('Error al crear la lista: ' + e.message, 'danger');
    }
};

/**
 * Activa la edición inline del nombre de un producto genérico en el historial.
 * @param {string} key     - ID único del elemento (hist-{cartId}-{itemIdx})
 * @param {string} currentName - Nombre actual del producto
 * @param {string} productCode - Código del producto (GENERIC_...)
 * @param {number} cartId  - ID del registro en cartHistory
 */
window.startRenameHistoryItem = function(key, currentName, productCode, cartId) {
    const wrapper = document.getElementById(`hname-wrapper-${key}`);
    if (!wrapper) return;
    if (wrapper.querySelector('.hist-rename-input')) return;
    wrapper.innerHTML = `
        <div class="input-group input-group-sm">
            <input type="text" class="form-control bg-dark text-warning border-warning hist-rename-input"
                   id="hist-rename-input-${key}"
                   value="${currentName.replace(/&quot;/g, '"')}"
                   placeholder="Nombre del producto"
                   maxlength="80"
                   onkeydown="if(event.key==='Enter'){window.confirmRenameHistoryItem('${key}', '${productCode}', ${cartId});}else if(event.key==='Escape'){renderHistory();}"
            >
            <button class="btn btn-warning btn-sm" onclick="window.confirmRenameHistoryItem('${key}', '${productCode}', ${cartId})" title="Guardar"><i class="bi bi-check-lg"></i></button>
            <button class="btn btn-outline-secondary btn-sm" onclick="renderHistory()" title="Cancelar"><i class="bi bi-x-lg"></i></button>
        </div>
    `;
    const input = document.getElementById(`hist-rename-input-${key}`);
    if (input) { input.focus(); input.select(); }
};

/**
 * Confirma el renombre en historial: actualiza customProducts y regenera el historial.
 */
window.confirmRenameHistoryItem = async function(key, productCode, cartId) {
    const input = document.getElementById(`hist-rename-input-${key}`);
    if (!input) return;
    const newName = input.value.trim();
    if (!newName) { showToast('El nombre no puede estar vacío', 'warning'); return; }

    try {
        // Actualizar en customProducts (nombre global del producto)
        await ProductStore.updateCustomProduct(productCode, { product_name: newName });

        // Actualizar también el productName en los items del carrito histórico
        const cart = await db.cartHistory.get(cartId);
        if (cart && cart.items) {
            const updatedItems = cart.items.map(i =>
                i.productCode === productCode ? { ...i, productName: newName } : i
            );
            await db.cartHistory.update(cartId, { items: updatedItems });
        }

        showToast(`✅ Renombrado: ${newName}`, 'success');
        await renderHistory();
    } catch (e) {
        showToast('Error al renombrar: ' + e.message, 'danger');
    }
};

// ── Integración con OpenFoodFacts desde el Historial de Compras ──────────────

function initHistoryOffHandlers() {
    // Cámara en modal OFF
    document.getElementById('btn-history-off-camera')?.addEventListener('click', startHistoryOffCamera);
    document.getElementById('btn-history-off-take-snapshot')?.addEventListener('click', takeHistoryOffSnapshot);
    document.getElementById('btn-history-off-close-camera')?.addEventListener('click', stopHistoryOffCamera);

    // Archivo / Galería en modal OFF
    document.getElementById('btn-history-off-file')?.addEventListener('click', () => {
        document.getElementById('history-off-file-input')?.click();
    });
    document.getElementById('history-off-file-input')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setHistoryOffImage(file, file.name);
        e.target.value = '';
    });

    // Toolbar del Cropper
    document.getElementById('btn-history-off-rotate')?.addEventListener('click', () => {
        if (historyCropperInstance) historyCropperInstance.rotateClockwise();
    });
    document.getElementById('btn-history-off-reset-crop')?.addEventListener('click', () => {
        if (historyCropperInstance) historyCropperInstance.resetCrop();
    });
    document.getElementById('history-off-aspect-group')?.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-aspect]');
        if (!btn) return;
        historyAspect = btn.getAttribute('data-aspect');
        document.querySelectorAll('#history-off-aspect-group button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (historyCropperInstance) historyCropperInstance.setAspectRatio(historyAspect);
    });

    // Guardar foto en la cola
    document.getElementById('btn-history-off-save')?.addEventListener('click', handleSaveHistoryOffPhoto);

    // Limpieza al cerrar modal
    const modalEl = document.getElementById('modal-history-off-capture');
    if (modalEl) {
        modalEl.addEventListener('hidden.bs.modal', () => {
            stopHistoryOffCamera();
            if (historyCropperInstance) {
                historyCropperInstance.destroy();
                historyCropperInstance = null;
            }
            historyOriginalBlob = null;
            const statusEl = document.getElementById('history-off-image-status');
            if (statusEl) statusEl.textContent = '';
        });
    }
}

async function startHistoryOffCamera() {
    const videoEl = document.getElementById('history-off-capture-video');
    const container = document.getElementById('history-off-camera-container');
    if (!videoEl || !container) return;

    try {
        stopHistoryOffCamera();
        historyModalStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        videoEl.srcObject = historyModalStream;
        container.classList.remove('d-none');
    } catch (err) {
        showToast('No se pudo acceder a la cámara: ' + err.message, 'warning');
        document.getElementById('history-off-file-input')?.click();
    }
}

function stopHistoryOffCamera() {
    if (historyModalStream) {
        historyModalStream.getTracks().forEach(t => t.stop());
        historyModalStream = null;
    }
    document.getElementById('history-off-camera-container')?.classList.add('d-none');
}

function takeHistoryOffSnapshot() {
    const videoEl = document.getElementById('history-off-capture-video');
    if (!videoEl) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth || 800;
    canvas.height = videoEl.videoHeight || 600;
    canvas.getContext('2d').drawImage(videoEl, 0, 0);

    stopHistoryOffCamera();

    canvas.toBlob((blob) => {
        if (!blob) {
            showToast('Error al capturar la imagen', 'danger');
            return;
        }
        setHistoryOffImage(blob, 'Foto tomada con cámara');
    }, 'image/jpeg', 0.92);
}

function setHistoryOffImage(blob, label = '') {
    historyOriginalBlob = blob;
    const statusEl = document.getElementById('history-off-image-status');
    if (statusEl) statusEl.textContent = label ? `✓ ${label}` : '';

    const canvas = document.getElementById('history-off-cropper-canvas');
    if (!canvas) return;
    if (historyCropperInstance) historyCropperInstance.destroy();

    historyCropperInstance = new ImageCropper({
        canvas,
        image: blob,
        aspectRatio: historyAspect
    });
}

async function handleSaveHistoryOffPhoto() {
    const barcodeInput = document.getElementById('history-off-barcode');
    const nameInput = document.getElementById('history-off-product-name');
    const typeInput = document.getElementById('history-off-image-type');

    const barcode = barcodeInput?.value.trim();
    const productName = nameInput?.value.trim();
    const type = typeInput?.value || 'front';

    if (!barcode) {
        showToast('Debes indicar el código de barras del producto', 'warning');
        barcodeInput?.focus();
        return;
    }

    if (!historyCropperInstance && !historyOriginalBlob) {
        showToast('Debes tomar o seleccionar una foto antes de guardar', 'warning');
        return;
    }

    try {
        let croppedBlob = null;
        let cropConfig = null;

        if (historyCropperInstance) {
            croppedBlob = await historyCropperInstance.getCroppedBlob('image/jpeg', 0.88);
            cropConfig = historyCropperInstance.getCropData();
        } else if (historyOriginalBlob) {
            croppedBlob = historyOriginalBlob;
        }

        await saveImageToPendingUploads(
            barcode,
            croppedBlob,
            type,
            productName,
            historyOriginalBlob || croppedBlob,
            cropConfig
        );

        showToast(`✅ Foto de "${productName || barcode}" guardada en la cola OFF`, 'success');

        const modalEl = document.getElementById('modal-history-off-capture');
        if (modalEl) {
            Modal.getInstance(modalEl)?.hide();
        }

        await renderHistory();
    } catch (err) {
        console.error(err);
        showToast('Error al guardar foto: ' + err.message, 'danger');
    }
}

window.historyContributeToOFF = function(barcode = '', productName = '', suggestedType = 'front') {
    const modalEl = document.getElementById('modal-history-off-capture');
    if (!modalEl) return;

    document.getElementById('history-off-barcode').value = barcode || '';
    document.getElementById('history-off-product-name').value = productName || '';
    document.getElementById('history-off-image-type').value = suggestedType || 'front';
    document.getElementById('history-off-heading').textContent = productName ? `Aportar Foto: ${productName}` : 'Aportar Foto a OpenFoodFacts';

    const statusEl = document.getElementById('history-off-image-status');
    if (statusEl) statusEl.textContent = 'Selecciona o captura una foto';

    if (historyCropperInstance) {
        historyCropperInstance.destroy();
        historyCropperInstance = null;
    }
    historyOriginalBlob = null;
    const canvas = document.getElementById('history-off-cropper-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }

    Modal.getOrCreateInstance(modalEl).show();
};

window.openUnpackingAssistant = async function(cartId) {
    const cart = await db.cartHistory.get(cartId);
    if (!cart) return;

    const modalEl = document.getElementById('modal-history-unpacking-assistant');
    if (!modalEl) return;

    const titleEl = document.getElementById('unpacking-modal-title');
    if (titleEl) {
        const dateStr = new Date(cart.date).toLocaleDateString();
        titleEl.textContent = `📦 Desempacar Compra: ${cart.supermarket || 'Supermercado'} (${dateStr})`;
    }

    const allUploads = await db.pendingUploads.toArray();
    const uploadsByBarcode = new Map();
    allUploads.forEach(u => {
        if (!uploadsByBarcode.has(u.barcode)) uploadsByBarcode.set(u.barcode, []);
        uploadsByBarcode.get(u.barcode).push(u);
    });

    const items = cart.items || [];
    const container = document.getElementById('unpacking-items-list');
    if (!container) return;

    if (items.length === 0) {
        container.innerHTML = '<div class="alert alert-secondary small">Esta compra no tiene productos desglosados para desempacar.</div>';
    } else {
        container.innerHTML = items.map((item) => {
            const rawCode = item.productCode || '';
            const cleanCode = rawCode.startsWith('GENERIC_') ? rawCode.replace(/^GENERIC_/, '') : rawCode;
            const isNumeric = /^\d{8,14}$/.test(cleanCode);
            const effectiveBarcode = isNumeric ? cleanCode : (rawCode.startsWith('GENERIC_') ? rawCode : '');
            const safeItemName = (item.productName || item.productCode).replace(/'/g, "\\'").replace(/"/g, '&quot;');

            const uploads = (effectiveBarcode && uploadsByBarcode.get(effectiveBarcode)) || [];
            const doneCount = uploads.filter(u => u.status === 'done').length;
            const pendingCount = uploads.length - doneCount;

            let statusBadge = '';
            let nextType = 'front';
            if (uploads.length > 0) {
                const types = uploads.map(u => u.type);
                if (!types.includes('ingredients')) nextType = 'ingredients';
                else if (!types.includes('nutrition')) nextType = 'nutrition';
                else nextType = 'front';

                if (doneCount > 0 && pendingCount === 0) {
                    statusBadge = `<span class="badge bg-success">✅ En OFF (${doneCount} foto${doneCount > 1 ? 's' : ''})</span>`;
                } else {
                    statusBadge = `<span class="badge bg-warning text-dark">⏳ En cola OFF (${uploads.length} foto${uploads.length > 1 ? 's' : ''})</span>`;
                }
            } else {
                statusBadge = `<span class="badge bg-secondary">Sin fotos</span>`;
            }

            return `
                <div class="card bg-black border-secondary p-2 d-flex flex-row justify-content-between align-items-center gap-2">
                    <div class="overflow-hidden">
                        <div class="fw-bold text-white text-truncate" style="max-width: 340px;">${item.productName || item.productCode}</div>
                        <div class="small text-muted">
                            <code>${effectiveBarcode || 'Sin código'}</code> • ${item.amount} ${item.unit} (${item.price ? (item.amount * item.price).toFixed(2) + '€' : ''})
                        </div>
                    </div>
                    <div class="d-flex align-items-center gap-2 flex-shrink-0">
                        ${statusBadge}
                        <button type="button" class="btn btn-sm btn-outline-info" onclick="window.historyContributeToOFF('${effectiveBarcode}', '${safeItemName}', '${nextType}')" title="Aportar o añadir foto a OpenFoodFacts">
                            <i class="bi bi-camera-plus me-1"></i>+ Foto
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    Modal.getOrCreateInstance(modalEl).show();
};

// ── Navegación bidireccional: Historial → Zona OFF ─────────────────────────

/**
 * Navega a la zona de contribuciones OFF pre-filtrando por el código de barras dado.
 * Funciona tanto en modo SPA (hash routing) como en páginas independientes.
 */
window.navigateToOFFZone = function(barcode) {
    const isSPA = document.getElementById('app-view') !== null;
    if (isSPA) {
        // En SPA: cambiar hash e inyectar el barcode en el search input tras montar la vista
        window.location.hash = `off-contributions?barcode=${encodeURIComponent(barcode)}`;
        const tryFill = (attempts = 0) => {
            const searchInput = document.getElementById('off-search-input');
            if (searchInput) {
                searchInput.value = barcode;
                searchInput.dispatchEvent(new Event('input'));
            } else if (attempts < 20) {
                setTimeout(() => tryFill(attempts + 1), 150);
            }
        };
        setTimeout(() => tryFill(), 300);
    } else {
        window.location.href = `off-contributions.html?barcode=${encodeURIComponent(barcode)}`;
    }
};
