# Tareas Pendientes (TODO)

## Sincronización y Compartición
- [x] **Sincronización Selectiva de Agenda (Diary):**
  - [x] Soporte para sincronización selectiva (`mergeData(data, { mergeDiary })`) protegiendo por defecto las entradas personales de cada usuario.
  - [x] Selector contextual en la pantalla de Ajustes (`#check-merge-diary` y `#btn-merge`).
  - [x] Cobertura E2E con test automatizado (`tests/menu-import-selective-sync.spec.js`).

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
- [x] **Importador Aditivo de Paquetes de Menú (`importMenuPlanPackage`):**
  - [x] Recibir paquete `buscatureceta_menu_pack.json` o plan anual generado por PrimaryFoods.
  - [x] Inyectar recetas en `db.recipes` sin sobrescribir las existentes preservando alternativas e ingredientes primarios.
  - [x] Inyectar la planificación de comidas en `db.diary` para las fechas indicadas (`status: 'planned'`).
  - [x] Añadir los ingredientes faltantes directamente al carrito (`db.cart`) o a la pre-lista (`db.preShoppingList`).
  - [x] Botones en Ajustes (*"📥 Importar Menú"*) y acceso directo en Agenda (*"📥 Importar Menú"*).
  - [x] Cobertura E2E automatizada en `tests/menu-import-selective-sync.spec.js`.

## Colaboraciones de Metadatos OFF (Fotos y Datos) y Filtrado en Historial
- [x] **Clasificación Unificada de Metadatos OFF (`cart-history.js`):**
  - [x] Tratamiento de las fotos como un metadato visual más del producto junto al peso (`quantity`) y nombre (`product_name`).
  - [x] Discriminación de productos que ya disponen de foto en OFF (`image_url`): se muestran con badge discreto informativo `🌐 OFF` sin alarmas innecesarias de foto pendiente.
  - [x] Exclusión de códigos no comerciales: frutas a granel de balanza de tienda (`/^2[0-9]{7,13}$/`), genéricos creados por timestamp y alimentos primarios BEDCA.
  - [x] Detección de productos comerciales nuevos o con fotos/metadatos faltantes con llamada a la acción contextualizada (`📷 OFF (Nuevo)` / `📷 OFF (Falta foto)`).
- [x] **Asistente "Desempacar OFF" Categorizado (`openUnpackingAssistant`):**
  - [x] Agrupación en: *Requieren fotos o datos en OFF*, *Ya documentados en OFF con fotografía* y *Granel / Local no aplicable*.
  - [x] Si todos los productos de la compra están documentados, muestra aviso de felicitación verde.
- [x] **Colaboración de Pesos y Nombres (`openFoodFacts.js` & `grid.js`):**
  - [x] Encolado de metadatos `{ quantity, product_quantity }` en checkout cuando se rellena el peso.
  - [x] Encolado de metadatos `{ product_name }` al renombrar productos en el carrito.
  - [x] Filtrado por tipo `[ Todo | Fotos | Datos ]` en la Zona de Colaboraciones (`#off-contributions`).
- [x] **Tests Automatizados:**
  - [x] `tests/cart-history-off-filter.spec.js` (diferenciación de productos en historial y desempacar).
  - [x] `tests/off-metadata-contributions.spec.js` (flujo de checkout y renombres a la cola OFF).
  - [x] `tests/off-contributions-flow.spec.js` (gestión integral de la zona de colaboraciones).

## Borrador de Menú Semanal en la Agenda (Weekly Draft)
- [x] **Espacio de Escritura Rápida (`src/diary.html`, `src/index.html` & `src/js/diary.js`):**
  - [x] Botón directo `📝 Borrador Semanal` en la barra superior de la Agenda con badge de estado si la semana tiene contenido.
  - [x] Modal interactivo `#modal-weekly-draft` con parrilla de 7 días (Lunes a Domingo) para anotar **Comida** y **Cena** rápidamente.
  - [x] Pestaña de texto libre / notas para apuntar ideas de la semana o menú de corrido.
- [x] **Persistencia y Volcado a la Agenda (`DiaryStore.js`):**
  - [x] Almacenamiento local persistente por semana (`getWeeklyDraft`, `saveWeeklyDraft`, `clearWeeklyDraft`).
  - [x] Acción `⚡ Volcar a la Agenda`: crea automáticamente entradas planificadas (`status: 'planned'`) en los días correspondientes, listas para desarrollar con recetas e ingredientes o hacer check-in al consumirlas.
- [x] **Tests Automatizados:**
  - [x] `tests/weekly-menu-draft.spec.js` (redacción, guardado, recarga y volcado a agenda con verificación en el grid semanal).

## Pre-lista de la Compra (Inbox Continuo y Reposición Inteligente)
- [x] **Fase 1: Core de la Pre-lista, Captura Rápida y Conversión a Lista Activa:**
  - [x] Esquema Dexie v15 con store `preShoppingList: '++id, status, dateAdded'`.
  - [x] Módulo `PreShoppingStore.js` con soporte para CRUD, selección en lote, volcado a lista de compra (`promoteToShoppingList`) y al carro (`promoteToCart`).
  - [x] Parser de texto inteligente `preListParser.js` con soporte para cantidades numéricas, fracciones, unidades en español y eliminación de prefijos de petición.
  - [x] Módulo de voz nativo `speechRecognition.js` con Web Speech API (`es-ES`) para dictado en tiempo real.
  - [x] Vista y controlador `pre-shopping.html` / `pre-shopping.js` con chips de inicio rápido, ajuste de cantidades, renombrado inline y modal de pegado masivo (WhatsApp / Notas / Alexa).
  - [x] Barra fija de conversión para promover la selección a Lista Activa (`#grid`) o Carrito directo.
  - [x] Integración en menú de navegación `app-menu.js`, `Router.js`, `app.js`, `BackupStore.js` y `vite.config.js`.
  - [x] Cobertura E2E completa con Playwright en `tests/pre-shopping.spec.js`.
- [x] **Fase 2: Motor de Repetición Inteligente y Cruce con Despensa:**
  - [x] Analizador de frecuencia histórica en `cartHistory` ([ReplenishmentEngine.js](file:///home/jose/workspace/josejuanmontiel/buscatureceta/src/js/modules/shopping/ReplenishmentEngine.js)) con cálculo de cadencia media en días y detección de retraso/urgencia.
  - [x] Panel desplegable de sugerencias de reposición en [pre-shopping.html](file:///home/jose/workspace/josejuanmontiel/buscatureceta/src/pre-shopping.html) estructurado en 3 pestañas: *⚡ Toca comprar*, *🥫 Despensa a 0* y *📊 Frecuentes*.
  - [x] Marcado de productos favoritos como "Básicos fijos" (⭐) persistentes.
  - [x] Detección de productos de despensa con stock en 0 (`db.pantry`) listos para añadir en 1 clic.
  - [x] Botón de acción masiva: `➕ Añadir que tocan` para volcar todas las sugerencias debidas a la pre-lista.
  - [x] Filtro reactivo: los productos ya añadidos a la pre-lista o a la lista activa no se duplican en las sugerencias.
  - [x] Tests E2E en Playwright cubriendo cadencia, despensa a cero y adición reactiva ([tests/pre-shopping.spec.js](file:///home/jose/workspace/josejuanmontiel/buscatureceta/tests/pre-shopping.spec.js)).
- [x] **Fase 3: Integración con la Agenda de Menús:**
  - [x] Cálculo automático de ingredientes requeridos a partir de comidas planificadas en la Agenda (`db.diary`) para los próximos días (`getPlannedMenuMissingIngredients`).
  - [x] Soporte para recetas (`type: 'recipe'`), productos sueltos (`type: 'product'`) y platos de texto libre del borrador semanal emparejados con recetas (`type: 'free'`).
  - [x] Cruce en tiempo real con el stock de la despensa (`db.pantry`) para calcular y sugerir únicamente las cantidades netas faltantes.
  - [x] Nueva pestaña *📅 Menú* en el panel de sugerencias de reposición de la Pre-lista, detallando platos de destino y fechas.
  - [x] Integración en el botón masivo `➕ Añadir que tocan` y en botones individuales con badge `📖 Receta`.
  - [x] Test E2E en Playwright verificando la detección de ingredientes faltantes y su incorporación a la Pre-lista ([tests/pre-shopping.spec.js](file:///home/jose/workspace/josejuanmontiel/buscatureceta/tests/pre-shopping.spec.js)).
