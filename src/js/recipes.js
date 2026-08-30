import * as ProductStore from "./modules/products/ProductStore.js";
import * as PrimaryFoodStore from "./modules/products/PrimaryFoodStore.js";
import * as MealieClient from "./modules/mealie/MealieClient.js";
import { Modal } from 'bootstrap';
import { db } from './db/schema.js';
import * as RecipeStore from './modules/recipes/RecipeStore.js';
import * as NutritionCalc from './modules/nutrition/NutritionCalculator.js';
import * as ShoppingStore from './modules/shopping/ShoppingStore.js';
import { showToast, confirmModal } from './modules/ui/UI.js';

let recipeModal;
let mealieModal;
let currentIngredients = [];
let mealieRecipesCache = [];

export async function initView() {
  recipeModal = new Modal(document.getElementById('recipeModal'));
  const mealieEl = document.getElementById('mealieImportModal');
  if (mealieEl) {
    mealieModal = new Modal(mealieEl);
  }
  
  await loadRecipes();

  document.getElementById('recipe-search').addEventListener('input', (e) => {
    loadRecipes(e.target.value);
  });

  document.getElementById('btn-new-recipe').addEventListener('click', () => {
    window.location.hash = '#recipe-editor';
  });

  // Botón Importar de Mealie
  const btnOpenMealie = document.getElementById('btn-open-mealie-import');
  if (btnOpenMealie) {
    btnOpenMealie.addEventListener('click', openMealieImportModal);
  }

  // Buscador y refresco de Mealie
  const mealieSearchInput = document.getElementById('mealie-recipe-search');
  if (mealieSearchInput) {
    mealieSearchInput.addEventListener('input', (e) => filterMealieRecipes(e.target.value));
  }
  const btnRefreshMealie = document.getElementById('btn-refresh-mealie-list');
  if (btnRefreshMealie) {
    btnRefreshMealie.addEventListener('click', () => loadMealieRecipes());
  }

  // Botón Pack Mediterráneo
  const btnMedPack = document.getElementById('btn-import-mediterranean-pack');
  if (btnMedPack) {
    btnMedPack.addEventListener('click', importMediterraneanPack);
  }

  // Recalcular al cambiar raciones
  const servingsEl = document.getElementById('recipe-servings');
  if (servingsEl) {
    servingsEl.addEventListener('change', updateNutritionPreview);
  }
}

async function loadRecipes(query = '') {
  const recipes = await RecipeStore.searchRecipes(query);
  const container = document.getElementById('recipes-list');
  
  if (recipes.length === 0) {
    container.innerHTML = `
      <div class="col-12 text-center my-5">
        <div class="p-4 bg-dark border border-secondary rounded-3 d-inline-block text-start" style="max-width: 540px;">
          <h5 class="text-info mb-2">📖 Aún no tienes recetas guardadas</h5>
          <p class="text-muted small mb-3">
            Comienza creando una nueva receta, importando desde tu servidor Mealie o cargando nuestro pack de 12 recetas mediterráneas con Alimentos Primarios (BEDCA).
          </p>
          <div class="d-flex flex-wrap gap-2">
            <button class="btn btn-sm btn-success" onclick="document.getElementById('btn-import-mediterranean-pack').click()">
              🥗 Cargar 12 Recetas Mediterráneas
            </button>
            <button class="btn btn-sm btn-outline-info" onclick="document.getElementById('btn-open-mealie-import').click()">
              🍽️ Importar de Mealie
            </button>
            <a href="#recipe-editor" class="btn btn-sm btn-outline-light">
              + Crear Receta
            </a>
          </div>
        </div>
      </div>`;
    return;
  }

  container.innerHTML = recipes.map(recipe => `
    <div class="col-md-6 col-lg-4 mb-4">
      <div class="card bg-secondary text-white recipe-card h-100">
        <div class="card-body" onclick="window.location.hash = '#recipe-editor?id=${recipe.id}'" style="cursor:pointer;">
          <h5 class="card-title">
            ${recipe.name}
            ${recipe.status === 'draft' ? '<span class="badge bg-warning text-dark ms-2" style="font-size:0.7rem;">Borrador</span>' : ''}
          </h5>
          <h6 class="card-subtitle mb-2 text-light">${recipe.servings} raciones · v${recipe.version || 1}</h6>
          <p class="card-text nutrition-summary">
            ${recipe.nutritionPerServing ?
              `${recipe.nutritionPerServing.kcal} kcal | P: ${recipe.nutritionPerServing.proteins_g}g | C: ${recipe.nutritionPerServing.carbs_g}g | G: ${recipe.nutritionPerServing.fat_g}g` :
              'Nutrición no calculada'}
          </p>
          <div class="mt-2">
            ${recipe.ingredients.slice(0, 3).map(i => `<span class="badge bg-dark me-1">${i.productName}</span>`).join('')}
            ${recipe.ingredients.length > 3 ? `<span class="badge bg-dark">...</span>` : ''}
          </div>
        </div>
        <div class="card-footer d-flex gap-2 bg-dark border-secondary">
          <a href="#recipe-editor?id=${recipe.id}" class="btn btn-sm btn-outline-light flex-grow-1">✏️ Editar</a>
          <button class="btn btn-sm btn-outline-success" onclick="event.stopPropagation(); window._generateShoppingList(${recipe.id})" title="Generar Lista de Compra">🛒 Lista</button>
          <button class="btn btn-sm btn-outline-info" onclick="event.stopPropagation(); window._duplicateRecipe(${recipe.id})" title="Duplicar">📋</button>
          <button class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation(); window.deleteRecipe(${recipe.id})" title="Eliminar">🗑</button>
        </div>
      </div>
    </div>
  `).join('');
}

window._generateShoppingList = async function(recipeId) {
  const recipe = await RecipeStore.getRecipeById(recipeId);
  if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) {
    showToast('La receta no tiene ingredientes para generar una lista.', 'warning');
    return;
  }

  const missingItems = [];
  for (const ing of recipe.ingredients) {
    let currentStock = 0;
    if (ing.productCode) {
      const pantryItem = await db.pantry.where({ productCode: ing.productCode }).first();
      if (pantryItem) currentStock = pantryItem.amount;
    }
    const needed = ing.amount || 1;
    const diff = needed - currentStock;
    if (diff > 0 || currentStock === 0) {
      missingItems.push({
        name: ing.productName || 'Ingrediente',
        code: ing.productCode || null,
        amount: Math.round(diff * 10) / 10,
        unit: ing.unit || ''
      });
    }
  }

  const itemsToBuy = missingItems.length > 0 ? missingItems : recipe.ingredients.map(i => ({
    name: i.productName,
    code: i.productCode || null,
    amount: i.amount || 1,
    unit: i.unit || ''
  }));

  const msg = missingItems.length > 0
    ? `¿Crear lista de la compra para "${recipe.name}" con ${missingItems.length} ingredientes faltantes?`
    : `Tienes stock suficiente en la despensa para todos los ingredientes. ¿Deseas crear la lista para reponer "${recipe.name}"?`;

  const confirmed = await confirmModal('Generar Lista de la Compra', msg);
  if (!confirmed) return;

  await ShoppingStore.createList(recipe.name, itemsToBuy);
  showToast(`Lista de la compra creada con ${itemsToBuy.length} productos. Abriendo Carrito...`, 'success');
  setTimeout(() => {
    window.location.hash = '#grid';
  }, 800);
};

window.editRecipe = async function(id) {
  const recipe = await RecipeStore.getRecipeById(id);
  if (!recipe) return;

  document.getElementById('recipeModalTitle').innerText = 'Editar Receta';
  document.getElementById('recipe-id').value = recipe.id;
  document.getElementById('recipe-name').value = recipe.name;
  document.getElementById('recipe-servings').value = recipe.servings;
  
  currentIngredients = [...recipe.ingredients];
  updateIngredientList();
  
  recipeModal.show();
};

function openNewRecipeModal() {
  document.getElementById('recipeModalTitle').innerText = 'Nueva Receta';
  document.getElementById('recipe-form').reset();
  document.getElementById('recipe-id').value = '';
  currentIngredients = [];
  updateIngredientList();
  document.getElementById('product-search-results').style.display = 'none';
}

async function searchProduct() {
  const query = document.getElementById('ingredient-search').value.trim();
  if (!query) return;

  // Búsqueda simple en Dexie (empieza por código, o incluye nombre)
  let results = [];
  if (/^\d+$/.test(query)) {
    // Es código de barras
    const p = await ProductStore.getProductByCode(query);
    if (p) results = [p];
  } else {
    // Es nombre (búsqueda parcial case-insensitive, max 20 resultados)
    const qLower = query.toLowerCase();
    results = await ProductStore.searchProducts(qLower, 20);
  }

  const resultContainer = document.getElementById('product-search-results');
  if (results.length === 0) {
    resultContainer.innerHTML = '<div class="list-group-item">No se encontraron productos.</div>';
  } else {
    resultContainer.innerHTML = results.map(p => `
      <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
              onclick="window.addIngredient('${p.code}', '${p.product_name?.replace(/'/g, "\\'")}')">
        ${p.product_name || 'Sin nombre'} <small class="text-muted">${p.code}</small>
      </button>
    `).join('');
  }
  resultContainer.style.display = 'block';
}

window.addIngredient = function(code, name) {
  currentIngredients.push({
    productCode: code,
    productName: name || 'Producto ' + code,
    amount: 100,
    unit: 'g'
  });
  
  document.getElementById('ingredient-search').value = '';
  document.getElementById('product-search-results').style.display = 'none';
  updateIngredientList();
};

window.removeIngredient = function(index) {
  currentIngredients.splice(index, 1);
  updateIngredientList();
};

window.updateIngredientAmount = function(index, value) {
  currentIngredients[index].amount = parseFloat(value) || 0;
  updateNutritionPreview();
};

async function updateIngredientList() {
  const container = document.getElementById('ingredient-list');
  
  if (currentIngredients.length === 0) {
    container.innerHTML = '<li class="list-group-item text-muted">Aún no hay ingredientes</li>';
  } else {
    container.innerHTML = currentIngredients.map((ing, idx) => `
      <li class="list-group-item d-flex justify-content-between align-items-center">
        <div class="text-truncate" style="max-width: 50%;" title="${ing.productName}">${ing.productName}</div>
        <div class="d-flex align-items-center">
          <input type="number" class="form-control form-control-sm me-2" style="width: 80px;" 
                 value="${ing.amount}" onchange="window.updateIngredientAmount(${idx}, this.value)">
          <select class="form-select form-select-sm me-2" style="width: 70px;" disabled>
            <option value="g" ${ing.unit === 'g' ? 'selected' : ''}>g</option>
            <option value="ml" ${ing.unit === 'ml' ? 'selected' : ''}>ml</option>
          </select>
          <button type="button" class="btn btn-sm btn-outline-danger" onclick="window.removeIngredient(${idx})">X</button>
        </div>
      </li>
    `).join('');
  }
  
  await updateNutritionPreview();
}

async function updateNutritionPreview() {
  const servings = parseFloat(document.getElementById('recipe-servings').value) || 1;
  const preview = document.getElementById('nutrition-preview');
  
  if (currentIngredients.length === 0) {
    preview.innerHTML = 'Añade ingredientes para calcular la nutrición.';
    return;
  }

  const nutrition = await NutritionCalc.calculateRecipeNutritionPerServing(currentIngredients, servings);
  const formatted = NutritionCalc.formatNutritionForDisplay(nutrition);
  
  preview.innerHTML = `
    <div class="row text-center">
      <div class="col-3"><strong>${nutrition.kcal}</strong><br><small>kcal</small></div>
      <div class="col-3"><strong>${nutrition.proteins_g}g</strong><br><small>Prot</small></div>
      <div class="col-3"><strong>${nutrition.carbs_g}g</strong><br><small>Carb</small></div>
      <div class="col-3"><strong>${nutrition.fat_g}g</strong><br><small>Grasas</small></div>
    </div>
  `;
}



async function saveRecipe() {
  const id = document.getElementById('recipe-id').value;
  const name = document.getElementById('recipe-name').value.trim();
  const servings = parseFloat(document.getElementById('recipe-servings').value) || 1;
  
  if (!name) {
    showToast("Por favor, introduce un nombre para la receta.", 'warning');
    return;
  }

  const nutritionPerServing = await NutritionCalc.calculateRecipeNutritionPerServing(currentIngredients, servings);

  const data = {
    name,
    servings,
    ingredients: currentIngredients,
    nutritionPerServing
  };

  if (id) {
    await RecipeStore.updateRecipe(parseInt(id), data);
  } else {
    await RecipeStore.createRecipe(data);
  }

  recipeModal.hide();
  await loadRecipes();
}

// Eliminar receta desde la lista (con confirmación)
window.deleteRecipe = async function(id) {
  if (!(await confirmModal('¿Eliminar esta receta y todo su historial? Esta acción no se puede deshacer.', 'Eliminar Receta'))) return;
  await RecipeStore.deleteRecipe(id);
  await loadRecipes();
};

// Duplicar receta
window._duplicateRecipe = async function(id) {
  const recipe = await RecipeStore.getRecipeById(id);
  if (!recipe) return;

  const { id: _id, createdAt, updatedAt, version, ...data } = recipe;
  data.name = `${data.name} (Copia)`;
  
  await RecipeStore.createRecipe(data);
  await loadRecipes();
};

// ─────────────────────────────────────────────────────────────────────────────
// Integración con Mealie
// ─────────────────────────────────────────────────────────────────────────────

async function openMealieImportModal() {
  if (!mealieModal) return;
  mealieModal.show();
  await loadMealieRecipes();
}

async function loadMealieRecipes(query = '') {
  const statusEl = document.getElementById('mealie-recipes-status');
  const container = document.getElementById('mealie-recipes-container');
  if (!container) return;

  const config = MealieClient.getMealieConfig();
  if (statusEl) {
    statusEl.className = 'alert alert-info py-2 small mb-3';
    statusEl.innerHTML = `Conectando con <strong>${config.url}</strong>...`;
  }
  container.innerHTML = '<div class="text-center py-4 text-muted"><span class="spinner-border spinner-border-sm text-info me-2"></span>Cargando recetas de Mealie...</div>';

  try {
    const items = await MealieClient.getRecipes(query);
    mealieRecipesCache = items || [];

    if (mealieRecipesCache.length === 0) {
      if (statusEl) {
        statusEl.className = 'alert alert-warning py-2 small mb-3';
        statusEl.innerHTML = `No se encontraron recetas en Mealie (${config.url}).`;
      }
      container.innerHTML = '<div class="text-center py-4 text-muted small">No hay recetas disponibles en tu servidor Mealie o no coinciden con la búsqueda.</div>';
      return;
    }

    if (statusEl) {
      statusEl.className = 'alert alert-success py-2 small mb-3';
      statusEl.innerHTML = `✅ Conectado a Mealie. <strong>${mealieRecipesCache.length}</strong> recetas encontradas.`;
    }

    renderMealieRecipesList(mealieRecipesCache);
  } catch (err) {
    console.error('Error cargando recetas de Mealie:', err);
    if (statusEl) {
      statusEl.className = 'alert alert-danger py-2 small mb-3';
      statusEl.innerHTML = `❌ Error al conectar con Mealie: ${err.message}. Revisa la URL y Token en <a href="#settings" class="alert-link">Ajustes</a>.`;
    }
    container.innerHTML = `<div class="p-3 text-center text-danger small">
      No se pudo conectar con el servidor Mealie.<br>
      Asegúrate de que Mealie está iniciado en <code>${config.url}</code> y configurado en <a href="#settings">Ajustes</a>.
    </div>`;
  }
}

function filterMealieRecipes(q) {
  const query = (q || '').toLowerCase().trim();
  if (!query) {
    renderMealieRecipesList(mealieRecipesCache);
    return;
  }
  const filtered = mealieRecipesCache.filter(r => 
    (r.name && r.name.toLowerCase().includes(query)) ||
    (r.description && r.description.toLowerCase().includes(query)) ||
    (r.tags && r.tags.some(t => (t.name || t).toLowerCase().includes(query)))
  );
  renderMealieRecipesList(filtered);
}

function renderMealieRecipesList(items) {
  const container = document.getElementById('mealie-recipes-container');
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = '<div class="text-muted text-center py-3 small">Sin resultados coincidentes.</div>';
    return;
  }

  container.innerHTML = items.map((r, idx) => `
    <div class="list-group-item bg-dark text-white border-secondary d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 py-3">
      <div style="flex:1; min-width:0;">
        <div class="fw-bold text-info">${r.name}</div>
        <div class="text-muted small text-truncate">${r.description || 'Sin descripción'}</div>
        <div class="mt-1">
          <span class="badge bg-secondary me-1">🍽️ ${r.recipeServings || r.recipeYieldQuantity || 2} raciones</span>
          ${(r.tags || []).map(t => `<span class="badge bg-dark border border-info me-1">${typeof t === 'object' ? t.name : t}</span>`).join('')}
        </div>
      </div>
      <div class="d-flex gap-2 flex-shrink-0">
        <button class="btn btn-sm btn-outline-info" onclick="window._openMealieInEditor('${r.slug}')" title="Editar antes de guardar">
          ✏️ Editor
        </button>
        <button class="btn btn-sm btn-success" id="btn-import-direct-${idx}" onclick="window._importMealieDirect('${r.slug}', ${idx})" title="Importar directamente">
          ⚡ Importar
        </button>
      </div>
    </div>
  `).join('');
}

window._openMealieInEditor = function(slug) {
  if (mealieModal) mealieModal.hide();
  window.location.hash = `#recipe-editor?mealieSlug=${encodeURIComponent(slug)}`;
};

window._importMealieDirect = async function(slug, btnIdx) {
  const btn = document.getElementById(`btn-import-direct-${btnIdx}`);
  const originalText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Importando...';
  }

  try {
    const rawDetail = await MealieClient.getRecipeDetail(slug);
    const converted = MealieClient.convertMealieToBuscaReceta(rawDetail);
    
    // Resolver ingredientes con Smart Match (Alimentos Primarios BEDCA / OFF)
    const resolvedIngredients = [];
    for (const rawIng of converted.ingredients) {
      const match = await PrimaryFoodStore.resolveIngredientSmart(rawIng.name);
      resolvedIngredients.push({
        productCode: match ? match.code : null,
        productName: match ? match.product_name : rawIng.name,
        amount: rawIng.amount || 100,
        unit: rawIng.unit || 'g',
        isPrimary: match ? (match.isPrimaryFood || (match.code && match.code.startsWith('primary:'))) : false
      });
    }

    const nutritionPerServing = await NutritionCalc.calculateRecipeNutritionPerServing(
      resolvedIngredients,
      converted.servings || 2
    );

    const recipeData = {
      name: converted.name,
      servings: converted.servings || 2,
      description: converted.description,
      instructions: converted.instructions,
      tags: converted.tags,
      ingredients: resolvedIngredients,
      nutritionPerServing,
      mealieSlug: slug
    };

    await RecipeStore.createRecipe(recipeData);
    showToast(`✅ Receta "${converted.name}" importada con éxito de Mealie.`, 'success');
    if (mealieModal) mealieModal.hide();
    await loadRecipes();
  } catch (err) {
    console.error('Error importando receta de Mealie:', err);
    showToast(`Error al importar receta: ${err.message}`, 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Importador Pack Dieta Mediterránea
// ─────────────────────────────────────────────────────────────────────────────

async function importMediterraneanPack() {
  const confirmed = await confirmModal(
    '¿Cargar Pack de Recetas Mediterráneas?',
    'Se importarán 12 recetas equilibradas (desayunos, comidas, cenas y meriendas) con Alimentos Primarios BEDCA y macros calculados.'
  );
  if (!confirmed) return;

  const btn = document.getElementById('btn-import-mediterranean-pack');
  const originalText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Importando pack...';
  }

  try {
    const { seedMediterraneanPack } = await import('./modules/demo/demoData.js');
    const count = await seedMediterraneanPack();
    showToast(`🎉 ¡${count} recetas mediterráneas importadas con éxito!`, 'success');
    await loadRecipes();
  } catch (err) {
    console.error('Error importando pack mediterráneo:', err);
    showToast(`Error al cargar el pack: ${err.message}`, 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
}


