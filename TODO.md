# Tareas Pendientes (TODO)

## Sincronización y Compartición
- [ ] **Sincronización Selectiva de Agenda (Diary):** Actualmente la función `mergeData` ignora por completo la tabla `diary` al importar/fusionar un backup para proteger la privacidad de los eventos y métricas personales de cada usuario de la familia. En el futuro, se debe implementar una interfaz que pregunte qué registros del diario se quieren sincronizar, o utilizar un sistema de "Propietarios" para que cada usuario pueda compartir y fusionar sus propios registros en una base de datos común sin pisar los demás.

## Arquitectura SPA y Gestión de Vistas
Actualmente la SPA utiliza **Carga Dinámica HTML (`fetch()` en `Router.js`)**, lo cual permite mantener los archivos HTML independientes para desarrollo pero cargarlos de forma reactiva sin recargar la página. Para el futuro, se identificaron las siguientes alternativas de mejora arquitectónica:

- [ ] **Opción A: Componentes Web Nativos (Web Components / Custom Elements)**
  - Encapsular cada vista (ej: `<pantry-view>`, `<diary-view>`, `<settings-view>`) usando Shadow DOM / Custom Elements nativos del navegador.
  - *Ventajas:* Encapsulación total de estilos CSS y código JS sin interferencias globales ni necesidad de extraer partes manualmente con `DOMParser`.
  - *Desventajas:* Requiere reestructurar la lógica de manipulación del DOM nativo a la jerarquía del Shadow DOM.

- [ ] **Opción B: Plantillas compiladas en módulos JS (Build-Time HTML Bundling)**
  - Importar los HTMLs directamente en JS como módulos/string templates a través del bundler (Vite) en tiempo de compilación (`import diaryHtml from './diary.html?raw'`).
  - *Ventajas:* Cero peticiones HTTP `fetch()` adicionales en runtime para cambiar de pantalla, máxima velocidad de navegación instantánea e integración 100% libre de errores de red en la PWA offline.

