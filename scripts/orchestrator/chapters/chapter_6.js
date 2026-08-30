/**
 * Coreografía Automatizada para el Capítulo 6:
 * «Dashboard de Salud & Explorador de Alimentos Básicos BEDCA y OpenFoodFacts»
 */

export const chapter6Data = {
  chapterNumber: 6,
  title: "Dashboard de Salud & Explorador BEDCA / OpenFoodFacts",
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
      id: "escena_02_explorador_bd_y_bedca",
      title: "Visor y Búsqueda en Alimentos Básicos (BEDCA) y OpenFoodFacts",
      narration: "El visor de base de datos nos permite alternar entre productos envasados de OpenFoodFacts y casi mil alimentos primarios frescos de BEDCA, con desglose de calorías, proteínas, grasas y minerales sin conexión a internet.",
      action: async (page, durationMs) => {
        await page.goto('/#db-viewer');
        await page.waitForTimeout(800);

        // Cambiar a la pestaña de Alimentos Básicos BEDCA
        const primaryTab = await page.$('label[for="db-primary"]');
        if (primaryTab) {
          await primaryTab.hover();
          await page.waitForTimeout(300);
          await primaryTab.click();
          await page.waitForTimeout(500);
        }

        const searchInput = await page.$('#db-search');
        if (searchInput) {
          await searchInput.click({ force: true });
          await searchInput.fill('Calabacín');
          await page.waitForTimeout(700);
        }

        await page.mouse.move(500, 450, { steps: 15 });
        await page.waitForTimeout(Math.max(500, durationMs - 2800));
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
