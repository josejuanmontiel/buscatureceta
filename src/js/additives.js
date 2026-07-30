import * as AdditivesStore from './modules/additives/AdditivesStore.js';

export async function initView() {
    const searchInput = document.getElementById('additives-search-input');
    const searchBtn = document.getElementById('btn-search-additives');
    
    // Bind events
    searchBtn.addEventListener('click', () => performSearch(searchInput.value));
    searchInput.addEventListener('keyup', (e) => {
        clearTimeout(window._additivesDebounce);
        window._additivesDebounce = setTimeout(() => performSearch(e.target.value), 300);
    });

    // Initial render
    performSearch('');
}

async function performSearch(query) {
    const listContainer = document.getElementById('additives-list');
    listContainer.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-info"></div></div>';
    
    const results = await AdditivesStore.searchAdditives(query);
    
    if (results.length === 0) {
        listContainer.innerHTML = '<div class="alert alert-secondary text-center">No se encontraron aditivos.</div>';
        return;
    }
    
    listContainer.innerHTML = results.map(item => {
        let badgeColor = 'bg-success';
        if (item.risk === 'medio') badgeColor = 'bg-warning text-dark';
        if (item.risk === 'alto') badgeColor = 'bg-danger';
        
        return `
            <div class="card bg-dark border-secondary mb-3">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h5 class="card-title text-white mb-0">
                            <span class="text-info">${item.code}</span> - ${item.name}
                        </h5>
                        <span class="badge ${badgeColor}">${item.risk ? 'Riesgo ' + item.risk : ''}</span>
                    </div>
                    <h6 class="card-subtitle mb-2 text-muted">${item.category}</h6>
                    <p class="card-text small text-light">${item.description || 'Sin descripción.'}</p>
                    <div class="d-flex flex-column flex-sm-row gap-2 mt-3">
                        <a href="https://es.wikipedia.org/wiki/${item.code}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-info w-100">
                            <i class="bi bi-wikipedia me-1"></i> Wikipedia
                        </a>
                        <a href="https://ec.europa.eu/food/food-feed-portal/screen/food-additives/search?name=${encodeURIComponent(item.name)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-primary w-100" title="Buscar en Base de Datos de la UE">
                            🇪🇺 Buscar en UE
                        </a>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}
