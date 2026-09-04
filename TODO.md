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

## Evolución de Agenda y Recetas: Ingestas Multi-Plato, Plantillas y Tracking
- [x] **Esquema de Datos (Dexie v12):**
  - [x] Crear store `mealTemplates` (`++id, name, mealType, *tags`).
  - [x] Añadir campos `course` (`appetizer`, `starter`, `main`, `dessert`, `drink`, `snack`) y `status` (`planned`, `consumed`, `skipped`) a los ítems del diario.
  - [x] Definir catálogo constante `COURSE_TYPES` con iconos y etiquetas.
- [x] **Módulo `MealTemplateStore.js` y extensión de `DiaryStore.js`:**
  - [x] Implementar CRUD de plantillas de menús reutilizables.
  - [x] Implementar métodos de cambio de estado de consumo (`updateEntryStatus`, `confirmMealConsumption`).
- [x] **Gestor de Creación Multi-Plato en Agenda (`diary.html` & `diary.js`):**
  - [x] Transformar el modal de comida en un constructor de menús con selección de curso/rol por plato.
  - [x] Integrar selector para cargar plantillas de menú existentes.
  - [x] Integrar acción para guardar la combinación actual como plantilla de menú.
  - [x] Botones para guardar como *Planificado ⏳* o *Consumido ✓*.
- [x] **Flujo de Tracking y Quick Check-In:**
  - [x] Modal de Check-In rápido (1-tap) para confirmar comidas planificadas con checkboxes por plato.
  - [x] Toggle "Comido fuera de casa" para omitir descuento automático de despensa.
  - [x] Badges visuales de cursos (`🍸`, `🥗`, `🍲`, `🍰`, `🥤`) y estados en la vista semanal y diaria.
- [x] **Integración con Despensa y Fotos:**
  - [x] Asegurar descuento atómico en `PantryStore` solo tras confirmación de ingesta consumida.
  - [x] Soporte para fotos vinculadas a la ingesta general o platos específicos.
- [x] **Pruebas y Verificación:**
  - [x] Añadir tests automatizados de creación de menús, plantillas y check-in (`tests/multi-course-tracking.spec.js`).

## Histórico de Cambios en el Diario y Exportación Modular (PrimaryFoods)
- [x] **Esquema de Trazabilidad (Dexie v13):**
  - [x] Crear store `diaryVersions` (`++id, diaryEntryId, date, mealType, action, timestamp`).
  - [x] Definir catálogo constante `DIARY_ACTIONS` (`plan_created`, `plan_adjusted`, `consumed`, `deleted`).
- [x] **Lógica de Versionado en `DiaryStore.js`:**
  - [x] Guardar snapshot automática al crear un plan inicial (`plan_created`).
  - [x] Guardar snapshot al ajustar o editar platos/raciones (`plan_adjusted`).
  - [x] Guardar snapshot al confirmar consumo con omisiones (`consumed`).
  - [x] Métodos para consultar historial (`getEntryVersions`, `getAllDiaryHistory`).
- [x] **Línea Temporal de Cambios en la UI (`diary.html` & `diary.js`):**
  - [x] Visualizar el historial cronológico de revisiones dentro del detalle de la comida (`#mealHistoryModal`).
- [x] **Exportación Modular en `BackupStore.js` & `settings.html`:**
  - [x] Exportación de snapshot de despensa (`exportPantrySnapshot`).
  - [x] Exportación de historial de diario con revisiones (`exportDiaryHistory`).
  - [x] Exportación de paquete completo de sincronización para PrimaryFoods (`exportPrimaryFoodsPackage`).
  - [x] Botones de descarga y gestión en la pantalla de Ajustes (`#btn-export-primaryfoods`, `#btn-export-pantry`, `#btn-export-diary-history`).
- [x] **Tests y Verificación:**
  - [x] Test E2E de ciclo de vida (Plan -> Ajuste -> Consumo -> Historial -> Exportación) en `tests/diary-history-export.spec.js`.

## Integración con PrimaryFoods (Recepción de Recetas, Agenda y Compra)
- [ ] **Importador Aditivo de Paquetes de Menú (`importMenuPlanPackage`):**
  - [ ] Recibir el paquete `buscatureceta_menu_pack.json` generado por PrimaryFoods (o mediante push HTTP directo).
  - [ ] Inyectar recetas en `db.recipes` sin sobrescribir las existentes (aprovechando `importRecipeFromExternal`).
  - [ ] Inyectar la planificación de comidas en `db.diary` para las fechas indicadas (`status: 'planned'`).
  - [ ] Añadir los ingredientes faltantes directamente a la lista de la compra / carrito (`db.cart`).
  - [ ] Añadir botón en NutriAgenda o Ajustes: *"📥 Importar Paquete de Menú / PrimaryFoods"*.






