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

// ─── Estado local ─────────────────────────────────────────────────────────────
let recipeId = null;            // null → nueva receta
let currentIngredients = [];   // array de { productCode, productName, amount, unit }
let currentTags = [];
let currentPhotoBlob = null;   // Blob | null
let cameraStream = null;
let pendingRestoreVersionId = null;
let restoreModal = null;

// ─── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  restoreModal = new Modal(document.getElementById('restoreModal'));

  const params = new URLSearchParams(window.location.search);
  const idParam = params.get('id');
  if (idParam) {
    recipeId = parseInt(idParam);
    await loadRecipe(recipeId);
  }

  bindEvents();
});

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
    if (!confirm('¿Eliminar esta receta y todo su historial de versiones? Esta acción no se puede deshacer.')) return;
    await RecipeStore.deleteRecipe(recipeId);
    showToast('Receta eliminada');
    setTimeout(() => { window.location.href = 'recipes.html'; }, 800);
  });

  // Buscador de ingredientes
  document.getElementById('btn-search-ingredient').addEventListener('click', searchIngredient);
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
      // Navegar al editor con el id nuevo
      window.history.replaceState({}, '', `recipe-editor.html?id=${newId}`);
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

  let results = [];
  if (/^\d+$/.test(query)) {
    const p = await db.products.get(query);
    if (p) results = [p];
  } else {
    const q = query.toLowerCase();
    results = await db.products
      .filter(p => p.product_name && p.product_name.toLowerCase().includes(q))
      .limit(20).toArray();
  }

  const searchPantryOnly = document.getElementById('search-pantry-only')?.checked;
  if (searchPantryOnly) {
    const pantryItems = await db.pantry.toArray();
    const pantryCodes = new Set(pantryItems.map(item => item.productCode));
    results = results.filter(p => pantryCodes.has(p.code));
  }

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

window._addIngredient = function(code, name) {
  currentIngredients.push({ productCode: code, productName: name || `Prod ${code}`, amount: 100, unit: 'g' });
  document.getElementById('ingredient-search').value = '';
  document.getElementById('ingredient-search-results').style.display = 'none';
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

function takePhoto() {
  const video = document.getElementById('recipe-video');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  stopCamera();
  canvas.toBlob(blob => {
    if (!blob) return;
    currentPhotoBlob = blob;
    showPhotoPreview(blob);
  }, 'image/jpeg', 0.9);
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
function showToast(msg, isError = false) {
  const el = document.getElementById('app-toast');
  el.textContent = msg;
  el.className = 'my-toast' + (isError ? ' error' : '');
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}
