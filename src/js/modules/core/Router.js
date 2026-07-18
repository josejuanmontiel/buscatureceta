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

    // 1. Ocultar todas las vistas
    this.appView.innerHTML = '';
    
    // 2. Cargar vista (si es de template)
    const tpl = document.getElementById(`view-${viewName}`);
    if (tpl) {
      this.appView.appendChild(tpl.content.cloneNode(true));
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
      if (module && module.initView) {
        await module.initView();
      }
    }
  }

  start() {
    this.handleRoute();
  }
}
