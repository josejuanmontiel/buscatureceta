class AppMenu extends HTMLElement {
  connectedCallback() {
    const current = this.getAttribute('current-page') || '';
    const links = [
      { href: "index.html", text: "Inicio" },
      { href: "grid.html", text: "Buscar" },
      { href: "pantry.html", text: "Despensa" },
      { href: "recipes.html", text: "Recetas" },
      { href: "diary.html", text: "Agenda" },
      { href: "meal-photos.html", text: "Fotos <span class=\"badge bg-warning text-dark ms-1\" id=\"nav-photo-badge\" style=\"display:none;\"></span>" },
      { href: "dashboard.html", text: "Dashboard" },
      { href: "db-viewer.html", text: "Visor BD" },
      { href: "settings.html", text: "Ajustes" }
    ];

    let html = `<nav class="nav nav-masthead justify-content-center float-md-end">`;
    for (let link of links) {
      const activeClass = (link.href === current) ? 'active' : '';
      const aria = (link.href === current) ? 'aria-current="page"' : '';
      html += `<a class="nav-link fw-bold py-1 px-0 ${activeClass}" ${aria} href="${link.href}">${link.text}</a>\n`;
    }
    html += `</nav>`;
    this.innerHTML = html;
  }
}

customElements.define('app-menu', AppMenu);
