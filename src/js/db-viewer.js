import { db } from './db/schema.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Mostrar recuento total rápido
    const count = await db.products.count();
    document.getElementById('db-count').textContent = `${count} productos`;

    if (count === 0) {
        document.getElementById('db-table').innerHTML = '<div class="alert alert-warning">La base de datos está vacía. Ve a "Inicio" para cargarla.</div>';
        return;
    }

    // 2. Cargar los primeros 1000 registros para no bloquear la UI si son 400k
    // (En una app real con millones de filas, Tabulator puede usar Ajax/Pagination directamente contra IndexedDB,
    // pero para nuestro caso, limitamos la vista inicial para rendimiento).
    const initialData = await db.products.limit(1000).toArray();

    // 3. Inicializar Tabulator
    const table = new Tabulator("#db-table", {
        data: initialData,
        layout: "fitColumns",
        responsiveLayout: "collapse",
        pagination: "local",
        paginationSize: 50,
        placeholder: "No hay datos disponibles",
        columns: [
            { title: "Código", field: "code", width: 150, headerFilter: "input" },
            { title: "Nombre", field: "product_name", headerFilter: "input" },
            { title: "Marcas", field: "brands", width: 150, headerFilter: "input" },
            { title: "Nutriscore", field: "nutriscore_grade", width: 100, formatter: "uppercase", hozAlign: "center" },
            { title: "Energía (kcal)", field: "energy-kcal_100g", width: 120, hozAlign: "right" },
            { title: "Nova", field: "nova_group", width: 80, hozAlign: "center" }
        ],
    });

    // 4. Búsqueda manual contra IndexedDB para saltar el límite de 1000
    const searchInput = document.getElementById('db-search');
    let searchTimeout;

    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const term = e.target.value.trim().toLowerCase();

        searchTimeout = setTimeout(async () => {
            if (term.length < 3 && term.length > 0) return; // Esperar al menos 3 caracteres

            let results = [];
            if (term.length === 0) {
                // Volver a los primeros 1000
                results = await db.products.limit(1000).toArray();
            } else if (/^\d+$/.test(term)) {
                // Si son números, buscar por código exacto o que empiece por...
                // Dexie no soporta 'startsWith' nativo en strings a menos que usemos bounds.
                // Lo más fácil es filtrar.
                results = await db.products.filter(p => p.code && String(p.code).includes(term)).limit(500).toArray();
            } else {
                // Buscar por nombre
                results = await db.products.filter(p => p.product_name && p.product_name.toLowerCase().includes(term)).limit(500).toArray();
            }

            table.replaceData(results);
        }, 500); // Debounce de 500ms
    });
});
