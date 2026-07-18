import { Modal, Toast } from 'bootstrap';

/**
 * Muestra un Toast en la pantalla.
 * @param {string} message El mensaje a mostrar.
 * @param {string} type El tipo (success, danger, warning, info).
 */
export function showToast(message, type = 'success') {
  let container = document.getElementById('global-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'global-toast-container';
    container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    container.style.zIndex = '9999';
    document.body.appendChild(container);
  }

  const toastEl = document.createElement('div');
  toastEl.className = `toast align-items-center text-white bg-${type} border-0 mb-2`;
  toastEl.setAttribute('role', 'alert');
  toastEl.setAttribute('aria-live', 'assertive');
  toastEl.setAttribute('aria-atomic', 'true');

  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body fw-bold">
        ${message}
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;

  container.appendChild(toastEl);
  const bsToast = new Toast(toastEl, { delay: 3000 });
  
  toastEl.addEventListener('hidden.bs.toast', () => {
    toastEl.remove();
  });

  bsToast.show();
}

/**
 * Muestra un modal de confirmación asíncrono.
 * @param {string} message El mensaje a preguntar.
 * @param {string} title El título del modal.
 * @returns {Promise<boolean>} Promesa que resuelve a true si el usuario acepta, false si cancela.
 */
export function confirmModal(message, title = 'Confirmar Acción') {
  return new Promise((resolve) => {
    let modalEl = document.getElementById('global-confirm-modal');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'global-confirm-modal';
      modalEl.className = 'modal fade';
      modalEl.setAttribute('tabindex', '-1');
      modalEl.setAttribute('aria-hidden', 'true');
      document.body.appendChild(modalEl);
    }

    modalEl.innerHTML = `
      <div class="modal-dialog modal-sm modal-dialog-centered">
        <div class="modal-content bg-dark text-white glass-panel border-secondary">
          <div class="modal-header border-secondary py-2">
            <h6 class="modal-title m-0">${title}</h6>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body text-center py-4">
            <p class="mb-0 fw-medium">${message}</p>
          </div>
          <div class="modal-footer border-secondary py-1 justify-content-center gap-3">
            <button type="button" class="btn btn-sm btn-outline-secondary px-3" id="btn-global-cancel" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-sm btn-primary px-4" id="btn-global-confirm">Aceptar</button>
          </div>
        </div>
      </div>
    `;

    const bsModal = new Modal(modalEl, { backdrop: 'static' });
    
    const onConfirm = () => {
      bsModal.hide();
      cleanup();
      resolve(true);
    };

    const onCancel = () => {
      bsModal.hide();
      cleanup();
      resolve(false);
    };

    const cleanup = () => {
      document.getElementById('btn-global-confirm').removeEventListener('click', onConfirm);
      document.getElementById('btn-global-cancel').removeEventListener('click', onCancel);
      modalEl.removeEventListener('hidden.bs.modal', onCancel);
    };

    document.getElementById('btn-global-confirm').addEventListener('click', onConfirm);
    document.getElementById('btn-global-cancel').addEventListener('click', onCancel);
    modalEl.addEventListener('hidden.bs.modal', onCancel);

    bsModal.show();
  });
}

/**
 * Comprime una imagen desde un Blob o URL Object, reduciendo sus dimensiones a max 1080px.
 * @param {Blob|string} imageFile El blob de la imagen a comprimir, o un objeto URL temporal.
 * @param {number} maxWidth Ancho máximo (por defecto 1080)
 * @returns {Promise<Blob>} Promesa que resuelve al Blob comprimido
 */
export function compressImage(imageFile, maxWidth = 1080) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const isBlob = imageFile instanceof Blob;
    const url = isBlob ? URL.createObjectURL(imageFile) : imageFile;

    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxWidth) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxWidth) / height);
          height = maxWidth;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        if (isBlob) URL.revokeObjectURL(url);
        resolve(blob);
      }, 'image/jpeg', 0.85);
    };

    img.onerror = (err) => {
      if (isBlob) URL.revokeObjectURL(url);
      reject(err);
    };

    img.src = url;
  });
}
