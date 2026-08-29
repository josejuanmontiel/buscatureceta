/**
 * Coreografía Automatizada para el Capítulo 3:
 * «De la Cesta a la Cocina — Checkout Automático y Gestión de Despensa»
 */

export const chapter3Data = {
  chapterNumber: 3,
  title: "De la Cesta a la Cocina: Checkout y Despensa Inteligente",
  scenes: [
    {
      id: "escena_01_completar_compra",
      title: "Escaneo de Ingredientes Complementarios",
      narration: "Añadimos a la cesta el resto de nuestra compra: Pan de molde blanco y leche entera. Cada producto queda registrado con sus macros nutricionales y coste asociado.",
      action: async (page, durationMs) => {
        await page.goto('/#grid?code=01472165');
        await page.waitForTimeout(600);
        const priceInputs = await page.$$('#cart-list .cart-price-input');
        if (priceInputs.length > 0) {
          await priceInputs[priceInputs.length - 1].fill('1.80');
        }
        await page.waitForTimeout(400);

        await page.goto('/#grid?code=04295181');
        await page.waitForTimeout(600);
        const lastInputs = await page.$$('#cart-list .cart-price-input');
        if (lastInputs.length > 0) {
          await lastInputs[lastInputs.length - 1].fill('0.90');
        }
        await page.waitForTimeout(Math.max(500, durationMs - 2400));
      }
    },
    {
      id: "escena_02_checkout_despensa",
      title: "Checkout Directo al Stock de la Despensa",
      narration: "Al pulsar el botón de Checkout, la cesta de la compra se transfiere íntegramente a nuestro inventario de cocina. No hace falta reescribir nada a mano.",
      action: async (page, durationMs) => {
        const checkoutBtn = await page.$('#btn-checkout');
        if (checkoutBtn) {
          await checkoutBtn.hover();
          await page.waitForTimeout(600);
          await checkoutBtn.click();
          await page.waitForTimeout(1000);
        }
        // Manejar modal si solicita peso
        const missingWeight = await page.$('#modal-missing-weights.show');
        if (missingWeight) {
          const inputs = await page.$$('.missing-weight-input');
          for (const inp of inputs) {
            await inp.fill('200');
          }
          const saveBtn = await page.$('#btn-save-missing-weights');
          if (saveBtn) await saveBtn.click();
          await page.waitForTimeout(1000);
        }
        await page.waitForTimeout(Math.max(500, durationMs - 2000));
      }
    },
    {
      id: "escena_03_visor_despensa",
      title: "Control Visual de Existencias en la Despensa",
      narration: "En la sección de Despensa tenemos una vista clara de todos los alimentos disponibles, sus fechas de caducidad, cantidades y valores calóricos. Todo listo para cocinar.",
      action: async (page, durationMs) => {
        await page.goto('/#pantry');
        await page.waitForTimeout(800);
        await page.mouse.move(500, 300, { steps: 20 });
        await page.waitForTimeout(600);
        await page.mouse.move(500, 500, { steps: 20 });
        await page.waitForTimeout(Math.max(500, durationMs - 2000));
      }
    }
  ]
};
