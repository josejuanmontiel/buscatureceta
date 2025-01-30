# Buscatureceta

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
La release inicial tenia todo lo descrito [aqui](https://github.com/josejuanmontiel/buscatureceta/releases/tag/v0.1.0) que basicamente era:
    1. Boton de descarga, descompresion y almacenaje en la base de datos.
    2. Un boton de escaneo de codigo de barras.
    3. Mostrar imagen, link y alguna cosa mas obtenida de la base de datos.

### Relese v0.2
En esta [segunda](https://github.com/josejuanmontiel/buscatureceta/releases/tag/v0.2.0) release se incluye:

    1. Breve explicacion de que no hay servidor en la primera pagina.
    2. Boton de carga indicando el fichero que se quiere cargar en la primera pagina (descompresion). Lo que permite algo de flexibilidad inicial en la carga de datos.
    3. Empezar a gestionar varios ficheros (en la distribucion de la web), pues necesitaria una segunda ventana.
    4. Tras la carga o eleccion de empezar a comprar (con datos almacenados) vamos a la segunda pagina.
    5. Incluir la libreria (y ejemplo inicial con datos fijos) para mostar los elementos que se van escanenado con [tabulator](https://tabulator.info/examples/6.3#fittodata).

### Relese v0.3
En la [proxima](https://github.com/josejuanmontiel/buscatureceta/releases/tag/v0.3.0) release:

    1. Como la base de datos ya tiene fechas de ultima modificacion de los elementos, se plantea una carga diferencial a partir de otro fichero previamente preparado.
    2. Aun queda pendiente un spinner que indique que se esta realizando la carga (aunque ya hay logs en consola).
    3. Se observa la necesidad de insercio de datos nutricionales (a parte de los ingredientes como tal) para poder hacer filtro sobre cantidades de azucares y grasas. Por lo que aprovechando la carga diferencial se añadira la opcion de importar nuevos campos, con esta informacion.
    4. Empezar a usar los nuevos datos con [Dexie](https://dexie.org/docs/Tutorial/Hello-World)
    5. Añadir a la tabla los elementos que se van escaneando, permitir añadir precio manualmente y mostrar totales, y permitir borrar lineas o moverlas a otras tablas (despensa, receta...).
    