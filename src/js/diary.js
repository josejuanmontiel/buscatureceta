import * as RecentStore from "./modules/products/RecentStore.js";
import * as ProductStore from "./modules/products/ProductStore.js";
import { Modal } from 'bootstrap';
import { db, MEAL_TYPES, COURSE_TYPES, DIARY_ACTIONS } from './db/schema.js';
import * as DiaryStore from './modules/diary/DiaryStore.js';
import * as RecipeStore from './modules/recipes/RecipeStore.js';
import * as MealTemplateStore from './modules/diary/MealTemplateStore.js';
import * as NutritionCalc from './modules/nutrition/NutritionCalculator.js';
import * as PantryStore from './modules/pantry/PantryStore.js';
import * as MealPhotoStore from './modules/mealPhotos/MealPhotoStore.js';
import { showToast, confirmModal, compressImage } from './modules/ui/UI.js';
import { globalEvents } from './modules/core/EventEmitter.js';

let mealModal;
let diaryPhotoModal;
let itemDetailModal;
let checkInModal;
let saveTemplateModal;
let mealHistoryModal;
let activeDetailEntryId = null;
let currentDate = new Date();
let currentSelectedDate = null;
let diaryPhotoCapturedBlob = null;
let diaryCameraStream = null;
let mealTray = [];
let loadedRecipes = [];

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export async function initView() {
  mealModal = new Modal(document.getElementById('mealModal'));
  diaryPhotoModal = new Modal(document.getElementById('diaryPhotoModal'));
  itemDetailModal = new Modal(document.getElementById('itemDetailModal'));
  checkInModal = new Modal(document.getElementById('mealCheckInModal'));
  saveTemplateModal = new Modal(document.getElementById('saveTemplateModal'));
  mealHistoryModal = new Modal(document.getElementById('mealHistoryModal'));

  document.getElementById('btn-view-meal-history')?.addEventListener('click', () => {
    if (activeDetailEntryId) {
      window.showMealHistory(activeDetailEntryId);
    }
  });

  await renderWeek(currentDate);
  await updateDiaryPhotoBadge();

  const urlParams = new URLSearchParams(window.location.hash.includes('?') ? window.location.hash.split('?')[1] : window.location.search);
  const codeParam = urlParams.get('code');
  const actionParam = urlParams.get('action');
  const recipeIdParam = urlParams.get('recipeId');
  
  if (codeParam && actionParam === 'addMeal') {
    const todayStr = new Date().toISOString().split('T')[0];
    window.openMealModal(todayStr);
    setTimeout(() => {
      document.getElementById('tab-product').click();
      document.getElementById('meal-product-search').value = codeParam;
      document.getElementById('btn-search-meal-product').click();
    }, 500);
  } else if (recipeIdParam && actionParam === 'addRecipe') {
    const targetDate = urlParams.get('date') || new Date().toISOString().split('T')[0];
    const targetMeal = urlParams.get('mealType') || null;
    window.openMealModal(targetDate, parseInt(recipeIdParam), targetMeal);
  }

  document.getElementById('btn-prev-week').addEventListener('click', () => {
    currentDate.setDate(currentDate.getDate() - 7);
    renderWeek(currentDate);
  });

  document.getElementById('btn-next-week').addEventListener('click', () => {
    currentDate.setDate(currentDate.getDate() + 7);
    renderWeek(currentDate);
  });

  document.getElementById('btn-save-meal').addEventListener('click', () => saveMeal('consumed'));
  document.getElementById('btn-save-planned')?.addEventListener('click', () => saveMeal('planned'));
  document.getElementById('btn-add-to-tray')?.addEventListener('click', addCurrentItemToTray);
  document.getElementById('btn-load-template')?.addEventListener('click', loadSelectedTemplate);
  document.getElementById('btn-save-as-template')?.addEventListener('click', openSaveTemplateModal);
  document.getElementById('btn-do-save-template')?.addEventListener('click', doSaveTemplate);
  document.getElementById('btn-confirm-checkin')?.addEventListener('click', confirmCheckIn);

  document.getElementById('btn-search-meal-product').addEventListener('click', searchProduct);
  document.getElementById('meal-search-pantry-only')?.addEventListener('change', () => {
    searchProduct();
  });
  document.getElementById('meal-product-search')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchProduct();
    }
  });

  const productResultsContainer = document.getElementById('meal-product-results');
  if (productResultsContainer) {
    productResultsContainer.addEventListener('click', async (e) => {
      const btnDirect = e.target.closest('.btn-add-product-direct');
      if (btnDirect) {
        const pCode = btnDirect.dataset.code;
        const pName = btnDirect.dataset.name;
        await window.selectProduct(pCode, pName);
        await addCurrentItemToTray();
        return;
      }

      const btnSelect = e.target.closest('.btn-select-product') || e.target.closest('.btn-product-row') || e.target.closest('button');
      if (btnSelect && btnSelect.dataset.code) {
        const pCode = btnSelect.dataset.code;
        const pName = btnSelect.dataset.name;
        await window.selectProduct(pCode, pName);
      }
    });
  }

  document.getElementById('btn-scan-meal')?.addEventListener('click', () => {
    window.location.href = "/scan.html?return=%23diary&action=addMeal";
  });
  
  // Eventos para recalcular ingredientes de la receta y buscador en tiempo real
  document.getElementById('meal-recipe-search')?.addEventListener('input', (e) => {
    filterRecipeOptions(e.target.value);
  });
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
  window.addEventListener('hashchange', stopDiaryCamera);
}

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
    const byMeal = { breakfast: [], midmorning: [], lunch: [], snack: [], dinner: [] };
    let dayKcal = 0;

    entries.forEach(entry => {
      (entry.items || []).forEach(item => {
        if (item.status !== 'skipped') {
          dayKcal += item.nutrition?.kcal || 0;
        }
        byMeal[entry.mealType]?.push({
          ...item,
          entryId: entry.id,
          entryStatus: entry.status || 'consumed'
        });
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
        ${renderMealSlot('Almuerzo', 'midmorning', byMeal.midmorning, day)}
        ${renderMealSlot('Comida', 'lunch', byMeal.lunch, day)}
        ${renderMealSlot('Merienda', 'snack', byMeal.snack, day)}
        ${renderMealSlot('Cena', 'dinner', byMeal.dinner, day)}
      </div>
      <div class="d-flex gap-1 mt-auto pt-2 border-top border-secondary">
        <button class="btn btn-sm btn-outline-success flex-grow-1 fw-bold" onclick="window.openMealModal('${day}')">+ Añadir</button>
        <button class="btn btn-sm btn-outline-secondary" onclick="window.openDiaryPhotoModal('${day}')" title="Foto de lo que comí">📷</button>
      </div>
    `;
    container.appendChild(dayEl);
  }
}

function renderMealSlot(label, mealType, items, dayKey) {
  if (!items || items.length === 0) return '';

  const hasPlanned = items.some(i => i.status === 'planned' || i.entryStatus === 'planned');
  const primaryEntryId = items[0]?.entryId;

  return `
    <div class="mb-2">
      <div class="d-flex justify-content-between align-items-center mb-1">
        <span class="meal-type-label">${label}</span>
        ${hasPlanned && primaryEntryId ? `<button class="btn btn-xs btn-outline-warning btn-quick-checkin" onclick="event.stopPropagation(); window.openMealCheckIn(${primaryEntryId})" title="Confirmar consumo de esta comida">✓ Comer</button>` : ''}
      </div>
      ${items.map(i => {
        let icon = '';
        const course = COURSE_TYPES[i.course] || COURSE_TYPES.main;
        let kcal = Math.round(i.nutrition?.kcal || 0);
        let action = `window.openItemDetail(${i.entryId}, '${(i.name||'').replace(/'/g, "\\'")}', ${kcal}, ${i.nutrition?.proteins_g||0}, ${i.nutrition?.carbs_g||0}, ${i.nutrition?.fat_g||0}, ${i.photoId || 'null'})`;
        let textClass = '';
        let kcalText = `${kcal} kcal`;

        if (i.type === 'photo') {
          icon = '📷 ';
          textClass = 'text-info fst-italic';
          action = `window.openItemDetail(${i.entryId}, '${(i.name||'').replace(/'/g, "\\'")}', 0, 0, 0, 0, ${i.photoId}, true)`;
          kcalText = 'Resolver';
        } else if (i.type === 'custom_macros') {
          icon = '✨ ';
        } else {
          icon = `<span class="course-badge me-1" title="${course.label}">${course.icon}</span>`;
        }

        const isPlanned = i.status === 'planned' || i.entryStatus === 'planned';
        const isSkipped = i.status === 'skipped';
        const slotClass = isSkipped ? 'text-decoration-line-through opacity-50' : (isPlanned ? 'status-planned' : 'status-consumed');
        const statusBadge = isPlanned ? '<span class="badge badge-planned ms-1" style="font-size:0.65em;">⏳ Plan</span>' : '';

        return `
        <div class="meal-slot d-flex justify-content-between align-items-start ${slotClass}" onclick="${action}">
          <span class="me-1 ${textClass}" style="min-width: 0; flex: 1; white-space: pre-line; word-break: break-word;" title="${i.name}">${icon}${i.name}${statusBadge}</span>
          <span class="text-warning small mt-1 flex-shrink-0" style="white-space: nowrap;">${kcalText}</span>
        </div>
        `;
      }).join('')}
    </div>
  `;
}

// Expuesto globalmente para el botón onclick en el HTML generado
window.openMealModal = async function(dayKey, defaultRecipeId = null, defaultMealType = null) {
  currentSelectedDate = dayKey;
  document.getElementById('meal-date').value = dayKey;
  document.getElementById('meal-form').reset();
  document.getElementById('meal-type').value = defaultMealType || getDefaultMealType();
  const courseSel = document.getElementById('meal-course-select');
  if (courseSel) courseSel.value = 'main';
  document.getElementById('meal-product-results').innerHTML = '';
  document.getElementById('meal-product-selected').value = '';
  const selCard = document.getElementById('meal-product-selected-card');
  if (selCard) selCard.classList.add('d-none');
  
  mealTray = [];
  renderMealTray();

  // Cargar opciones de recetas
  loadedRecipes = await RecipeStore.getAllRecipes();
  const searchInput = document.getElementById('meal-recipe-search');
  if (searchInput) searchInput.value = '';
  renderRecipeSelectOptions(loadedRecipes);

  if (defaultRecipeId) {
    const select = document.getElementById('meal-recipe-select');
    if (select) {
      select.value = defaultRecipeId;
      await updateRecipeIngredientsPreview();
    }
  } else {
    document.getElementById('meal-recipe-ingredients-container').style.display = 'none';
  }

  await populateTemplateSelect();

  mealModal.show();
};

function renderRecipeSelectOptions(recipesList) {
  const select = document.getElementById('meal-recipe-select');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="">-- Selecciona receta --</option>' + 
    recipesList.map(r => `<option value="${r.id}">${r.name} (${r.servings} rac.)</option>`).join('');
  if (currentVal && recipesList.some(r => String(r.id) === String(currentVal))) {
    select.value = currentVal;
  }
}

function filterRecipeOptions(query) {
  const q = (query || '').toLowerCase().trim();
  const filtered = q
    ? loadedRecipes.filter(r => r.name.toLowerCase().includes(q))
    : loadedRecipes;
  renderRecipeSelectOptions(filtered);
  if (q && filtered.length === 1) {
    const select = document.getElementById('meal-recipe-select');
    if (select) {
      select.value = filtered[0].id;
      updateRecipeIngredientsPreview();
    }
  }
}

async function populateTemplateSelect() {
  const tplSelect = document.getElementById('meal-template-select');
  if (!tplSelect) return;
  const templates = await MealTemplateStore.getAllTemplates();
  tplSelect.innerHTML = '<option value="">-- Cargar Menú / Plantilla --</option>' +
    templates.map(t => `<option value="${t.id}">${t.name} (${t.items?.length || 0} platos)</option>`).join('');
}

function renderMealTray() {
  const wrapper = document.getElementById('meal-tray-wrapper');
  const container = document.getElementById('meal-tray-items');
  const emptyMsg = document.getElementById('meal-tray-empty');
  const countBadge = document.getElementById('tray-count');
  const kcalBadge = document.getElementById('tray-total-kcal');
  if (!container) return;

  if (wrapper) {
    wrapper.style.display = mealTray.length > 0 ? 'block' : 'none';
  }

  if (countBadge) countBadge.textContent = mealTray.length;
  let totalKcal = 0;
  mealTray.forEach(it => {
    totalKcal += (it.nutrition?.kcal || 0);
  });
  if (kcalBadge) kcalBadge.textContent = `${Math.round(totalKcal)} kcal`;

  if (mealTray.length === 0) {
    if (emptyMsg) emptyMsg.style.display = 'block';
    container.innerHTML = '';
    return;
  }

  if (emptyMsg) emptyMsg.style.display = 'none';
  container.innerHTML = mealTray.map((it, idx) => {
    const course = COURSE_TYPES[it.course] || COURSE_TYPES.main;
    const kcal = Math.round(it.nutrition?.kcal || 0);
    const amountText = it.type === 'recipe'
      ? `${it.servings} rac.`
      : `${Math.round(it.servings * 100)}g`;
    return `
      <div class="tray-item d-flex justify-content-between align-items-center py-2 px-2 mb-1 rounded bg-black bg-opacity-50 border border-secondary">
        <div class="d-flex align-items-center gap-2 text-truncate me-2">
          <span class="course-badge" style="font-size: 0.8rem;">${course.icon} ${course.label}</span>
          <span class="small fw-semibold text-truncate text-light" title="${it.name}">${it.name}</span>
          <span class="text-muted small">(${amountText})</span>
        </div>
        <div class="d-flex align-items-center gap-2 flex-shrink-0">
          <span class="badge bg-secondary small">${kcal} kcal</span>
          <button type="button" class="btn btn-outline-danger btn-sm py-0 px-2" onclick="window.removeTrayItem(${idx})" title="Quitar plato">&times;</button>
        </div>
      </div>
    `;
  }).join('');
}

window.removeTrayItem = function(index) {
  mealTray.splice(index, 1);
  renderMealTray();
};

async function getCurrentConfiguredItem() {
  const activeTab = document.querySelector('#mealTabs .active')?.id || 'tab-recipe';
  const courseSel = document.getElementById('meal-course-select');
  const course = courseSel ? courseSel.value : 'main';

  if (activeTab === 'tab-recipe') {
    const recipeSelect = document.getElementById('meal-recipe-select');
    const recipeId = parseInt(recipeSelect?.value);
    const amountVal = parseFloat(document.getElementById('meal-recipe-amount')?.value);
    const unit = document.getElementById('meal-recipe-unit')?.value;
    
    if (!recipeId) throw new Error('Selecciona una receta');
    if (!amountVal || amountVal <= 0) throw new Error('Introduce una cantidad válida');
    
    const recipe = await RecipeStore.getRecipeById(recipeId);
    if (!recipe) throw new Error('Error al cargar receta');
    
    let servings = 0;
    if (unit === 'grams') {
      let totalGrams = 0;
      for (const ing of (recipe.ingredients || [])) {
        const g = NutritionCalc.toGrams(ing.amount, ing.unit);
        if (g !== null) totalGrams += g;
      }
      if (totalGrams === 0) throw new Error('La receta no tiene ingredientes pesables. Usa raciones en su lugar.');
      
      const fraction = amountVal / totalGrams;
      servings = fraction * (recipe.servings || 1);
    } else {
      servings = amountVal;
    }
    
    const customIngredients = [];
    document.querySelectorAll('.recipe-ing-row').forEach(row => {
      const code = row.dataset.code;
      const name = row.dataset.name;
      const ingUnit = row.dataset.unit;
      const input = row.querySelector('.ing-amount-input');
      const amount = parseFloat(input?.value) || 0;
      if (amount > 0 && code && code !== "null" && code !== "undefined") {
        customIngredients.push({
          productCode: code,
          productName: name,
          amount,
          unit: ingUnit
        });
      }
    });

    let nutrition = null;
    if (customIngredients.length > 0) {
      nutrition = await NutritionCalc.calculateTotalNutrition(customIngredients);
    }

    // Si la nutrición calculada da 0 o no hay customIngredients, pero la receta original tiene nutritionPerServing
    if ((!nutrition || (nutrition.kcal === 0 && (recipe.nutritionPerServing?.kcal || 0) > 0)) && recipe.nutritionPerServing) {
      nutrition = NutritionCalc.scaleNutrition(recipe.nutritionPerServing, servings);
    }

    if (!nutrition) {
      nutrition = { kcal: 0, proteins_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugars_g: 0, salt_g: 0, saturated_fat_g: 0 };
    }
    
    return {
      course,
      type: 'recipe',
      recipeId: recipe.id,
      productCode: null,
      name: recipe.name,
      servings,
      customIngredients,
      nutrition
    };
  } else {
    // Producto
    const code = document.getElementById('meal-product-selected')?.value;
    const grams = parseFloat(document.getElementById('meal-product-grams')?.value);
    
    if (!code) throw new Error('Busca y selecciona un producto');
    if (!grams || grams <= 0) throw new Error('Introduce los gramos consumidos');
    
    const product = await ProductStore.getProductByCode(code);
    if (!product) throw new Error('Error al cargar producto');
    
    const nutrition = await NutritionCalc.calculateTotalNutrition([
      { productCode: code, amount: grams, unit: 'g' }
    ]);

    return {
      course,
      type: 'product',
      recipeId: null,
      productCode: code,
      name: product.product_name || `Prod ${code}`,
      servings: grams / 100,
      nutrition: nutrition || { kcal: 0, proteins_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugars_g: 0, salt_g: 0, saturated_fat_g: 0 }
    };
  }
}

async function addCurrentItemToTray() {
  try {
    const item = await getCurrentConfiguredItem();
    mealTray.push(item);
    renderMealTray();
    showToast(`Añadido al menú: ${item.name}`, 'info');

    // Limpiar inputs del producto/receta para el siguiente plato
    document.getElementById('meal-product-selected').value = '';
    document.getElementById('meal-product-search').value = '';
    document.getElementById('meal-product-results').innerHTML = '';
    const selCardTray = document.getElementById('meal-product-selected-card');
    if (selCardTray) selCardTray.classList.add('d-none');
    document.getElementById('meal-recipe-select').value = '';
    const searchInput = document.getElementById('meal-recipe-search');
    if (searchInput) searchInput.value = '';
    renderRecipeSelectOptions(loadedRecipes);
    document.getElementById('meal-recipe-ingredients-container').style.display = 'none';

    // Desplazar suavemente hacia la bandeja para que el usuario vea el plato añadido inmediatamente
    const trayEl = document.getElementById('meal-tray-wrapper');
    if (trayEl) {
      trayEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } catch (err) {
    showToast(err.message, 'warning');
  }
}

window.addCurrentItemToTray = addCurrentItemToTray;

async function loadSelectedTemplate() {
  const tplId = parseInt(document.getElementById('meal-template-select').value);
  if (!tplId) return;

  const tpl = await MealTemplateStore.getTemplateById(tplId);
  if (!tpl || !tpl.items || tpl.items.length === 0) {
    return alert('La plantilla seleccionada no contiene platos');
  }

  tpl.items.forEach(it => {
    mealTray.push({ ...it });
  });
  renderMealTray();
  showToast(`Plantilla "${tpl.name}" cargada`, 'info');
}

async function openSaveTemplateModal() {
  if (mealTray.length === 0) {
    try {
      const it = await getCurrentConfiguredItem();
      mealTray.push(it);
      renderMealTray();
    } catch {
      return alert('Añade al menos un plato a la bandeja para guardar una plantilla');
    }
  }

  document.getElementById('template-name-input').value = '';
  saveTemplateModal.show();
}

async function doSaveTemplate() {
  const name = document.getElementById('template-name-input').value.trim();
  if (!name) return alert('Introduce un nombre para la plantilla');

  const mealType = document.getElementById('meal-type').value;
  try {
    await MealTemplateStore.saveMealTemplate({
      name,
      mealType,
      items: mealTray
    });
    saveTemplateModal.hide();
    showToast(`Plantilla "${name}" guardada`, 'success');
    await populateTemplateSelect();
  } catch (err) {
    alert('Error al guardar plantilla: ' + err.message);
  }
}

async function deductMealItemsFromPantry(items) {
  for (const item of items) {
    if (item.status === 'skipped') continue;
    if (item.type === 'recipe') {
      if (item.customIngredients && item.customIngredients.length > 0) {
        for (const ing of item.customIngredients) {
          await PantryStore.consumeStock(ing.productCode, ing.amount, 'consumed_me', ing.unit || 'g');
        }
      } else if (item.recipeId) {
        await PantryStore.consumeRecipeIngredients(item.recipeId, item.servings, 'consumed_me');
      }
    } else if (item.type === 'product' && item.productCode) {
      await PantryStore.consumeStock(item.productCode, item.servings * 100, 'consumed_me', 'g');
    }
  }
}

window.openMealCheckIn = async function(entryId) {
  const entry = await db.diary.get(entryId);
  if (!entry) return;

  document.getElementById('checkin-entry-id').value = entryId;
  const mealLabel = MEAL_TYPES[entry.mealType] || entry.mealType;
  document.getElementById('checkInModalTitle').textContent = `🍽️ Confirmar ${mealLabel} (${entry.date})`;

  const container = document.getElementById('checkInItemsList');
  container.innerHTML = (entry.items || []).map((it, idx) => {
    const course = COURSE_TYPES[it.course] || COURSE_TYPES.main;
    const kcal = Math.round(it.nutrition?.kcal || 0);
    const isChecked = it.status !== 'skipped';
    return `
      <label class="list-group-item d-flex justify-content-between align-items-center" style="cursor: pointer;">
        <div class="d-flex align-items-center gap-2">
          <input class="form-check-input me-1 checkin-item-cb" type="checkbox" data-index="${idx}" ${isChecked ? 'checked' : ''}>
          <span>${course.icon} <strong>${it.name}</strong></span>
        </div>
        <span class="badge bg-secondary">${kcal} kcal</span>
      </label>
    `;
  }).join('');

  document.getElementById('checkin-ate-at-home').checked = entry.ate_at_home ?? true;
  checkInModal.show();
};

async function confirmCheckIn() {
  const entryId = parseInt(document.getElementById('checkin-entry-id').value);
  if (!entryId) return;

  const entry = await db.diary.get(entryId);
  if (!entry) return;

  const checkboxes = document.querySelectorAll('.checkin-item-cb');
  const consumedIndices = [];
  checkboxes.forEach(cb => {
    if (cb.checked) consumedIndices.push(parseInt(cb.dataset.index));
  });

  const ateAtHome = document.getElementById('checkin-ate-at-home').checked;

  await DiaryStore.confirmMealConsumption(entryId, { consumedIndices, ateAtHome });

  if (ateAtHome) {
    const consumedItems = (entry.items || []).filter((_, idx) => consumedIndices.includes(idx));
    await deductMealItemsFromPantry(consumedItems);
  }

  checkInModal.hide();
  showToast('¡Ingesta confirmada como consumida!', 'success');
  await renderWeek(currentDate);
}

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

window.openItemDetail = function(entryId, name, kcal, prot, carbs, fat, photoId, isUnresolvedPhoto = false) {
  activeDetailEntryId = entryId;
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
    if (isUnresolvedPhoto) {
      photoLink.innerHTML = '✨ Resolver foto con IA';
      photoLink.className = 'btn btn-outline-warning btn-sm w-100';
    } else {
      photoLink.innerHTML = '🖼️ Ver foto original';
      photoLink.className = 'btn btn-outline-info btn-sm w-100';
    }
  } else {
    photoContainer.style.display = 'none';
  }
  
  document.getElementById('btn-delete-item').onclick = () => {
    itemDetailModal.hide();
    window.removeMealItem(entryId);
  };
  
  itemDetailModal.show();
};

window.showMealHistory = async function(entryId) {
  if (!entryId) return;
  if (itemDetailModal) itemDetailModal.hide();

  const container = document.getElementById('mealHistoryTimeline');
  if (!container) return;
  container.innerHTML = '<div class="text-muted small">Cargando historial...</div>';

  if (mealHistoryModal) mealHistoryModal.show();

  const versions = await DiaryStore.getEntryVersions(entryId);

  if (!versions || versions.length === 0) {
    container.innerHTML = `
      <div class="alert alert-secondary small py-2">
        ℹ️ No hay versiones previas registradas para esta comida. Cualquier ajuste o confirmación posterior quedará registrado automáticamente aquí.
      </div>
    `;
    return;
  }

  container.innerHTML = versions.map((v, idx) => {
    const actionMeta = DIARY_ACTIONS[v.action] || { label: v.action, icon: '📌' };
    const timeFormatted = new Date(v.timestamp).toLocaleString('es-ES', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
    const isLatest = idx === versions.length - 1;
    const badgeBorder = isLatest ? '#20c997' : '#0dcaf0';

    const itemsHtml = (v.items || []).map(item => {
      const courseIcon = COURSE_TYPES[item.course]?.icon || '🍲';
      const isSkipped = item.status === 'skipped';
      return `
        <div class="small ${isSkipped ? 'text-decoration-line-through opacity-50' : 'text-light'}">
          ${courseIcon} ${item.name} ${isSkipped ? '<span class="badge bg-secondary ms-1">omitido</span>' : ''}
        </div>
      `;
    }).join('');

    return `
      <div class="timeline-item">
        <div class="timeline-badge" style="border-color: ${badgeBorder};">
          ${actionMeta.icon}
        </div>
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="fw-semibold small">${actionMeta.label} <span class="badge bg-dark border border-secondary text-info">v${v.versionNumber || 1}</span></span>
          <span class="text-muted" style="font-size: 0.75em;">${timeFormatted}</span>
        </div>
        <div class="p-2 rounded bg-dark border border-secondary mb-2">
          ${itemsHtml || '<span class="text-muted small">Sin platos</span>'}
        </div>
      </div>
    `;
  }).join('');
};

window.removeMealItem = async function(entryId) {
  if (await confirmModal('¿Eliminar este registro?')) {
    // Para simplificar, si hay varios items en la misma entry, se borra toda la entry en este MVP.
    await DiaryStore.deleteDiaryEntry(entryId);
    await renderWeek(currentDate);
  }
};

async function searchProduct() {
  const query = document.getElementById('meal-product-search').value.trim();
  const searchPantryOnly = document.getElementById('meal-search-pantry-only')?.checked;
  if (!query && !searchPantryOnly) return;

  const spinner = document.getElementById('meal-search-spinner');
  if (spinner) spinner.classList.remove('d-none');

  const container = document.getElementById('meal-product-results');
  if (container) {
    container.style.display = 'block';
  }

  try {
    const qLower = query.toLowerCase();
    
    let results = [];
    if (searchPantryOnly) {
      // 1. Obtener directamente los alimentos en despensa (zona food) con stock > 0
      const pantryInventory = await PantryStore.getPantryInventory('food');
      
      // 2. Filtrar directamente sobre los productos que el usuario realmente tiene
      const filteredPantry = query
        ? pantryInventory.filter(item => {
            const nameMatch = item.productName && item.productName.toLowerCase().includes(qLower);
            const codeMatch = item.productCode && item.productCode.includes(query);
            return nameMatch || codeMatch;
          })
        : pantryInventory;

      // 3. Obtener los productos completos con sus datos nutricionales
      const matchedCodes = filteredPantry.map(i => i.productCode);
      const fullProducts = await ProductStore.getProductsByCodes(matchedCodes);
      const fullProductsMap = new Map(fullProducts.map(p => [p.code, p]));

      results = filteredPantry.map(item => {
        const fullP = fullProductsMap.get(item.productCode) || {};
        return {
          ...fullP,
          code: item.productCode,
          product_name: item.productName || fullP.product_name || `Producto ${item.productCode}`,
          brands: fullP.brands || '',
          pantryAmount: item.amount,
          pantryUnit: item.unit
        };
      });
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
      html = searchPantryOnly
        ? '<div class="list-group-item text-muted small py-2">No tienes productos en tu despensa que coincidan con la búsqueda.</div>'
        : '<div class="list-group-item text-muted small py-2">Sin resultados. Puedes crearlo con el botón "+ Genérico rápido" de arriba.</div>';
    } else {
      html = results.map(p => {
        const safeName = (p.product_name || 'Sin nombre').replace(/"/g, '&quot;');
        const safeBrand = p.brands ? p.brands.replace(/"/g, '&quot;') : '';
        const stockBadge = p.pantryAmount !== undefined 
          ? `<span class="badge bg-success bg-opacity-25 text-success border border-success border-opacity-25 ms-1">Stock: ${p.pantryAmount} ${p.pantryUnit || 'g'}</span>`
          : '';
        return `
        <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-2">
          <button type="button" class="btn btn-link text-white text-decoration-none p-0 text-start flex-grow-1 text-truncate me-2 btn-product-row"
                  data-code="${p.code}" data-name="${safeName}">
            <div class="small fw-semibold text-truncate">${safeName} ${stockBadge}</div>
            <small class="text-muted">${safeBrand ? safeBrand + ' • ' : ''}${p.code}</small>
          </button>
          <div class="d-flex align-items-center gap-1 flex-shrink-0">
            <button type="button" class="btn btn-xs btn-outline-info text-nowrap btn-select-product"
                    data-code="${p.code}" data-name="${safeName}">
              Seleccionar
            </button>
            <button type="button" class="btn btn-xs btn-success text-nowrap btn-add-product-direct"
                    data-code="${p.code}" data-name="${safeName}" title="Seleccionar y añadir al menú">
              ➕ Añadir
            </button>
          </div>
        </div>
      `;
      }).join('');
    }

    if (container) {
      container.innerHTML = html;
    }
  } finally {
    if (spinner) spinner.classList.add('d-none');
  }
}

window.addGenericProduct = async function(name) {
  const confirmed = await confirmModal(`¿Quieres añadir "${name}" como producto genérico sin código de barras a tu Base de Datos Personal?`);
  if (!confirmed) return;
  const genericCode = 'GENERIC_' + Date.now();
  await ProductStore.addCustomProduct({
      code: genericCode,
      product_name: name,
      ingredients_text: '',
      nutriscore_grade: 'unknown'
  });
  await window.selectProduct(genericCode, name);
};

window.selectProduct = async function(code, name, product = null) {
  const selectedInput = document.getElementById('meal-product-selected');
  const searchInput = document.getElementById('meal-product-search');
  if (selectedInput) selectedInput.value = code;
  if (searchInput) searchInput.value = name || '';

  const resultsContainer = document.getElementById('meal-product-results');
  if (resultsContainer) {
    resultsContainer.innerHTML = '';
    resultsContainer.style.display = 'none';
  }
  RecentStore.markAsUsed(code);

  if (!product) {
    product = await ProductStore.getProductByCode(code);
  }

  // Actualizar tarjeta visual de selección
  const card = document.getElementById('meal-product-selected-card');
  const nameEl = document.getElementById('meal-selected-name');
  const detailsEl = document.getElementById('meal-selected-details');
  const kcalEl = document.getElementById('meal-selected-kcal');

  if (card && nameEl) {
    nameEl.textContent = name || product?.product_name || `Producto ${code}`;
    if (detailsEl) {
      const details = [];
      if (product?.brands) details.push(product.brands);
      if (code) details.push(`Ref: ${code}`);
      detailsEl.textContent = details.join(' • ');
    }
    if (kcalEl) {
      const kcal = product?.nutriments?.['energy-kcal_100g'] ?? product?.nutriments?.energy_kcal_100g ?? product?.energy_kcal_100g;
      kcalEl.textContent = (kcal !== undefined && kcal !== null) ? `${Math.round(kcal)} kcal / 100g` : '';
    }
    card.classList.remove('d-none');
  }
};

async function saveMeal(targetStatus = 'consumed') {
  const finalStatus = (typeof targetStatus === 'string') ? targetStatus : 'consumed';
  const date = document.getElementById('meal-date').value;
  const mealType = document.getElementById('meal-type').value;

  let itemsToSave = [];

  if (mealTray.length > 0) {
    itemsToSave = [...mealTray];
    // Si además el usuario tiene un plato seleccionado en el formulario, intentar incluirlo también
    try {
      const current = await getCurrentConfiguredItem();
      if (current) itemsToSave.push(current);
    } catch {
      // Normal si el usuario ya añadió todo a la bandeja y el formulario quedó libre
    }
  } else {
    try {
      const singleItem = await getCurrentConfiguredItem();
      itemsToSave = [singleItem];
    } catch (err) {
      showToast(err.message, 'warning');
      return;
    }
  }

  if (itemsToSave.length === 0) {
    showToast('Selecciona una receta o producto para añadir a la agenda.', 'warning');
    return;
  }

  const context = {
    hunger_before: parseInt(document.getElementById('meal-hunger').value) || null,
    fullness_after: null,
    mood: null,
    notes: ''
  };

  const deductPantry = document.getElementById('meal-deduct-pantry').checked;

  await DiaryStore.addDiaryEntry({
    date,
    mealType,
    items: itemsToSave,
    context,
    status: finalStatus,
    ate_at_home: deductPantry
  });

  // Solo descontar de despensa si es consumido en el momento
  if (finalStatus === 'consumed' && deductPantry) {
    await deductMealItemsFromPantry(itemsToSave);
  }

  mealModal.hide();
  showToast(finalStatus === 'planned' ? 'Comida planificada en la agenda ⏳' : 'Comida registrada en la agenda ✓', 'success');
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

  document.getElementById('diary-video').style.display = 'block';
  document.getElementById('btn-diary-snap').style.display = 'block';

  // Iniciar cámara automáticamente
  try {
    diaryCameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    document.getElementById('diary-video').srcObject = diaryCameraStream;
  } catch {
    // Si no hay cámara o sin permisos
    document.getElementById('diary-video').style.display = 'none';
    document.getElementById('btn-diary-snap').style.display = 'none';
    document.getElementById('diary-file-input').click(); // Auto abrir galería
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
  if (hour >= 6 && hour < 10.5) return 'breakfast';
  if (hour >= 10.5 && hour < 13.5) return 'midmorning';
  if (hour >= 13.5 && hour < 17) return 'lunch';
  if (hour >= 17 && hour < 20) return 'snack';
  return 'dinner';
}
