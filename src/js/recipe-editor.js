import * as ShoppingAssistant from "./modules/insights/ShoppingAssistant.js";
import * as RecentStore from "./modules/products/RecentStore.js";
import * as ProductStore from "./modules/products/ProductStore.js";
import * as PantryStore from './modules/pantry/PantryStore.js';
/**
 * recipe-editor.js — Lógica del editor completo de recetas
 *
 * URL: /recipe-editor.html?id=X  (editar existente)
 *      /recipe-editor.html        (nueva receta)
 */

import { Modal } from 'bootstrap';
import { db } from './db/schema.js';
import * as RecipeStore from './modules/recipes/RecipeStore.js';
import * as NutritionCalc from './modules/nutrition/NutritionCalculator.js';
import { showToast, confirmModal, compressImage } from './modules/ui/UI.js';

// ─── Estado local ─────────────────────────────────────────────────────────────
let recipeId = null;            // null → nueva receta
let currentIngredients = [];   // array de { productCode, productName, amount, unit }
let currentTags = [];
let currentPhotoBlob = null;   // Blob | null
let cameraStream = null;
let pendingRestoreVersionId = null;
let restoreModal = null;

// ─── Init ──────────────────────────────────────────────────────────────────────
export async function initView() {
  restoreModal = new Modal(document.getElementById('restoreModal'));

  const params = new URLSearchParams(window.location.hash.includes('?') ? window.location.hash.split('?')[1] : window.location.search);
  const idParam = params.get('id');
  if (idParam) {
    recipeId = parseInt(idParam);
    await loadRecipe(recipeId);
  }

  bindEvents();

  const codeParam = params.get('code');
  if (codeParam) {
    document.getElementById('ingredient-search').value = codeParam;
    setTimeout(searchIngredient, 500);
  }

  loadPantryQuickAdd();
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

  document.getElementById('btn-delete-recipe').style.display = 'inline-block';
  document.getElementById('btn-duplicate-recipe').style.display = 'inline-block';

  renderIngredients();
  renderTags();
  await updateNutrition();
  await loadVersionHistory(id);
}

// ─── Binding de eventos ────────────────────────────────────────────────────────
function bindEvents() {
  // Guardar
  document.getElementById('btn-save-recipe').addEventListener('click', saveRecipe);

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
    
    if (/^\d+$/.test(query)) {
      if (pantryCodes.includes(query)) {
        const p = await ProductStore.getProductByCode(query);
        if (p) results = [p];
      }
    } else {
      const q = query.toLowerCase();
      const searchRes = await ProductStore.searchProducts(q, 50);
      results = searchRes.filter(p => pantryCodes.includes(p.code));
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
    const analysisResult = await ShoppingAssistant.analyzeProductForCart(code);
    if (analysisResult && analysisResult.status === 'success') {
      const { warnings, healthyAlternative } = analysisResult.analysis;
      if (warnings.length > 0 || healthyAlternative) {
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

function renderIngredients() {
  const container = document.getElementById('ingredient-list');
  if (currentIngredients.length === 0) {
    container.innerHTML = '<div class="text-muted small">Aún no hay ingredientes.</div>';
    return;
  }
  container.innerHTML = currentIngredients.map((ing, i) => `
    <div class="ingredient-row">
      <span class="ingredient-name" title="${ing.productName}">${ing.productName}</span>
      <input type="number" class="form-control form-control-sm" style="width:80px;"
             value="${ing.amount}" onchange="window._changeAmount(${i}, this.value)">
      <span class="small text-muted">${ing.unit}</span>
      <button class="btn-remove-ing" onclick="window._removeIngredient(${i})">✕</button>
    </div>`).join('');
}

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
