// Función para parsear el CSV
function parseCSV(data) {
    // Si la primera línea tiene tabuladores, es TSV (como viene de OpenFoodFacts)
    const delimiter = data.indexOf('\t') !== -1 ? '\t' : ',';
    
    if (typeof Papa !== 'undefined') {
        const parsed = Papa.parse(data, {
            header: true,
            delimiter: delimiter,
            skipEmptyLines: true
        });
        return parsed.data;
    }

    throw new Error("Librería PapaParse no encontrada");
}

import { db, migrateFromLegacyDB } from './db/schema.js';

// Llamar a migración al inicio
migrateFromLegacyDB().catch(console.error);

// E2E test helper: clear all user-generated data (keeps products intact)
window.__resetUserData = async function() {
  const stores = ['cart', 'pantry', 'pantryLog', 'diary', 'recipes',
    'recipeVersions', 'recentProducts', 'customProducts', 'priceHistory', 'mealPhotos'];
  for (const store of stores) {
    if (db[store]) await db[store].clear();
  }
};


// Función para guardar los datos en Dexie
async function saveToDatabase(data) {
    try {
        const adapted = data.map(item => ({
            ...item,
            code: item.code || item.id
        }));
        await db.products.bulkPut(adapted);
        console.log("Datos guardados exitosamente en IndexedDB (Dexie)");
    } catch (error) {
        console.error("Error al guardar los datos: ", error);
    }
}

export async function initView() {
    const valores = localStorage.getItem("filters");
    if (valores!=null && valores.length>0) {
        document.getElementById("filters").textContent = valores;
    }

    // Event listener para el botón
    function goToGrid() {
        var filters = document.getElementById('filters').value;
        localStorage.setItem("filters", filters);
        window.location.hash = "#grid";
    }

    const yaSeBtn = document.getElementById("ya-se");
    if(yaSeBtn) yaSeBtn.addEventListener("click", goToGrid);



// Función para descargar y cargar el CSV usando Streams para evitar falta de memoria
async function downloadAndLoadCSV() {
    const btn = document.getElementById("download-btn");
    try {
        btn.disabled = true;
        btn.textContent = "Descargando BD...";

        var database = document.getElementById("database").value;
        if (database == null || database == "") {
            database = '/spain_products.tsv.zz';
        }

        const response = await fetch(database);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        btn.textContent = "Procesando... (0 guardados)";

        // Vite y algunos servidores añaden 'Content-Encoding: gzip', lo que hace que el
        // navegador descomprima automáticamente. Si usamos DecompressionStream sobre
        // algo ya descomprimido, fallará al instante. Comprobamos los magic numbers (1F 8B).
        const originalReader = response.body.getReader();
        const { value: firstChunk, done: firstDone } = await originalReader.read();
        
        if (firstDone) throw new Error("El archivo está vacío");

        // Comprobamos los magic numbers de gzip (1F 8B) o deflate/zlib (78 9C / 78 DA / 78 01)
        const isGzip = firstChunk[0] === 0x1f && firstChunk[1] === 0x8b;
        const isDeflate = firstChunk[0] === 0x78 && (firstChunk[1] === 0x9c || firstChunk[1] === 0xda || firstChunk[1] === 0x01);

        // Reconstruimos el stream con el primer trozo que ya hemos leído
        let stream = new ReadableStream({
            start(controller) {
                controller.enqueue(firstChunk);
            },
            async pull(controller) {
                const { value, done } = await originalReader.read();
                if (done) {
                    controller.close();
                } else {
                    controller.enqueue(value);
                }
            },
            cancel() {
                originalReader.cancel();
            }
        });

        // Solo descomprimimos si realmente vienen los bytes crudos
        if (isGzip) {
            stream = stream.pipeThrough(new DecompressionStream('gzip'));
        } else if (isDeflate) {
            stream = stream.pipeThrough(new DecompressionStream('deflate'));
        }
        
        stream = stream.pipeThrough(new TextDecoderStream());
        const reader = stream.getReader();

        let buffer = '';
        let headers = null;
        let chunk = [];
        const CHUNK_SIZE = 5000;
        let totalSaved = 0;

        while (true) {
            const { value, done } = await reader.read();
            if (value) {
                buffer += value;
                const lines = buffer.split('\n');
                // La última línea podría estar incompleta, la dejamos en el buffer
                buffer = lines.pop();

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;

                    const cols = line.split('\t');

                    if (!headers) {
                        headers = cols.map(h => h.trim());
                        continue;
                    }

                    const obj = {};
                    for (let j = 0; j < headers.length; j++) {
                        if (cols[j]) {
                            obj[headers[j]] = cols[j].replace(/^"|"$/g, '');
                        }
                    }
                    
                    obj.code = obj.code || obj.id;
                    if (obj.code) {
                        chunk.push(obj);
                    }

                    if (chunk.length >= CHUNK_SIZE) {
                        await db.products.bulkPut(chunk);
                        totalSaved += chunk.length;
                        chunk = [];
                        btn.textContent = `Procesando... (${totalSaved} guardados)`;
                    }
                }
            }

            if (done) break;
        }

        // Guardar el último trozo si queda algo
        if (buffer.trim()) {
            const cols = buffer.trim().split('\t');
            const obj = {};
            for (let j = 0; j < headers.length; j++) {
                if (cols[j]) obj[headers[j]] = cols[j].replace(/^"|"$/g, '');
            }
            obj.code = obj.code || obj.id;
            if (obj.code) chunk.push(obj);
        }

        if (chunk.length > 0) {
            await db.products.bulkPut(chunk);
            totalSaved += chunk.length;
        }

        console.log(`Guardados ${totalSaved} productos exitosamente.`);
        btn.textContent = "¡Carga Completada!";
        setTimeout(() => {
            goToGrid();
        }, 1000);

    } catch (error) {
        console.error("Error en la descarga o carga del CSV: ", error);
        btn.textContent = "Error al cargar";
        btn.classList.add("btn-danger");
        btn.classList.remove("btn-primary");
    } finally {
        btn.disabled = false;
    }
}

// Event listener para el botón
const dlBtn = document.getElementById("download-btn");
if(dlBtn) dlBtn.addEventListener("click", downloadAndLoadCSV);

}
