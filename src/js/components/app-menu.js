class AppMenu extends HTMLElement {
  connectedCallback() {
    const current = this.getAttribute('current-page') || '';
    const links = [
      { id: "index", text: "Inicio" },
      { id: "grid", text: "Buscar" },
      { id: "pantry", text: "Despensa" },
      { id: "recipes", text: "Recetas" },
      { id: "diary", text: "Agenda" },
      { id: "meal-photos", text: "Fotos <span class=\"badge bg-warning text-dark ms-1\" id=\"nav-photo-badge\" style=\"display:none;\"></span>" },
      { id: "dashboard", text: "Dashboard" },
      { id: "db-viewer", text: "Visor BD" },
      { id: "settings", text: "Ajustes" }
    ];

    let html = `<nav class="nav nav-masthead justify-content-center float-md-end">`;
    for (let link of links) {
      const isMatch = (current === `${link.id}.html` || current === link.id);
      const activeClass = isMatch ? 'active' : '';
      const aria = isMatch ? 'aria-current="page"' : '';
      html += `<a class="nav-link fw-bold py-1 px-0 ${activeClass}" ${aria} data-target="${link.id}" href="#${link.id}">${link.text}</a>\n`;
    }
    html += `</nav>`;
    this.innerHTML = html;
  }

  updateActiveLink() {
    const current = this.getAttribute('current-page') || '';
    const links = this.querySelectorAll('.nav-link');
    links.forEach(link => {
      const target = link.getAttribute('data-target');
      if (current === `${target}.html` || current === target) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      } else {
        link.classList.remove('active');
        link.removeAttribute('aria-current');
      }
    });
  }
}

customElements.define('app-menu', AppMenu);
