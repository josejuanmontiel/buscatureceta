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

    document.getElementById("clear-db-btn").addEventListener("click", async () => {
        await db.delete();
        await db.open();
        console.log("Base de datos borrada con éxito.");
    });

    // Botones del panel de captura de foto
    document.getElementById('btn-capture-photo').addEventListener('click', startCapture);
    document.getElementById('btn-retake-photo').addEventListener('click', startCapture);
    document.getElementById('btn-save-photo').addEventListener('click', handleSaveUnknownProduct);
    document.getElementById('btn-cancel-capture').addEventListener('click', hideUnknownPanel);

    // Sincronizar cola de imágenes pendientes con OFF
    document.getElementById('btn-sync-off').addEventListener('click', handleSync);

    // Mostrar badge inicial
    await updateSyncBadge();

    // ── Modal de Credenciales OFF ─────────────────────────────────────────────
    initCredentialsModal();

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

    // Si no es un número (código), buscar por nombre en local
    if (!/^\d+$/.test(query)) {
        const res = await ProductStore.searchProducts(query, 1);
        const p = res.length > 0 ? res[0] : null;
        if (p) {
            query = p.code;
        } else {
            if (confirm(`No se encontró "${query}" en la base de datos local.\n¿Quieres añadirlo como producto genérico sin código de barras al carrito?`)) {
                const genericCode = 'GENERIC_' + Date.now();
                await ProductStore.addCustomProduct({
                    code: genericCode,
                    product_name: query,
                    ingredients_text: '',
                    nutriscore_grade: 'unknown'
                });
                query = genericCode;
            } else {
                return;
            }
        }
    }

    const result = await ShoppingAssistant.analyzeProductForCart(query);
    
    if (result.status === 'not_found') {
        // Producto no encontrado: mostrar panel de captura
        unknownBarcode = query;
        capturedImageBlob = null;
        showUnknownProductPanel(query);
        return;
    }

    currentScannedProduct = result.product;
    showProductPanel(result);
}

function showProductPanel(analysis) {
    const p = analysis.product;
    document.getElementById('scanned-product-name').innerText = p.product_name || `Producto ${p.code}`;
    
    // Precio
    const priceInput = document.getElementById('scanned-price');
    if (analysis.lastPrice > 0) {
        priceInput.value = analysis.lastPrice;
    } else {
        priceInput.value = '';
    }

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

    document.getElementById('add-to-cart-panel').classList.remove('d-none');
}

window.selectAlternative = async function(code) {
    document.getElementById('code-input').value = code;
    await handleSearch();
};

async function handleAddToCart() {
    if (!currentScannedProduct) return;

    const amount = parseFloat(document.getElementById('scanned-amount').value) || 1;
    const price = parseFloat(document.getElementById('scanned-price').value) || 0;

    // Asumimos unit='unidad' si compramos paquetes, o si sabemos que es 500g podríamos guardar gramos. 
    // Por defecto en la lista de la compra metemos "unidades" o paquetes.
    await CartStore.addToCart(currentScannedProduct.code, amount, price, 'unidad');
    RecentStore.markAsUsed(currentScannedProduct.code);
    
    // Limpiar UI
    document.getElementById('add-to-cart-panel').classList.add('d-none');
    document.getElementById('assistant-alert').classList.add('d-none');
    document.getElementById('code-input').value = '';
    currentScannedProduct = null;

    await updateCartUI();
}

async function updateCartUI() {
    const { items, total } = await CartStore.getCart();
    
    document.getElementById('cart-total').innerText = `${total.toFixed(2)} €`;

    const list = document.getElementById('cart-list');
    if (items.length === 0) {
        list.innerHTML = '<div class="list-group-item bg-dark text-muted border-secondary text-center">Carro vacío</div>';
    } else {
        list.innerHTML = items.map(item => `
            <div class="list-group-item bg-dark text-white border-secondary d-flex justify-content-between align-items-center">
                <div>
                    <h6 class="mb-0">${item.productName}</h6>
                    <small class="text-muted">${item.amount} ${item.unit} | ${item.price.toFixed(2)}€</small>
                </div>
                <button class="btn btn-sm btn-outline-danger" onclick="window.removeFromCart(${item.id})"><i class="bi bi-trash"></i></button>
            </div>
        `).join('');
    }
}

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
                    <input type="number" class="form-control missing-weight-input" data-code="${mw.item.productCode}" placeholder="Ej: 500" min="1" required>
                    <span class="input-group-text">g/ml</span>
                </div>
            </div>
        `).join('');

        const modalEl = document.getElementById('modal-missing-weights');
        const modal = Modal.getOrCreateInstance(modalEl);
        modal.show();

        document.getElementById('btn-skip-missing-weights').onclick = async () => {
            modal.hide();
            await performCheckout(items.length);
        };

        document.getElementById('btn-save-missing-weights').onclick = async () => {
            const inputs = form.querySelectorAll('.missing-weight-input');
            let allValid = true;
            for (const input of inputs) {
                if (!input.value || parseFloat(input.value) <= 0) {
                    allValid = false;
                    input.classList.add('is-invalid');
                } else {
                    input.classList.remove('is-invalid');
                }
            }

            if (!allValid) return;

            // Save weights to db.products
            for (const input of inputs) {
                const code = input.dataset.code;
                const weightStr = parseFloat(input.value).toString();
                const p = await ProductStore.getProductByCode(code);
                if (p) {
                    if (p.is_custom) {
                        await db.customProducts.update(code, { product_quantity: weightStr });
                    } else {
                        await db.products.update(code, { product_quantity: weightStr });
                    }
                } else {
                    // Create minimal entry if it doesn't exist
                    await ProductStore.addCustomProduct({ code: code, product_name: 'Producto ' + code, product_quantity: weightStr });
                }
            }

            modal.hide();
            await performCheckout(items.length);
        };
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

// ─────────────────────────────────────────────────────────────────────────────
// Gestión de credenciales de OpenFoodFacts
// ─────────────────────────────────────────────────────────────────────────────

function initCredentialsModal() {
    const btnOpen   = document.getElementById('btn-open-credentials');
    const btnSave   = document.getElementById('btn-save-credentials');
    const btnClear  = document.getElementById('btn-clear-credentials');
    const btnVerify = document.getElementById('btn-verify-credentials');
    const btnToggle = document.getElementById('btn-toggle-password');
    const modalEl   = document.getElementById('modal-credentials');

    // Abrir modal → rellenar campos y estado actual
    btnOpen.addEventListener('click', () => {
        populateCredentialsForm();
        // Bootstrap 5 Modal
        const bsModal = Modal.getOrCreateInstance(modalEl);
        bsModal.show();
    });

    // Toggle contraseña visible
    btnToggle.addEventListener('click', () => {
        const pwd = document.getElementById('cred-password');
        pwd.type = pwd.type === 'password' ? 'text' : 'password';
        btnToggle.textContent = pwd.type === 'password' ? '👁' : '🙈';
    });

    // Guardar credenciales
    btnSave.addEventListener('click', () => {
        const user = document.getElementById('cred-username').value.trim();
        const pass = document.getElementById('cred-password').value;

        if (!user || !pass) {
            showCredStatus('warning', '⚠️ Debes introducir usuario y contraseña.');
            return;
        }
        localStorage.setItem('off_user', user);
        localStorage.setItem('off_password', pass);
        showCredStatus('success', `✅ Credenciales guardadas para el usuario <strong>${user}</strong>.`);
    });

    // Borrar credenciales
    btnClear.addEventListener('click', () => {
        if (!confirm('¿Seguro que quieres borrar las credenciales de OpenFoodFacts?')) return;
        localStorage.removeItem('off_user');
        localStorage.removeItem('off_password');
        document.getElementById('cred-username').value = '';
        document.getElementById('cred-password').value = '';
        showCredStatus('secondary', '🗑 Credenciales eliminadas. Se usará el entorno de test (off/off).');
    });

    // Verificar credenciales contra la API de test
    btnVerify.addEventListener('click', async () => {
        const user = document.getElementById('cred-username').value.trim();
        const pass = document.getElementById('cred-password').value;

        if (!user || !pass) {
            showVerifyResult('warning', '⚠️ Introduce usuario y contraseña antes de verificar.');
            return;
        }

        btnVerify.disabled = true;
        btnVerify.textContent = 'Verificando...';
        showVerifyResult('secondary', '⏳ Comprobando credenciales contra OpenFoodFacts...');

        try {
            // La API de OFF no tiene endpoint de login explícito; usamos
            // el endpoint de preferencias del usuario que requiere auth.
            const resp = await fetch(
                `https://world.openfoodfacts.net/api/v2/preferences`,
                {
                    headers: {
                        'Authorization': 'Basic ' + btoa(user + ':' + pass),
                        'Accept': 'application/json',
                    }
                }
            );

            if (resp.ok || resp.status === 200) {
                showVerifyResult('success', `✅ Credenciales correctas para <strong>${user}</strong> en el entorno de test.`);
            } else if (resp.status === 401) {
                showVerifyResult('danger', '❌ Credenciales incorrectas. Comprueba usuario y contraseña.');
            } else {
                showVerifyResult('warning', `⚠️ Respuesta inesperada (HTTP ${resp.status}). Las credenciales podrían ser válidas igualmente.`);
            }
        } catch (err) {
            showVerifyResult('danger', `❌ Error de conexión: ${err.message}`);
        } finally {
            btnVerify.disabled = false;
            btnVerify.textContent = '🔍 Verificar credenciales';
        }
    });
}

function populateCredentialsForm() {
    const user = localStorage.getItem('off_user');
    const pass = localStorage.getItem('off_password');

    document.getElementById('cred-username').value = user || '';
    document.getElementById('cred-password').value = pass || '';

    if (user && user !== 'off') {
        showCredStatus('success', `✅ Cuenta configurada: <strong>${user}</strong>`);
    } else {
        showCredStatus('warning',
            '⚠️ Sin cuenta configurada. Usando credenciales de <strong>test</strong> (off/off). ' +
            'Las fotos se subirán al entorno de pruebas, no a la BD real.'
        );
    }
    document.getElementById('cred-verify-result').classList.add('d-none');
}

function showCredStatus(type, html) {
    const el = document.getElementById('cred-status');
    el.className = `alert alert-${type} py-2 mb-3 small`;
    el.innerHTML = html;
}

function showVerifyResult(type, html) {
    const el = document.getElementById('cred-verify-result');
    el.className = `alert alert-${type} py-2 small`;
    el.innerHTML = html;
    el.classList.remove('d-none');
}