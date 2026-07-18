/**
 * meal-photos.js — Pool fotográfico de lo que se come
 *
 * Gestiona la captura, listado, anotación y portapapeles de fotos de comidas.
 */

import { Modal } from 'bootstrap';
import * as MealPhotoStore from './modules/mealPhotos/MealPhotoStore.js';

// ─── Estado ───────────────────────────────────────────────────────────────────
let currentFilter = 'all';      // 'all' | 'pending_review' | 'logged'
let quickCameraStream = null;
let annotateModal = null;
let currentAnnotateId = null;   // id de la foto que se está anotando
let currentAnnotateBlob = null; // blob completo para portapapeles

const MEAL_LABELS = {
  breakfast: 'Desayuno', lunch: 'Comida', snack: 'Merienda', dinner: 'Cena',
};

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  annotateModal = new Modal(document.getElementById('annotateModal'));

  // Fecha de hoy por defecto en campos de fecha
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('quick-date').value = today;

  await renderGallery();
  await updatePendingBadge();

  bindEvents();

  // Si venimos de la agenda para resolver una foto:
  const params = new URLSearchParams(window.location.search);
  const resolveId = params.get('resolvePhotoId');
  if (resolveId) {
    window._openAnnotate(parseInt(resolveId, 10));
  }
});

// ─── Binding de eventos ────────────────────────────────────────────────────────
function bindEvents() {
  // Botón abrir cámara rápida
  document.getElementById('btn-quick-capture').addEventListener('click', toggleQuickCapture);
  document.getElementById('btn-cancel-quick-camera').addEventListener('click', cancelQuickCamera);
  document.getElementById('btn-snap').addEventListener('click', snapPhoto);

  // Galería (file input)
  document.getElementById('btn-quick-gallery').addEventListener('click', () => {
    document.getElementById('quick-file-input').click();
  });
  document.getElementById('quick-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await saveQuickPhoto(file);
    e.target.value = '';
  });

  // Filtros
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderGallery();
    });
  });

  // Modal anotación — botones
  document.getElementById('btn-copy-clipboard').addEventListener('click', copyPhotoToClipboard);
  document.getElementById('btn-copy-prompt').addEventListener('click', copyAIPrompt);
  document.getElementById('btn-process-ai').addEventListener('click', processAIJson);
  document.getElementById('btn-send-to-agenda').addEventListener('click', sendPhotoToAgendaEmpty);
  document.getElementById('btn-save-annotation').addEventListener('click', saveAnnotation);
  document.getElementById('btn-discard-photo').addEventListener('click', discardCurrentPhoto);
}

// ─── Cámara rápida ────────────────────────────────────────────────────────────
async function toggleQuickCapture() {
  const section = document.getElementById('quick-camera-section');
  const isOpen = section.style.display !== 'none';
  if (isOpen) { cancelQuickCamera(); return; }

  section.style.display = 'block';
  section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  try {
    quickCameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    document.getElementById('quick-video').srcObject = quickCameraStream;
  } catch (err) {
    showToast('No se pudo acceder a la cámara: ' + err.message, true);
    section.style.display = 'none';
  }
}

function cancelQuickCamera() {
  stopQuickCamera();
  document.getElementById('quick-camera-section').style.display = 'none';
}

function stopQuickCamera() {
  if (quickCameraStream) {
    quickCameraStream.getTracks().forEach(t => t.stop());
    quickCameraStream = null;
  }
  document.getElementById('quick-video').srcObject = null;
}

function snapPhoto() {
  const video = document.getElementById('quick-video');
  if (!video.videoWidth) { showToast('La cámara aún no está lista', true); return; }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  canvas.toBlob(async blob => {
    if (!blob) return;
    stopQuickCamera();
    await saveQuickPhoto(blob);
    document.getElementById('quick-camera-section').style.display = 'none';
  }, 'image/jpeg', 0.88);
}

async function saveQuickPhoto(blob) {
  const date = document.getElementById('quick-date').value || new Date().toISOString().split('T')[0];
  const mealType = document.getElementById('quick-meal-type').value || null;
  try {
    await MealPhotoStore.addMealPhoto(date, mealType, blob);
    showToast('Foto guardada ✓');
    await renderGallery();
    await updatePendingBadge();
  } catch (err) {
    showToast('Error al guardar: ' + err.message, true);
  }
}

// ─── Galería ──────────────────────────────────────────────────────────────────
async function renderGallery() {
  const statusFilter = currentFilter === 'all' ? null : currentFilter;
  const photos = await MealPhotoStore.getPhotosForGallery({ statusFilter });

  const grid = document.getElementById('photos-grid');
  const countEl = document.getElementById('photo-count');
  countEl.textContent = `${photos.length} foto${photos.length !== 1 ? 's' : ''}`;

  if (photos.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="icon">🍽️</div>
        <h4>${currentFilter === 'pending_review' ? 'Sin fotos pendientes' : 'Sin fotos todavía'}</h4>
        <p class="small">Pulsa "Añadir foto ahora" o ve a la Agenda y usa el botón 📷 en cualquier día.</p>
      </div>`;
    return;
  }

  grid.innerHTML = photos.map(photo => {
    const thumbUrl = photo.thumbnailBlob ? URL.createObjectURL(photo.thumbnailBlob) : null;
    const mealLabel = MEAL_LABELS[photo.mealType] || '–';
    const dateStr = photo.date || '–';
    const statusClass = photo.status === 'logged' ? 'status-logged' : 'status-pending';
    const statusLabel = photo.status === 'logged' ? 'Anotada' : 'Pendiente';
    const notes = photo.notes ? photo.notes.slice(0, 60) + (photo.notes.length > 60 ? '…' : '') : '';

    return `
      <div class="photo-card" id="photo-card-${photo.id}">
        ${thumbUrl
          ? `<img class="photo-thumb" src="${thumbUrl}" alt="Foto de comida" loading="lazy">`
          : `<div class="photo-thumb-placeholder">🍽️</div>`}
        <div class="photo-card-body">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="photo-meal">${mealLabel}</span>
            <span class="status-label ${statusClass}">${statusLabel}</span>
          </div>
          <div class="photo-date">${dateStr}</div>
          ${notes ? `<div class="photo-notes">${notes}</div>` : ''}
          <div class="photo-actions">
            <button class="btn btn-outline-primary btn-sm" onclick="window._openAnnotate(${photo.id})">✏️ Anotar</button>
            <button class="btn btn-outline-danger btn-sm" onclick="window._discardPhoto(${photo.id})">🗑</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ─── Modal de anotación ────────────────────────────────────────────────────────
window._openAnnotate = async function(id) {
  const photo = await MealPhotoStore.getMealPhotoById(id);
  if (!photo) return;

  currentAnnotateId = id;
  currentAnnotateBlob = photo.blob;

  // Mostrar preview
  const previewEl = document.getElementById('annotate-preview');
  if (photo.blob) {
    previewEl.src = URL.createObjectURL(photo.blob);
    previewEl.style.display = 'block';
  } else {
    previewEl.style.display = 'none';
  }

  // Rellenar campos
  document.getElementById('annotate-notes').value = photo.notes || '';
  document.getElementById('annotate-meal-type').value = photo.mealType || '';
  document.getElementById('annotate-date').value = photo.date || new Date().toISOString().split('T')[0];
  document.getElementById('ai-json-input').value = '';
  document.getElementById('clipboard-status').style.display = 'none';

  annotateModal.show();
};

async function copyPhotoToClipboard() {
  if (!currentAnnotateBlob) { showToast('No hay imagen para copiar', true); return; }
  const statusEl = document.getElementById('clipboard-status');

  try {
    // Preferimos PNG para Clipboard API
    let blobToCopy = currentAnnotateBlob;
    if (currentAnnotateBlob.type !== 'image/png') {
      blobToCopy = await convertBlobToPng(currentAnnotateBlob);
    }

    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blobToCopy })
    ]);
    statusEl.textContent = '✅ ¡Imagen copiada! Pégala en ChatGPT, Gemini o tu app de IA favorita.';
    statusEl.style.color = '#75b798';
    statusEl.style.display = 'block';
    showToast('Imagen copiada al portapapeles ✓');
  } catch (err) {
    // Fallback: descargar
    const url = URL.createObjectURL(currentAnnotateBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comida-${Date.now()}.jpg`;
    a.click();
    URL.revokeObjectURL(url);
    statusEl.textContent = '⚠️ Tu navegador no permite copiar imágenes. Se ha descargado la foto.';
    statusEl.style.color = '#ffc107';
    statusEl.style.display = 'block';
  }
}

async function copyAIPrompt() {
  const prompt = `Analiza esta comida. Devuelve ÚNICAMENTE un bloque JSON válido con este formato, estimando los valores:
{
  "name": "Nombre del plato o comida",
  "kcal": 0,
  "protein_g": 0,
  "carbs_g": 0,
  "fat_g": 0
}`;
  try {
    await navigator.clipboard.writeText(prompt);
    showToast('Prompt copiado al portapapeles ✓');
  } catch (err) {
    showToast('Error copiando el prompt', true);
  }
}

async function sendPhotoToAgendaEmpty() {
  if (!currentAnnotateId) return;
  const mealType = document.getElementById('annotate-meal-type').value;
  const date = document.getElementById('annotate-date').value;
  if (!mealType) return alert('Selecciona un tipo de comida para poder enviarla a la agenda.');

  const { addDiaryEntry } = await import('./modules/diary/DiaryStore.js');
  
  const item = {
    type: 'photo',
    photoId: currentAnnotateId,
    name: document.getElementById('annotate-notes').value.trim() || 'Foto sin identificar',
    servings: 1,
    nutrition: { kcal: 0, proteins_g: 0, carbs_g: 0, fat_g: 0 }
  };

  try {
    const entryId = await addDiaryEntry({
      date,
      mealType,
      items: [item]
    });
    // Log the photo so it goes away from the review queue
    await MealPhotoStore.logPhoto(currentAnnotateId, item.name, entryId);
    
    annotateModal.hide();
    showToast('Foto enlazada a la agenda ✓');
    await renderGallery();
    await updatePendingBadge();
  } catch (err) {
    showToast('Error al enlazar: ' + err.message, true);
  }
}

async function processAIJson() {
  if (!currentAnnotateId) return;
  const mealType = document.getElementById('annotate-meal-type').value;
  const date = document.getElementById('annotate-date').value;
  const jsonStr = document.getElementById('ai-json-input').value.trim();

  if (!mealType) return alert('Selecciona un tipo de comida (Desayuno, Comida...).');
  if (!jsonStr) return alert('Pega el JSON de la IA primero.');

  let data;
  try {
    // Extraer solo la parte que parece un JSON (entre llaves)
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No se encontraron llaves {} en el texto");
    data = JSON.parse(match[0]);
  } catch (err) {
    alert('Aviso: No se pudo leer el JSON correctamente, pero se guardará el registro con valores a 0 para no perder tu nota. Detalle: ' + err.message);
    data = {
      name: 'IA (Error): ' + jsonStr.substring(0, 40).replace(/\n/g, ' ') + '...',
      kcal: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0
    };
  }

  const { addDiaryEntry, db } = await import('./modules/diary/DiaryStore.js');

  // Limpiar el ítem de la foto "vacía" si existe en este día y tipo de comida
  const existingEntry = await db.diary.where({ date, mealType }).first();
  if (existingEntry) {
    existingEntry.items = existingEntry.items.filter(i => !(i.type === 'photo' && i.photoId === currentAnnotateId));
    await db.diary.update(existingEntry.id, { items: existingEntry.items });
  }
  
  const item = {
    type: 'custom_macros',
    photoId: currentAnnotateId, // Guardamos la referencia
    name: data.name || 'Plato (IA)',
    servings: 1,
    nutrition: {
      kcal: parseFloat(data.kcal) || 0,
      proteins_g: parseFloat(data.protein_g || data.proteins_g) || 0,
      carbs_g: parseFloat(data.carbs_g || data.carbohydrates_g) || 0,
      fat_g: parseFloat(data.fat_g) || 0,
      fiber_g: parseFloat(data.fiber_g) || 0,
      sugars_g: parseFloat(data.sugars_g) || 0,
      salt_g: parseFloat(data.salt_g) || 0
    }
  };

  try {
    const entryId = await addDiaryEntry({
      date,
      mealType,
      items: [item]
    });
    await MealPhotoStore.logPhoto(currentAnnotateId, item.name, entryId);
    
    annotateModal.hide();
    
    // Si veníamos de la agenda para resolver, volvemos allí
    const params = new URLSearchParams(window.location.search);
    if (params.has('resolvePhotoId')) {
      window.location.href = '/diary.html';
      return;
    }
    
    showToast('Alimento añadido a la agenda mágicamente ✨');
    await renderGallery();
    await updatePendingBadge();
  } catch (err) {
    showToast('Error al guardar en agenda: ' + err.message, true);
  }
}

function convertBlobToPng(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(pngBlob => pngBlob ? resolve(pngBlob) : reject(new Error('Error PNG')), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Error imagen')); };
    img.src = url;
  });
}

async function saveAnnotation() {
  if (!currentAnnotateId) return;
  const notes = document.getElementById('annotate-notes').value.trim();
  const mealType = document.getElementById('annotate-meal-type').value || null;
  const date = document.getElementById('annotate-date').value;

  try {
    await MealPhotoStore.logPhoto(currentAnnotateId, notes);
    // Actualizar también date/mealType si cambiaron
    const { db } = await import('./db/schema.js');
    await db.mealPhotos.update(currentAnnotateId, { date, mealType });

    annotateModal.hide();
    showToast('Anotación guardada ✓');
    await renderGallery();
    await updatePendingBadge();
  } catch (err) {
    showToast('Error al guardar: ' + err.message, true);
  }
}

async function discardCurrentPhoto() {
  if (!currentAnnotateId) return;
  if (!confirm('¿Descartar esta foto? Se ocultará del pool.')) return;
  await MealPhotoStore.discardPhoto(currentAnnotateId);
  annotateModal.hide();
  showToast('Foto descartada');
  await renderGallery();
  await updatePendingBadge();
}

window._discardPhoto = async function(id) {
  if (!confirm('¿Descartar esta foto?')) return;
  await MealPhotoStore.discardPhoto(id);
  showToast('Foto descartada');
  await renderGallery();
  await updatePendingBadge();
};

// ─── Badge de pendientes ───────────────────────────────────────────────────────
async function updatePendingBadge() {
  const count = await MealPhotoStore.countPendingPhotos();
  const badge = document.getElementById('nav-photo-badge');
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline';
  } else {
    badge.style.display = 'none';
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, isError = false) {
  const el = document.getElementById('app-toast');
  el.textContent = msg;
  el.className = 'my-toast' + (isError ? ' error' : '');
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}
