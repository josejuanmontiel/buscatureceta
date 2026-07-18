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
