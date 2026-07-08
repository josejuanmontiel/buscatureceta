# OpenFoodFacts

**🌍 Aplicación en vivo:** [https://josejuanmontiel.github.io/OpenFoodFacts/](https://josejuanmontiel.github.io/OpenFoodFacts/) *(Se despliega automáticamente con cada push a la rama principal)*

## Motivo
A raiz de este [este](https://www.youtube.com/watch?v=j5dUzDTQ3mc) video de la fundacion [UAPO](https://www.fundacionuapo.org) y a cosas que ya tenia en la cabeza de hace tiempo:
- Creacion de listas de la compra en base a recetas.
- Lectura de tickets de la compra para extraer los precios (y mas cosas)
- Llevar control de las cosas que tienes en la despensa.
- Comparticion de de informacion entre pares (sin un servidor entre medias)
- Y otras muchas cosas mas...

Me dio por intentar hacer algo que fuera util, a quien pudiera necesitarlo.

## Idea
Usando el movil, poder escanear codigos de barras y previo a haber decidido que ingredientes (aditivos) no quieres que tengan los alimentos que vas a comprar, ir haciendo una lista (mientras te vas moviendo por el supermercado) que te permita (añadiendo el precio de cada cosa) decidir que te puedes permitir, pues conforme vas metiendo productos en el carro, tienes disponible (si los introduces) el total del carro pudiendo decidir si te puedes permitir ese alimento "menos malo" o no.

La idea es usar una base de datos [publica](https://es.openfoodfacts.org/data) y herramientas opensource disponibles, montar una pagina web, que tras la carga de la bases de datos en el navegador (del movil) pueda funcionar totalmente offline (sin internet) con lo cual no hay un servidor al otro lado, y toda la informacion permanece en tu telefono.

## Como

### Vite
Como es un proyecto web, voy a usar [vite](https://es.vitejs.dev/guide/) como herramienta de construccion

    npm create vite@latest

### Data
Usaremos los datos de OpenFoodFacts que se pueden descargar desde [aqui](https://mirabelle.openfoodfacts.org/products.csv?sql=select+code%2C+url%2C+product_name%2C+image_url%2C+image_ingredients_url%2C+image_nutrition_url%0D%0Afrom+%5Ball%5D%0D%0Awhere+countries_en+like+%22%25spain%25%22&_size=max) y una vez descargado, lo comprimiremos con [pigz](https://zlib.net/pigz/) para que la descarga (y el almacenamiento) sea mas optimo, para lo que deberemos usar una libreria javascript para realizar la descompresion esta sera [pako](https://github.com/nodeca/pako)

### Barcode
Estos datos los almacenaremos en la IndexedDB del navegador usando su API estandar, teniendo como clave el codigo de barras. Y para escanear los codigos de barras usaremos la libreria [html5-qrcode](https://github.com/mebjas/html5-qrcode)

### Release v0.1
La release inicial tenia todo lo descrito [aqui](https://github.com/josejuanmontiel/OpenFoodFacts/releases/tag/v0.1.0) que basicamente era:
    1. Boton de descarga, descompresion y almacenaje en la base de datos.
    2. Un boton de escaneo de codigo de barras.
    3. Mostrar imagen, link y alguna cosa mas obtenida de la base de datos.

### Release v0.2
En esta [segunda](https://github.com/josejuanmontiel/OpenFoodFacts/releases/tag/v0.2.0) release se incluye:

    1. Breve explicacion de que no hay servidor en la primera pagina.
    2. Boton de carga indicando el fichero que se quiere cargar en la primera pagina (descompresion). Lo que permite algo de flexibilidad inicial en la carga de datos.
    3. Empezar a gestionar varios ficheros (en la distribucion de la web), pues necesitaria una segunda ventana.
    4. Tras la carga o eleccion de empezar a comprar (con datos almacenados) vamos a la segunda pagina.
    5. Incluir la libreria (y ejemplo inicial con datos fijos) para mostar los elementos que se van escanenado con [tabulator](https://tabulator.info/examples/6.3#fittodata).

### Release v0.3 (Smart Cart & NutriAgenda)
Esta versión marca la evolución de la app hacia un ecosistema completo de planificación y seguimiento:

    1. Extracción de datos nutricionales completos (Kcal, Macros, etc.) usando la base de datos local y [Dexie](https://dexie.org/) para un almacenamiento estructurado y rápido.
    2. Carrito de la compra inteligente: control de presupuesto en tiempo real, alertas automáticas de aditivos indeseados (ej. E250) y recomendaciones de alternativas más sanas de la misma categoría.
    3. Gestión integral de despensa: al hacer checkout en el carrito, los productos se mueven automáticamente al stock de tu cocina.
    4. Creador de recetas: permite agrupar productos de la despensa y calcular de forma automática el total de calorías y macros por ración de la receta.
    5. Agenda y Dashboard: registro de ingestas directamente desde recetas o productos sueltos, descontando el stock automáticamente de la despensa, con gráficos interactivos de progreso y variedad.

## Flujo End-to-End (E2E) Automatizado

A continuación se muestra el ciclo de vida completo del "Smart Cart" validado automáticamente con Playwright (reproducido a velocidad x0.1 para apreciar los detalles). El flujo cubre todo el proceso desde que el usuario escanea un producto hasta que su información nutricional se refleja en el dashboard de consumo diario:

<video controls autoplay loop muted src="./flow_slow.webm" width="100%"></video>

> *Nota: Si tu visor de Markdown (o GitHub) no reproduce automáticamente el vídeo de arriba, puedes **[verlo o descargarlo directamente haciendo clic aquí](./flow_slow.webm)**.*

**Explicación del flujo:**
1. **Configuración Inicial**: Se carga una base de datos local prefiltrada con productos reales de OpenFoodFacts y se configura el asistente para alertar sobre ingredientes no deseados (ej. `E250`).
2. **Escaneo y Alerta**: Al escanear un producto con `E250` (Costilla Adobada), el asistente muestra una alerta visual y sugiere una alternativa más saludable de la misma categoría (Salchichas de Pollo).
3. **Compra e Ingesta de Presupuesto**: El usuario elige la alternativa sana y otros productos (Pan de Molde y Leche Entera), controla su presupuesto, ajusta las cantidades, y los añade al carrito.
4. **Despensa Automática (Checkout)**: Al finalizar la compra, los artículos del carrito se transfieren automáticamente al stock de la despensa.
5. **Generación de Recetas**: Se crea una receta (Bocadillo de Salchicha) usando ingredientes previamente guardados en la despensa, calculando la nutrición global sumando los macros y las kilocalorías de cada componente.
6. **Agenda Semanal (Diario)**: Se registra la ingesta de la receta elaborada hoy y el consumo de la Leche (suelta) programada para el día siguiente. Al consumir los productos, el sistema **descuenta automáticamente** la cantidad correspondiente del stock en la despensa.
7. **Dashboard Nutricional**: Finalmente, todos los datos consumidos a lo largo de la semana se presentan visualmente en gráficas (calorías, macros y variedad alimentaria), logrando el rastreo completo **Del Supermercado al Plato**.
    