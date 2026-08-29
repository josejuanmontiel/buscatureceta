/**
 * Coreografía Automatizada para el Capítulo 5:
 * «NutriAgenda & Registro Fotográfico — Planificación y Descuento de Stock»
 */

export const chapter5Data = {
  chapterNumber: 5,
  title: "NutriAgenda & Registro Fotográfico: Planificación y Diario",
  scenes: [
    {
      id: "escena_01_abrir_diario",
      title: "La Agenda Semanal y Turnos de Comida",
      narration: "En la NutriAgenda planificamos nuestras comidas del día distribuidas en desayuno, almuerzo, merienda y cena. Visualizamos de un vistazo el cumplimiento de nuestro objetivo calórico diario.",
      action: async (page, durationMs) => {
        await page.goto('/#diary');
        await page.waitForTimeout(800);
        await page.mouse.move(400, 250, { steps: 20 });
        await page.waitForTimeout(600);
        await page.mouse.move(700, 350, { steps: 20 });
        await page.waitForTimeout(Math.max(500, durationMs - 2200));
      }
    },
    {
      id: "escena_02_anotar_comida",
      title: "Registro de Ingesta y Descuento de Stock",
      narration: "Añadimos nuestra receta al almuerzo de hoy. En ese mismo instante, la aplicación descuenta automáticamente las porciones e ingredientes utilizados de las existencias de la despensa.",
      action: async (page, durationMs) => {
        const addMealBtn = await page.$('button[data-meal="lunch"], .btn-add-meal, button:has-text("Añadir")');
        if (addMealBtn) {
          await addMealBtn.click();
          await page.waitForTimeout(600);
        }
        await page.mouse.move(500, 450, { steps: 15 });
        await page.waitForTimeout(Math.max(500, durationMs - 1600));
      }
    },
    {
      id: "escena_03_pool_fotos",
      title: "Pool Fotográfico del Plato",
      narration: "Además, podemos asociar una fotografía real del plato cocinado. Las imágenes se guardan de forma optimizada y segura en la base de datos local, creando un diario visual ideal para seguimiento personal.",
      action: async (page, durationMs) => {
        await page.goto('/#meal-photos');
        await page.waitForTimeout(800);
        await page.mouse.move(600, 300, { steps: 20 });
        await page.waitForTimeout(800);
        await page.mouse.move(400, 500, { steps: 20 });
        await page.waitForTimeout(Math.max(500, durationMs - 2200));
      }
    }
  ]
};
