/**
 * Coreografía Automatizada para el Capítulo 1:
 * «Introducción & Filosofía Offline-First — Privacidad y Soberanía Nutricional»
 */

export const chapter1Data = {
  chapterNumber: 1,
  title: "Introducción & Filosofía Offline-First: Soberanía Nutricional",
  scenes: [
    {
      id: "escena_01_portada",
      title: "Bienvenida a OpenFoodFacts & NutriAgenda",
      narration: "Bienvenido a NutriAgenda. Esta aplicación nace con un objetivo fundamental: devolverte el control absoluto de lo que compras, comes y almacenas, combinando la base de datos abierta de OpenFoodFacts con un gestor nutricional completo y cien por cien privado.",
      action: async (page, durationMs) => {
        await page.goto('/#home');
        await page.waitForTimeout(800);
        await page.mouse.move(960, 400, { steps: 20 });
        await page.waitForTimeout(1000);
        await page.mouse.move(960, 600, { steps: 20 });
        await page.waitForTimeout(Math.max(500, durationMs - 2500));
      }
    },
    {
      id: "escena_02_privacidad_offline",
      title: "Arquitectura Offline-First con IndexedDB",
      narration: "A diferencia de las aplicaciones comerciales convencionales, NutriAgenda funciona totalmente en local dentro de tu navegador utilizando IndexedDB y Dexie. Tus compras, recetas, fotos y datos de salud no viajan a ningún servidor remoto: la privacidad es total.",
      action: async (page, durationMs) => {
        await page.mouse.move(300, 200, { steps: 15 });
        await page.waitForTimeout(600);
        await page.mouse.move(700, 500, { steps: 20 });
        await page.waitForTimeout(Math.max(500, durationMs - 1500));
      }
    },
    {
      id: "escena_03_navegacion_ciclo",
      title: "El Ciclo Completo de la Nutrición",
      narration: "El flujo de la aplicación conecta todos los eslabones: desde el escaneo con alertas de aditivos en el supermercado, el control de existencias en tu despensa, la creación de recetas con cálculo de macros, hasta el registro diario de ingestas y análisis gráfico.",
      action: async (page, durationMs) => {
        const navbar = await page.$('.navbar');
        if (navbar) {
          await page.mouse.move(200, 30, { steps: 15 });
          await page.waitForTimeout(400);
          await page.mouse.move(400, 30, { steps: 15 });
          await page.waitForTimeout(400);
          await page.mouse.move(600, 30, { steps: 15 });
        }
        await page.waitForTimeout(Math.max(500, durationMs - 1800));
      }
    }
  ]
};
