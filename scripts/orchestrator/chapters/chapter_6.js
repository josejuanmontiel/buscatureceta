/**
 * Coreografía Automatizada para el Capítulo 6:
 * «Dashboard de Salud & Explorador OpenFoodFacts — Análisis y Datos Abiertos»
 */

export const chapter6Data = {
  chapterNumber: 6,
  title: "Dashboard de Salud & Explorador OpenFoodFacts",
  scenes: [
    {
      id: "escena_01_dashboard_metricas",
      title: "Dashboard Nutricional y Métricas Globales",
      narration: "En el Dashboard consultamos la analítica completa: distribución de macronutrientes, balance energético semanal y estadísticas de consumo. Todos los gráficos se renderizan al instante con Chart.js en el cliente.",
      action: async (page, durationMs) => {
        await page.goto('/#dashboard');
        await page.waitForTimeout(800);
        await page.mouse.move(350, 350, { steps: 20 });
        await page.waitForTimeout(800);
        await page.mouse.move(750, 350, { steps: 20 });
        await page.waitForTimeout(Math.max(500, durationMs - 2200));
      }
    },
    {
      id: "escena_02_explorador_bd",
      title: "Visor y Búsqueda en la BD OpenFoodFacts",
      narration: "Por último, el visor de base de datos nos permite explorar cientos de miles de productos de OpenFoodFacts España sin conexión a internet, gracias a las tablas interactivas ultrarrápidas de Tabulator.",
      action: async (page, durationMs) => {
        await page.goto('/#db-viewer');
        await page.waitForTimeout(800);
        const searchInput = await page.$('input[type="search"], #db-search, input[placeholder*="Buscar"]');
        if (searchInput) {
          await searchInput.click({ force: true });
          await searchInput.fill('Aceite de oliva');
          await page.waitForTimeout(600);
        }
        await page.mouse.move(500, 450, { steps: 15 });
        await page.waitForTimeout(Math.max(500, durationMs - 2000));
      }
    },
    {
      id: "escena_03_cierre",
      title: "Cierre: Tu Salud, Tus Datos, Tu Control",
      narration: "NutriAgenda demuestra que es posible crear herramientas potentes de nutrición e inventario que respetan al cien por cien la privacidad del usuario. ¡Gracias por ver esta demostración!",
      action: async (page, durationMs) => {
        await page.goto('/#home');
        await page.waitForTimeout(800);
        await page.mouse.move(960, 450, { steps: 25 });
        await page.waitForTimeout(Math.max(500, durationMs - 1500));
      }
    }
  ]
};
