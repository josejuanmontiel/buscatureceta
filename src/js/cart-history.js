import { db } from './db/schema.js';
import * as PantryStore from './modules/pantry/PantryStore.js';
import * as ShoppingStore from './modules/shopping/ShoppingStore.js';
import * as ProductStore from './modules/products/ProductStore.js';
import { showToast } from './modules/ui/UI.js';

export async function initView() {
    await renderHistory();
    await renderChart();
}

async function renderHistory() {
    const carts = await db.cartHistory.orderBy('date').reverse().toArray();
    const list = document.getElementById('cart-history-list');

    if (carts.length === 0) {
        list.innerHTML = '<div class="alert alert-secondary text-center">No hay compras registradas.</div>';
        return;
    }

    list.innerHTML = carts.map((cart, index) => {
        const dateStr = new Date(cart.date).toLocaleDateString();
        const timeStr = new Date(cart.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const isExpanded = index === 0 ? 'true' : 'false';
        const collapseClass = index === 0 ? 'show' : '';
        const btnClass = index === 0 ? '' : 'collapsed';

        const supermarket = cart.supermarket || 'Sin supermercado';
        
        return `
        <div class="accordion-item bg-dark border-secondary mb-2">
            <h2 class="accordion-header" id="heading-${cart.id}">
                <button class="accordion-button bg-dark text-white ${btnClass}" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-${cart.id}" aria-expanded="${isExpanded}" aria-controls="collapse-${cart.id}">
                    <div class="d-flex justify-content-between w-100 me-3">
                        <span><strong>${dateStr}</strong> ${timeStr} - ${supermarket}</span>
                        <span class="text-info fw-bold">${(cart.total || 0).toFixed(2)} €</span>
                    </div>
                </button>
            </h2>
            <div id="collapse-${cart.id}" class="accordion-collapse collapse ${collapseClass}" aria-labelledby="heading-${cart.id}" data-bs-parent="#cart-history-list">
                <div class="accordion-body text-white p-3">
                    <div class="mb-3">
                        <label class="form-label small">Supermercado</label>
                        <div class="input-group input-group-sm mb-2">
                            <input type="text" class="form-control bg-secondary text-white border-secondary" id="supermarket-${cart.id}" value="${cart.supermarket || ''}" placeholder="Ej: Mercadona">
                        </div>
                        <label class="form-label small">Notas extras</label>
                        <textarea class="form-control form-control-sm bg-secondary text-white border-secondary mb-2" id="notes-${cart.id}" rows="2" placeholder="Notas sobre la compra...">${cart.notes || ''}</textarea>
                        <div class="d-flex gap-2">
                            <button class="btn btn-sm btn-success flex-grow-1" onclick="window.saveCartMeta(${cart.id})">Guardar Cambios</button>
                            <button class="btn btn-sm btn-outline-info" onclick="window.createListFromHistory(${cart.id})" title="Crear Lista de Compra">🛒 Lista</button>
                        </div>
                    </div>
                    
                    <hr class="border-secondary">
                    <h6 class="mb-3">Productos:</h6>
                    <ul class="list-group list-group-flush">
                        ${cart.items.map(item => {
                            const isGeneric = item.productCode.startsWith('GENERIC_');
                            const zoneBadge = isGeneric
                              ? '<span class="badge bg-secondary ms-1" title="No alimentario">🧹</span>'
                              : '';
                            return `
                            <li class="list-group-item bg-dark text-white px-0 py-1 d-flex justify-content-between align-items-center small border-secondary">
                                <div class="d-flex align-items-center gap-1 text-truncate" style="max-width: 55%;">
                                  <span class="text-truncate text-info" style="cursor:pointer;" onclick="window.showProductQuickDetail('${item.productCode}', '${(item.productName || item.productCode).replace(/'/g, "\'")}')">${item.productName || item.productCode}</span>
                                  ${zoneBadge}
                                </div>
                                <div class="d-flex align-items-center gap-2" style="flex-shrink:0;">
                                  <span>${item.amount}${item.unit} x ${item.price}€ = ${(item.amount * item.price).toFixed(2)}€</span>
                                  <button class="btn btn-outline-info btn-sm py-0 px-1" title="Mover zona en despensa" onclick="window.moveItemZone('${item.productCode}', '${(item.productName || item.productCode).replace(/'/g, "\'")}')">
                                    ↔
                                  </button>
                                </div>
                            </li>`;
                        }).join('')}
                    </ul>
                </div>
            </div>
        </div>`;
    }).join('');
}

window.saveCartMeta = async function(id) {
    const supermarket = document.getElementById(`supermarket-${id}`).value.trim();
    const notes = document.getElementById(`notes-${id}`).value.trim();
    
    await db.cartHistory.update(id, { supermarket, notes });
    await renderHistory();
};

/**
 * Mueve un producto (por código) a otra zona de despensa.
 * Muestra un pequeño confirm inline sin modal para no depender del DOM de la despensa.
 */
window.moveItemZone = async function(code, name) {
    const isGeneric = code.startsWith('GENERIC_');
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
    const realCode = product?.real_code || (!code.startsWith('GENERIC_') ? code : null);
    const offLink = document.getElementById('qd-off-link');
    if (realCode && /^\d+$/.test(realCode)) {
        offLink.href = `https://world.openfoodfacts.org/product/${realCode}`;
        offLink.classList.remove('d-none');
    } else {
        offLink.classList.add('d-none');
    }

    const { Modal } = await import('bootstrap');
    Modal.getOrCreateInstance(modal).show();
};

async function renderChart() {
    const carts = await db.cartHistory.orderBy('date').toArray();
    if (carts.length === 0) return;

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

    const ctx = document.getElementById('cart-chart');
    if (window.cartChartInstance) {
        window.cartChartInstance.destroy();
    }

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

window.createListFromHistory = async function(cartId) {
    const cart = await db.cartHistory.get(cartId);
    if (!cart || !cart.items || cart.items.length === 0) {
        showToast('El carro está vacío o no existe', 'warning');
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
