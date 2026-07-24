import * as RecentStore from "./modules/products/RecentStore.js";
import * as ProductStore from "./modules/products/ProductStore.js";
import { db, migrateFromLegacyDB } from './db/schema.js';
import * as CartStore from './modules/cart/CartStore.js';
import * as ShoppingAssistant from './modules/insights/ShoppingAssistant.js';
import { saveImageToPendingUploads, syncPendingUploads, countPendingUploads } from './api/openFoodFacts.js';
import { Modal } from 'bootstrap';
import { showToast, confirmModal } from './modules/ui/UI.js';

let currentScannedProduct = null;
let capturedImageBlob = null;
let unknownBarcode = null;
// Expose to allow Playwright tests to wait for product to be loaded
Object.defineProperty(window, 'currentScannedProduct', {
    get: () => currentScannedProduct,
    configurable: true
});


// Inicialización
export async function initView() {
    await migrateFromLegacyDB().catch(console.error);
    await updateCartUI();

    document.getElementById("query-btn").addEventListener("click", handleSearch);
    document.getElementById("code-input").addEventListener("keypress", (e) => {
        if (e.key === 'Enter') handleSearch();
    });
    
    document.getElementById("btn-add-cart").addEventListener("click", handleAddToCart);
    document.getElementById("btn-checkout").addEventListener("click", handleCheckout);
    document.getElementById("scan-btn").addEventListener("click", () => {
        window.location.href = '/scan.html?return=%23grid';
    });

    const clearDbBtn = document.getElementById("clear-db-btn");
    if (clearDbBtn) {
        clearDbBtn.addEventListener("click", async () => {
            await db.delete();
            await db.open();
            console.log("Base de datos borrada con éxito.");
        });
    }

    // Botones del panel de captura de foto
    document.getElementById('btn-capture-photo').addEventListener('click', startCapture);
    document.getElementById('btn-retake-photo').addEventListener('click', startCapture);
    document.getElementById('btn-save-photo').addEventListener('click', handleSaveUnknownProduct);
    document.getElementById('btn-cancel-capture').addEventListener('click', hideUnknownPanel);

    // Sincronizar cola de imágenes pendientes con OFF
    document.getElementById('btn-sync-off').addEventListener('click', handleSync);

    // Mostrar badge inicial
    await updateSyncBadge();

    // Leer parámetro URL si venimos del scanner
    const urlParams = new URLSearchParams(window.location.hash.includes('?') ? window.location.hash.split('?')[1] : window.location.search);
    const codeFromUrl = urlParams.get('code');
    if (codeFromUrl) {
        document.getElementById("code-input").value = codeFromUrl;
        handleSearch();
    }
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
            // Producto no encontrado por código, añadir como genérico al instante
            const genericCode = 'GENERIC_' + Date.now();
            await ProductStore.addCustomProduct({
                code: genericCode,
                product_name: 'Producto ' + query, // Usar el query escaneado
                ingredients_text: '',
                nutriscore_grade: 'unknown'
            });
            // Añadir al carro directamente
            await CartStore.addToCart(genericCode, 1, 0, 'unidad');
            document.getElementById('code-input').value = '';
            await updateCartUI();
            return;
        }

        // Si se encuentra, añadir directamente al carro
        currentScannedProduct = result.product;
        await CartStore.addToCart(result.product.code, 1, result.lastPrice || 0, 'unidad');
        RecentStore.markAsUsed(result.product.code);

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
    
    document.getElementById('cart-total').innerText = `${total.toFixed(2)} €`;

    const hasOFF = localStorage.getItem('off_user') && localStorage.getItem('off_user') !== 'off';

    const list = document.getElementById('cart-list');
    if (items.length === 0) {
        list.innerHTML = '<div class="list-group-item bg-dark text-muted border-secondary text-center">Carro vacío</div>';
    } else {
        list.innerHTML = items.map(item => {
            const isGeneric = item.productCode.startsWith('GENERIC_');
            const showOFFButton = isGeneric && hasOFF;
            return `
            <div class="list-group-item bg-dark text-white border-secondary d-flex flex-column gap-2">
                <div class="d-flex justify-content-between align-items-center">
                    <h6 class="mb-0 text-truncate me-2">${item.productName}</h6>
                    <div class="d-flex gap-2">
                        ${showOFFButton ? `<button class="btn btn-sm btn-outline-info" onclick="window.triggerOFFUpload('${item.productCode}')" title="Subir foto a OpenFoodFacts"><i class="bi bi-camera"></i> OFF</button>` : ''}
                        <button class="btn btn-sm btn-outline-danger" onclick="window.removeFromCart(${item.id})"><i class="bi bi-trash"></i></button>
                    </div>
                </div>
                <div class="d-flex align-items-center w-100 gap-2" id="cart-item-${item.id}">
                    <div class="input-group input-group-sm w-50">
                        <input type="number" class="form-control bg-dark text-white border-secondary cart-amount-input" value="${item.amount}" min="0" step="0.1" onchange="window.updateCartItem(${item.id})">
                        <span class="input-group-text bg-secondary text-white border-secondary">${item.unit}</span>
                    </div>
                    <div class="input-group input-group-sm w-50">
                        <input type="number" class="form-control bg-dark text-white border-secondary cart-price-input" value="${item.price}" min="0" step="0.01" onchange="window.updateCartItem(${item.id})">
                        <span class="input-group-text bg-secondary text-white border-secondary">€</span>
                    </div>
                </div>
            </div>
        `}).join('');
    }
}

window.triggerOFFUpload = function(code) {
    unknownBarcode = code;
    capturedImageBlob = null;
    showUnknownProductPanel(code);
    // Rellenamos el nombre del producto de lo que el usuario haya tecleado
    ProductStore.getProductByCode(code).then(p => {
        if (p) document.getElementById('unknown-product-name').value = p.product_name.replace(/^Producto /, '');
    });
};

window.updateCartItem = async function(id) {
    const container = document.getElementById(`cart-item-${id}`);
    if (!container) return;
    const amount = container.querySelector('.cart-amount-input').value;
    const price = container.querySelector('.cart-price-input').value;
    await CartStore.updateCartItem(id, amount, price);
    await updateCartUI();
};

window.removeFromCart = async function(id) {
    await CartStore.removeFromCart(id);
    await updateCartUI();
};

async function handleCheckout() {
    const { items } = await CartStore.getCart();
    if (items.length === 0) return showToast('El carro está vacío', 'warning');

    const missingWeights = [];
    for (const item of items) {
        if (item.unit === 'unidad') {
            const product = await ProductStore.getProductByCode(item.productCode);
            if (!product || !product.product_quantity || isNaN(parseFloat(product.product_quantity)) || parseFloat(product.product_quantity) <= 0) {
                missingWeights.push({ item, product });
            }
        }
    }

    if (missingWeights.length > 0) {
        const form = document.getElementById('missing-weights-form');
        form.innerHTML = missingWeights.map(mw => `
            <div class="mb-3">
                <label class="form-label small">${mw.product?.product_name || mw.item.productName || mw.item.productCode}</label>
                <div class="input-group input-group-sm">
                    <input type="number" class="form-control missing-weight-input" data-code="${mw.item.productCode}" placeholder="Ej: 500" min="1">
                    <span class="input-group-text">g/ml</span>
                </div>
            </div>
        `).join('');

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

            // Guardar pesos en la BD
            for (const input of inputs) {
                const code = input.dataset.code;
                const weight = parseFloat(input.value);
                const weightStr = weight.toString();
                try {
                    const p = await ProductStore.getProductByCode(code);
                    if (p) {
                        if (p.is_custom) {
                            await db.customProducts.update(code, { product_quantity: weightStr });
                        } else {
                            // Para productos OFF, actualizamos solo ese campo
                            await db.products.where('code').equals(code).modify({ product_quantity: weightStr });
                        }
                    } else {
                        await ProductStore.addCustomProduct({ code, product_name: 'Producto ' + code, product_quantity: weightStr });
                    }
                } catch(err) {
                    console.error('Error guardando peso para', code, err);
                }
            }

            modal.hide();
            await performCheckout(items.length);
        });
    } else {
        await performCheckout(items.length);
    }
}

async function performCheckout(itemCount) {
    if (confirm(`¿Terminar compra y mover ${itemCount} productos a la despensa?`)) {
        const warnings = await CartStore.checkout();
        let msg = '¡Compra guardada en Despensa!';
        if (warnings && warnings.length > 0) {
            msg += "\n\n⚠️ Atención:\n" + warnings.join("\n") + "\n\nSe ha asumido 1kg para los que no tenían peso.";
        }
        showToast(msg.replace(/\n/g, '<br>'));
        setTimeout(() => window.location.hash = '#pantry', 1000);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel de producto desconocido y captura de foto
// ─────────────────────────────────────────────────────────────────────────────

function showUnknownProductPanel(barcode) {
    document.getElementById('unknown-barcode-label').textContent = barcode;
    document.getElementById('unknown-product-panel').classList.remove('d-none');
    document.getElementById('add-to-cart-panel').classList.add('d-none');
    document.getElementById('assistant-alert').classList.add('d-none');
    document.getElementById('photo-preview-container').classList.add('d-none');
    document.getElementById('btn-save-photo').classList.add('d-none');
    document.getElementById('btn-retake-photo').classList.add('d-none');
}

function hideUnknownPanel() {
    document.getElementById('unknown-product-panel').classList.add('d-none');
    capturedImageBlob = null;
    unknownBarcode = null;
    stopCamera();
}

let stream = null;

async function startCapture() {
    const videoEl = document.getElementById('capture-video');
    const cameraContainer = document.getElementById('camera-container');

    try {
        stopCamera();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        videoEl.srcObject = stream;
        cameraContainer.classList.remove('d-none');
        document.getElementById('btn-capture-photo').textContent = '📸 Hacer foto';
        document.getElementById('btn-capture-photo').onclick = takeSnapshot;
    } catch (err) {
        alert('No se pudo acceder a la cámara: ' + err.message);
    }
}

function takeSnapshot() {
    const videoEl = document.getElementById('capture-video');
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    canvas.getContext('2d').drawImage(videoEl, 0, 0);

    stopCamera();
    document.getElementById('camera-container').classList.add('d-none');

    canvas.toBlob((blob) => {
        capturedImageBlob = blob;
        const preview = document.getElementById('photo-preview');
        preview.src = URL.createObjectURL(blob);
        document.getElementById('photo-preview-container').classList.remove('d-none');
        document.getElementById('btn-save-photo').classList.remove('d-none');
        document.getElementById('btn-retake-photo').classList.remove('d-none');
        document.getElementById('btn-capture-photo').textContent = '📷 Abrir cámara';
        document.getElementById('btn-capture-photo').onclick = startCapture;
    }, 'image/jpeg', 0.9);
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
    }
}

async function handleSaveUnknownProduct() {
    if (!capturedImageBlob || !unknownBarcode) return;

    const nameInput = document.getElementById('unknown-product-name').value.trim();
    const imageType = document.getElementById('unknown-image-type').value;

    try {
        await saveImageToPendingUploads(unknownBarcode, capturedImageBlob, imageType, nameInput);
        await updateSyncBadge();
        alert(`¡Imagen guardada! El producto se ha creado localmente y la foto está en cola para subir a OpenFoodFacts.`);
        hideUnknownPanel();
        // El producto ya está en local, permitir que el usuario lo busque
        document.getElementById('code-input').value = unknownBarcode;
        handleSearch();
    } catch (err) {
        alert('Error al guardar: ' + err.message);
    }
}

async function handleSync() {
    const btn = document.getElementById('btn-sync-off');
    btn.disabled = true;
    btn.textContent = 'Sincronizando...';

    try {
        const { ok, failed } = await syncPendingUploads((processed, total) => {
            btn.textContent = `Sincronizando ${processed}/${total}...`;
        });
        alert(`Sincronización completada: ${ok} éxitos, ${failed} errores.`);
    } catch (err) {
        alert('Error en la sincronización: ' + err.message);
    } finally {
        btn.disabled = false;
        await updateSyncBadge();
    }
}

async function updateSyncBadge() {
    const count = await countPendingUploads();
    const badge = document.getElementById('sync-badge');
    if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('d-none');
    } else {
        badge.classList.add('d-none');
    }
}
