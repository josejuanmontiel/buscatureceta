export class Router {
  constructor(routes) {
    this.routes = routes;
    this.currentViewId = null;
    this.appView = document.getElementById('app-view');
    
    window.addEventListener('hashchange', () => this.handleRoute());
  }

  async handleRoute() {
    let hash = window.location.hash.slice(1) || 'index';
    
    // Support URL parameters in hash like #grid?code=123
    let viewName = hash;
    let queryParams = '';
    const qIndex = hash.indexOf('?');
    if (qIndex !== -1) {
      viewName = hash.slice(0, qIndex);
      queryParams = hash.slice(qIndex);
      // We manually update window.location.search for compatibility with old code
      // that does new URLSearchParams(window.location.search)
      const url = new URL(window.location);
      url.search = queryParams;
      window.history.replaceState({}, '', url);
    } else {
      // clear search if no params
      const url = new URL(window.location);
      if (url.search) {
        url.search = '';
        window.history.replaceState({}, '', url);
      }
    }

    if (!this.routes[viewName]) {
      viewName = 'index';
    }

    const route = this.routes[viewName];

    // 1. Limpiar contenedor principal
    this.appView.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-info" role="status"></div></div>';
    
    // Cache de HTMLs cargados
    if (!this.htmlCache) this.htmlCache = {};

    // 2. Cargar HTML dinámicamente desde el archivo individual (.html)
    try {
      let htmlContent = this.htmlCache[viewName];
      if (!htmlContent) {
        const fileToFetch = viewName === 'index' ? '/home.html' : `/${viewName}.html`;
        const res = await fetch(fileToFetch);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        htmlContent = await res.text();
        this.htmlCache[viewName] = htmlContent;
      }

      // Extraer el contenido dentro de <main> y los modales asociados en el documento HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');
      const mainContent = doc.querySelector('main');
      
      this.appView.innerHTML = '';
      if (mainContent) {
        // Clonar e inyectar todos los hijos de <main>
        Array.from(mainContent.children).forEach(child => {
          this.appView.appendChild(child.cloneNode(true));
        });
      } else if (doc.body) {
        // Si no hay <main>, inyectar el body sin header ni scripts repetidos
        const bodyContent = doc.body.cloneNode(true);
        bodyContent.querySelectorAll('header, script, app-menu').forEach(el => el.remove());
        Array.from(bodyContent.children).forEach(child => {
          this.appView.appendChild(child);
        });
      }

      // Inyectar modales específicos de la vista que estén fuera del contenedor <main> (ej: modal-missing-weights, addStockModal, etc.)
      const modals = doc.querySelectorAll('.modal');
      modals.forEach(modal => {
        if (!modal.id || modal.id === 'quickDetailModal') return; // Salta el modal global
        const existing = document.getElementById(modal.id);
        if (existing) existing.remove();
        this.appView.appendChild(modal.cloneNode(true));
      });
    } catch (err) {
      console.error(`Error cargando la vista ${viewName}:`, err);
      // Fallback: si falla el fetch, intentar buscar si existe template legacy
      const tpl = document.getElementById(`view-${viewName}`);
      this.appView.innerHTML = '';
      if (tpl) {
        this.appView.appendChild(tpl.content.cloneNode(true));
      } else {
        this.appView.innerHTML = `<div class="alert alert-danger m-3">Error al cargar la vista ${viewName}</div>`;
      }
    }

    // 3. Actualizar menú
    const appMenu = document.querySelector('app-menu');
    if (appMenu) {
      appMenu.setAttribute('current-page', `${viewName}.html`);
      if (appMenu.updateActiveLink) {
        appMenu.updateActiveLink();
      }
    }

    // 4. Actualizar título
    const routeTitles = {
      'index': 'NutriAgenda',
      'grid': 'Carrito - NutriAgenda',
      'pantry': 'Despensa - NutriAgenda',
      'recipes': 'Recetas - NutriAgenda',
      'recipe-editor': 'Editor - NutriAgenda',
      'diary': 'Agenda - NutriAgenda',
      'dashboard': 'Dashboard - NutriAgenda',
      'meal-photos': 'Fotos - NutriAgenda'
    };
    if (routeTitles[viewName]) {
      document.title = routeTitles[viewName];
    }

    // 5. Inicializar JS de la vista si es necesario
    if (route.init) {
      // init module dynamically to save initial load time
      const module = await route.init();
      // Verificamos que la URL siga en esta vista antes de inicializar,
      // para evitar problemas si el usuario navegó rápido antes de que el import terminara.
      let currentHash = window.location.hash.slice(1) || 'index';
      let currentViewName = currentHash;
      const qIndex2 = currentHash.indexOf('?');
      if (qIndex2 !== -1) {
        currentViewName = currentHash.slice(0, qIndex2);
      }
      
      if (currentViewName === viewName && module && module.initView) {
        await module.initView();
      }
    }
  }

  start() {
    this.handleRoute();
  }
}
