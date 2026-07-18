import * as BackupStore from './modules/backup/BackupStore.js';
import { showToast, confirmModal } from './modules/ui/UI.js';

export async function initView() {
  document.getElementById('btn-export').addEventListener('click', handleExport);
  document.getElementById('btn-import').addEventListener('click', handleImport);
}

async function handleExport() {
  const btn = document.getElementById('btn-export');
  const originalText = btn.textContent;
  
  try {
    btn.disabled = true;
    btn.textContent = 'Generando backup...';
    
    const jsonString = await BackupStore.exportData();
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    
    // Generar nombre de archivo con fecha
    const dateStr = new Date().toISOString().split('T')[0];
    a.download = `nutriagenda_backup_${dateStr}.json`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Copia de seguridad descargada con éxito.');
  } catch (err) {
    console.error('Error al exportar:', err);
    showToast('Error al exportar: ' + err.message, 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function handleImport() {
  const fileInput = document.getElementById('import-file');
  const file = fileInput.files[0];
  
  if (!file) {
    showToast('Por favor, selecciona un archivo .json para restaurar.', 'warning');
    return;
  }

  if (!(await confirmModal('¿Estás seguro de que quieres sobrescribir tus datos actuales con este backup? ESTA ACCIÓN ES IRREVERSIBLE.', 'Restaurar Copia'))) {
    return;
  }

  const btn = document.getElementById('btn-import');
  const originalText = btn.textContent;

  try {
    btn.disabled = true;
    btn.textContent = 'Restaurando...';

    const text = await file.text();
    await BackupStore.importData(text);
    
    showToast('Copia de seguridad restaurada correctamente. La página se recargará.');
    setTimeout(() => window.location.reload(), 1500);
  } catch (err) {
    console.error('Error al restaurar:', err);
    showToast('Error al restaurar la copia de seguridad.\nDetalles: ' + err.message, 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
    fileInput.value = '';
  }
}
