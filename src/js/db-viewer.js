import { db } from './db/schema.js';
import * as ProductStore from './modules/products/ProductStore.js';
import * as PrimaryFoodStore from './modules/products/PrimaryFoodStore.js';
import {TabulatorFull as Tabulator} from 'tabulator-tables';
import 'tabulator-tables/dist/css/tabulator_midnight.min.css';

let table;
let currentDb = 'official'; // 'official', 'primary' o 'custom'

export async function initView() {
    // Sincronizar estado con la UI por si venimos de otra vista (SPA)
    const checkedRadio = document.querySelector('input[name="dbtype"]:checked');
    if (checkedRadio) currentDb = checkedRadio.value;

    await updateCount();

    // Configuración de columnas base
    const numFormatter = (field) => (cell) => {
        const row = cell.getData();
        const v = cell.getValue() ?? row?.nutriments?.[field];
        if (v === undefined || v === null || v === '') return '-';
        const num = parseFloat(v);
        return isNaN(num) ? '-' : (Math.round(num * 10) / 10).toString();
    };

    const columns = [
        { title: "Código", field: "code", width: 150, headerFilter: "input", editable: false },
        { title: "Nombre", field: "product_name", headerFilter: "input", editable: false },
        { title: "Marcas / Origen", field: "brands", width: 160, headerFilter: "input", editable: false },
        { title: "Nutriscore", field: "nutriscore_grade", width: 100, formatter: "uppercase", hozAlign: "center", editable: false },
        { title: "Energía (kcal)", field: "energy-kcal_100g", width: 120, hozAlign: "right", formatter: numFormatter('energy-kcal_100g'), editable: false },
        { title: "Proteínas (g)", field: "proteins_100g", width: 110, hozAlign: "right", formatter: numFormatter('proteins_100g'), editable: false },
        { title: "Carbohidratos (g)", field: "carbohydrates_100g", width: 130, hozAlign: "right", formatter: numFormatter('carbohydrates_100g'), editable: false },
        { title: "Grasas (g)", field: "fat_100g", width: 100, hozAlign: "right", formatter: numFormatter('fat_100g'), editable: false }
    ];

    // Inicializar Tabulator
    table = new Tabulator("#db-table", {
        data: [], // Se carga luego
        layout: "fitColumns",
        pagination: "local",
        paginationSize: 50,
        placeholder: "No hay datos disponibles",
        columns: columns,
    });

    // Evento de edición de celdas (solo afecta a custom)
    table.on("cellEdited", async function(cell) {
        if (currentDb !== 'custom') return;
        const rowData = cell.getRow().getData();
        const field = cell.getField();
        const newVal = cell.getValue();

        try {
            await ProductStore.updateCustomProduct(rowData.code, { [field]: newVal });
            showToast(`Actualizado ${field}. Sincronizando con agenda...`);
        } catch (err) {
            alert('Error al guardar: ' + err.message);
        }
    });

    // Cargar datos iniciales y forzar redibujado
    await loadTableData();
    setTimeout(() => { if (table) table.redraw(true); }, 0);

    // Toggle de BD
    document.querySelectorAll('input[name="dbtype"]').forEach(radio => {
        radio.addEventListener('change', async (e) => {
            currentDb = e.target.value;
            await updateCount();
            
            // Si es custom, hacer editables las columnas nutricionales y el nombre
            const isCustom = currentDb === 'custom';
            const newCols = columns.map(col => {
                if (['energy-kcal_100g', 'proteins_100g', 'carbohydrates_100g', 'fat_100g', 'product_name', 'brands'].includes(col.field)) {
                    return { ...col, editor: isCustom ? "input" : false, editable: isCustom };
                }
                return col;
            });
            table.setColumns(newCols);
            
            document.getElementById('db-search').value = '';
            await loadTableData();
        });
    });

    // Búsqueda
    const searchInput = document.getElementById('db-search');
    let searchTimeout;

    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const term = e.target.value.trim().toLowerCase();

        searchTimeout = setTimeout(async () => {
            if (term.length < 2 && term.length > 0) return;
            
            const countEl = document.getElementById('db-count');
            countEl.textContent = "Buscando...";

            let results = [];

            if (currentDb === 'primary') {
                if (term.length === 0) {
                    const all = await PrimaryFoodStore.getAllPrimaryFoods();
                    results = all.map(PrimaryFoodStore.primaryFoodToProduct);
                } else {
                    results = await PrimaryFoodStore.searchPrimaryFoods(term, 100);
                }
            } else {
                const targetDb = currentDb === 'custom' ? db.customProducts : db.products;

                if (term.length === 0) {
                    results = await targetDb.limit(1000).toArray();
                } else {
                    const terms = term.split(' ').filter(t => t.length > 0);
                    
                    // 1. Si es un código exacto
                    if (/^\d+$/.test(terms[0]) && terms.length === 1) {
                        const exact = await targetDb.get(terms[0]);
                        if (exact) results = [exact];
                    }
                    
                    // 2. Búsqueda por texto
                    if (results.length === 0) {
                        let scanned = 0;
                        results = await targetDb.toCollection()
                            .until(() => {
                                scanned++;
                                return scanned > 15000;
                            })
                            .filter(p => {
                                const name = (p.product_name || '').toLowerCase();
                                const brand = (p.brands || '').toLowerCase();
                                const code = (p.code || '').toLowerCase();
                                return terms.every(t => name.includes(t) || brand.includes(t) || code.includes(t));
                            })
                            .limit(150)
                            .toArray();
                    }
                }
            }

            table.replaceData(results);
            await updateCount(results.length);
        }, 300);
    });
}

async function loadTableData() {
    if (currentDb === 'primary') {
        const all = await PrimaryFoodStore.getAllPrimaryFoods();
        const data = all.map(PrimaryFoodStore.primaryFoodToProduct);
        table.replaceData(data);
        return;
    }
    const targetDb = currentDb === 'custom' ? db.customProducts : db.products;
    const initialData = await targetDb.limit(1000).toArray();
    table.replaceData(initialData);
}

async function updateCount(overrideCount) {
    const countEl = document.getElementById('db-count');
    if (!countEl) return;

    if (overrideCount !== undefined) {
        countEl.textContent = `${overrideCount} productos`;
        return;
    }

    if (currentDb === 'primary') {
        const all = await PrimaryFoodStore.getAllPrimaryFoods();
        countEl.textContent = `${all.length} alimentos básicos (BEDCA)`;
        return;
    }

    const count = currentDb === 'custom' ? await db.customProducts.count() : await db.products.count();
    countEl.textContent = `${count} productos`;
}

// Pequeño toast para el visor
function showToast(msg) {
    let toast = document.getElementById('viewer-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'viewer-toast';
        toast.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background: #198754; color: white; padding: 10px 20px; border-radius: 5px; z-index: 9999; transition: opacity 0.3s; opacity: 0;';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    setTimeout(() => toast.style.opacity = '0', 3000);
}
