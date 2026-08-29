/**
 * Coreografía Automatizada para el Capítulo 2:
 * «Supermercado Inteligente — Detección de Aditivos Nocivos y Alternativas Saludables»
 */

export const chapter2Data = {
  chapterNumber: 2,
  title: "Supermercado Inteligente: Detección de Aditivos y Alternativas",
  scenes: [
    {
      id: "escena_01_configurar_filtros",
      title: "Configuración de Alertas de Aditivos",
      narration: "En la sección de ajustes podemos configurar alertas automáticas para ingredientes y aditivos controvertidos. Por ejemplo, activamos la exclusión del conservante E250, el nitrito sódico habitual en embutidos ultraprocesados.",
      action: async (page, durationMs) => {
        await page.goto('/#settings');
        await page.waitForTimeout(600);
        const filterInput = await page.$('#additive-filters');
        if (filterInput) {
          await filterInput.click({ force: true });
          await filterInput.fill('E250');
          await page.waitForTimeout(400);
        }
        const saveBtn = await page.$('#btn-save-filters');
        if (saveBtn) {
          await saveBtn.click();
          await page.waitForTimeout(600);
        }
        await page.waitForTimeout(Math.max(500, durationMs - 2200));
      }
    },
    {
      id: "escena_02_escanear_aditivo",
      title: "Escaneo y Detección de Alerta Roja",
      narration: "Al escanear un producto en el supermercado, el sistema analiza sus componentes al instante. Si detecta el aditivo E250, emite un aviso visual en rojo y nos explica el motivo de la advertencia sanitaria.",
      action: async (page, durationMs) => {
        await page.goto('/#grid?code=2087569003329');
        await page.waitForTimeout(800);
        await page.mouse.move(500, 350, { steps: 20 });
        await page.waitForTimeout(800);
        const alertBox = await page.$('#assistant-alert');
        if (alertBox) {
          const box = await alertBox.boundingBox();
          if (box) {
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 });
          }
        }
        await page.waitForTimeout(Math.max(500, durationMs - 2200));
      }
    },
    {
      id: "escena_03_alternativa_sana",
      title: "Sugerencia Inteligente de Alternativa Saludable",
      narration: "NutriAgenda no solo te alerta, sino que te propone automáticamente productos alternativos de la misma categoría libres del aditivo nocivo. Con un solo clic sustituimos el producto por la opción saludable.",
      action: async (page, durationMs) => {
        const altBtn = await page.$('#assistant-alternatives button');
        if (altBtn) {
          await altBtn.hover();
          await page.waitForTimeout(600);
          await altBtn.click();
          await page.waitForTimeout(800);
        }
        await page.waitForTimeout(Math.max(500, durationMs - 1800));
      }
    },
    {
      id: "escena_04_ajuste_precio_presupuesto",
      title: "Control de Precios y Presupuesto en Vivo",
      narration: "Ajustamos el precio real del supermercado y la cantidad. La cesta calcula el total en tiempo real para mantenernos siempre dentro de nuestro presupuesto.",
      action: async (page, durationMs) => {
        const priceInput = await page.$('#cart-list .cart-price-input');
        if (priceInput) {
          await priceInput.click({ force: true });
          await priceInput.fill('2.50');
          await page.waitForTimeout(400);
        }
        const amountInput = await page.$('#cart-list .cart-amount-input');
        if (amountInput) {
          await amountInput.click({ force: true });
          await amountInput.fill('2');
          await page.waitForTimeout(400);
        }
        await page.mouse.move(800, 200, { steps: 15 });
        await page.waitForTimeout(Math.max(500, durationMs - 2000));
      }
    }
  ]
};
