/**
 * Coreografía Automatizada para el Capítulo 4:
 * «Editor de Recetas — Composición de Platos, Ficha de Ingredientes y Cálculo de Macros»
 */

export const chapter4Data = {
  chapterNumber: 4,
  title: "Editor de Recetas: Composición, Ficha de Ingredientes y Macros",
  scenes: [
    {
      id: "escena_01_abrir_editor",
      title: "Acceso al Editor de Recetas y Pack Mediterráneo",
      narration: "Entramos en la pestaña de Recetas y abrimos el editor. Aquí podemos diseñar nuestros platos combinando productos escaneados con alimentos frescos de la despensa y recetas mediterráneas.",
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
      id: "escena_02_ingredientes_y_ficha",
      title: "Composición de Ingredientes y Ficha Nutricional",
      narration: "Escribimos el nombre del plato, definimos dos raciones y añadimos ingredientes. Al hacer clic sobre cualquier ingrediente, se despliega su ficha de detalle completa con vitaminas, minerales, Nutri-Score y beneficios.",
      action: async (page, durationMs) => {
        const titleInput = await page.$('#recipe-name, input[placeholder*="Nombre de la receta"]');
        if (titleInput) {
          await titleInput.click({ force: true });
          await titleInput.fill('Bocadillo Saludable de Pollo y Verduras');
          await page.waitForTimeout(300);
        }

        const servingsInput = await page.$('#recipe-servings');
        if (servingsInput) {
          await servingsInput.fill('2');
          await page.waitForTimeout(300);
        }

        // Buscar y añadir ingrediente
        const searchInput = await page.$('#ingredient-search');
        if (searchInput) {
          await searchInput.fill('Calabacín');
          await page.waitForTimeout(200);
          const searchBtn = await page.$('#btn-search-ingredient');
          if (searchBtn) await searchBtn.click();
          await page.waitForTimeout(500);

          const firstResult = await page.$('#ingredient-search-results button');
          if (firstResult) {
            await firstResult.click();
            await page.waitForTimeout(400);
          }
        }

        // Abrir ficha de detalle del ingrediente
        const ingRow = await page.$('.ingredient-row');
        if (ingRow) {
          await ingRow.hover();
          await page.waitForTimeout(300);
          await ingRow.click();
          await page.waitForTimeout(1200);

          // Cerrar modal
          const closeBtn = await page.$('#ingredientDetailModal button[data-bs-dismiss="modal"]');
          if (closeBtn) {
            await closeBtn.click();
            await page.waitForTimeout(300);
          }
        }

        await page.mouse.move(600, 400, { steps: 15 });
        await page.waitForTimeout(Math.max(500, durationMs - 4000));
      }
    },
    {
      id: "escena_03_calculo_macros_y_menu",
      title: "Cálculo Dinámico, Menú de Opciones y Guardado",
      narration: "El sistema calcula automáticamente las calorías y macronutrientes por ración. Con la cabecera minimalista podemos guardar la receta o acceder al menú de opciones para duplicar o crear listas de compra.",
      action: async (page, durationMs) => {
        const saveRecipeBtn = await page.$('#btn-save-recipe');
        if (saveRecipeBtn) {
          await saveRecipeBtn.hover();
          await page.waitForTimeout(500);
          await saveRecipeBtn.click();
          await page.waitForTimeout(1000);
        }

        // Mostrar menú ⋮ desplegable
        const dropdownBtn = await page.$('#recipeOptionsDropdown');
        if (dropdownBtn && await dropdownBtn.isVisible()) {
          await dropdownBtn.hover();
          await page.waitForTimeout(300);
          await dropdownBtn.click();
          await page.waitForTimeout(700);
          await dropdownBtn.click(); // cerrar
        }

        await page.waitForTimeout(Math.max(500, durationMs - 3000));
      }
    }
  ]
};
