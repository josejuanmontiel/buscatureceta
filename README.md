# OpenFoodFacts & NutriAgenda

**🌍 Aplicación en vivo:** [https://josejuanmontiel.github.io/OpenFoodFacts/](https://josejuanmontiel.github.io/OpenFoodFacts/) *(Se despliega automáticamente con cada push a la rama principal)*

## Motivo
A raiz de este [este](https://www.youtube.com/watch?v=j5dUzDTQ3mc) video de la fundacion [UAPO](https://www.fundacionuapo.org) y a cosas que ya tenia en la cabeza de hace tiempo:
- Creacion de listas de la compra en base a recetas.
- Lectura de tickets de la compra para extraer los precios (y mas cosas)
- Llevar control de las cosas que tienes en la despensa.
- Comparticion de de informacion entre pares (sin un servidor entre medias)

Me dio por intentar hacer algo que fuera util, a quien pudiera necesitarlo.

## Idea y Evolución
La idea original era usar el móvil para escanear códigos de barras en el supermercado y, con una base de datos pública de aditivos, avisarte de lo que compras y llevar un presupuesto en tiempo real. 

Poco a poco, el proyecto ha evolucionado de un "Scanner" a una **NutriAgenda** completa. La ventaja única de este proyecto es que **el punto de entrada es la compra**, lo que permite trazar todo el ciclo sin teclear manualmente cada ingrediente:
`Compra (escáner) → Despensa → Receta → Plato cocinado → Ingesta → Análisis`

Todo esto funcionando de forma **100% local (offline-first)** usando el almacenamiento del navegador, lo que garantiza una privacidad radical sin depender de servidores externos.

## Arquitectura y Stack Tecnológico
- **Vite** para la construcción del frontal.
- **IndexedDB (Dexie 5)** para el almacenamiento local y asíncrono (productos, despensa, recetas, agenda y cola de subidas).
- **Tabulator** para la renderización eficiente de tablas y cuadrículas de datos.
- **Web Streams (DecompressionStream + TextDecoderStream)** para procesar volcados de datos de 1GB en tiempo real sin colapsar la memoria del navegador.
- **html5-qrcode** para la lectura de códigos de barras.
- **Playwright** para la validación E2E.

---

## Histórico de Versiones

### Release v0.1 & v0.2 (El Origen)
- Descarga, descompresión y almacenaje en la base de datos de productos.
- Escaneo de código de barras.
- Uso de `tabulator` para mostrar los elementos escaneados.

### Release v0.3 (Smart Cart & NutriAgenda)
- **Extracción Nutricional:** Datos completos (Kcal, Macros, etc.) usando Dexie.
- **Carrito Inteligente:** Control de presupuesto, alertas automáticas de aditivos indeseados (ej. E250) y alternativas más sanas.
- **Gestión de Despensa:** Checkout automático del carrito al stock de la cocina.
- **Creador de Recetas:** Agrupación de productos y cálculo automático de macros por ración.
- **Agenda y Dashboard:** Registro de ingestas con descuento automático de stock y gráficos de progreso.

### Release v0.4 (OFF Native Integration & Sync) *(Actual)*
- **Script Nativo de Actualización:** Filtrado ultra-rápido en Bash puro para extraer los productos de España del volcado global de OpenFoodFacts (reduciendo el tamaño drásticamente).
- **Motor de Carga Anti-Colapso:** Uso de Web Streams nativos en el navegador para descomprimir (gzip) y parsear (TSV) un archivo de más de 1GB al vuelo, inyectándolo en bloques en IndexedDB sin agotar la memoria.
- **Cola Offline-First:** Si se escanea un producto desconocido, se puede tomar una foto con la cámara del móvil. Se encola localmente y, cuando hay conexión, se sincroniza usando la API V3 de OpenFoodFacts.
- **Visor BD Tabulator:** Interfaz completa para consultar los cientos de miles de registros de la base local en tiempo real.

---

## 🗺️ Roadmap de Evolución y Próximos Pasos (Post v0.4)

Tras haber consolidado el flujo principal de *Compra → Despensa → Ingesta* (v0.3) y haber dotado al sistema de una integración oficial, robusta y optimizada con OpenFoodFacts (v0.4), los siguientes pasos se centran en el valor analítico y la facilidad de uso.

### Fase 4 — Analytics e Insights (Próximo objetivo principal)
> El diferenciador real. En lugar de solo contar calorías, analizar la *diversidad* y los patrones.
- [ ] **Rueda de variedad alimentaria:** Gráfico que se ilumina según los grupos de alimentos (categorías OFF) que has comido esta semana.
- [ ] **Detección de brechas alimentarias:** Identificación inteligente: "Llevas 3 semanas sin comer legumbres" o "Tu ingesta de fibra cae en días de trabajo".
- [ ] **Sugerencias proactivas:** Cruzar la despensa actual con las recetas para sugerir qué cocinar basándose en lo que te falta nutricionalmente.
- [ ] **Correlación contexto-ingesta:** Registrar humor/hambre para detectar patrones emocionales (opcional para no saturar al usuario).

### Fase 5 — Integraciones Avanzadas y Ecosistema
- [ ] **Integración OCR de tickets:** Usar Tesseract.js (offline) para escanear tickets de compra y registrar compras masivas automáticamente sin leer código por código.
- [ ] **Compartición P2P:** Aprovechar WebRTC/PeerJS (experiencia de "pingo") para compartir la despensa o la lista de la compra entre miembros de la misma familia sin pasar por un servidor centralizado.
- [ ] **Adaptadores externos de Recetas:** Conectores (solo lectura) para importar recetas estructuradas desde APIs como Mealie o Tandoor si el usuario tiene su propio servidor casero.
- [ ] **Export/Import de Privacidad:** Mecanismo robusto para descargar toda tu vida nutricional en un archivo JSON y llevártela a otro dispositivo.

---

## Flujo End-to-End (E2E) Automatizado

A continuación se muestra el ciclo de vida completo del "Smart Cart" validado automáticamente con Playwright (reproducido a velocidad x0.1 para apreciar los detalles). 

<video controls autoplay loop muted src="./flow_slow.webm" width="100%"></video>

> *Nota: Si tu visor de Markdown no reproduce automáticamente el vídeo, puedes **[verlo o descargarlo directamente haciendo clic aquí](./flow_slow.webm)**.*

**Explicación del flujo:**
1. **Configuración Inicial**: Se carga una base local y se configuran alertas (ej. `E250`).
2. **Escaneo y Alerta**: Escaneo de Costilla Adobada → alerta visual → sugerencia de Salchichas de Pollo.
3. **Compra e Ingesta de Presupuesto**: Elección de productos y control de presupuesto.
4. **Despensa Automática**: Al hacer Checkout, los artículos pasan al stock.
5. **Generación de Recetas**: Se crea "Bocadillo de Salchicha" sumando macros automáticamente.
6. **Agenda Semanal (Diario)**: Al registrar la ingesta, se descuentan las cantidades de la despensa.
7. **Dashboard Nutricional**: Todos los datos se presentan visualmente (calorías, macros, etc.).