import { Router } from './modules/core/Router.js';
import * as BackupStore from './modules/backup/BackupStore.js';

document.addEventListener('DOMContentLoaded', () => {
  const router = new Router({
    'index': { init: () => import('./index.js') },
    'grid': { init: () => import('./grid.js') },
    'pantry': { init: () => import('./pantry.js') },
    'recipes': { init: () => import('./recipes.js') },
    'recipe-editor': { init: () => import('./recipe-editor.js') },
    'diary': { init: () => import('./diary.js') },
    'meal-photos': { init: () => import('./meal-photos.js') },
    'dashboard': { init: () => import('./dashboard.js') },
    'db-viewer': { init: () => import('./db-viewer.js') },
    'settings': { init: () => import('./settings.js') }
  });

  router.start();
  checkSharedFiles();
});

async function checkSharedFiles() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('action') === 'share_received') {
    try {
      const file = await new Promise((resolve, reject) => {
        const request = indexedDB.open('nutriagenda-share', 1);
        request.onsuccess = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('files')) {
            resolve(null); return;
          }
          const tx = db.transaction('files', 'readonly');
          const getReq = tx.objectStore('files').get('shared-file');
          getReq.onsuccess = () => resolve(getReq.result);
          getReq.onerror = () => reject(getReq.error);
        };
        request.onerror = () => reject(request.error);
      });

      if (file) {
        console.log('[Share] File found in IDB:', file);
        setTimeout(async () => {
          console.log('[Share] Showing confirm dialog');
          const confirmMerge = confirm(`Has recibido un archivo de sincronización: ${file.name}.\n\n¿Deseas fusionar (merge) estos datos con tu base de datos actual?\n\n(Las recetas y despensa se actualizarán, tu agenda personal se mantendrá intacta)`);
          
          if (confirmMerge) {
            try {
              const text = await file.text();
              await BackupStore.mergeData(text);
              alert('Fusión completada con éxito.');
              window.history.replaceState({}, document.title, window.location.pathname);
              window.location.reload();
              return; // Evitar el clear si hay recarga rápida
            } catch (err) {
              console.error('Error al fusionar:', err);
              alert('Error al fusionar los datos: ' + err.message);
            }
          }
          
          // Clear the file
          const request = indexedDB.open('nutriagenda-share', 1);
          request.onsuccess = (e) => {
            const db = e.target.result;
            if (db.objectStoreNames.contains('files')) {
              const tx = db.transaction('files', 'readwrite');
              tx.objectStore('files').delete('shared-file');
            }
          };
          window.history.replaceState({}, document.title, window.location.pathname);
        }, 500);
      }
    } catch (err) {
      console.error('[Share] Error checking shared files:', err);
    }
  }
}

let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  // Update UI notify the user they can install the PWA
  const installBtn = document.getElementById('btn-install-app');
  if (installBtn) {
    installBtn.style.display = 'block';
    installBtn.addEventListener('click', async () => {
      // Hide the app provided install promotion
      installBtn.style.display = 'none';
      // Show the install prompt
      deferredPrompt.prompt();
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      // We've used the prompt, and can't use it again, throw it away
      deferredPrompt = null;
    });
  }
});

window.addEventListener('appinstalled', () => {
  // Hide the app-provided install promotion
  deferredPrompt = null;
  const installBtn = document.getElementById('btn-install-app');
  if (installBtn) {
    installBtn.style.display = 'none';
  }
  console.log('PWA was installed');
});
