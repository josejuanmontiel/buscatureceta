/**
 * Coreografía Automatizada para el Capítulo 7:
 * «Alimentos Primarios BEDCA, Pack Mediterráneo & Ecosistema Mealie»
 */

export const chapter7Data = {
  chapterNumber: 7,
  title: "Alimentos Básicos BEDCA, Pack Mediterráneo & Ecosistema Mealie",
  scenes: [
    {
      id: "escena_01_catalogo_bedca",
      title: "Catálogo BEDCA de Alimentos Primarios y Frescos",
      narration: "NutriAgenda integra casi mil alimentos básicos de la base de datos oficial BEDCA: frutas, verduras, carnes, pescados y aceites clasificados como alimentos naturales sin procesar, listos para consultar sin internet.",
      action: async (page, durationMs) => {
        await page.goto('/#db-viewer');
        await page.waitForTimeout(600);

        const primaryTab = await page.$('label[for="db-primary"]');
        if (primaryTab) {
          await primaryTab.click();
          await page.waitForTimeout(400);
        }

        const searchInput = await page.$('#db-search');
        if (searchInput) {
          await searchInput.fill('Calabacín');
          await page.waitForTimeout(800);
          await searchInput.fill('Salmón');
          await page.waitForTimeout(800);
        }

        await page.mouse.move(550, 450, { steps: 15 });
        await page.waitForTimeout(Math.max(500, durationMs - 3500));
      }
    },
    {
      id: "escena_02_pack_mediterraneo",
      title: "Pack de 12 Recetas Mediterráneas en 1 Clic",
      narration: "Con un solo clic podemos importar el pack completo de doce recetas mediterráneas tradicionales: desde gazpacho andaluz y lentejas estofadas hasta salmón al horno o crema suave de calabacín.",
      action: async (page, durationMs) => {
        await page.goto('/#recipes');
        await page.waitForTimeout(600);

        const importPackBtn = await page.$('#btn-import-mediterranean-pack');
        if (importPackBtn) {
          await importPackBtn.hover();
          await page.waitForTimeout(300);
          await importPackBtn.click();
          await page.waitForTimeout(500);

          const confirmBtn = await page.$('#btn-global-confirm');
          if (confirmBtn) {
            await confirmBtn.click();
            await page.waitForTimeout(1000);
          }
        }

        // Scroll suave por las recetas
        await page.mouse.wheel(0, 300);
        await page.waitForTimeout(Math.max(500, durationMs - 3200));
      }
    },
    {
      id: "escena_03_ficha_nutricional_ingrediente",
      title: "Ficha Nutricional Profunda, Vitaminas y Sinergias",
      narration: "Al entrar en cualquier receta y hacer clic en un ingrediente, exploramos su ficha de detalle: nutrientes exactos para la cantidad del plato, vitaminas, minerales destacados, beneficios de salud y sinergias culinarias.",
      action: async (page, durationMs) => {
        const recipeCard = await page.$('.recipe-card');
        if (recipeCard) {
          await recipeCard.click();
          await page.waitForTimeout(800);
        } else {
          await page.goto('/#recipe-editor');
          await page.waitForTimeout(600);
        }

        const ingRow = await page.$('.ingredient-row');
        if (ingRow) {
          await ingRow.hover();
          await page.waitForTimeout(400);
          await ingRow.click();
          await page.waitForTimeout(1500);

          const closeBtn = await page.$('#ingredientDetailModal button[data-bs-dismiss="modal"]');
          if (closeBtn) {
            await closeBtn.click();
            await page.waitForTimeout(400);
          }
        }

        await page.waitForTimeout(Math.max(500, durationMs - 3800));
      }
    },
    {
      id: "escena_04_integracion_mealie",
      title: "Integración Bidireccional con Mealie & Smart Match",
      narration: "Además, nos conectamos directamente con servidores de recetas Mealie. El algoritmo de Smart Match empareja automáticamente los ingredientes importados con los alimentos primarios locales de tu despensa.",
      action: async (page, durationMs) => {
        await page.goto('/#recipes');
        await page.waitForTimeout(600);

        const mealieBtn = await page.$('#btn-open-mealie-import');
        if (mealieBtn) {
          await mealieBtn.hover();
          await page.waitForTimeout(300);
          await mealieBtn.click();
          await page.waitForTimeout(1200);

          const closeMealie = await page.$('#mealieImportModal button[data-bs-dismiss="modal"]');
          if (closeMealie) {
            await closeMealie.click();
            await page.waitForTimeout(400);
          }
        }

        await page.goto('/#home');
        await page.waitForTimeout(Math.max(500, durationMs - 3000));
      }
    }
  ]
};
