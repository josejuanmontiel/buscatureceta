import { db, migrateFromLegacyDB } from './db/schema.js';
import * as CartStore from './modules/cart/CartStore.js';
import * as ShoppingAssistant from './modules/insights/ShoppingAssistant.js';

let currentScannedProduct = null;

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    await migrateFromLegacyDB().catch(console.error);
    await updateCartUI();

    document.getElementById("query-btn").addEventListener("click", handleSearch);
    document.getElementById("code-input").addEventListener("keypress", (e) => {
        if (e.key === 'Enter') handleSearch();
    });
    
    document.getElementById("btn-add-cart").addEventListener("click", handleAddToCart);
    document.getElementById("btn-checkout").addEventListener("click", handleCheckout);
    document.getElementById("scan-btn").addEventListener("click", () => {
        window.location.href = "/scan.html";
    });

    document.getElementById("clear-db-btn").addEventListener("click", async () => {
        await db.delete();
        await db.open();
        console.log("Base de datos borrada con éxito.");
    });

    // Leer parámetro URL si venimos del scanner
    const urlParams = new URLSearchParams(window.location.search);
    const codeFromUrl = urlParams.get('code');
    if (codeFromUrl) {
        document.getElementById("code-input").value = codeFromUrl;
        handleSearch();
    }
});

async function handleSearch() {
    let query = document.getElementById("code-input").value.trim();
    if (!query) return;

    // Si no es un número (código), buscar por nombre en local
    if (!/^\d+$/.test(query)) {
        const qLower = query.toLowerCase();
        const p = await db.products.filter(pr => pr.product_name && pr.product_name.toLowerCase().includes(qLower)).first();
        if (p) query = p.code;
        else return alert("No se encontró producto con ese nombre");
    }

    const result = await ShoppingAssistant.analyzeProductForCart(query);
    
    if (result.status === 'not_found') {
        alert("Producto no encontrado en la base de datos local.");
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

window.selectAlternative = function(code) {
    document.getElementById('code-input').value = code;
    handleSearch();
};

async function handleAddToCart() {
    if (!currentScannedProduct) return;

    const amount = parseFloat(document.getElementById('scanned-amount').value) || 1;
    const price = parseFloat(document.getElementById('scanned-price').value) || 0;

    // Asumimos unit='unidad' si compramos paquetes, o si sabemos que es 500g podríamos guardar gramos. 
    // Por defecto en la lista de la compra metemos "unidades" o paquetes.
    await CartStore.addToCart(currentScannedProduct.code, amount, price, 'unidad');
    
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
    if (items.length === 0) return alert('El carro está vacío');

    if (confirm(`¿Terminar compra y mover ${items.length} productos a la despensa?`)) {
        await CartStore.checkout();
        alert('¡Compra guardada en Despensa!');
        window.location.href = 'pantry.html';
    }
}