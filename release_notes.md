Release v0.4.0

Novedades principales:
- **Flujo Mágico con IA en Galería**: Se ha integrado el "Magic AI Load" para extraer información nutricional de tus platos a partir de fotos. Ahora puedes generar un prompt para la IA y procesar automáticamente su respuesta en formato JSON. Además, puedes "Enviar a la Agenda" directamente una foto como marcador pendiente de resolver.
- **Tipos especiales en la Agenda**: Soporte nativo para registros de tipo `photo` (marcadores visuales pendientes de resolver) y `custom_macros` (macros insertados mágicamente mediante IA).
- **Filtro de Despensa en Recetas**: A la hora de crear o editar recetas, ahora puedes marcar una casilla para buscar y usar *sólo ingredientes que tengas actualmente en tu despensa*.
- **Productos Genéricos (Sin código de barras)**: Ahora puedes añadir alimentos sueltos al Carrito y a la Agenda buscando por su nombre (ej. "Manzana", "Tomates de la huerta"). Si no existen, la app te permite crearlos al vuelo como productos genéricos sin requerir código de barras, fluyendo de forma natural por la despensa y los cálculos.
- **Edición Precisa de Recetas Consumidas**: Al registrar una comida basada en una receta, ahora puedes indicar los *gramos consumidos* exactos. La aplicación desglosará todos los ingredientes, permitiéndote editarlos manualmente uno a uno antes de guardar. Esto garantiza un conteo de calorías 100% real y un descuento milimétrico en el stock de tu despensa.
- **Copias de Seguridad Manuales**: Se ha añadido una nueva sección de "Ajustes" que permite exportar un archivo JSON con toda tu información valiosa (recetas, fotos, diarios, despensa, etc.) e importarlo cuando quieras. Se excluyen los productos base (OpenFoodFacts) para mantener la copia súper ligera.
