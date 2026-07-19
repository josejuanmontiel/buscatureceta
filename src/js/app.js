import { Router } from './modules/core/Router.js';

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
});

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
