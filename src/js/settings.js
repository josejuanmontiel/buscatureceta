import * as BackupStore from './modules/backup/BackupStore.js';
import { showToast, confirmModal } from './modules/ui/UI.js';
import { getPendingUploads, deletePendingUpload, syncPendingUploads, countPendingUploads } from './api/openFoodFacts.js';
import { db } from './db/schema.js';

export async function initView() {
  document.getElementById('btn-export').addEventListener('click', handleExport);
  document.getElementById('btn-import').addEventListener('click', handleImport);
  document.getElementById('btn-clear-data').addEventListener('click', handleClearData);

  const shareBtn = document.getElementById('btn-share-sys');
  // Check if Web Share API is available and supports files
  if (navigator.canShare) {
    shareBtn.style.display = 'inline-block';
    shareBtn.addEventListener('click', handleShareSystem);
  }

  // Inicializar configuración de OpenFoodFacts
  initCredentialsConfig();
  
  // Inicializar sección de subidas pendientes
  // initPendingUploadsUI();

  // Inicializar Carga de Base de Datos
  const dlBtn = document.getElementById('download-btn');
  if (dlBtn) dlBtn.addEventListener('click', downloadAndLoadCSV);
  
  // Inicializar configuración de Filtros de Aditivos
  initFiltersConfig();
}

async function handleShareSystem() {
  const btn = document.getElementById('btn-share-sys');
  const originalText = btn.textContent;
  
  try {
    btn.disabled = true;
    btn.textContent = 'Preparando...';
    
    const jsonString = await BackupStore.exportData();
    const dateStr = new Date().toISOString().split('T')[0];
    // Web Share API in Chrome requires specific MIME types. application/json is not allowed, so we use text/plain.
    const file = new File([jsonString], `nutriagenda_backup_${dateStr}.txt`, { type: 'text/plain' });
    
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: 'Copia de NutriAgenda',
        text: 'Backup de NutriAgenda listo para enviar.',
        files: [file]
      });
      showToast('Compartido con éxito.');
    } else {
      showToast('Tu navegador no soporta compartir este tipo de archivos.', 'warning');
    }
  } catch (err) {
    console.error('Error al compartir:', err);
    if (err.name !== 'AbortError') {
      showToast('Error al compartir: ' + err.message, 'danger');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function handleExport() {
  const btn = document.getElementById('btn-export');
  const originalText = btn.textContent;
  
  try {
    btn.disabled = true;
    btn.textContent = 'Generando backup...';
    
    const jsonString = await BackupStore.exportData();
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    
    // Generar nombre de archivo con fecha
    const dateStr = new Date().toISOString().split('T')[0];
    a.download = `nutriagenda_backup_${dateStr}.json`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Copia de seguridad descargada con éxito.');
  } catch (err) {
    console.error('Error al exportar:', err);
    showToast('Error al exportar: ' + err.message, 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function handleImport() {
  const fileInput = document.getElementById('import-file');
  const file = fileInput.files[0];
  
  if (!file) {
    showToast('Por favor, selecciona un archivo de backup para restaurar.', 'warning');
    return;
  }

  if (!(await confirmModal('¿Estás seguro de que quieres sobrescribir tus datos actuales con este backup? ESTA ACCIÓN ES IRREVERSIBLE.', 'Restaurar Copia'))) {
    return;
  }

  const btn = document.getElementById('btn-import');
  const originalText = btn.textContent;

  try {
    btn.disabled = true;
    btn.textContent = 'Restaurando...';

    const text = await file.text();
    await BackupStore.importData(text);
    
    showToast('Copia de seguridad restaurada correctamente. La página se recargará.');
    setTimeout(() => window.location.reload(), 1500);
  } catch (err) {
    console.error('Error al restaurar:', err);
    showToast('Error al restaurar la copia de seguridad.\nDetalles: ' + err.message, 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
    fileInput.value = '';
  }
}

async function handleClearData() {
  if (!(await confirmModal('¿Estás seguro de que quieres borrar todos los datos personales? Esta acción NO se puede deshacer. (Los ingredientes se mantendrán)', '¡Atención! Borrado de Datos'))) {
    return;
  }

  const btn = document.getElementById('btn-clear-data');
  const originalText = btn.textContent;

  try {
    btn.disabled = true;
    btn.textContent = 'Borrando datos...';

    await BackupStore.clearUserData();
    
    showToast('Datos borrados correctamente. La página se recargará.');
    setTimeout(() => window.location.reload(), 1500);
  } catch (err) {
    console.error('Error al borrar los datos:', err);
    showToast('Error al borrar los datos.\nDetalles: ' + err.message, 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gestión de credenciales de OpenFoodFacts
// ─────────────────────────────────────────────────────────────────────────────

function initCredentialsConfig() {
    const btnSave   = document.getElementById('btn-save-credentials');
    const btnClear  = document.getElementById('btn-clear-credentials');
    const btnVerify = document.getElementById('btn-verify-credentials');
    const btnToggle = document.getElementById('btn-toggle-password');

    // Rellenar campos y estado actual al cargar
    populateCredentialsForm();

    // Toggle contraseña visible
    btnToggle.addEventListener('click', () => {
        const pwd = document.getElementById('cred-password');
        pwd.type = pwd.type === 'password' ? 'text' : 'password';
        btnToggle.textContent = pwd.type === 'password' ? '👁' : '🙈';
    });

    // Guardar credenciales
    btnSave.addEventListener('click', () => {
        const user = document.getElementById('cred-username').value.trim();
        const pass = document.getElementById('cred-password').value;

        if (!user || !pass) {
            showCredStatus('warning', '⚠️ Debes introducir usuario y contraseña.');
            return;
        }
        localStorage.setItem('off_user', user);
        localStorage.setItem('off_password', pass);
        showCredStatus('success', `✅ Credenciales guardadas para el usuario <strong>${user}</strong>.`);
    });

    // Borrar credenciales
    btnClear.addEventListener('click', () => {
        if (!confirm('¿Seguro que quieres borrar las credenciales de OpenFoodFacts?')) return;
        localStorage.removeItem('off_user');
        localStorage.removeItem('off_password');
        document.getElementById('cred-username').value = '';
        document.getElementById('cred-password').value = '';
        showCredStatus('secondary', '🗑 Credenciales eliminadas. Se usará el entorno de test (off/off).');
    });

    // Verificar credenciales contra la API de test
    btnVerify.addEventListener('click', async () => {
        const user = document.getElementById('cred-username').value.trim();
        const pass = document.getElementById('cred-password').value;

        if (!user || !pass) {
            showVerifyResult('warning', '⚠️ Introduce usuario y contraseña antes de verificar.');
            return;
        }

        btnVerify.disabled = true;
        btnVerify.textContent = 'Verificando...';
        showVerifyResult('secondary', '⏳ Comprobando credenciales contra OpenFoodFacts...');

        try {
            // La API de OFF no tiene endpoint de login explícito; usamos
            // el endpoint de preferencias del usuario que requiere auth.
            const resp = await fetch(
                `https://world.openfoodfacts.net/api/v2/preferences`,
                {
                    headers: {
                        'Authorization': 'Basic ' + btoa(user + ':' + pass),
                        'Accept': 'application/json',
                    }
                }
            );

            if (resp.ok || resp.status === 200) {
                showVerifyResult('success', `✅ Credenciales correctas para <strong>${user}</strong> en el entorno de test.`);
            } else if (resp.status === 401) {
                showVerifyResult('danger', '❌ Credenciales incorrectas. Comprueba usuario y contraseña.');
            } else {
                showVerifyResult('warning', `⚠️ Respuesta inesperada (HTTP ${resp.status}). Las credenciales podrían ser válidas igualmente.`);
            }
        } catch (err) {
            showVerifyResult('danger', `❌ Error de conexión: ${err.message}`);
        } finally {
            btnVerify.disabled = false;
            btnVerify.textContent = '🔍 Verificar credenciales';
        }
    });
}

function populateCredentialsForm() {
    const user = localStorage.getItem('off_user');
    const pass = localStorage.getItem('off_password');

    document.getElementById('cred-username').value = user || '';
    document.getElementById('cred-password').value = pass || '';

    if (user && user !== 'off') {
        showCredStatus('success', `✅ Cuenta configurada: <strong>${user}</strong>`);
    } else {
        showCredStatus('warning',
            '⚠️ Sin cuenta configurada. Usando credenciales de <strong>test</strong> (off/off). ' +
            'Las fotos se subirán al entorno de pruebas, no a la BD real.'
        );
    }
    document.getElementById('cred-verify-result').classList.add('d-none');
}

function showCredStatus(type, html) {
    const el = document.getElementById('cred-status');
    el.className = `alert alert-${type} py-2 mb-3 small`;
    el.innerHTML = html;
}

function showVerifyResult(type, html) {
    const el = document.getElementById('cred-verify-result');
    el.className = `alert alert-${type} py-2 small`;
    el.innerHTML = html;
    el.classList.remove('d-none');
}

// ─────────────────────────────────────────────────────────────────────────────
// Gestión de Filtros de Aditivos e Ingredientes
// ─────────────────────────────────────────────────────────────────────────────

function initFiltersConfig() {
    const filterInput = document.getElementById('additive-filters');
    const btnSaveFilters = document.getElementById('btn-save-filters');
    const btnDefaultAdditives = document.getElementById('btn-default-additives');

    // Cargar filtros guardados
    const savedFilters = localStorage.getItem('filters');
    if (savedFilters) {
        filterInput.value = savedFilters;
    }

    // Guardar filtros
    btnSaveFilters.addEventListener('click', () => {
        const value = filterInput.value.trim();
        if (value) {
            localStorage.setItem('filters', value);
        } else {
            localStorage.removeItem('filters');
        }
        showToast('Filtros guardados correctamente.');
    });

    // Rellenar aditivos comunes (los que pidió el usuario)
    btnDefaultAdditives.addEventListener('click', () => {
        const defaultAdditives = 'E249 | E250 | E251 | E252 | E102 | E104 | E110 | E122 | E124 | E127 | E950 | E951 | E952 | E955 | E220 | E221 | E222 | E223 | E224 | E225 | E226 | E227 | E228 | E214 | E215 | E216 | E217 | E218 | E219 | E621 | E622 | E623 | E624 | E625';
        filterInput.value = defaultAdditives;
        // opcionalmente guardar al instante
        localStorage.setItem('filters', defaultAdditives);
        showToast('Aditivos comunes aplicados.');
    });
}

// Función para descargar y cargar el CSV usando Streams para evitar falta de memoria
async function downloadAndLoadCSV() {
    const btn = document.getElementById("download-btn");
    try {
        btn.disabled = true;
        btn.textContent = "Descargando BD...";

        var database = document.getElementById("database").value;
        if (database == null || database == "") {
            database = 'spain_products.tsv.zz';
        }

        const response = await fetch(database);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        btn.textContent = "Procesando... (0 guardados)";

        const originalReader = response.body.getReader();
        const { value: firstChunk, done: firstDone } = await originalReader.read();
        
        if (firstDone) throw new Error("El archivo está vacío");

        const isGzip = firstChunk[0] === 0x1f && firstChunk[1] === 0x8b;
        const isDeflate = firstChunk[0] === 0x78 && (firstChunk[1] === 0x9c || firstChunk[1] === 0xda || firstChunk[1] === 0x01);

        let stream = new ReadableStream({
            start(controller) { controller.enqueue(firstChunk); },
            async pull(controller) {
                const { value, done } = await originalReader.read();
                if (done) controller.close();
                else controller.enqueue(value);
            },
            cancel() { originalReader.cancel(); }
        });

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
                        if (cols[j]) obj[headers[j]] = cols[j].replace(/^"|"$/g, '');
                    }
                    
                    obj.code = obj.code || obj.id;
                    if (obj.code) chunk.push(obj);

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
        btn.textContent = `¡Carga Completada! (${totalSaved} productos)`;
        // Redirigir al escáner para empezar a usarlo
        setTimeout(() => {
            window.location.hash = '#grid';
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
