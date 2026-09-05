class AppMenu extends HTMLElement {
  connectedCallback() {
    const current = this.getAttribute('current-page') || '';

    // Main menu items
    const items = [
      { id: 'index',        icon: '🏠', text: 'Inicio' },
      { id: 'grid',         icon: '🛒', text: 'Carrito' },
      { id: 'pantry',       icon: '🥫', text: 'Despensa' },
      { id: 'recipes',      icon: '📖', text: 'Recetas' },
      { id: 'diary',        icon: '📅', text: 'Agenda' },
      { id: 'meal-photos',  icon: '📷', text: 'Fotos de comidas', badgeId: 'nav-photo-badge' },
      { id: 'off-contributions', icon: '🌍', text: 'Contribuciones OFF', badgeId: 'nav-off-badge' },
      // Grupo Estadísticas
      { group: true, icon: '📊', text: 'Estadísticas', children: [
        { id: 'dashboard',    icon: '📈', text: 'Dashboard' },
        { id: 'cart-history', icon: '🧾', text: 'Historial de Compras' },
      ]},
      { id: 'db-viewer',   icon: '🔍', text: 'Visor BD' },
      { id: 'settings',    icon: '⚙️', text: 'Ajustes' },
    ];

    const offcanvasId = 'appNavOffcanvas';

    const isActive = (id) => current === `${id}.html` || current === id;
    const isSPA = typeof document !== 'undefined' && document.getElementById('app-view') !== null;

    const renderItem = (item) => {
      if (item.group) {
        const childrenHtml = item.children.map(child => {
          const active = isActive(child.id);
          const href = isSPA ? `#${child.id}` : `${child.id}.html`;
          return `<a class="offcanvas-nav-sublink${active ? ' active' : ''}" href="${href}" data-target="${child.id}" data-bs-dismiss="offcanvas">
            <span class="nav-icon">${child.icon}</span>${child.text}
          </a>`;
        }).join('');
        return `<div class="offcanvas-nav-group">
          <div class="offcanvas-nav-group-label"><span class="nav-icon">${item.icon}</span>${item.text}</div>
          <div class="offcanvas-nav-group-children">${childrenHtml}</div>
        </div>`;
      }

      const active = isActive(item.id);
      const badge = item.badgeId
        ? `<span class="badge bg-warning text-dark ms-auto" id="${item.badgeId}" style="display:none;"></span>`
        : '';
      const href = isSPA ? `#${item.id}` : `${item.id}.html`;
      return `<a class="offcanvas-nav-link${active ? ' active' : ''}" href="${href}" data-target="${item.id}" data-bs-dismiss="offcanvas">
        <span class="nav-icon">${item.icon}</span>${item.text}${badge}
      </a>`;
    };

    const linksHtml = items.map(renderItem).join('');

    this.innerHTML = `
      <button class="hamburger-btn" type="button"
              data-bs-toggle="offcanvas" data-bs-target="#${offcanvasId}"
              aria-controls="${offcanvasId}" aria-label="Menú">
        <span class="hamburger-bar"></span>
        <span class="hamburger-bar"></span>
        <span class="hamburger-bar"></span>
      </button>

      <!-- Menú Lateral (Offcanvas) -->
      <div class="offcanvas offcanvas-start" tabindex="-1" id="${offcanvasId}" aria-labelledby="${offcanvasId}Label">
        <div class="offcanvas-header border-bottom border-secondary">
          <span class="offcanvas-title fw-bold fs-5" id="${offcanvasId}Label">🥦 NutriAgenda</span>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="offcanvas" aria-label="Cerrar"></button>
        </div>
        <div class="offcanvas-body p-0">
          <nav class="offcanvas-nav">
            ${linksHtml}
          </nav>
          <div class="offcanvas-footer">
            <a class="offcanvas-nav-link text-warning" id="btn-install-app" style="display:none; cursor:pointer;">
              <span class="nav-icon">📲</span>Instalar App
            </a>
          </div>
        </div>
      </div>

      <!-- Barra de Navegación Inferior Móvil (Bottom Navigation Bar) -->
      <nav class="app-bottom-nav d-md-none" aria-label="Navegación principal">
        <a class="bottom-nav-link${isActive('grid') ? ' active' : ''}" href="${isSPA ? '#grid' : 'grid.html'}" data-target="grid">
          <span class="bottom-nav-icon">🛒</span>
          <span class="bottom-nav-text">Carrito</span>
        </a>
        <a class="bottom-nav-link${isActive('pantry') ? ' active' : ''}" href="${isSPA ? '#pantry' : 'pantry.html'}" data-target="pantry">
          <span class="bottom-nav-icon">🥫</span>
          <span class="bottom-nav-text">Despensa</span>
        </a>
        <a class="bottom-nav-link${isActive('recipes') ? ' active' : ''}" href="${isSPA ? '#recipes' : 'recipes.html'}" data-target="recipes">
          <span class="bottom-nav-icon">📖</span>
          <span class="bottom-nav-text">Recetas</span>
        </a>
        <a class="bottom-nav-link${isActive('diary') ? ' active' : ''}" href="${isSPA ? '#diary' : 'diary.html'}" data-target="diary">
          <span class="bottom-nav-icon">📅</span>
          <span class="bottom-nav-text">Agenda</span>
        </a>
        <button class="bottom-nav-link btn-more-menu" type="button" data-bs-toggle="offcanvas" data-bs-target="#${offcanvasId}" aria-label="Más opciones">
          <span class="bottom-nav-icon">☰</span>
          <span class="bottom-nav-text">Más</span>
        </button>
      </nav>
    `;

    // Ensure navigation when clicking links, as Bootstrap's data-bs-dismiss might prevent default navigation
    this.addEventListener('click', (e) => {
      const link = e.target.closest('a[data-target]');
      if (link) {
        e.preventDefault();
        const target = link.getAttribute('data-target');
        const isSPAView = document.getElementById('app-view') !== null;
        
        setTimeout(() => {
          if (isSPAView) {
            window.location.hash = target;
          } else {
            window.location.href = `${target}.html`;
          }
        }, 120);
      }
    });

    // PWA Install Button Logic
    const installBtn = this.querySelector('#btn-install-app');
    if (installBtn) {
      if (window.deferredPrompt) {
        installBtn.style.display = 'block';
      }
      installBtn.addEventListener('click', async () => {
        if (!window.deferredPrompt) return;
        installBtn.style.display = 'none';
        window.deferredPrompt.prompt();
        const { outcome } = await window.deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        window.deferredPrompt = null;
      });
    }
  }

  updateActiveLink() {
    const current = this.getAttribute('current-page') || '';
    this.querySelectorAll('[data-target]').forEach(link => {
      const target = link.getAttribute('data-target');
      const active = current === `${target}.html` || current === target;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }
}

customElements.define('app-menu', AppMenu);

