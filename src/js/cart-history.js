import { db } from './db/schema.js';

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
                        <button class="btn btn-sm btn-success w-100" onclick="window.saveCartMeta(${cart.id})">Guardar Cambios</button>
                    </div>
                    
                    <hr class="border-secondary">
                    <h6 class="mb-3">Productos:</h6>
                    <ul class="list-group list-group-flush">
                        ${cart.items.map(item => `
                            <li class="list-group-item bg-dark text-white px-0 py-1 d-flex justify-content-between small border-secondary">
                                <span class="text-truncate" style="max-width: 60%;">${item.productName || item.productCode}</span>
                                <span>${item.amount}${item.unit} x ${item.price}€ = ${(item.amount * item.price).toFixed(2)}€</span>
                            </li>
                        `).join('')}
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
    // Refrescar para actualizar la cabecera y mantener todo bien
    await renderHistory();
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
