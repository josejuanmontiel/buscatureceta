import { db } from './db/schema.js';
import * as PreShoppingStore from './modules/shopping/PreShoppingStore.js';
import { parseShoppingText, parseSingleItem } from './modules/shopping/preListParser.js';
import { isSpeechRecognitionSupported, createSpeechRecognizer } from './modules/shopping/speechRecognition.js';
import { showToast, confirmModal } from './modules/ui/UI.js';
import { Modal } from 'bootstrap';

let pasteModalInstance = null;
let activeSpeechRecognizer = null;
let isRecordingVoice = false;

export async function initView() {
  initDOM();
  initVoice();
  initPasteModal();
  initConversionActions();
  await renderList();
}

function initDOM() {
  // Modal de pegado
  const modalEl = document.getElementById('modalPastePreList');
  if (modalEl) {
    pasteModalInstance = new Modal(modalEl);
  }

  // Formulario de añadir rápido
  const formQuick = document.getElementById('form-quick-add');
  const inputName = document.getElementById('input-quick-name');

  if (formQuick && inputName) {
    formQuick.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rawText = inputName.value.trim();
      if (!rawText) return;

      const parsed = parseSingleItem(rawText);
      if (parsed) {
        await PreShoppingStore.addItem({
          name: parsed.name,
          amount: parsed.amount,
          unit: parsed.unit,
          source: 'manual'
        });
        inputName.value = '';
        inputName.focus();
        showToast(`➕ Añadido: ${parsed.name}`, 'success');
        await renderList();
      }
    });
  }

  // Botón seleccionar todos
  const checkSelectAll = document.getElementById('check-select-all');
  if (checkSelectAll) {
    checkSelectAll.addEventListener('change', async () => {
      const items = await PreShoppingStore.getPendingItems();
      for (const item of items) {
        if (item.checked !== checkSelectAll.checked) {
          await PreShoppingStore.updateItem(item.id, { checked: checkSelectAll.checked });
        }
      }
      await renderList();
    });
  }

  // Eliminar seleccionados
  const btnClearChecked = document.getElementById('btn-clear-checked');
  if (btnClearChecked) {
    btnClearChecked.addEventListener('click', async () => {
      const count = await PreShoppingStore.clearChecked();
      if (count > 0) {
        showToast(`Eliminados ${count} productos seleccionados`, 'secondary');
        await renderList();
      } else {
        showToast('No hay productos seleccionados para eliminar', 'warning');
      }
    });
  }

  // Vaciar pre-lista completa
  const btnClearAll = document.getElementById('btn-clear-all');
  if (btnClearAll) {
    btnClearAll.addEventListener('click', async () => {
      const confirmed = await confirmModal(
        '¿Vaciar Pre-lista?',
        'Se eliminarán todos los productos pendientes de la pre-lista.'
      );
      if (!confirmed) return;
      await PreShoppingStore.clearAllPending();
      showToast('Pre-lista vaciada', 'secondary');
      await renderList();
    });
  }

  // Chips de inicio rápido (Empty state)
  const chips = document.querySelectorAll('.starter-chip');
  chips.forEach(chip => {
    chip.addEventListener('click', async () => {
      const name = chip.getAttribute('data-name');
      if (name) {
        await PreShoppingStore.addItem({ name, source: 'manual' });
        showToast(`➕ Añadido: ${name}`, 'success');
        await renderList();
      }
    });
  });
}

function initVoice() {
  const btnVoice = document.getElementById('btn-voice-dictate');
  const btnStopVoice = document.getElementById('btn-stop-voice');
  const panelStatus = document.getElementById('voice-status-panel');
  const interimText = document.getElementById('voice-interim-text');

  if (!btnVoice) return;

  if (!isSpeechRecognitionSupported()) {
    btnVoice.title = 'Dictado por voz no compatible con este navegador';
    btnVoice.classList.add('opacity-50');
    btnVoice.addEventListener('click', () => {
      showToast('El dictado por voz no está disponible en este navegador.', 'warning');
    });
    return;
  }

  try {
    activeSpeechRecognizer = createSpeechRecognizer({
      onStart: () => {
        isRecordingVoice = true;
        btnVoice.classList.add('mic-recording');
        if (panelStatus) panelStatus.classList.remove('d-none');
        if (interimText) interimText.textContent = 'Habla ahora...';
      },
      onResult: async (text, isFinal) => {
        if (interimText) interimText.textContent = `"${text}"`;
        if (isFinal && text.trim()) {
          const parsed = parseShoppingText(text);
          if (parsed.length > 0) {
            await PreShoppingStore.addBulkItems(parsed, 'voice');
            showToast(`🎙️ Añadido(s) ${parsed.length} producto(s) por voz`, 'success');
            await renderList();
          }
        }
      },
      onError: (err) => {
        console.warn('Speech error:', err);
        showToast(`Error de micrófono: ${err.error || 'no detectado'}`, 'danger');
        stopVoiceUI();
      },
      onEnd: () => {
        stopVoiceUI();
      }
    });

    btnVoice.addEventListener('click', () => {
      if (isRecordingVoice) {
        activeSpeechRecognizer.stop();
        stopVoiceUI();
      } else {
        activeSpeechRecognizer.start();
      }
    });

    if (btnStopVoice) {
      btnStopVoice.addEventListener('click', () => {
        if (activeSpeechRecognizer) activeSpeechRecognizer.stop();
        stopVoiceUI();
      });
    }
  } catch (e) {
    console.warn('Failed to init speech:', e);
  }

  function stopVoiceUI() {
    isRecordingVoice = false;
    btnVoice.classList.remove('mic-recording');
    if (panelStatus) panelStatus.classList.add('d-none');
  }
}

function initPasteModal() {
  const btnOpen = document.getElementById('btn-open-paste-modal');
  const textarea = document.getElementById('paste-textarea');
  const countEl = document.getElementById('paste-detected-count');
  const btnConfirm = document.getElementById('btn-confirm-paste');

  if (btnOpen) {
    btnOpen.addEventListener('click', () => {
      if (textarea) textarea.value = '';
      if (countEl) countEl.textContent = '0';
      if (pasteModalInstance) pasteModalInstance.show();
    });
  }

  if (textarea && countEl) {
    textarea.addEventListener('input', () => {
      const parsed = parseShoppingText(textarea.value);
      countEl.textContent = parsed.length;
    });
  }

  if (btnConfirm && textarea) {
    btnConfirm.addEventListener('click', async () => {
      const text = textarea.value.trim();
      if (!text) {
        showToast('El texto está vacío', 'warning');
        return;
      }
      const parsed = parseShoppingText(text);
      if (parsed.length === 0) {
        showToast('No se detectaron productos válidos en el texto', 'warning');
        return;
      }

      await PreShoppingStore.addBulkItems(parsed, 'paste');
      if (pasteModalInstance) pasteModalInstance.hide();
      showToast(`📋 ${parsed.length} productos añadidos a la pre-lista`, 'success');
      await renderList();
    });
  }
}

function initConversionActions() {
  const btnConvertList = document.getElementById('btn-convert-to-shopping-list');
  const btnConvertCart = document.getElementById('btn-convert-to-cart');

  if (btnConvertList) {
    btnConvertList.addEventListener('click', async () => {
      try {
        const items = await PreShoppingStore.getPendingItems();
        const selected = items.filter(i => i.checked);
        if (selected.length === 0) {
          showToast('Selecciona al menos un producto para la lista', 'warning');
          return;
        }

        const dateStr = new Date().toLocaleDateString();
        const listName = `Compra ${dateStr}`;
        const confirmed = await confirmModal(
          `¿Convertir ${selected.length} productos seleccionados en la Lista de Compra activa? Podrás tacharlos o escanearlos en el Carrito.`,
          '🛒 Crear Lista de la Compra Activa'
        );
        if (!confirmed) return;

        const { listId, count } = await PreShoppingStore.promoteToShoppingList(listName);
        showToast(`¡Lista activa creada con ${count} productos! Redirigiendo...`, 'success');

        setTimeout(() => {
          window.location.hash = '#grid';
        }, 800);
      } catch (e) {
        showToast(e.message, 'danger');
      }
    });
  }

  if (btnConvertCart) {
    btnConvertCart.addEventListener('click', async () => {
      try {
        const items = await PreShoppingStore.getPendingItems();
        const selected = items.filter(i => i.checked);
        if (selected.length === 0) {
          showToast('Selecciona al menos un producto para volcar al carro', 'warning');
          return;
        }

        const confirmed = await confirmModal(
          `¿Pasar ${selected.length} productos directamente al Carrito de la compra actual?`,
          '⚡ Volcar al Carrito'
        );
        if (!confirmed) return;

        const { count } = await PreShoppingStore.promoteToCart();
        showToast(`¡${count} productos añadidos al Carrito! Redirigiendo...`, 'success');

        setTimeout(() => {
          window.location.hash = '#grid';
        }, 800);
      } catch (e) {
        showToast(e.message, 'danger');
      }
    });
  }
}

async function renderList() {
  const container = document.getElementById('prelist-container');
  const emptyState = document.getElementById('prelist-empty');
  const conversionBar = document.getElementById('conversion-bar');
  const toolsBar = document.getElementById('prelist-tools-bar');
  const badgePending = document.getElementById('badge-pending-count');
  const countSelected = document.getElementById('count-selected');
  const summaryReady = document.getElementById('summary-ready-count');
  const checkSelectAll = document.getElementById('check-select-all');

  if (!container) return;

  const items = await PreShoppingStore.getPendingItems();
  const total = items.length;
  const selectedCount = items.filter(i => i.checked).length;

  if (badgePending) badgePending.textContent = total;
  if (countSelected) countSelected.textContent = selectedCount;
  if (summaryReady) summaryReady.textContent = `${selectedCount} productos seleccionados`;

  if (checkSelectAll) {
    checkSelectAll.checked = total > 0 && selectedCount === total;
    checkSelectAll.indeterminate = selectedCount > 0 && selectedCount < total;
  }

  if (total === 0) {
    container.innerHTML = '';
    if (emptyState) emptyState.classList.remove('d-none');
    if (conversionBar) conversionBar.classList.add('d-none');
    if (toolsBar) toolsBar.classList.add('d-none');
    return;
  }

  if (emptyState) emptyState.classList.add('d-none');
  if (conversionBar) conversionBar.classList.remove('d-none');
  if (toolsBar) toolsBar.classList.remove('d-none');

  const sourceBadges = {
    voice: '<span class="badge bg-danger-subtle text-danger border border-danger-subtle source-badge">🎙️ Voz</span>',
    paste: '<span class="badge bg-info-subtle text-info border border-info-subtle source-badge">📋 Pegado</span>',
    manual: '<span class="badge bg-secondary-subtle text-light border border-secondary-subtle source-badge">✏️ Manual</span>',
    recurring: '<span class="badge bg-warning-subtle text-warning border border-warning-subtle source-badge">🔄 Repetición</span>',
    pantry: '<span class="badge bg-primary-subtle text-primary border border-primary-subtle source-badge">🥫 Despensa</span>',
    recipe: '<span class="badge bg-success-subtle text-success border border-success-subtle source-badge">📖 Receta</span>'
  };

  container.innerHTML = items.map(item => {
    const badge = sourceBadges[item.source] || sourceBadges.manual;
    const isChecked = item.checked ? 'checked' : '';
    const unitText = item.unit ? `<small class="text-muted ms-1">${escapeHtml(item.unit)}</small>` : '';

    return `
      <div class="list-group-item bg-dark text-white border-secondary p-2 prelist-item d-flex align-items-center justify-content-between gap-2" id="item-${item.id}">
        <div class="d-flex align-items-center gap-2 flex-grow-1 overflow-hidden">
          <input class="form-check-input mt-0 flex-shrink-0" type="checkbox"
                 id="check-item-${item.id}"
                 ${isChecked}
                 onchange="window.togglePrelistItem(${item.id})">
          
          <div class="text-truncate flex-grow-1">
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <span class="fw-semibold text-light user-select-all" id="name-${item.id}" style="cursor: pointer;"
                    onclick="window.startRenamePrelistItem(${item.id}, '${escapeHtml(item.name).replace(/'/g, "\\'")}')">
                ${escapeHtml(item.name)}
              </span>
              ${badge}
            </div>
          </div>
        </div>

        <div class="d-flex align-items-center gap-1 flex-shrink-0">
          <button class="btn btn-outline-secondary btn-sm py-0 px-2 text-white"
                  title="Restar 1"
                  onclick="window.changePrelistAmount(${item.id}, -1)">−</button>
          <span class="badge bg-dark border border-secondary px-2 py-1 text-white fs-6">
            ${item.amount}${unitText}
          </span>
          <button class="btn btn-outline-secondary btn-sm py-0 px-2 text-white"
                  title="Sumar 1"
                  onclick="window.changePrelistAmount(${item.id}, 1)">+</button>
          
          <button class="btn btn-outline-danger btn-sm py-0 px-2 ms-1"
                  title="Eliminar de la pre-lista"
                  onclick="window.removePrelistItem(${item.id})">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Global window helpers para eventos en línea ─────────────────────────────

window.togglePrelistItem = async function(id) {
  await PreShoppingStore.toggleCheck(id);
  await renderList();
};

window.changePrelistAmount = async function(id, delta) {
  const item = await db.preShoppingList.get(id);
  if (!item) return;
  const newAmount = Math.max(1, (parseFloat(item.amount) || 1) + delta);
  await PreShoppingStore.updateItem(id, { amount: newAmount });
  await renderList();
};

window.removePrelistItem = async function(id) {
  await PreShoppingStore.deleteItem(id);
  await renderList();
};

window.startRenamePrelistItem = function(id, currentName) {
  const nameEl = document.getElementById(`name-${id}`);
  if (!nameEl) return;

  const current = currentName || nameEl.textContent.trim();
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'form-control form-control-sm bg-secondary text-white border-info d-inline-block';
  input.style.maxWidth = '220px';
  input.value = current;

  const save = async () => {
    const val = input.value.trim();
    if (val && val !== current) {
      await PreShoppingStore.updateItem(id, { name: val });
    }
    await renderList();
  };

  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      input.removeEventListener('blur', save);
      save();
    } else if (e.key === 'Escape') {
      input.removeEventListener('blur', save);
      renderList();
    }
  });

  nameEl.replaceWith(input);
  input.focus();
  input.select();
};
