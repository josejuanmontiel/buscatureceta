const valores = localStorage.getItem("filters");
if (valores!=null && valores.length>0) {
    document.getElementById("filters").textContent = valores;
}

// Event listener para el botón
function goToGrid() {
    var filters = document.getElementById('filters').value;
    localStorage.setItem("filters", filters);
    window.location.href = "/grid.html";
}

document.getElementById("ya-se").addEventListener("click", goToGrid);

// Función para parsear el CSV
function parseCSV(data) {
    // Separar líneas
    const lines = data.split("\n").filter(line => line.trim() !== ""); // Ignorar líneas vacías
    const result = [];

    // Obtener los encabezados de la primera línea y quitar espacios
    const headers = lines[0].split(",").map(header => header.trim());

    for (let i = 1; i < lines.length; i++) {
        const obj = {};
        const currentLine = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/); // Expresión regular para comas en comillas

        headers.forEach((header, index) => {
            // Asignar valores, asegurando que estén limpios de espacios
            obj[header] = currentLine[index] ? currentLine[index].trim().replace(/^"|"$/g, '') : null;
        });

        result.push(obj);
    }

    return result;
}


import { db, migrateFromLegacyDB } from './db/schema.js';

// Llamar a migración al inicio
migrateFromLegacyDB().catch(console.error);

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

// Función para descargar y cargar el CSV
async function downloadAndLoadCSV() {
    try {
        var database = document.getElementById("database").value;
        if (database == null || database == "") {
            database = '/spain_products.csv.zz';
        }

        const response = await fetch(database); // Cambia esto por la URL del archivo GZ
        const blob = await response.blob();
        
        console.log("Descargada")

        // Leer el archivo como un ArrayBuffer
        const arrayBuffer = await blob.arrayBuffer();
        
        // Descomprimir el archivo GZ usando Pako
        const decompressed = pako.inflate(new Uint8Array(arrayBuffer), { to: 'string' });

        console.log("Descomprimida")

        // Convertir el contenido del CSV a un array de objetos
        const csvData = parseCSV(decompressed);
        
        // Guardar los datos usando Dexie
        await saveToDatabase(csvData);

        console.log("Guardada")

        goToGrid();
    } catch (error) {
        console.error("Error en la descarga o carga del CSV: ", error);
        goToGrid();
    }
}

// Event listener para el botón
document.getElementById("download-btn").addEventListener("click", downloadAndLoadCSV);
