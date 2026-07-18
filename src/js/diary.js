import * as ProductStore from "./modules/products/ProductStore.js";
import { Modal } from 'bootstrap';
import { db } from './db/schema.js';
import * as DiaryStore from './modules/diary/DiaryStore.js';
import * as RecipeStore from './modules/recipes/RecipeStore.js';
import * as NutritionCalc from './modules/nutrition/NutritionCalculator.js';
import * as PantryStore from './modules/pantry/PantryStore.js';
import * as MealPhotoStore from './modules/mealPhotos/MealPhotoStore.js';

let mealModal;
let diaryPhotoModal;
let itemDetailModal;
let currentDate = new Date();
let currentSelectedDate = null;
let diaryPhotoCapturedBlob = null;
let diaryCameraStream = null;

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

document.addEventListener('DOMContentLoaded', async () => {
  mealModal = new Modal(document.getElementById('mealModal'));
  diaryPhotoModal = new Modal(document.getElementById('diaryPhotoModal'));
  itemDetailModal = new Modal(document.getElementById('itemDetailModal'));

  await renderWeek(currentDate);
  await updateDiaryPhotoBadge();

  const urlParams = new URLSearchParams(window.location.search);
  const codeParam = urlParams.get('code');
  const actionParam = urlParams.get('action');
  if (codeParam && actionParam === 'addMeal') {
    const todayStr = new Date().toISOString().split('T')[0];
    window.openMealModal(todayStr);
    setTimeout(() => {
      document.getElementById('tab-product').click();
      document.getElementById('meal-product-search').value = codeParam;
      document.getElementById('btn-search-meal-product').click();
    }, 500);
  }

  document.getElementById('btn-prev-week').addEventListener('click', () => {
    currentDate.setDate(currentDate.getDate() - 7);
    renderWeek(currentDate);
  });

  document.getElementById('btn-next-week').addEventListener('click', () => {
    currentDate.setDate(currentDate.getDate() + 7);
    renderWeek(currentDate);
  });

  document.getElementById('btn-save-meal').addEventListener('click', saveMeal);
  document.getElementById('btn-search-meal-product').addEventListener('click', searchProduct);
  document.getElementById('btn-scan-meal')?.addEventListener('click', () => {
    window.location.href = "/scan.html?return=diary.html&action=addMeal";
  });
  
  // Eventos para recalcular ingredientes de la receta
  document.getElementById('meal-recipe-select').addEventListener('change', updateRecipeIngredientsPreview);
  document.getElementById('meal-recipe-amount').addEventListener('input', updateRecipeIngredientsPreview);
  document.getElementById('meal-recipe-unit').addEventListener('change', updateRecipeIngredientsPreview);

  // ── Foto desde agenda ─────────────────────────────────────────────
  document.getElementById('btn-diary-snap').addEventListener('click', doDiarySnap);
  document.getElementById('btn-diary-stop-camera').addEventListener('click', stopDiaryCamera);
  document.getElementById('btn-diary-retake').addEventListener('click', retakeDiaryPhoto);
  document.getElementById('btn-diary-gallery').addEventListener('click', () => {
    document.getElementById('diary-file-input').click();
  });
  document.getElementById('diary-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    diaryPhotoCapturedBlob = file;
    showDiaryPhotoPreview(file);
    e.target.value = '';
  });
  document.getElementById('btn-diary-save-photo').addEventListener('click', saveDiaryPhoto);

  // Limpiar cámara al cerrar modal
  document.getElementById('diaryPhotoModal').addEventListener('hidden.bs.modal', stopDiaryCamera);
});

async function renderWeek(date) {
  const { weekDays } = await DiaryStore.getCurrentWeekEntries(date);
  
  const start = new Date(weekDays[0]);
  const end = new Date(weekDays[6]);
  document.getElementById('current-week-label').innerText = 
    `${start.getDate()} ${start.toLocaleString('es', {month:'short'})} - ${end.getDate()} ${end.toLocaleString('es', {month:'short'})}`;

  const container = document.getElementById('diary-grid');
  container.innerHTML = ''; // Limpiar

  for (const day of weekDays) {
    const entries = await DiaryStore.getDayEntries(day);
    const dayDate = new Date(day);
    
    // Agrupar items por mealType
    const byMeal = { breakfast: [], lunch: [], snack: [], dinner: [] };
    let dayKcal = 0;

    entries.forEach(entry => {
      entry.items.forEach(item => {
        byMeal[entry.mealType].push({ ...item, entryId: entry.id });
        dayKcal += item.nutrition?.kcal || 0;
      });
    });

    const dayEl = document.createElement('div');
    dayEl.className = 'diary-day d-flex flex-column';
    dayEl.innerHTML = `
      <div class="diary-day-header">
        ${DAYS_ES[dayDate.getDay()]} ${dayDate.getDate()}
        <div style="font-size: 0.8em; font-weight: normal; color: #aaa;">
           ${Math.round(dayKcal)} kcal
        </div>
      </div>
      <div class="flex-grow-1">
        ${renderMealSlot('Desayuno', 'breakfast', byMeal.breakfast, day)}
        ${renderMealSlot('Comida', 'lunch', byMeal.lunch, day)}
        ${renderMealSlot('Merienda', 'snack', byMeal.snack, day)}
        ${renderMealSlot('Cena', 'dinner', byMeal.dinner, day)}
      </div>
      <div class="d-flex gap-1 mt-2">
        <button class="btn btn-sm btn-outline-success flex-grow-1" onclick="window.openMealModal('${day}')">+ Añadir</button>
        <button class="btn btn-sm btn-outline-secondary" onclick="window.openDiaryPhotoModal('${day}')" title="Foto de lo que comí">📷</button>
      </div>
    `;
    container.appendChild(dayEl);
  }
}

function renderMealSlot(label, mealType, items, dayKey) {
  if (items.length === 0) return '';
  return `
    <div class="mb-2">
      <div class="meal-type-label">${label}</div>
      ${items.map(i => {
        let icon = '';
        let kcal = Math.round(i.nutrition?.kcal || 0);
        let action = `window.openItemDetail(${i.entryId}, '${i.name?.replace(/'/g, "\\'")}', ${kcal}, ${i.nutrition?.proteins_g||0}, ${i.nutrition?.carbs_g||0}, ${i.nutrition?.fat_g||0}, ${i.photoId || 'null'})`;
        let textClass = '';
        let kcalText = kcal;

        if (i.type === 'photo') {
          icon = '📷 ';
          textClass = 'text-info fst-italic';
          action = `window.resolvePhotoItem(${i.entryId}, ${i.photoId})`;
          kcalText = 'Resolver';
        } else if (i.type === 'custom_macros') {
          icon = '✨ ';
        }

        return `
        <div class="meal-slot d-flex justify-content-between align-items-start" onclick="${action}">
          <span class="me-1 ${textClass}" style="min-width: 0; flex: 1; white-space: pre-line; word-break: break-word;" title="${i.name}">${icon}${i.name}</span>
          <span class="text-warning small mt-1" style="white-space: nowrap;">${kcalText}</span>
        </div>
        `;
      }).join('')}
    </div>
  `;
}

window.resolvePhotoItem = function(entryId, photoId) {
  if (confirm('¿Quieres resolver esta foto ahora? Se te redirigirá para usar la IA.')) {
    window.location.href = `/meal-photos.html?resolvePhotoId=${photoId}`;
  }
};

// Expuesto globalmente para el botón onclick en el HTML generado
window.openMealModal = async function(dayKey) {
  currentSelectedDate = dayKey;
  document.getElementById('meal-date').value = dayKey;
  document.getElementById('meal-form').reset();
  document.getElementById('meal-type').value = getDefaultMealType();
  document.getElementById('meal-product-results').innerHTML = '';
  document.getElementById('meal-product-selected').value = '';
  
  // Cargar opciones de recetas
  const recipes = await RecipeStore.getAllRecipes();
  const select = document.getElementById('meal-recipe-select');
  select.innerHTML = '<option value="">-- Selecciona receta --</option>' + 
    recipes.map(r => `<option value="${r.id}">${r.name} (${r.servings} rac.)</option>`).join('');

  document.getElementById('meal-recipe-ingredients-container').style.display = 'none';

  mealModal.show();
};

async function updateRecipeIngredientsPreview() {
  const recipeId = parseInt(document.getElementById('meal-recipe-select').value);
  const amountVal = parseFloat(document.getElementById('meal-recipe-amount').value);
  const unit = document.getElementById('meal-recipe-unit').value;
  const container = document.getElementById('meal-recipe-ingredients-container');
  const listEl = document.getElementById('meal-recipe-ingredients');
  
  if (!recipeId || !amountVal || amountVal <= 0) {
    container.style.display = 'none';
    return;
  }
  
  const recipe = await RecipeStore.getRecipeById(recipeId);
  if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) {
    container.style.display = 'none';
    return;
  }

  let servings = 0;
  if (unit === 'grams') {
    let totalGrams = 0;
    for (const ing of recipe.ingredients) {
      const g = NutritionCalc.toGrams(ing.amount, ing.unit);
      if (g !== null) totalGrams += g;
    }
    if (totalGrams > 0) {
      const fraction = amountVal / totalGrams;
      servings = fraction * recipe.servings;
    }
  } else {
    servings = amountVal;
  }

  container.style.display = 'block';
  listEl.innerHTML = recipe.ingredients.map((ing, idx) => {
    // Calcular cantidad proporcional original
    let proportionalAmount = 0;
    if (recipe.servings) {
      proportionalAmount = (ing.amount / recipe.servings) * servings;
    }
    // Redondear a un decimal
    proportionalAmount = Math.round(proportionalAmount * 10) / 10;
    
    return `
      <div class="d-flex align-items-center mb-1 recipe-ing-row" data-code="${ing.productCode}" data-name="${ing.productName?.replace(/'/g, "\\'")}" data-unit="${ing.unit}">
        <div class="text-truncate flex-grow-1 small" title="${ing.productName}">${ing.productName}</div>
        <input type="number" class="form-control form-control-sm text-end ing-amount-input" style="width: 70px;" value="${proportionalAmount}" min="0" step="0.5">
        <div class="small text-muted ms-1" style="width: 25px;">${ing.unit}</div>
      </div>
    `;
  }).join('');
}

window.openItemDetail = function(entryId, name, kcal, prot, carbs, fat, photoId) {
  document.getElementById('itemDetailTitle').textContent = name;
  document.getElementById('itemDetailKcal').textContent = Math.round(kcal);
  document.getElementById('itemDetailProt').textContent = Math.round(prot);
  document.getElementById('itemDetailCarbs').textContent = Math.round(carbs);
  document.getElementById('itemDetailFat').textContent = Math.round(fat);
  
  const photoContainer = document.getElementById('itemDetailPhotoContainer');
  const photoLink = document.getElementById('itemDetailPhotoLink');
  
  if (photoId) {
    photoContainer.style.display = 'block';
    photoLink.href = `/meal-photos.html?resolvePhotoId=${photoId}`;
  } else {
    photoContainer.style.display = 'none';
  }
  
  document.getElementById('btn-delete-item').onclick = () => {
    itemDetailModal.hide();
    window.removeMealItem(entryId);
  };
  
  itemDetailModal.show();
};

window.removeMealItem = async function(entryId) {
  if (confirm('¿Eliminar este registro?')) {
    // Para simplificar, si hay varios items en la misma entry, se borra toda la entry en este MVP.
    await DiaryStore.deleteDiaryEntry(entryId);
    await renderWeek(currentDate);
  }
};

async function searchProduct() {
  const query = document.getElementById('meal-product-search').value.trim();
  if (!query) return;

  const spinner = document.getElementById('meal-search-spinner');
  if (spinner) spinner.classList.remove('d-none');

  try {
    const qLower = query.toLowerCase();
    const searchPantryOnly = document.getElementById('meal-search-pantry-only')?.checked;
    
    let results = [];
    if (searchPantryOnly) {
      const pantryItems = await db.pantry.toArray();
      const pantryCodes = Array.from(new Set(pantryItems.map(item => item.productCode)));
      
      if (/^\d+$/.test(query)) {
        if (pantryCodes.includes(query)) {
          const p = await ProductStore.getProductByCode(query);
          if (p) results = [p];
        }
      } else {
        const pResults = await ProductStore.searchProducts(qLower, 50);
        results = pResults.filter(p => pantryCodes.includes(p.code));
      }
    } else {
      if (/^\d+$/.test(query)) {
        const p = await ProductStore.getProductByCode(query);
        if (p) results = [p];
      } else {
        results = await ProductStore.searchProducts(qLower, 10);
      }
    }

    let html = '';
    if (results.length === 0) {
      html = '<div class="list-group-item text-muted small">Sin resultados.</div>';
    } else {
      html = results.map(p => `
        <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                onclick="window.selectProduct('${p.code}', '${p.product_name?.replace(/'/g, "\\'")}')">
          <span class="small">${p.product_name || 'Sin nombre'}</span>
          <span class="badge bg-secondary">${p.code}</span>
        </button>
      `).join('');
    }

    const container = document.getElementById('meal-product-results');
    container.innerHTML = html;
  } finally {
    if (spinner) spinner.classList.add('d-none');
  }
}

window.addGenericProduct = async function(name) {
  if (!confirm(`¿Quieres añadir "${name}" como producto genérico sin código de barras a tu Base de Datos Personal?`)) return;
  const genericCode = 'GENERIC_' + Date.now();
  await ProductStore.addCustomProduct({
      code: genericCode,
      product_name: name,
      ingredients_text: '',
      nutriscore_grade: 'unknown'
  });
  window.selectProduct(genericCode, name);
};

window.selectProduct = function(code, name) {
  document.getElementById('meal-product-selected').value = code;
  document.getElementById('meal-product-search').value = name;
  document.getElementById('meal-product-results').innerHTML = '';
};

async function saveMeal() {
  const date = document.getElementById('meal-date').value;
  const mealType = document.getElementById('meal-type').value;
  const activeTab = document.querySelector('#mealTabs .active').id;
  
  let item = null;

  if (activeTab === 'tab-recipe') {
    const recipeId = parseInt(document.getElementById('meal-recipe-select').value);
    const amountVal = parseFloat(document.getElementById('meal-recipe-amount').value);
    const unit = document.getElementById('meal-recipe-unit').value;
    
    if (!recipeId) return alert('Selecciona una receta');
    if (!amountVal || amountVal <= 0) return alert('Introduce una cantidad válida');
    
    const recipe = await RecipeStore.getRecipeById(recipeId);
    if (!recipe) return alert('Error al cargar receta');
    
    let servings = 0;
    if (unit === 'grams') {
      let totalGrams = 0;
      for (const ing of recipe.ingredients) {
        const g = NutritionCalc.toGrams(ing.amount, ing.unit);
        if (g !== null) totalGrams += g;
      }
      if (totalGrams === 0) return alert('La receta no tiene ingredientes pesables. Usa raciones en su lugar.');
      
      const fraction = amountVal / totalGrams;
      servings = fraction * recipe.servings;
    } else {
      servings = amountVal;
    }
    
    // Leer los ingredientes personalizados del DOM (los que el usuario pudo editar)
    const customIngredients = [];
    document.querySelectorAll('.recipe-ing-row').forEach(row => {
      const code = row.dataset.code;
      const name = row.dataset.name;
      const ingUnit = row.dataset.unit;
      const input = row.querySelector('.ing-amount-input');
      const amount = parseFloat(input.value) || 0;
      if (amount > 0 && code !== "null" && code !== "undefined") {
        customIngredients.push({
          productCode: code,
          productName: name,
          amount,
          unit: ingUnit
        });
      }
    });

    // Calcular la nutrición en base a los ingredientes personalizados leídos del DOM
    const nutrition = await NutritionCalc.calculateTotalNutrition(customIngredients);
    
    item = {
      type: 'recipe',
      recipeId: recipe.id,
      productCode: null,
      name: recipe.name,
      servings, // sirve como metadato, pero la nutrición ya está calculada exactamente
      customIngredients, // guardamos el desglose exacto
      nutrition
    };
    
  } else {
    // Producto
    const code = document.getElementById('meal-product-selected').value;
    const grams = parseFloat(document.getElementById('meal-product-grams').value);
    
    if (!code) return alert('Busca y selecciona un producto');
    
    const product = await ProductStore.getProductByCode(code);
    if (!product) return alert('Error al cargar producto');
    
    const nutrition = await NutritionCalc.calculateTotalNutrition([
      { productCode: code, amount: grams, unit: 'g' }
    ]);

    item = {
      type: 'product',
      recipeId: null,
      productCode: code,
      name: product.product_name || `Prod ${code}`,
      servings: grams / 100, // asumiendo 1 ración = 100g para productos sueltos
      nutrition
    };
  }

  const context = {
    hunger_before: parseInt(document.getElementById('meal-hunger').value) || null,
    fullness_after: null,
    mood: null,
    notes: ''
  };

  await DiaryStore.addDiaryEntry({
    date,
    mealType,
    items: [item],
    context
  });

  // Integración con Despensa
  const deductPantry = document.getElementById('meal-deduct-pantry').checked;
  if (deductPantry) {
    if (item.type === 'recipe') {
      if (item.customIngredients && item.customIngredients.length > 0) {
        for (const ing of item.customIngredients) {
          await PantryStore.consumeStock(ing.productCode, ing.amount, 'consumed_me', ing.unit || 'g');
        }
      } else {
        await PantryStore.consumeRecipeIngredients(item.recipeId, item.servings, 'consumed_me');
      }
    } else if (item.type === 'product' && item.productCode) {
      await PantryStore.consumeStock(item.productCode, item.servings * 100, 'consumed_me', 'g'); 
    }
  }

  mealModal.hide();
  await renderWeek(currentDate);
}

// ─── Captura de foto rápida desde la agenda ────────────────────────────────────

window.openDiaryPhotoModal = async function(dayKey) {
  diaryPhotoCapturedBlob = null;
  document.getElementById('diary-photo-date').value = dayKey;
  document.getElementById('diary-photo-meal-type').value = getDefaultMealType();
  document.getElementById('diary-photo-preview-section').style.display = 'none';
  document.getElementById('diary-camera-section').style.display = 'block';
  document.getElementById('btn-diary-save-photo').disabled = true;

  // Iniciar cámara automáticamente
  try {
    diaryCameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    document.getElementById('diary-video').srcObject = diaryCameraStream;
  } catch {
    // Si no hay cámara, ocultar sección de video
    document.getElementById('diary-camera-section').style.display = 'none';
  }

  diaryPhotoModal.show();
};

function doDiarySnap() {
  const video = document.getElementById('diary-video');
  if (!video.videoWidth) return;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  canvas.toBlob(blob => {
    if (!blob) return;
    stopDiaryCamera();
    diaryPhotoCapturedBlob = blob;
    showDiaryPhotoPreview(blob);
  }, 'image/jpeg', 0.88);
}

function stopDiaryCamera() {
  if (diaryCameraStream) {
    diaryCameraStream.getTracks().forEach(t => t.stop());
    diaryCameraStream = null;
  }
  const video = document.getElementById('diary-video');
  if (video) video.srcObject = null;
  const section = document.getElementById('diary-camera-section');
  if (section) section.style.display = 'none';
}

function retakeDiaryPhoto() {
  diaryPhotoCapturedBlob = null;
  document.getElementById('diary-photo-preview-section').style.display = 'none';
  document.getElementById('btn-diary-save-photo').disabled = true;
  // Reiniciar cámara
  window.openDiaryPhotoModal(document.getElementById('diary-photo-date').value);
}

function showDiaryPhotoPreview(blob) {
  const preview = document.getElementById('diary-photo-preview');
  preview.src = URL.createObjectURL(blob);
  document.getElementById('diary-photo-preview-section').style.display = 'block';
  document.getElementById('diary-camera-section').style.display = 'none';
  document.getElementById('btn-diary-save-photo').disabled = false;
}

async function saveDiaryPhoto() {
  if (!diaryPhotoCapturedBlob) return;
  const date = document.getElementById('diary-photo-date').value;
  const mealType = document.getElementById('diary-photo-meal-type').value || null;

  try {
    await MealPhotoStore.addMealPhoto(date, mealType, diaryPhotoCapturedBlob);
    diaryPhotoModal.hide();
    await updateDiaryPhotoBadge();
  } catch (err) {
    console.error('Error guardando foto:', err);
    alert('Error al guardar la foto: ' + err.message);
  }
}

async function updateDiaryPhotoBadge() {
  const count = await MealPhotoStore.countPendingPhotos();
  const badge = document.getElementById('nav-photo-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline';
  } else {
    badge.style.display = 'none';
  }
}

function getDefaultMealType() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'breakfast';
  if (hour >= 12 && hour < 16) return 'lunch';
  if (hour >= 16 && hour < 20) return 'snack';
  return 'dinner';
}
