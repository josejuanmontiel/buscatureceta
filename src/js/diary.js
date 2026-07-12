import { Modal } from 'bootstrap';
import { db } from './db/schema.js';
import * as DiaryStore from './modules/diary/DiaryStore.js';
import * as RecipeStore from './modules/recipes/RecipeStore.js';
import * as NutritionCalc from './modules/nutrition/NutritionCalculator.js';
import * as PantryStore from './modules/pantry/PantryStore.js';
import * as MealPhotoStore from './modules/mealPhotos/MealPhotoStore.js';

let mealModal;
let diaryPhotoModal;
let currentDate = new Date();
let currentSelectedDate = null;
let diaryPhotoCapturedBlob = null;
let diaryCameraStream = null;

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

document.addEventListener('DOMContentLoaded', async () => {
  mealModal = new Modal(document.getElementById('mealModal'));
  diaryPhotoModal = new Modal(document.getElementById('diaryPhotoModal'));

  await renderWeek(currentDate);
  await updateDiaryPhotoBadge();

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
      ${items.map(i => `
        <div class="meal-slot d-flex justify-content-between align-items-center" onclick="window.removeMealItem(${i.entryId}, '${i.productCode || i.recipeId}')">
          <span class="text-truncate me-1" title="${i.name}">${i.name}</span>
          <span class="text-warning small">${Math.round(i.nutrition?.kcal || 0)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

// Expuesto globalmente para el botón onclick en el HTML generado
window.openMealModal = async function(dayKey) {
  currentSelectedDate = dayKey;
  document.getElementById('meal-date').value = dayKey;
  document.getElementById('meal-form').reset();
  document.getElementById('meal-product-results').innerHTML = '';
  document.getElementById('meal-product-selected').value = '';
  
  // Cargar opciones de recetas
  const recipes = await RecipeStore.getAllRecipes();
  const select = document.getElementById('meal-recipe-select');
  select.innerHTML = '<option value="">-- Selecciona receta --</option>' + 
    recipes.map(r => `<option value="${r.id}">${r.name} (${r.servings} rac.)</option>`).join('');

  mealModal.show();
};

window.removeMealItem = async function(entryId, itemId) {
  if (confirm('¿Eliminar este registro?')) {
    // Para simplificar, si hay varios items en la misma entry, se borra toda la entry en este MVP.
    // Una implementación completa usaría DiaryStore.removeDiaryItem buscando el index exacto.
    await DiaryStore.deleteDiaryEntry(entryId);
    await renderWeek(currentDate);
  }
};

async function searchProduct() {
  const query = document.getElementById('meal-product-search').value.trim();
  if (!query) return;

  const qLower = query.toLowerCase();
  const results = await db.products
    .filter(p => p.product_name && p.product_name.toLowerCase().includes(qLower) || p.code === query)
    .limit(10)
    .toArray();

  const container = document.getElementById('meal-product-results');
  container.innerHTML = results.map(p => `
    <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
            onclick="window.selectProduct('${p.code}', '${p.product_name?.replace(/'/g, "\\'")}')">
      ${p.product_name || 'Sin nombre'}
    </button>
  `).join('');
}

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
    const servings = parseFloat(document.getElementById('meal-recipe-servings').value);
    
    if (!recipeId) return alert('Selecciona una receta');
    
    const recipe = await RecipeStore.getRecipeById(recipeId);
    if (!recipe) return alert('Error al cargar receta');
    
    item = {
      type: 'recipe',
      recipeId: recipe.id,
      productCode: null,
      name: recipe.name,
      servings,
      nutrition: NutritionCalc.scaleNutrition(recipe.nutritionPerServing, servings)
    };
    
  } else {
    // Producto
    const code = document.getElementById('meal-product-selected').value;
    const grams = parseFloat(document.getElementById('meal-product-grams').value);
    
    if (!code) return alert('Busca y selecciona un producto');
    
    const product = await db.products.get(code);
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
      await PantryStore.consumeRecipeIngredients(item.recipeId, item.servings, 'consumed_me');
    } else if (item.type === 'product' && item.productCode) {
      await PantryStore.consumeStock(item.productCode, item.servings * 100, 'consumed_me'); 
    }
  }

  mealModal.hide();
  await renderWeek(currentDate);
}

// ─── Captura de foto rápida desde la agenda ────────────────────────────────────

window.openDiaryPhotoModal = async function(dayKey) {
  diaryPhotoCapturedBlob = null;
  document.getElementById('diary-photo-date').value = dayKey;
  document.getElementById('diary-photo-meal-type').value = '';
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
