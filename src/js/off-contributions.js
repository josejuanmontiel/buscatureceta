/**
 * off-contributions.js
 * Controlador de la vista dedicada a contribuciones y cola de subidas a OpenFoodFacts.
 */
import {
  getAllUploads,
  getUploadById,
  updateUpload,
  deletePendingUpload,
  retryUpload,
  syncPendingUploads,
  getOffStats,
  getCredentials,
  saveCredentials,
  saveImageToPendingUploads
} from './api/openFoodFacts.js';
import { ImageCropper } from './modules/ui/ImageCropper.js';
import { showToast } from './modules/ui/UI.js';
import { Modal } from 'bootstrap';

let currentFilter = 'all';
let searchQuery = '';
let activeEditUploadId = null;
let editCropperInstance = null;
let editOriginalBlob = null;
let editAspect = 'free';
let editModalInstance = null;
let credsModalInstance = null;
let modalCameraStream = null;

export async function initView() {
  initEventListeners();
  await loadUploads();
  await updateStats();
}

function initEventListeners() {
  // Filtros
  const filterGroup = document.getElementById('off-filter-group');
  if (filterGroup) {
    filterGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-filter]');
      if (!btn) return;
      currentFilter = btn.getAttribute('data-filter');
      filterGroup.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadUploads();
    });
  }

  // Clic en KPIs para filtrar
  document.getElementById('kpi-card-pending')?.addEventListener('click', () => setFilter('pending'));
  document.getElementById('kpi-card-failed')?.addEventListener('click', () => setFilter('failed'));
  document.getElementById('kpi-card-done')?.addEventListener('click', () => setFilter('done'));
  document.getElementById('kpi-card-total')?.addEventListener('click', () => setFilter('all'));

  // Búsqueda
  const searchInput = document.getElementById('off-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      loadUploads();
    });
  }

  // Botón "+ Nueva Foto" en la cabecera
  document.getElementById('btn-add-off-photo')?.addEventListener('click', () => {
    window.offAddNewPhotoForBarcode('', '', '');
  });

  // Sincronizar todo
  document.getElementById('btn-sync-all')?.addEventListener('click', handleSyncAll);

  // Modal credenciales
  document.getElementById('btn-open-credentials')?.addEventListener('click', openCredentialsModal);
  document.getElementById('btn-save-credentials')?.addEventListener('click', handleSaveCredentials);

  // Modal edición / nueva foto: Cámara y Archivo
  document.getElementById('btn-modal-camera')?.addEventListener('click', startModalCamera);
  document.getElementById('btn-modal-take-snapshot')?.addEventListener('click', takeModalSnapshot);
  document.getElementById('btn-modal-close-camera')?.addEventListener('click', stopModalCamera);

  document.getElementById('btn-modal-file')?.addEventListener('click', () => {
    document.getElementById('modal-file-input')?.click();
  });
  document.getElementById('modal-file-input')?.addEventListener('change', handleModalFileSelected);

  // Modal edición / recorte: Rotar, reset y aspect
  document.getElementById('btn-edit-rotate')?.addEventListener('click', () => {
    if (editCropperInstance) editCropperInstance.rotateClockwise();
  });
  document.getElementById('btn-edit-reset-crop')?.addEventListener('click', () => {
    if (editCropperInstance) editCropperInstance.resetCrop();
  });
  document.getElementById('edit-aspect-group')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-aspect]');
    if (!btn) return;
    editAspect = btn.getAttribute('data-aspect');
    document.querySelectorAll('#edit-aspect-group button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (editCropperInstance) editCropperInstance.setAspectRatio(editAspect);
  });

  // Guardar cambios (editar) o Guardar nueva foto
  document.getElementById('btn-save-edited-upload')?.addEventListener('click', () => handleSaveUpload(false));
  document.getElementById('btn-save-as-new-upload')?.addEventListener('click', () => handleSaveUpload(true));

  // Cleanup cropper y cámara al cerrar modal
  const editModalEl = document.getElementById('modal-off-edit');
  if (editModalEl) {
    editModalEl.addEventListener('hidden.bs.modal', () => {
      stopModalCamera();
      if (editCropperInstance) {
        editCropperInstance.destroy();
        editCropperInstance = null;
      }
      editOriginalBlob = null;
      activeEditUploadId = null;
      const statusEl = document.getElementById('modal-image-status');
      if (statusEl) statusEl.textContent = '';
      const fileInput = document.getElementById('modal-file-input');
      if (fileInput) fileInput.value = '';
    });
  }
}

function setFilter(filter) {
  currentFilter = filter;
  const filterGroup = document.getElementById('off-filter-group');
  if (filterGroup) {
    filterGroup.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-filter') === filter);
    });
  }
  loadUploads();
}

async function updateStats() {
  try {
    const stats = await getOffStats();
    document.getElementById('kpi-pending-count').textContent = stats.pending;
    document.getElementById('kpi-failed-count').textContent = stats.failed;
    document.getElementById('kpi-done-count').textContent = stats.done;
    document.getElementById('kpi-total-count').textContent = stats.total;

    // Actualizar badge del menú si existe
    const navBadge = document.getElementById('nav-off-badge');
    if (navBadge) {
      const activeCount = stats.pending + stats.failed;
      if (activeCount > 0) {
        navBadge.textContent = activeCount;
        navBadge.style.display = 'inline';
      } else {
        navBadge.style.display = 'none';
      }
    }
  } catch (err) {
    console.warn('Error actualizando KPIs OFF:', err);
  }
}

async function loadUploads() {
  const container = document.getElementById('off-uploads-container');
  const emptyState = document.getElementById('off-empty-state');
  if (!container) return;

  const allItems = await getAllUploads();

  // Filtrado
  const filtered = allItems.filter(item => {
    // Filtro por estado
    if (currentFilter === 'pending' && !(item.status === 'pending' || item.status === 'uploading')) return false;
    if (currentFilter === 'failed' && item.status !== 'failed') return false;
    if (currentFilter === 'done' && item.status !== 'done') return false;

    // Filtro por búsqueda
    if (searchQuery) {
      const name = (item.productName || '').toLowerCase();
      const code = (item.barcode || '').toLowerCase();
      if (!name.includes(searchQuery) && !code.includes(searchQuery)) return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = '';
    emptyState?.classList.remove('d-none');
    return;
  }

  emptyState?.classList.add('d-none');

  container.innerHTML = filtered.map(item => {
    const typeNames = {
      front: 'Etiqueta frontal (front)',
      ingredients: 'Ingredientes',
      nutrition: 'Información nutricional'
    };
    const typeLabel = typeNames[item.type] || item.type;

    let statusBadgeHtml = '';
    if (item.status === 'done') {
      const dateStr = item.uploadedAt ? new Date(item.uploadedAt).toLocaleDateString() : '';
      statusBadgeHtml = `<span class="badge bg-success"><i class="bi bi-check2 me-1"></i>Subida ${dateStr}</span>`;
    } else if (item.status === 'failed') {
      statusBadgeHtml = `<span class="badge bg-danger" title="${item.lastError || ''}"><i class="bi bi-exclamation-triangle me-1"></i>Error: ${item.lastError || 'Fallo de subida'}</span>`;
    } else if (item.status === 'uploading') {
      statusBadgeHtml = `<span class="badge bg-info text-dark"><span class="spinner-border spinner-border-sm me-1"></span>Subiendo...</span>`;
    } else {
      statusBadgeHtml = `<span class="badge bg-warning text-dark"><i class="bi bi-clock me-1"></i>Pendiente</span>`;
    }

    const blob = new Blob([item.imageData], { type: item.mimeType || 'image/jpeg' });
    const thumbUrl = URL.createObjectURL(blob);
    const createdDate = item.createdAt ? new Date(item.createdAt).toLocaleString() : '';

    const isNumericCode = /^\d+$/.test(item.barcode);
    const codeLink = isNumericCode
      ? `<a href="https://world.openfoodfacts.org/product/${item.barcode}" target="_blank" class="text-info text-decoration-none" title="Ver en OpenFoodFacts"><code>${item.barcode}</code> <i class="bi bi-box-arrow-up-right small"></i></a>`
      : `<code>${item.barcode}</code>`;

    return `
      <div class="off-item-card p-3 d-flex flex-column flex-sm-row gap-3 align-items-sm-center" id="off-item-${item.id}">
        <!-- Miniatura -->
        <div class="flex-shrink-0 text-center">
          <img src="${thumbUrl}" alt="${typeLabel}" class="off-thumb" onclick="window.open('${thumbUrl}', '_blank')" title="Clic para ampliar imagen">
        </div>

        <!-- Información -->
        <div class="flex-grow-1 overflow-hidden">
          <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
            <h5 class="mb-0 text-white text-truncate fw-bold" style="max-width: 320px;">
              ${item.productName || 'Producto sin nombre'}
            </h5>
            <span class="badge bg-secondary text-light">${typeLabel}</span>
            ${statusBadgeHtml}
          </div>

          <div class="small text-muted mb-2">
            <span>Código: ${codeLink}</span>
            <span class="mx-2">•</span>
            <span>Fecha: ${createdDate}</span>
          </div>

          ${item.lastError ? `
            <div class="alert alert-danger py-1 px-2 small mb-2 text-break">
              <i class="bi bi-x-circle me-1"></i><strong>Motivo del fallo:</strong> ${item.lastError}
            </div>
          ` : ''}
        </div>

        <!-- Botones de Acción -->
        <div class="d-flex flex-sm-column gap-2 flex-shrink-0 justify-content-end">
          ${item.status !== 'done' ? `
            <button type="button" class="btn btn-sm btn-outline-info" onclick="window.offRetrySingle(${item.id})" id="btn-retry-${item.id}" title="Subir a OpenFoodFacts">
              <i class="bi bi-cloud-arrow-up"></i> Subir
            </button>
          ` : ''}
          <button type="button" class="btn btn-sm btn-outline-success" onclick="window.offAddNewPhotoForBarcode('${item.barcode}', '${(item.productName || '').replace(/'/g, "\\'")}', '${item.type}')" title="Añadir otra foto a este producto">
            <i class="bi bi-camera-plus"></i> + Foto
          </button>
          <button type="button" class="btn btn-sm btn-outline-warning" onclick="window.offEditSingle(${item.id})" title="Editar recorte o datos">
            <i class="bi bi-crop"></i> Editar
          </button>
          <button type="button" class="btn btn-sm btn-outline-danger" onclick="window.offDeleteSingle(${item.id})" title="Eliminar de la cola">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ── Acciones individuales ──────────────────────────────────────────────────

window.offRetrySingle = async function(id) {
  const btn = document.getElementById(`btn-retry-${id}`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
  }

  try {
    const result = await retryUpload(id);
    if (result.success) {
      showToast('✅ Imagen subida con éxito a OpenFoodFacts', 'success');
    } else {
      showToast('⚠️ Error al subir: ' + (result.error || 'Fallo de conexión'), 'danger');
    }
  } catch (err) {
    showToast('Error inesperado: ' + err.message, 'danger');
  } finally {
    await updateStats();
    await loadUploads();
  }
};

window.offEditSingle = async function(id) {
  const item = await getUploadById(id);
  if (!item) return;

  activeEditUploadId = item.id;
  document.getElementById('modal-off-edit-heading').textContent = 'Editar y Re-recortar Foto';
  const icon = document.getElementById('modal-off-edit-icon');
  if (icon) icon.className = 'bi bi-crop text-warning me-2';

  const barcodeInput = document.getElementById('edit-barcode');
  if (barcodeInput) barcodeInput.value = item.barcode || '';

  document.getElementById('edit-product-name').value = item.productName || '';
  document.getElementById('edit-image-type').value = item.type || 'front';

  // En modo edición mostramos la opción de "Guardar como foto nueva (+)" y "Guardar Cambios"
  const btnSaveAsNew = document.getElementById('btn-save-as-new-upload');
  if (btnSaveAsNew) btnSaveAsNew.classList.remove('d-none');
  const btnSaveText = document.getElementById('btn-save-edited-text');
  if (btnSaveText) btnSaveText.textContent = 'Guardar Cambios';

  const statusEl = document.getElementById('modal-image-status');
  if (statusEl) statusEl.textContent = 'Foto actual cargada';

  const modalEl = document.getElementById('modal-off-edit');
  if (!modalEl) return;
  editModalInstance = Modal.getOrCreateInstance(modalEl);
  editModalInstance.show();

  const buffer = item.originalImageData || item.imageData;
  editOriginalBlob = new Blob([buffer], { type: item.mimeType || 'image/jpeg' });

  setTimeout(() => {
    const canvas = document.getElementById('edit-cropper-canvas');
    if (editCropperInstance) editCropperInstance.destroy();

    editCropperInstance = new ImageCropper({
      canvas,
      image: editOriginalBlob,
      aspectRatio: editAspect
    });
  }, 250);
};

window.offAddNewPhotoForBarcode = function(barcode = '', productName = '', currentType = '') {
  activeEditUploadId = null;

  const heading = productName
    ? `Añadir otra foto a: ${productName}`
    : (barcode ? `Añadir foto a ${barcode}` : 'Añadir Nueva Foto OFF');
  document.getElementById('modal-off-edit-heading').textContent = heading;

  const icon = document.getElementById('modal-off-edit-icon');
  if (icon) icon.className = 'bi bi-camera-plus text-success me-2';

  const barcodeInput = document.getElementById('edit-barcode');
  if (barcodeInput) barcodeInput.value = barcode || '';

  document.getElementById('edit-product-name').value = productName || '';

  // Sugerir el siguiente tipo lógico
  let nextType = 'front';
  if (currentType === 'front') nextType = 'ingredients';
  else if (currentType === 'ingredients') nextType = 'nutrition';
  document.getElementById('edit-image-type').value = nextType;

  // En modo añadir nueva foto, ocultamos "Guardar como foto nueva" porque ya es nueva
  const btnSaveAsNew = document.getElementById('btn-save-as-new-upload');
  if (btnSaveAsNew) btnSaveAsNew.classList.add('d-none');
  const btnSaveText = document.getElementById('btn-save-edited-text');
  if (btnSaveText) btnSaveText.textContent = 'Guardar foto en cola OFF';

  const statusEl = document.getElementById('modal-image-status');
  if (statusEl) statusEl.textContent = 'Selecciona o captura una foto';

  const modalEl = document.getElementById('modal-off-edit');
  if (!modalEl) return;
  editModalInstance = Modal.getOrCreateInstance(modalEl);
  editModalInstance.show();

  // Limpiar cropper canvas hasta que haya una foto
  if (editCropperInstance) {
    editCropperInstance.destroy();
    editCropperInstance = null;
  }
  editOriginalBlob = null;
  const canvas = document.getElementById('edit-cropper-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  }
};

window.offDeleteSingle = async function(id) {
  if (!confirm('¿Seguro que deseas eliminar esta imagen de la cola?')) return;
  await deletePendingUpload(id);
  showToast('Foto eliminada de la cola', 'info');
  await updateStats();
  await loadUploads();
};

// ── Cámara y selección de archivos en modal ────────────────────────────────

async function startModalCamera() {
  const videoEl = document.getElementById('modal-capture-video');
  const cameraContainer = document.getElementById('modal-camera-container');
  if (!videoEl || !cameraContainer) return;

  try {
    stopModalCamera();
    modalCameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    videoEl.srcObject = modalCameraStream;
    cameraContainer.classList.remove('d-none');
  } catch (err) {
    showToast('No se pudo acceder a la cámara: ' + err.message, 'warning');
    document.getElementById('modal-file-input')?.click();
  }
}

function stopModalCamera() {
  if (modalCameraStream) {
    modalCameraStream.getTracks().forEach(t => t.stop());
    modalCameraStream = null;
  }
  document.getElementById('modal-camera-container')?.classList.add('d-none');
}

function takeModalSnapshot() {
  const videoEl = document.getElementById('modal-capture-video');
  if (!videoEl) return;

  const canvas = document.createElement('canvas');
  canvas.width = videoEl.videoWidth || 800;
  canvas.height = videoEl.videoHeight || 600;
  canvas.getContext('2d').drawImage(videoEl, 0, 0);

  stopModalCamera();

  canvas.toBlob((blob) => {
    if (!blob) {
      showToast('Error al capturar la imagen', 'danger');
      return;
    }
    setModalImage(blob, 'Foto tomada con cámara');
  }, 'image/jpeg', 0.92);
}

function handleModalFileSelected(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  setModalImage(file, file.name);
  e.target.value = '';
}

function setModalImage(blob, label = '') {
  editOriginalBlob = blob;
  const statusEl = document.getElementById('modal-image-status');
  if (statusEl) statusEl.textContent = label ? `✓ ${label}` : '';

  const canvas = document.getElementById('edit-cropper-canvas');
  if (!canvas) return;
  if (editCropperInstance) editCropperInstance.destroy();

  editCropperInstance = new ImageCropper({
    canvas,
    image: blob,
    aspectRatio: editAspect
  });
}

// ── Guardado de foto (Edición o Añadir nueva) ───────────────────────────────

async function handleSaveUpload(asNew = false) {
  const barcodeInput = document.getElementById('edit-barcode');
  const nameInput = document.getElementById('edit-product-name');
  const typeInput = document.getElementById('edit-image-type');

  const barcode = barcodeInput?.value.trim();
  const productName = nameInput?.value.trim();
  const type = typeInput?.value || 'front';

  if (!barcode) {
    showToast('Debes indicar el código de barras del producto', 'warning');
    barcodeInput?.focus();
    return;
  }

  if (!editCropperInstance && !editOriginalBlob) {
    showToast('Debes tomar o seleccionar una foto antes de guardar', 'warning');
    return;
  }

  try {
    let croppedBlob = null;
    let cropConfig = null;

    if (editCropperInstance) {
      croppedBlob = await editCropperInstance.getCroppedBlob('image/jpeg', 0.88);
      cropConfig = editCropperInstance.getCropData();
    } else if (editOriginalBlob) {
      croppedBlob = editOriginalBlob;
    }

    if (!croppedBlob) {
      showToast('No se pudo procesar la imagen seleccionada', 'danger');
      return;
    }

    // Si es "Guardar como foto nueva" O estamos en modo añadir
    if (asNew || !activeEditUploadId) {
      await saveImageToPendingUploads(
        barcode,
        croppedBlob,
        type,
        productName,
        editOriginalBlob || croppedBlob,
        cropConfig
      );
      showToast('✅ Foto añadida a la cola OFF', 'success');
    } else {
      // Modo actualizar registro existente
      await updateUpload(activeEditUploadId, {
        barcode,
        productName,
        type,
        imageBlob: croppedBlob,
        originalBlob: editOriginalBlob || croppedBlob,
        cropConfig,
        status: 'pending',
        lastError: null
      });
      showToast('✅ Cambios guardados en la cola OFF', 'success');
    }

    if (editModalInstance) editModalInstance.hide();
    await updateStats();
    await loadUploads();
  } catch (err) {
    console.error(err);
    showToast('Error al guardar: ' + err.message, 'danger');
  }
}

// ── Sincronización masiva (Subir pendientes) ───────────────────────────────

async function handleSyncAll() {
  const btnSync = document.getElementById('btn-sync-all');
  const btnText = document.getElementById('btn-sync-all-text');
  const progressContainer = document.getElementById('sync-progress-container');
  const progressBar = document.getElementById('sync-progress-bar');
  const progressCount = document.getElementById('sync-progress-count');

  btnSync.disabled = true;
  btnText.textContent = 'Subiendo...';
  progressContainer?.classList.remove('d-none');
  progressBar.style.width = '0%';
  progressCount.textContent = 'Iniciando...';

  try {
    const result = await syncPendingUploads((processed, total, ok, failed) => {
      const pct = Math.round((processed / total) * 100);
      progressBar.style.width = `${pct}%`;
      progressCount.textContent = `${processed} de ${total} (${ok} ok, ${failed} err)`;
    });

    if (result.ok > 0) {
      showToast(`🚀 Sincronización completada: ${result.ok} foto(s) subida(s) correctamente`, 'success');
    }
    if (result.failed > 0) {
      showToast(`⚠️ ${result.failed} foto(s) no pudieron subirse`, 'warning');
    }
  } catch (err) {
    showToast('Error en la sincronización: ' + err.message, 'danger');
  } finally {
    btnSync.disabled = false;
    btnText.textContent = 'Subir Pendientes';
    setTimeout(() => {
      progressContainer?.classList.add('d-none');
    }, 2000);
    await updateStats();
    await loadUploads();
  }
}

// ── Credenciales OFF ───────────────────────────────────────────────────────

function openCredentialsModal() {
  const { userId, password } = getCredentials();
  document.getElementById('off-user-input').value = userId || '';
  document.getElementById('off-password-input').value = password || '';

  const modalEl = document.getElementById('modal-off-credentials');
  if (!modalEl) return;
  credsModalInstance = Modal.getOrCreateInstance(modalEl);
  credsModalInstance.show();
}

function handleSaveCredentials() {
  const user = document.getElementById('off-user-input').value.trim();
  const pass = document.getElementById('off-password-input').value.trim();

  saveCredentials(user || 'off', pass || 'off');
  showToast('✅ Credenciales OFF guardadas', 'success');
  if (credsModalInstance) credsModalInstance.hide();
}
