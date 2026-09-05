import * as PrimaryFoodStore from "./modules/products/PrimaryFoodStore.js";
import * as ShoppingAssistant from "./modules/insights/ShoppingAssistant.js";
import * as RecentStore from "./modules/products/RecentStore.js";
import * as ProductStore from "./modules/products/ProductStore.js";
import * as PantryStore from './modules/pantry/PantryStore.js';
import * as MealieClient from './modules/mealie/MealieClient.js';
/**
 * recipe-editor.js — Lógica del editor completo de recetas
 *
 * URL: /recipe-editor.html?id=X  (editar existente)
 *      /recipe-editor.html        (nueva receta)
 */

import { Modal } from 'bootstrap';
import { db } from './db/schema.js';
import * as RecipeStore from './modules/recipes/RecipeStore.js';
import * as ShoppingStore from './modules/shopping/ShoppingStore.js';
import * as NutritionCalc from './modules/nutrition/NutritionCalculator.js';
import * as DiaryStore from './modules/diary/DiaryStore.js';
import { showToast, confirmModal, compressImage } from './modules/ui/UI.js';

// ─── Estado local ─────────────────────────────────────────────────────────────
let recipeId = null;            // null → nueva receta
let currentIngredients = [];   // array de { productCode, productName, amount, unit }
let currentTags = [];
let currentPhotoBlob = null;   // Blob | null
let cameraStream = null;
let pendingRestoreVersionId = null;
let restoreModal = null;
let aiImportModal = null;
let smartMatchModal = null;
let planRecipeModal = null;
let changeIngredientModal = null;
let mergeConflictModal = null;
let ingredientDetailModal = null;
let aiImportedRecipeData = null;
let aiImportedIngredients = [];
let currentChangeIngredientIndex = null;

// ─── Init ──────────────────────────────────────────────────────────────────────
export async function initView() {
  restoreModal = new Modal(document.getElementById('restoreModal'));
  aiImportModal = new Modal(document.getElementById('aiImportModal'));
  smartMatchModal = new Modal(document.getElementById('smartMatchModal'));
  changeIngredientModal = new Modal(document.getElementById('changeIngredientModal'));
  mergeConflictModal = new Modal(document.getElementById('mergeConflictModal'));
  const ingDetailEl = document.getElementById('ingredientDetailModal');
  if (ingDetailEl) {
    ingredientDetailModal = new Modal(ingDetailEl);
  }

  const params = new URLSearchParams(window.location.hash.includes('?') ? window.location.hash.split('?')[1] : window.location.search);
  const idParam = params.get('id');
  if (idParam) {
    recipeId = parseInt(idParam);
    await loadRecipe(recipeId);
  }

  const mealieSlugParam = params.get('mealieSlug');
  if (mealieSlugParam) {
    await loadFromMealie(mealieSlugParam);
  }

  bindEvents();

  const codeParam = params.get('code');
  if (codeParam) {
    const p = await ProductStore.getProductByCode(codeParam);
    if (p) {
      currentIngredients.push({
        productCode: p.code,
        productName: p.product_name,
        amount: 100,
        unit: 'g'
      });
      renderIngredients();
      await updateNutrition();
    }
  }

  loadPantryQuickAdd();
}

async function loadFromMealie(slug) {
  try {
    showToast('Cargando receta desde Mealie...', 'info');
    const raw = await MealieClient.getRecipeDetail(slug);
    const converted = MealieClient.convertMealieToBuscaReceta(raw);
    aiImportedRecipeData = converted;
    if (converted.ingredients && converted.ingredients.length > 0) {
      await runSmartMatch(converted.ingredients);
    } else {
      applyImportedRecipeData();
    }
  } catch (err) {
    console.error('Error cargando receta desde Mealie:', err);
    showToast(`Error al cargar desde Mealie: ${err.message}`, 'danger');
  }
}

async function loadPantryQuickAdd() {
  const items = await PantryStore.getPantryInventory();
  const container = document.getElementById('pantry-quick-add-list');
  
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = '<span class="text-muted small">Tu despensa está vacía.</span>';
    return;
  }
  
  container.innerHTML = items.map(item => `
    <button type="button" class="btn btn-sm btn-outline-info rounded-pill"
            onclick="window._addIngredient('${item.productCode}', '${(item.productName || '').replace(/'/g, "\\'")}', true)">
      + ${item.productName} <small class="text-white-50">(${item.amount}${item.unit})</small>
    </button>
  `).join('');
}


// ─── Cargar receta existente ───────────────────────────────────────────────────
async function loadRecipe(id) {
  const recipe = await RecipeStore.getRecipeById(id);
  if (!recipe) {
    showToast('Receta no encontrada', true);
    return;
  }

  document.getElementById('editor-page-title').textContent = recipe.name;
  document.getElementById('recipe-id').value = id;
  document.getElementById('recipe-name').value = recipe.name || '';
  document.getElementById('recipe-servings').value = recipe.servings || 2;
  document.getElementById('recipe-description').value = recipe.description || '';
  document.getElementById('recipe-instructions').value = recipe.instructions || '';
  document.getElementById('recipe-notes').value = recipe.notes || '';

  currentIngredients = recipe.ingredients ? [...recipe.ingredients] : [];
  currentTags = recipe.tags ? [...recipe.tags] : [];

  if (recipe.photoBlob) {
    currentPhotoBlob = recipe.photoBlob;
    showPhotoPreview(recipe.photoBlob);
  }

  const vBadge = document.getElementById('version-badge');
  vBadge.textContent = `v${recipe.version || 1}`;
  vBadge.style.display = 'inline';

  const optionsDropdown = document.getElementById('recipe-options-dropdown-container');
  if (optionsDropdown) optionsDropdown.style.display = 'inline-block';

  renderIngredients();
  renderTags();
  await updateNutrition();
  await loadVersionHistory(id);
}

// ─── Binding de eventos ────────────────────────────────────────────────────────
function bindEvents() {
  // Guardar
  document.getElementById('btn-save-recipe').addEventListener('click', saveRecipe);

  // IA Import
  document.getElementById('btn-import-ai').addEventListener('click', () => aiImportModal.show());
  document.getElementById('btn-copy-recipe-prompt').addEventListener('click', async () => {
    const prompt = `Analiza esta receta. Devuelve ÚNICAMENTE un bloque JSON válido con este formato:
{
  "name": "Nombre de la receta",
  "servings": 2,
  "description": "Breve descripción",
  "instructions": "Paso 1...\\nPaso 2...",
  "ingredients": [
    { "name": "Tomate frito", "amount": 200, "unit": "g" }
  ]
}`;
    try {
      await navigator.clipboard.writeText(prompt);
      showToast('Prompt copiado al portapapeles ✓');
    } catch (err) {
      showToast('Error copiando el prompt', true);
    }
  });
  document.getElementById('btn-process-recipe-ai').addEventListener('click', processRecipeAI);
  document.getElementById('btn-confirm-smart-match').addEventListener('click', confirmSmartMatch);
  document.getElementById('change-ingredient-search').addEventListener('input', debounce(searchChangeIngredient, 300));
  document.getElementById('btn-merge-replace').addEventListener('click', () => mergeIngredients('replace'));
  document.getElementById('btn-merge-append').addEventListener('click', () => mergeIngredients('append'));

  const planEl = document.getElementById('planRecipeModal');
  if (planEl) {
    planRecipeModal = new Modal(planEl);
  }

  document.getElementById('btn-plan-in-diary')?.addEventListener('click', () => {
    if (!recipeId) return;
    openPlanModalForCurrentRecipe();
  });

  document.getElementById('btn-quick-date-today')?.addEventListener('click', () => {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('plan-date').value = today;
  });

  document.getElementById('btn-quick-date-tomorrow')?.addEventListener('click', () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    document.getElementById('plan-date').value = d.toISOString().split('T')[0];
  });

  document.getElementById('btn-do-plan-recipe')?.addEventListener('click', doPlanFromEditor);

  // Eliminar
  document.getElementById('btn-delete-recipe').addEventListener('click', async () => {
    if (!recipeId) return;
    if (!(await confirmModal('¿Eliminar esta receta y todo su historial de versiones? Esta acción no se puede deshacer.', 'Eliminar Receta'))) return;
    await RecipeStore.deleteRecipe(recipeId);
    showToast('Receta eliminada');
    setTimeout(() => { window.location.hash = '#recipes'; }, 800);
  });

  // Duplicar
  document.getElementById('btn-duplicate-recipe').addEventListener('click', async () => {
    if (!recipeId) return;
    const recipe = await RecipeStore.getRecipeById(recipeId);
    if (!recipe) return;
    const duplicateData = {
      name: recipe.name + ' (Copia)',
      servings: recipe.servings,
      description: recipe.description,
      instructions: recipe.instructions,
      notes: recipe.notes,
      tags: recipe.tags ? [...recipe.tags] : [],
      ingredients: recipe.ingredients ? JSON.parse(JSON.stringify(recipe.ingredients)) : [],
      nutritionPerServing: recipe.nutritionPerServing,
      photoBlob: recipe.photoBlob || null
    };
    try {
      const newId = await RecipeStore.createRecipe(duplicateData);
      showToast('Receta duplicada');
      setTimeout(() => { window.location.hash = `#recipe-editor?id=${newId}`; }, 800);
    } catch (err) {
      showToast('Error al duplicar: ' + err.message, true);
    }
  });

  // Crear Lista de Compra
  document.getElementById('btn-create-list-recipe').addEventListener('click', async () => {
    if (!recipeId) return;
    if (currentIngredients.length === 0) {
      showToast('La receta no tiene ingredientes para comprar.', 'warning');
      return;
    }
    const name = document.getElementById('recipe-name').value || 'Receta ' + recipeId;
    const items = currentIngredients.map(ing => ({
      name: ing.productName,
      code: ing.productCode,
      amount: ing.amount,
      unit: ing.unit
    }));
    try {
      await ShoppingStore.createList(name, items);
      showToast(`Lista de la compra creada con ${items.length} productos. Abriendo Carrito...`, 'success');
      setTimeout(() => {
        window.location.hash = '#grid';
      }, 800);
    } catch (e) {
      showToast('Error al crear la lista: ' + e.message, 'danger');
    }
  });

  async function openPlanModalForCurrentRecipe() {
    if (!recipeId) return;
    const recipe = await RecipeStore.getRecipeById(recipeId);
    if (!recipe) return;

    document.getElementById('plan-recipe-id').value = recipe.id;
    document.getElementById('plan-recipe-name').textContent = recipe.name;
    
    const kcal = Math.round(recipe.nutritionPerServing?.kcal || 0);
    document.getElementById('plan-recipe-nutrition').textContent = kcal > 0 ? `${kcal} kcal por ración` : 'Nutrición pendiente';
    document.getElementById('plan-recipe-servings-badge').textContent = `${recipe.servings || 1} rac. en receta`;

    const today = new Date().toISOString().split('T')[0];
    document.getElementById('plan-date').value = today;
    document.getElementById('plan-meal-type').value = 'lunch';
    document.getElementById('plan-course').value = 'main';
    document.getElementById('plan-servings').value = 1;
    document.getElementById('planStatusPlanned').checked = true;
    document.getElementById('plan-deduct-pantry').checked = true;

    if (planRecipeModal) planRecipeModal.show();
  }

  async function doPlanFromEditor() {
    const targetId = parseInt(document.getElementById('plan-recipe-id').value);
    if (!targetId) return;

    const recipe = await RecipeStore.getRecipeById(targetId);
    if (!recipe) return;

    const date = document.getElementById('plan-date').value;
    if (!date) return showToast('Selecciona una fecha válida', 'warning');

    const mealType = document.getElementById('plan-meal-type').value;
    const course = document.getElementById('plan-course').value;
    const servings = parseFloat(document.getElementById('plan-servings').value) || 1;
    const status = document.querySelector('input[name="planStatusRadio"]:checked')?.value || 'planned';
    const deductPantry = document.getElementById('plan-deduct-pantry').checked;

    let nutrition = null;
    if (recipe.nutritionPerServing) {
      nutrition = NutritionCalc.scaleNutrition(recipe.nutritionPerServing, servings);
    } else if (recipe.ingredients && recipe.ingredients.length > 0) {
      nutrition = await NutritionCalc.calculateTotalNutrition(recipe.ingredients);
    }

    const diaryItem = {
      course,
      type: 'recipe',
      recipeId: recipe.id,
      productCode: null,
      name: recipe.name,
      servings,
      nutrition: nutrition || { kcal: 0, proteins_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugars_g: 0, salt_g: 0, saturated_fat_g: 0 }
    };

    await DiaryStore.addDiaryEntry({
      date,
      mealType,
      items: [diaryItem],
      status,
      ate_at_home: deductPantry
    });

    if (status === 'consumed' && deductPantry) {
      await PantryStore.consumeRecipeIngredients(recipe.id, servings, 'consumed_me');
    }

    if (planRecipeModal) planRecipeModal.hide();

    const actionText = status === 'planned' ? 'planificada' : 'registrada como consumida';
    showToast(`¡"${recipe.name}" ${actionText} para el ${date}!`, 'success');
  }

  // Buscador de ingredientes
  document.getElementById('btn-search-ingredient').addEventListener('click', searchIngredient);
  document.getElementById('btn-scan-ingredient')?.addEventListener('click', () => {
    const rId = recipeId ? `&id=${recipeId}` : '';
    window.location.href = `/scan.html?return=%23recipe-editor${rId}`;
  });
  document.getElementById('ingredient-search').addEventListener('keypress', e => {
    if (e.key === 'Enter') { e.preventDefault(); searchIngredient(); }
  });

  // Recalcular al cambiar raciones
  document.getElementById('recipe-servings').addEventListener('input', updateNutrition);

  // Tags
  document.getElementById('btn-add-tag').addEventListener('click', addTag);
  document.getElementById('tag-input').addEventListener('keypress', e => {
    if (e.key === 'Enter') { e.preventDefault(); addTag(); }
  });

  // Foto — galería (file input)
  document.getElementById('btn-open-gallery').addEventListener('click', () => {
    document.getElementById('recipe-photo-input').click();
  });
  document.getElementById('recipe-photo-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    currentPhotoBlob = file;
    showPhotoPreview(file);
    e.target.value = '';
  });

  // Foto — cámara
  document.getElementById('btn-open-camera').addEventListener('click', openCamera);
  document.getElementById('btn-take-photo').addEventListener('click', takePhoto);
  document.getElementById('btn-cancel-camera').addEventListener('click', stopCamera);

  // Quitar foto
  document.getElementById('btn-remove-photo').addEventListener('click', removePhoto);

  // Clic en el box de foto → galería
  document.getElementById('recipe-photo-box').addEventListener('click', (e) => {
    if (document.getElementById('camera-section').style.display !== 'none') return;
    if (e.target.closest('#btn-remove-photo')) return;
    document.getElementById('recipe-photo-input').click();
  });

  // Restaurar versión
  document.getElementById('btn-confirm-restore').addEventListener('click', async () => {
    if (!pendingRestoreVersionId || !recipeId) return;
    restoreModal.hide();
    try {
      await RecipeStore.restoreVersion(recipeId, pendingRestoreVersionId);
      showToast('Versión restaurada');
      await loadRecipe(recipeId);
    } catch (err) {
      showToast('Error al restaurar: ' + err.message, true);
    }
  });
}

// ─── Guardar receta ────────────────────────────────────────────────────────────
async function saveRecipe() {
  const name = document.getElementById('recipe-name').value.trim();
  if (!name) { showToast('El nombre es obligatorio', true); return; }

  const servings = parseFloat(document.getElementById('recipe-servings').value) || 1;
  const description = document.getElementById('recipe-description').value.trim();
  const instructions = document.getElementById('recipe-instructions').value.trim();
  const notes = document.getElementById('recipe-notes').value.trim();

  const nutritionPerServing = currentIngredients.length > 0
    ? await NutritionCalc.calculateRecipeNutritionPerServing(currentIngredients, servings)
    : null;

  const data = {
    name, servings, description, instructions, notes,
    tags: currentTags,
    ingredients: currentIngredients,
    nutritionPerServing,
    photoBlob: currentPhotoBlob,
  };

  try {
    if (recipeId) {
      await RecipeStore.updateRecipe(recipeId, data);
      showToast('Receta actualizada ✓');
      await loadRecipe(recipeId);
    } else {
      const newId = await RecipeStore.createRecipe(data);
      showToast('Receta creada ✓');
      // Navegar al editor con el id nuevo usando hash
      window.history.replaceState({}, '', `/#recipe-editor?id=${newId}`);
      recipeId = newId;
      await loadRecipe(newId);
    }
  } catch (err) {
    showToast('Error al guardar: ' + err.message, true);
  }
}

// ─── Ingredientes ──────────────────────────────────────────────────────────────
async function searchIngredient() {
  const query = document.getElementById('ingredient-search').value.trim();
  if (!query) return;

  const searchPantryOnly = document.getElementById('search-pantry-only')?.checked;
  
  let results = [];
  try {
  if (searchPantryOnly) {
    const pantryItems = await db.pantry.toArray();
    const pantryCodes = Array.from(new Set(pantryItems.map(item => item.productCode)));
    
    if (pantryCodes.length === 0) {
      results = [];
    } else if (/^\d+$/.test(query)) {
      // Búsqueda por código: solo comprobar si está en la despensa
      if (pantryCodes.includes(query)) {
        const p = await ProductStore.getProductByCode(query);
        if (p) results = [p];
      }
    } else {
      // Búsqueda por nombre: recuperar TODOS los productos de la despensa
      // y filtrar por nombre localmente, sin depender del límite de 10k
      const pantryProducts = await ProductStore.getProductsByCodes(pantryCodes);
      const q = query.toLowerCase();
      results = pantryProducts.filter(p =>
        (p.product_name || '').toLowerCase().includes(q) ||
        (p.brands || '').toLowerCase().includes(q)
      );
    }
  } else {
    if (/^\d+$/.test(query)) {
      const p = await ProductStore.getProductByCode(query);
      if (p) results = [p];
    } else {
      const q = query.toLowerCase();
      results = await ProductStore.searchProducts(q, 20);
    }
  }
  } catch(err) {
    console.error('SEARCH ERROR:', err);
  }

  console.log('SEARCH RESULTS:', results.length);
  const container = document.getElementById('ingredient-search-results');
  if (results.length === 0) {
    container.innerHTML = '<div class="list-group-item text-muted small">Sin resultados.</div>';
  } else {
    container.innerHTML = results.map(p => `
      <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-2"
              onclick="window._addIngredient('${p.code}','${(p.product_name || '').replace(/'/g,"\\'")}')">
        <span class="small">${p.product_name || 'Sin nombre'}</span>
        <span class="badge bg-secondary">${p.code}</span>
      </button>`).join('');
  }
  container.style.display = 'block';
}

let pendingIngredient = null;
let ingredientWarningModal = null;

window._addIngredient = async function(code, name, force = false) {
  if (!force) {
    const result = await ShoppingAssistant.analyzeProductForCart(code);
    if (result && result.status === 'warning') {
      const warnings = result.warnings || [];
      const healthyAlternative = (result.alternatives && result.alternatives.length > 0)
        ? result.alternatives[0]
        : null;

      if (warnings.length > 0) {
        if (!ingredientWarningModal) {
           ingredientWarningModal = new Modal(document.getElementById('ingredientWarningModal'));
        }
        pendingIngredient = { code, name };
        
        document.getElementById('ing-warning-text').innerText = `El producto "${name}" tiene los siguientes avisos:`;
        const list = document.getElementById('ing-warning-list');
        list.innerHTML = warnings.map(w => `<li>${w}</li>`).join('');
        
        const altContainer = document.getElementById('ing-alternative-container');
        if (healthyAlternative) {
          altContainer.style.display = 'block';
          document.getElementById('ing-alternative-name').innerText = healthyAlternative.product_name;
          document.getElementById('btn-use-alternative').onclick = () => {
            ingredientWarningModal.hide();
            _addIngredient(healthyAlternative.code, healthyAlternative.product_name, true);
          };
        } else {
          altContainer.style.display = 'none';
        }
        
        document.getElementById('btn-ignore-warning').onclick = () => {
          ingredientWarningModal.hide();
          _addIngredient(pendingIngredient.code, pendingIngredient.name, true);
        };
        
        ingredientWarningModal.show();
        return;
      }
    }
  }


  currentIngredients.push({ productCode: code, productName: name || `Prod ${code}`, amount: 100, unit: 'g' });
  document.getElementById('ingredient-search').value = '';
  document.getElementById('ingredient-search-results').style.display = 'none';
  RecentStore.markAsUsed(code);
  renderIngredients();
  updateNutrition();
};

window._removeIngredient = function(idx) {
  currentIngredients.splice(idx, 1);
  renderIngredients();
  updateNutrition();
};

window._changeAmount = function(idx, val) {
  currentIngredients[idx].amount = parseFloat(val) || 0;
  updateNutrition();
};

window._changeUnit = function(idx, val) {
  currentIngredients[idx].unit = val;
  updateNutrition();
};

function renderIngredients() {
  const container = document.getElementById('ingredient-list');
  if (currentIngredients.length === 0) {
    container.innerHTML = '<div class="text-muted small">Aún no hay ingredientes.</div>';
    return;
  }
  container.innerHTML = currentIngredients.map((ing, i) => {
    const isPrimary = ing.productCode?.startsWith('primary:') || ing.productCode?.startsWith('bedca_');
    const isOff = ing.productCode && /^\d+$/.test(ing.productCode);
    const badge = isPrimary 
      ? '<span class="badge bg-success-subtle text-success border border-success me-2" style="font-size:0.72rem;">🌱 Primario</span>'
      : (isOff ? '<span class="badge bg-primary-subtle text-primary border border-primary me-2" style="font-size:0.72rem;">🛒 OFF</span>' : '');

    return `
    <div class="ingredient-row d-flex align-items-center justify-content-between py-2 border-bottom border-secondary border-opacity-25">
      <div class="d-flex align-items-center flex-grow-1 me-2" style="cursor:pointer;" onclick="window._showIngredientDetail(${i})" title="Ver ficha nutricional de ${ing.productName}">
        ${badge}
        <span class="ingredient-name fw-medium text-white me-2" title="${ing.productName}">${ing.productName}</span>
        <button type="button" class="btn btn-sm btn-outline-info p-0 px-2 py-0" style="font-size:0.72rem;" title="Ver ficha nutricional">ℹ️</button>
      </div>
      <div class="d-flex align-items-center gap-2">
        <input type="number" class="form-control form-control-sm text-end" style="width:75px;"
               value="${ing.amount}" min="0" step="any" onchange="window._changeAmount(${i}, this.value)">
        <select class="form-select form-select-sm bg-dark text-white border-secondary py-0 px-1" style="width:70px; font-size:0.8rem;" onchange="window._changeUnit(${i}, this.value)">
          <option value="g" ${ing.unit === 'g' || !ing.unit ? 'selected' : ''}>g</option>
          <option value="ml" ${ing.unit === 'ml' ? 'selected' : ''}>ml</option>
          <option value="unidad" ${ing.unit === 'unidad' || ing.unit === 'ud' ? 'selected' : ''}>ud</option>
        </select>
        <button class="btn-remove-ing" onclick="window._removeIngredient(${i})" title="Eliminar">✕</button>
      </div>
    </div>`;
  }).join('');
}

window._showIngredientDetail = async function(index) {
  const ing = currentIngredients[index];
  if (!ing) return;

  const titleEl = document.getElementById('modal-ing-title');
  const subtitleEl = document.getElementById('modal-ing-subtitle');
  const bodyEl = document.getElementById('modal-ing-body');

  if (titleEl) titleEl.textContent = ing.productName || 'Detalle del Ingrediente';
  if (subtitleEl) subtitleEl.textContent = `Cantidad en esta receta: ${ing.amount} ${ing.unit}`;

  if (bodyEl) {
    bodyEl.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-info" role="status"></div><p class="mt-2 text-muted small">Cargando ficha nutricional...</p></div>';
  }
  if (ingredientDetailModal) {
    ingredientDetailModal.show();
  }

  let product = null;
  if (ing.productCode) {
    product = await ProductStore.getProductByCode(ing.productCode);
  }

  if (!product && ing.productName) {
    product = await PrimaryFoodStore.resolveIngredientSmart(ing.productName);
  }

  if (!product) {
    if (bodyEl) {
      bodyEl.innerHTML = `
        <div class="alert alert-warning py-3 mb-0">
          <h6>⚠️ Ingrediente no vinculado</h6>
          <p class="small mb-0">Este ingrediente aún no está enlazado a la base de datos de Alimentos Primarios (BEDCA) ni a Open Food Facts. Puedes buscarlo en el buscador de ingredientes para asignarle valores nutricionales.</p>
        </div>`;
    }
    return;
  }

  const isPrimary = product.isPrimaryFood || product.code?.startsWith('primary:') || product.code?.startsWith('bedca_');
  const nutriments = product.nutriments || {};

  const factor = (ing.amount || 100) / 100;
  const cal100 = parseFloat(nutriments['energy-kcal_100g'] ?? product['energy-kcal_100g'] ?? 0);
  const prot100 = parseFloat(nutriments['proteins_100g'] ?? product['proteins_100g'] ?? 0);
  const fat100 = parseFloat(nutriments['fat_100g'] ?? product['fat_100g'] ?? 0);
  const carbs100 = parseFloat(nutriments['carbohydrates_100g'] ?? product['carbohydrates_100g'] ?? 0);
  const fiber100 = parseFloat(nutriments['fiber_100g'] ?? product['fiber_100g'] ?? 0);
  const sugars100 = parseFloat(nutriments['sugars_100g'] ?? product['sugars_100g'] ?? 0);
  const salt100 = parseFloat(nutriments['salt_100g'] ?? product['salt_100g'] ?? 0);

  const calRec = Math.round(cal100 * factor * 10) / 10;
  const protRec = Math.round(prot100 * factor * 10) / 10;
  const fatRec = Math.round(fat100 * factor * 10) / 10;
  const carbsRec = Math.round(carbs100 * factor * 10) / 10;
  const fiberRec = Math.round(fiber100 * factor * 10) / 10;
  const sugarsRec = Math.round(sugars100 * factor * 10) / 10;
  const saltRec = Math.round(salt100 * factor * 100) / 100;

  const nutriscore = (product.nutriscore_grade || 'a').toUpperCase();
  const nova = product.nova_group || (isPrimary ? 1 : null);

  let badgesHtml = `
    <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
      <span class="badge ${isPrimary ? 'bg-success' : 'bg-primary'} px-2 py-1">
        ${isPrimary ? '🌱 Alimento Básico (BEDCA)' : '🛒 Producto Comercial (OpenFoodFacts)'}
      </span>
      <span class="badge bg-secondary px-2 py-1">Nutri-Score: <strong>${nutriscore}</strong></span>
      ${nova ? `<span class="badge bg-dark border border-secondary px-2 py-1">NOVA: <strong>Grupo ${nova}</strong></span>` : ''}
      ${product.brands && !isPrimary ? `<span class="badge bg-info text-dark px-2 py-1">${product.brands}</span>` : ''}
    </div>`;

  // Micronutrientes
  let micronutrientsHtml = '';
  const microList = [];
  const microKeys = [
    { k: 'vitamina_c_mg', label: 'Vitamina C', unit: 'mg' },
    { k: 'vitamina_a_ug', label: 'Vitamina A', unit: 'µg' },
    { k: 'vitamina_e_mg', label: 'Vitamina E', unit: 'mg' },
    { k: 'vitamina_b6_mg', label: 'Vitamina B6', unit: 'mg' },
    { k: 'vitamina_b12_ug', label: 'Vitamina B12', unit: 'µg' },
    { k: 'acido_folico_ug', label: 'Ácido Fólico', unit: 'µg' },
    { k: 'calcio_mg', label: 'Calcio', unit: 'mg' },
    { k: 'potasio_mg', label: 'Potasio', unit: 'mg' },
    { k: 'hierro_mg', label: 'Hierro', unit: 'mg' },
    { k: 'magnesio_mg', label: 'Magnesio', unit: 'mg' },
    { k: 'fosforo_mg', label: 'Fósforo', unit: 'mg' },
    { k: 'zinc_mg', label: 'Zinc', unit: 'mg' },
    { k: 'selenio_ug', label: 'Selenio', unit: 'µg' }
  ];

  for (const m of microKeys) {
    if (nutriments[m.k] !== undefined && nutriments[m.k] !== null && nutriments[m.k] > 0) {
      const val100 = parseFloat(nutriments[m.k]);
      const valRec = Math.round(val100 * factor * 100) / 100;
      microList.push(`<span class="badge bg-dark border border-success text-success px-2 py-1">${m.label}: <strong>${valRec} ${m.unit}</strong> <small class="text-muted">(${val100}${m.unit}/100g)</small></span>`);
    }
  }

  if (microList.length > 0) {
    micronutrientsHtml = `
      <div class="mt-3">
        <h6 class="text-success small fw-bold mb-2">🌿 Vitaminas y Minerales Destacados:</h6>
        <div class="d-flex flex-wrap gap-2">${microList.join('')}</div>
      </div>`;
  }

  // Beneficios de salud
  let benefitsHtml = '';
  if (product.benefits && product.benefits.length > 0) {
    benefitsHtml = `
      <div class="mt-3 p-3 bg-dark border border-success border-opacity-50 rounded-3">
        <h6 class="text-success small fw-bold mb-2">💚 Beneficios para la Salud:</h6>
        <ul class="small mb-0 ps-3">
          ${product.benefits.map(b => `<li class="mb-1 text-light">${b}</li>`).join('')}
        </ul>
      </div>`;
  }

  // Sinergias culinarias / nutricionales
  let synergiesHtml = '';
  if (product.synergies && product.synergies.length > 0) {
    synergiesHtml = `
      <div class="mt-3 p-3 bg-dark border border-warning border-opacity-50 rounded-3">
        <h6 class="text-warning small fw-bold mb-2">⚡ Sinergias Nutricionales:</h6>
        <ul class="small mb-0 ps-3">
          ${product.synergies.map(s => `<li class="mb-1 text-light">${s}</li>`).join('')}
        </ul>
      </div>`;
  }

  // Compuestos bioactivos
  let bioactivesHtml = '';
  if (product.bioactiveCompounds && product.bioactiveCompounds.length > 0) {
    bioactivesHtml = `
      <div class="mt-3">
        <h6 class="text-info small fw-bold mb-2">✨ Compuestos Bioactivos:</h6>
        <div class="d-flex flex-wrap gap-1">
          ${product.bioactiveCompounds.map(c => `<span class="badge bg-info-subtle text-info border border-info">${c}</span>`).join('')}
        </div>
      </div>`;
  }

  // Aditivos
  let additivesHtml = '';
  if (product.additives_tags && product.additives_tags.length > 0) {
    additivesHtml = `
      <div class="mt-3 p-3 bg-dark border border-danger border-opacity-50 rounded-3">
        <h6 class="text-danger small fw-bold mb-2">⚠️ Aditivos Detectados (${product.additives_tags.length}):</h6>
        <div class="d-flex flex-wrap gap-1">
          ${product.additives_tags.map(a => `<span class="badge bg-danger-subtle text-danger border border-danger">${a.replace('en:', '').toUpperCase()}</span>`).join('')}
        </div>
      </div>`;
  }

  if (bodyEl) {
    bodyEl.innerHTML = `
      ${badgesHtml}
      
      <div class="table-responsive">
        <table class="table table-dark table-sm table-bordered mb-0 small">
          <thead>
            <tr class="text-muted">
              <th>Nutriente</th>
              <th class="text-end">Por 100g / 100ml</th>
              <th class="text-end text-success fw-bold">En tu receta (${ing.amount} ${ing.unit})</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>🔥 Calorías</strong></td>
              <td class="text-end">${cal100} kcal</td>
              <td class="text-end text-success fw-bold">${calRec} kcal</td>
            </tr>
            <tr>
              <td><strong>💪 Proteínas</strong></td>
              <td class="text-end">${prot100} g</td>
              <td class="text-end text-success fw-bold">${protRec} g</td>
            </tr>
            <tr>
              <td><strong>🥑 Grasas</strong></td>
              <td class="text-end">${fat100} g</td>
              <td class="text-end text-success fw-bold">${fatRec} g</td>
            </tr>
            <tr>
              <td><strong>🍞 Carbohidratos</strong></td>
              <td class="text-end">${carbs100} g</td>
              <td class="text-end text-success fw-bold">${carbsRec} g</td>
            </tr>
            <tr>
              <td>&nbsp;&nbsp;↳ de los cuales azúcares</td>
              <td class="text-end text-muted">${sugars100} g</td>
              <td class="text-end text-muted">${sugarsRec} g</td>
            </tr>
            <tr>
              <td><strong>🌾 Fibra alimentaria</strong></td>
              <td class="text-end">${fiber100} g</td>
              <td class="text-end text-success fw-bold">${fiberRec} g</td>
            </tr>
            <tr>
              <td><strong>🧂 Sal</strong></td>
              <td class="text-end">${salt100} g</td>
              <td class="text-end">${saltRec} g</td>
            </tr>
          </tbody>
        </table>
      </div>

      ${micronutrientsHtml}
      ${bioactivesHtml}
      ${benefitsHtml}
      ${synergiesHtml}
      ${additivesHtml}
    `;
  }
};

// ─── Nutrición ─────────────────────────────────────────────────────────────────
async function updateNutrition() {
  const servings = parseFloat(document.getElementById('recipe-servings').value) || 1;
  const container = document.getElementById('nutrition-preview');
  if (currentIngredients.length === 0) {
    container.innerHTML = `
      <div class="nutrition-pill"><div class="val">–</div><div class="lbl">kcal</div></div>
      <div class="nutrition-pill"><div class="val">–</div><div class="lbl">Prot.</div></div>
      <div class="nutrition-pill"><div class="val">–</div><div class="lbl">Carb.</div></div>
      <div class="nutrition-pill"><div class="val">–</div><div class="lbl">Grasa</div></div>`;
    return;
  }
  const n = await NutritionCalc.calculateRecipeNutritionPerServing(currentIngredients, servings);
  container.innerHTML = `
    <div class="nutrition-pill"><div class="val">${n.kcal}</div><div class="lbl">kcal</div></div>
    <div class="nutrition-pill"><div class="val">${n.proteins_g}g</div><div class="lbl">Prot.</div></div>
    <div class="nutrition-pill"><div class="val">${n.carbs_g}g</div><div class="lbl">Carb.</div></div>
    <div class="nutrition-pill"><div class="val">${n.fat_g}g</div><div class="lbl">Grasa</div></div>`;
}

// ─── Tags ──────────────────────────────────────────────────────────────────────
function addTag() {
  const val = document.getElementById('tag-input').value.trim();
  if (!val || currentTags.includes(val)) { document.getElementById('tag-input').value = ''; return; }
  currentTags.push(val);
  document.getElementById('tag-input').value = '';
  renderTags();
}

window._removeTag = function(idx) { currentTags.splice(idx, 1); renderTags(); };

function renderTags() {
  const c = document.getElementById('tags-container');
  c.innerHTML = currentTags.map((t, i) =>
    `<span class="tag-badge" onclick="window._removeTag(${i})">${t} <span class="remove-tag">✕</span></span>`
  ).join('');
}

// ─── Historial de versiones ────────────────────────────────────────────────────
async function loadVersionHistory(id) {
  const versions = await RecipeStore.getRecipeVersions(id);
  const card = document.getElementById('versions-card');
  const timeline = document.getElementById('version-timeline');
  const countBadge = document.getElementById('versions-count');

  if (versions.length === 0) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';
  countBadge.textContent = versions.length;

  timeline.innerHTML = versions.map((v, i) => {
    const d = new Date(v.savedAt);
    const dateStr = d.toLocaleDateString('es', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr = d.toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' });
    return `
      <div class="version-item" onclick="window._confirmRestore(${v.id}, '${dateStr} ${timeStr}', 'v${v.versionNumber}')">
        <div class="version-dot ${i === 0 ? 'current' : ''}"></div>
        <div>
          <div class="version-label">v${v.versionNumber} — ${v.snapshot.name || 'sin nombre'}</div>
          <div class="version-meta">${dateStr} · ${timeStr} · ${v.snapshot.ingredients?.length || 0} ingredientes</div>
        </div>
      </div>`;
  }).join('');
}

window._confirmRestore = function(versionId, dateStr, vLabel) {
  pendingRestoreVersionId = versionId;
  document.getElementById('restore-modal-text').textContent =
    `¿Restaurar la versión ${vLabel} guardada el ${dateStr}?`;
  restoreModal.show();
};

// ─── Cámara y foto ─────────────────────────────────────────────────────────────
async function openCamera() {
  const section = document.getElementById('camera-section');
  const video = document.getElementById('recipe-video');
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = cameraStream;
    section.style.display = 'block';
  } catch (err) {
    showToast('No se pudo acceder a la cámara: ' + err.message, true);
  }
}

async function takePhoto() {
  const video = document.getElementById('recipe-video');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  stopCamera();
  
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
  if (!blob) return;
  
  try {
    currentPhotoBlob = await compressImage(blob, 1080);
    showPhotoPreview(currentPhotoBlob);
  } catch (e) {
    showToast('Error comprimiendo foto', 'danger');
  }
}

function stopCamera() {
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
  document.getElementById('camera-section').style.display = 'none';
}

function showPhotoPreview(blob) {
  const box = document.getElementById('recipe-photo-box');
  const placeholder = document.getElementById('photo-placeholder');
  const url = URL.createObjectURL(blob);

  // Eliminar img previa si existe
  const prev = box.querySelector('img');
  if (prev) prev.remove();

  const img = document.createElement('img');
  img.src = url;
  img.alt = 'Foto de la receta';
  box.prepend(img);

  placeholder.style.display = 'none';
  document.getElementById('btn-remove-photo').style.display = 'inline-block';
}

function removePhoto() {
  currentPhotoBlob = null;
  const box = document.getElementById('recipe-photo-box');
  const prev = box.querySelector('img');
  if (prev) prev.remove();
  document.getElementById('photo-placeholder').style.display = 'block';
  document.getElementById('btn-remove-photo').style.display = 'none';
}

// ─── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null;

// ─── IA Import & Smart Match ───────────────────────────────────────────────────

async function processRecipeAI() {
  const jsonStr = document.getElementById('recipe-ai-json').value.trim();
  if (!jsonStr) { showToast('Pega el JSON primero', true); return; }
  
  let data;
  try {
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No se encontraron llaves {}");
    data = JSON.parse(match[0]);
  } catch (err) {
    showToast('JSON inválido: ' + err.message, true);
    return;
  }
  
  aiImportedRecipeData = data;
  aiImportModal.hide();
  
  if (data.ingredients && data.ingredients.length > 0) {
    await runSmartMatch(data.ingredients);
  } else {
    applyImportedRecipeData();
  }
}

async function runSmartMatch(ingredients) {
  aiImportedIngredients = [];
  const listEl = document.getElementById('smart-match-list');
  smartMatchModal.show();

  const results = [];

  for (let i = 0; i < ingredients.length; i++) {
    const ing = ingredients[i];
    const q = ing.name.toLowerCase();

    // Progreso en tiempo real
    listEl.innerHTML = `
      <div class="text-center p-4">
        <div class="spinner-border spinner-border-sm text-info me-2" role="status"></div>
        <span>Buscando ${i + 1} de ${ingredients.length}: <strong>${ing.name}</strong></span>
        <div class="progress mt-3" style="height: 6px;">
          <div class="progress-bar bg-info" style="width: ${Math.round(((i) / ingredients.length) * 100)}%"></div>
        </div>
        ${results.length > 0 ? `<div class="mt-3 text-start small">
          ${results.map(r => `<div>${r.match ? '✅' : '⚠️'} ${r.original.name} → ${r.match ? r.match.product_name : '<em class="text-warning">Pendiente...</em>'}</div>`).join('')}
        </div>` : ''}
      </div>`;

    // Ceder el hilo para que el DOM se actualice
    await new Promise(r => setTimeout(r, 0));

    // 1º: buscar primero en Mis Productos (rápido, siempre exacto)
    let searchRes = await searchInCustomFirst(q);
    let bestMatch = searchRes.length > 0 ? searchRes[0] : null;

    // 2º: buscar en Alimentos Primarios (BEDCA/PrimaryFoods offline)
    if (!bestMatch) {
      const primaryRes = await PrimaryFoodStore.searchPrimaryFoods(q, 5);
      if (primaryRes.length > 0) {
        bestMatch = primaryRes[0];
        searchRes = primaryRes;
      }
    }

    // 3º: si no hay nada, buscar en BD oficial con límite pequeño para no atascar
    if (!bestMatch) {
      const officialRes = await searchInOfficial(q, 5);
      if (officialRes.length > 0) {
        bestMatch = officialRes[0];
        searchRes = officialRes;
      }
    }

    console.log(`[SmartMatch] ${i + 1}/${ingredients.length} "${ing.name}" → ${bestMatch ? bestMatch.product_name : 'NO ENCONTRADO'}`);

    results.push({
      original: ing,
      match: bestMatch,
      alternatives: searchRes.slice(1)
    });
  }

  aiImportedIngredients = results;
  renderSmartMatchList();
}

/**
 * Busca primero en customProducts (siempre pequeño, rápido)
 */
async function searchInCustomFirst(q) {
  const terms = q.split(' ').filter(t => t.length > 0);
  const all = await db.customProducts.toArray();
  return all.filter(p => {
    const name = (p.product_name || '').toLowerCase();
    return terms.every(t => name.includes(t));
  }).slice(0, 5);
}

/**
 * Busca en la BD oficial con un límite estricto para no atascar
 */
async function searchInOfficial(q, limit = 5) {
  const terms = q.split(' ').filter(t => t.length > 0);
  let scanned = 0;
  const MAX_SCAN = 5000; // Máximo reducido para no bloquear en smartmatch
  return db.products.toCollection()
    .until(() => { scanned++; return scanned > MAX_SCAN; })
    .filter(p => {
      const name = (p.product_name || '').toLowerCase();
      const brand = (p.brands || '').toLowerCase();
      return terms.every(t => name.includes(t) || brand.includes(t));
    })
    .limit(limit)
    .toArray();
}

function renderSmartMatchList() {
  const listEl = document.getElementById('smart-match-list');
  listEl.innerHTML = aiImportedIngredients.map((item, idx) => `
    <div class="list-group-item d-flex align-items-center justify-content-between gap-2" id="smart-match-row-${idx}">
      <div style="flex:1; min-width:0;">
        <div class="fw-bold small text-muted text-truncate">${item.original.amount}${item.original.unit} ${item.original.name}</div>
        ${item.match 
          ? `<div class="small mt-1">✅ <span class="fw-bold text-success">${item.match.product_name}</span>
             ${(item.match.code && item.match.code.startsWith('primary:')) || item.match.isPrimaryFood ? '<span class="badge bg-success ms-1">🌱 Primario</span>' : `<span class="badge bg-secondary ms-1">${item.match.code}</span>`}
             ${item.match.benefits && item.match.benefits.length > 0 ? `<div class="text-info mt-1" style="font-size:0.75rem;">✨ ${item.match.benefits[0]}</div>` : ''}
             </div>`
          : `<div class="small mt-1">❌ <span class="text-warning">Sin match — pulsa "Buscar" para asignar uno</span></div>`
        }
      </div>
      <div class="d-flex gap-1 flex-shrink-0">
        <button class="btn btn-sm btn-outline-info" onclick="window._openChangeIngredient(${idx})">Buscar</button>
        ${item.match ? `<button class="btn btn-sm btn-outline-danger" onclick="window._removeSmartMatch(${idx})">✕</button>` : ''}
      </div>
    </div>
  `).join('');
}

window._removeSmartMatch = function(idx) {
  aiImportedIngredients[idx].match = null;
  renderSmartMatchList();
}

window._openChangeIngredient = async function(idx) {
  currentChangeIngredientIndex = idx;
  const item = aiImportedIngredients[idx];
  document.getElementById('change-ingredient-search').value = item.original.name;
  changeIngredientModal.show();
  await searchChangeIngredient();
}

async function searchChangeIngredient() {
  const q = document.getElementById('change-ingredient-search').value.trim().toLowerCase();
  if (!q) return;

  const container = document.getElementById('change-ingredient-results');
  container.innerHTML = '<div class="text-center py-2"><span class="spinner-border spinner-border-sm text-info"></span></div>';

  // 1. Buscar en custom
  const customRes = await searchInCustomFirst(q);
  // 2. Buscar en alimentos primarios (BEDCA)
  const primaryRes = await PrimaryFoodStore.searchPrimaryFoods(q, 10);
  // 3. Buscar en oficial OFF
  const officialRes = await searchInOfficial(q, 20);

  // Combinar sin duplicados
  const customCodes = new Set(customRes.map(p => p.code));
  const primaryCodes = new Set(primaryRes.map(p => p.code));
  const all = [
    ...customRes.map(p => ({ ...p, _isCustom: true })),
    ...primaryRes.filter(p => !customCodes.has(p.code)).map(p => ({ ...p, _isPrimary: true })),
    ...officialRes.filter(p => !customCodes.has(p.code) && !primaryCodes.has(p.code))
  ];

  if (all.length === 0) {
    container.innerHTML = '<div class="list-group-item text-muted small">Sin resultados.</div>';
    return;
  }

  container.innerHTML = all.map(p => `
    <button type="button" class="list-group-item list-group-item-action py-2 d-flex justify-content-between align-items-center"
            onclick="window._selectChangeIngredient('${p.code}', '${(p.product_name || '').replace(/'/g, "\\'")}')">
      <span class="small">${p.product_name || 'Sin nombre'}</span>
      <span>
        ${p._isCustom ? '<span class="badge bg-info text-dark me-1">Mi lista</span>' : ''}
        ${p._isPrimary ? '<span class="badge bg-success me-1">🌱 Primario</span>' : ''}
        <span class="badge bg-secondary">${p.code}</span>
      </span>
    </button>`).join('');
}

window._selectChangeIngredient = function(code, name) {
  aiImportedIngredients[currentChangeIngredientIndex].match = { code, product_name: name };
  changeIngredientModal.hide();

  // Actualizar solo la fila afectada sin re-renderizar toda la lista
  const idx = currentChangeIngredientIndex;
  const row = document.getElementById(`smart-match-row-${idx}`);
  if (row) {
    const item = aiImportedIngredients[idx];
    row.querySelector('div[style]').innerHTML = `
      <div class="fw-bold small text-muted text-truncate">${item.original.amount}${item.original.unit} ${item.original.name}</div>
      <div class="small mt-1">✅ <span class="fw-bold text-success">${name}</span>
       <span class="badge bg-secondary ms-1">${code}</span></div>`;
    row.querySelector('.d-flex.gap-1').innerHTML = `
      <button class="btn btn-sm btn-outline-info" onclick="window._openChangeIngredient(${idx})">Buscar</button>
      <button class="btn btn-sm btn-outline-danger" onclick="window._removeSmartMatch(${idx})">✕</button>`;
  }
}


function confirmSmartMatch() {
  smartMatchModal.hide();
  
  if (currentIngredients.length > 0) {
    mergeConflictModal.show();
  } else {
    applyImportedRecipeData();
  }
}

function mergeIngredients(action) {
  mergeConflictModal.hide();
  if (action === 'replace') {
    currentIngredients = [];
  }
  applyImportedRecipeData();
}

function applyImportedRecipeData() {
  if (aiImportedRecipeData.name && !document.getElementById('recipe-name').value) {
    document.getElementById('recipe-name').value = aiImportedRecipeData.name;
  }
  if (aiImportedRecipeData.description && !document.getElementById('recipe-description').value) {
    document.getElementById('recipe-description').value = aiImportedRecipeData.description;
  }
  if (aiImportedRecipeData.instructions && !document.getElementById('recipe-instructions').value) {
    document.getElementById('recipe-instructions').value = aiImportedRecipeData.instructions;
  }
  if (aiImportedRecipeData.servings) {
    document.getElementById('recipe-servings').value = aiImportedRecipeData.servings;
  }
  
  if (aiImportedIngredients) {
    for (const item of aiImportedIngredients) {
      if (item.match) {
        currentIngredients.push({
          productCode: item.match.code,
          productName: item.match.product_name || item.original.name,
          amount: parseFloat(item.original.amount) || 100,
          unit: item.original.unit || 'g'
        });
      }
    }
  }
  
  renderIngredients();
  updateNutrition();
  
  aiImportedRecipeData = null;
  aiImportedIngredients = [];
  
  showToast('Receta importada correctamente', 'success');
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => { clearTimeout(timeout); func(...args); };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
