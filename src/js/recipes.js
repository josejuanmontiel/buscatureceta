import { Modal } from 'bootstrap';
import { db } from './db/schema.js';
import * as RecipeStore from './modules/recipes/RecipeStore.js';
import * as NutritionCalc from './modules/nutrition/NutritionCalculator.js';

let recipeModal;
let currentIngredients = [];

document.addEventListener('DOMContentLoaded', async () => {
  recipeModal = new Modal(document.getElementById('recipeModal'));
  
  await loadRecipes();

  document.getElementById('recipe-search').addEventListener('input', (e) => {
    loadRecipes(e.target.value);
  });

  document.getElementById('btn-new-recipe').addEventListener('click', () => {
    window.location.href = 'recipe-editor.html';
  });
});

async function loadRecipes(query = '') {
  const recipes = await RecipeStore.searchRecipes(query);
  const container = document.getElementById('recipes-list');
  
  if (recipes.length === 0) {
    container.innerHTML = `<div class="col-12 text-center mt-5"><p class="text-muted">No tienes recetas guardadas.</p></div>`;
    return;
  }

  container.innerHTML = recipes.map(recipe => `
    <div class="col-md-6 col-lg-4 mb-4">
      <div class="card bg-secondary text-white recipe-card h-100">
        <div class="card-body" onclick="window.location.href='recipe-editor.html?id=${recipe.id}'" style="cursor:pointer;">
          <h5 class="card-title">${recipe.name}</h5>
          <h6 class="card-subtitle mb-2 text-light">${recipe.servings} raciones · v${recipe.version || 1}</h6>
          <p class="card-text nutrition-summary">
            ${recipe.nutritionPerServing ?
              `${recipe.nutritionPerServing.kcal} kcal | P: ${recipe.nutritionPerServing.proteins_g}g | C: ${recipe.nutritionPerServing.carbs_g}g | G: ${recipe.nutritionPerServing.fat_g}g` :
              'Nutrición no calculada'}
          </p>
          <div class="mt-2">
            ${recipe.ingredients.slice(0, 3).map(i => `<span class="badge bg-dark me-1">${i.productName}</span>`).join('')}
            ${recipe.ingredients.length > 3 ? `<span class="badge bg-dark">...</span>` : ''}
          </div>
        </div>
        <div class="card-footer d-flex gap-2 bg-dark border-secondary">
          <a href="recipe-editor.html?id=${recipe.id}" class="btn btn-sm btn-outline-light flex-grow-1">✏️ Editar</a>
          <button class="btn btn-sm btn-outline-info" onclick="event.stopPropagation(); window._duplicateRecipe(${recipe.id})" title="Duplicar">📋</button>
          <button class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation(); window._deleteRecipe(${recipe.id})" title="Eliminar">🗑</button>
        </div>
      </div>
    </div>
  `).join('');
}

window.editRecipe = async function(id) {
  const recipe = await RecipeStore.getRecipeById(id);
  if (!recipe) return;

  document.getElementById('recipeModalTitle').innerText = 'Editar Receta';
  document.getElementById('recipe-id').value = recipe.id;
  document.getElementById('recipe-name').value = recipe.name;
  document.getElementById('recipe-servings').value = recipe.servings;
  
  currentIngredients = [...recipe.ingredients];
  updateIngredientList();
  
  recipeModal.show();
};

function openNewRecipeModal() {
  document.getElementById('recipeModalTitle').innerText = 'Nueva Receta';
  document.getElementById('recipe-form').reset();
  document.getElementById('recipe-id').value = '';
  currentIngredients = [];
  updateIngredientList();
  document.getElementById('product-search-results').style.display = 'none';
}

async function searchProduct() {
  const query = document.getElementById('ingredient-search').value.trim();
  if (!query) return;

  // Búsqueda simple en Dexie (empieza por código, o incluye nombre)
  let results = [];
  if (/^\d+$/.test(query)) {
    // Es código de barras
    const p = await db.products.get(query);
    if (p) results = [p];
  } else {
    // Es nombre (búsqueda parcial case-insensitive, max 20 resultados)
    const qLower = query.toLowerCase();
    results = await db.products
      .filter(p => p.product_name && p.product_name.toLowerCase().includes(qLower))
      .limit(20)
      .toArray();
  }

  const resultContainer = document.getElementById('product-search-results');
  if (results.length === 0) {
    resultContainer.innerHTML = '<div class="list-group-item">No se encontraron productos.</div>';
  } else {
    resultContainer.innerHTML = results.map(p => `
      <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
              onclick="window.addIngredient('${p.code}', '${p.product_name?.replace(/'/g, "\\'")}')">
        ${p.product_name || 'Sin nombre'} <small class="text-muted">${p.code}</small>
      </button>
    `).join('');
  }
  resultContainer.style.display = 'block';
}

window.addIngredient = function(code, name) {
  currentIngredients.push({
    productCode: code,
    productName: name || 'Producto ' + code,
    amount: 100,
    unit: 'g'
  });
  
  document.getElementById('ingredient-search').value = '';
  document.getElementById('product-search-results').style.display = 'none';
  updateIngredientList();
};

window.removeIngredient = function(index) {
  currentIngredients.splice(index, 1);
  updateIngredientList();
};

window.updateIngredientAmount = function(index, value) {
  currentIngredients[index].amount = parseFloat(value) || 0;
  updateNutritionPreview();
};

async function updateIngredientList() {
  const container = document.getElementById('ingredient-list');
  
  if (currentIngredients.length === 0) {
    container.innerHTML = '<li class="list-group-item text-muted">Aún no hay ingredientes</li>';
  } else {
    container.innerHTML = currentIngredients.map((ing, idx) => `
      <li class="list-group-item d-flex justify-content-between align-items-center">
        <div class="text-truncate" style="max-width: 50%;" title="${ing.productName}">${ing.productName}</div>
        <div class="d-flex align-items-center">
          <input type="number" class="form-control form-control-sm me-2" style="width: 80px;" 
                 value="${ing.amount}" onchange="window.updateIngredientAmount(${idx}, this.value)">
          <select class="form-select form-select-sm me-2" style="width: 70px;" disabled>
            <option value="g" ${ing.unit === 'g' ? 'selected' : ''}>g</option>
            <option value="ml" ${ing.unit === 'ml' ? 'selected' : ''}>ml</option>
          </select>
          <button type="button" class="btn btn-sm btn-outline-danger" onclick="window.removeIngredient(${idx})">X</button>
        </div>
      </li>
    `).join('');
  }
  
  await updateNutritionPreview();
}

async function updateNutritionPreview() {
  const servings = parseFloat(document.getElementById('recipe-servings').value) || 1;
  const preview = document.getElementById('nutrition-preview');
  
  if (currentIngredients.length === 0) {
    preview.innerHTML = 'Añade ingredientes para calcular la nutrición.';
    return;
  }

  const nutrition = await NutritionCalc.calculateRecipeNutritionPerServing(currentIngredients, servings);
  const formatted = NutritionCalc.formatNutritionForDisplay(nutrition);
  
  preview.innerHTML = `
    <div class="row text-center">
      <div class="col-3"><strong>${nutrition.kcal}</strong><br><small>kcal</small></div>
      <div class="col-3"><strong>${nutrition.proteins_g}g</strong><br><small>Prot</small></div>
      <div class="col-3"><strong>${nutrition.carbs_g}g</strong><br><small>Carb</small></div>
      <div class="col-3"><strong>${nutrition.fat_g}g</strong><br><small>Grasas</small></div>
    </div>
  `;
}

// Recalcular al cambiar raciones
document.getElementById('recipe-servings').addEventListener('change', updateNutritionPreview);

async function saveRecipe() {
  const id = document.getElementById('recipe-id').value;
  const name = document.getElementById('recipe-name').value.trim();
  const servings = parseFloat(document.getElementById('recipe-servings').value) || 1;
  
  if (!name) {
    alert("Por favor, introduce un nombre para la receta.");
    return;
  }

  const nutritionPerServing = await NutritionCalc.calculateRecipeNutritionPerServing(currentIngredients, servings);

  const data = {
    name,
    servings,
    ingredients: currentIngredients,
    nutritionPerServing
  };

  if (id) {
    await RecipeStore.updateRecipe(parseInt(id), data);
  } else {
    await RecipeStore.createRecipe(data);
  }

  recipeModal.hide();
  await loadRecipes();
}

// Eliminar receta desde la lista (con confirmación)
window._deleteRecipe = async function(id) {
  if (!confirm('¿Eliminar esta receta y todo su historial? Esta acción no se puede deshacer.')) return;
  await RecipeStore.deleteRecipe(id);
  await loadRecipes();
};

// Duplicar receta
window._duplicateRecipe = async function(id) {
  const recipe = await RecipeStore.getRecipeById(id);
  if (!recipe) return;

  const { id: _id, createdAt, updatedAt, version, ...data } = recipe;
  data.name = `${data.name} (Copia)`;
  
  await RecipeStore.createRecipe(data);
  await loadRecipes();
};

