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
import { seedDemoData } from './modules/demo/demoData.js';
import { showToast, confirmModal } from './modules/ui/UI.js';

// Llamar a migración al inicio
migrateFromLegacyDB().catch(console.error);

// E2E test helper: clear all user-generated data (keeps products intact)
window.__resetUserData = async function() {
  const stores = ['cart', 'pantry', 'pantryLog', 'diary', 'recipes',
    'recipeVersions', 'recentProducts', 'customProducts', 'priceHistory', 'mealPhotos', 'shoppingLists', 'pendingUploads', 'cartHistory'];
  for (const store of stores) {
    if (db[store]) await db[store].clear();
  }
};

window.__seedDemoData = seedDemoData;

export async function initView() {
  const btnDemo = document.getElementById('btn-load-demo-home');
  if (btnDemo) {
    btnDemo.addEventListener('click', async () => {
      const confirmed = await confirmModal(
        '¿Cargar datos de demostración?',
        'Se añadirán productos limpios a la despensa, 3 recetas listas y registros en la agenda para que puedas probar la aplicación al completo.'
      );
      if (!confirmed) return;

      btnDemo.disabled = true;
      btnDemo.textContent = 'Cargando...';
      try {
        await seedDemoData();
        showToast('¡Datos de demostración cargados con éxito! Redirigiendo a tu Agenda...', 'success');
        setTimeout(() => {
          window.location.hash = '#diary';
        }, 800);
      } catch (err) {
        console.error('Error al sembrar demo data:', err);
        showToast('Error al cargar datos de demo: ' + err.message, 'danger');
        btnDemo.disabled = false;
        btnDemo.textContent = '🪄 Datos de Prueba (Despensa, Recetas y Agenda)';
      }
    });
  }

  const btnMedHome = document.getElementById('btn-load-mediterranean-home');
  if (btnMedHome) {
    btnMedHome.addEventListener('click', async () => {
      const confirmed = await confirmModal(
        '¿Cargar Pack de Recetas Mediterráneas?',
        'Se importarán 12 recetas equilibradas (desayunos, comidas, cenas y meriendas) con Alimentos Primarios BEDCA.'
      );
      if (!confirmed) return;

      btnMedHome.disabled = true;
      btnMedHome.textContent = 'Cargando pack...';
      try {
        const { seedMediterraneanPack } = await import('./modules/demo/demoData.js');
        const count = await seedMediterraneanPack();
        showToast(`🎉 ¡${count} recetas mediterráneas importadas con éxito! Redirigiendo a Recetas...`, 'success');
        setTimeout(() => {
          window.location.hash = '#recipes';
        }, 800);
      } catch (err) {
        console.error('Error cargando pack mediterráneo:', err);
        showToast('Error al cargar el pack: ' + err.message, 'danger');
        btnMedHome.disabled = false;
        btnMedHome.textContent = '🥗 Pack 12 Recetas Mediterráneas (BEDCA)';
      }
    });
  }
}

