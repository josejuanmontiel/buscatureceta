/**
 * Coreografía Automatizada para el Capítulo 4:
 * «Editor de Recetas — Composición de Platos y Análisis Nutricional Automático»
 */

export const chapter4Data = {
  chapterNumber: 4,
  title: "Editor de Recetas: Composición y Cálculo de Macros",
  scenes: [
    {
      id: "escena_01_abrir_editor",
      title: "Acceso al Editor de Recetas",
      narration: "Pasamos a la pestaña de Recetas y abrimos el editor. Aquí podemos diseñar nuestros platos combinando productos escaneados con las existencias reales de nuestra despensa.",
      action: async (page, durationMs) => {
        await page.goto('/#recipes');
        await page.waitForTimeout(600);
        const newRecipeBtn = await page.$('#btn-new-recipe, button:has-text("Nueva Receta"), a[href*="recipe-editor"]');
        if (newRecipeBtn) {
          await newRecipeBtn.hover();
          await page.waitForTimeout(400);
          await newRecipeBtn.click();
        } else {
          await page.goto('/#recipe-editor');
        }
        await page.waitForTimeout(Math.max(500, durationMs - 2000));
      }
    },
    {
      id: "escena_02_crear_receta",
      title: "Composición de Ingredientes y Raciones",
      narration: "Bautizamos la receta como 'Bocadillo de Salchichas Saludables', definimos dos raciones y seleccionamos las salchichas de pollo y el pan de molde como ingredientes principales.",
      action: async (page, durationMs) => {
        const titleInput = await page.$('#recipe-title, #title, input[placeholder*="Nombre de la receta"]');
        if (titleInput) {
          await titleInput.click({ force: true });
          await titleInput.fill('Bocadillo de Salchichas Saludables');
          await page.waitForTimeout(400);
        }

        const servingsInput = await page.$('#recipe-servings, #servings');
        if (servingsInput) {
          await servingsInput.fill('2');
          await page.waitForTimeout(300);
        }

        // Añadir ingredientes si hay selector
        const addIngBtn = await page.$('#btn-add-ingredient, button:has-text("Añadir Ingrediente")');
        if (addIngBtn) {
          await addIngBtn.click();
          await page.waitForTimeout(400);
        }

        await page.mouse.move(600, 400, { steps: 15 });
        await page.waitForTimeout(Math.max(500, durationMs - 2200));
      }
    },
    {
      id: "escena_03_calculo_macros",
      title: "Cálculo Dinámico de Calorías y Costes",
      narration: "El sistema calcula al vuelo el desglose por ración: calorías totales, gramos de proteína, carbohidratos, grasas y el coste exacto en euros. Guardamos la receta y queda lista en nuestro recetario.",
      action: async (page, durationMs) => {
        const saveRecipeBtn = await page.$('#btn-save-recipe, button:has-text("Guardar Receta")');
        if (saveRecipeBtn) {
          await saveRecipeBtn.hover();
          await page.waitForTimeout(500);
          await saveRecipeBtn.click();
          await page.waitForTimeout(800);
        }
        await page.goto('/#recipes');
        await page.waitForTimeout(Math.max(500, durationMs - 1800));
      }
    }
  ]
};
