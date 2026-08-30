/**
 * demoData.js
 * Módulo para sembrar datos de demostración limpios y realistas en NutriAgenda
 * Permite a nuevos usuarios explorar el flujo completo de inmediato.
 */
import { db } from '../../db/schema.js';
import * as RecipeStore from '../recipes/RecipeStore.js';
import * as PantryStore from '../pantry/PantryStore.js';
import * as ShoppingStore from '../shopping/ShoppingStore.js';

export const DEMO_PRODUCTS = [
  {
    code: '8480000123456',
    product_name: 'Aceite de Oliva Virgen Extra 1L',
    brands: 'Hacendado',
    categories_tags: ['en:plant-based-foods-and-beverages', 'en:plant-based-foods', 'en:fats', 'en:plant-fats', 'en:vegetable-oils', 'en:olive-oils', 'en:extra-virgin-olive-oils', 'en:plant-oils'],
    nutriments: {
      'energy-kcal_100g': 900,
      'proteins_100g': 0,
      'carbohydrates_100g': 0,
      'fat_100g': 100,
      'fiber_100g': 0,
      'salt_100g': 0
    },
    nutriscore_grade: 'c',
    nova_group: 2
  },
  {
    code: '8480000654321',
    product_name: 'Huevos Camperos Clase M (Docena)',
    brands: 'Granja Real',
    categories_tags: ['en:dairies', 'en:eggs'],
    nutriments: {
      'energy-kcal_100g': 143,
      'proteins_100g': 12.5,
      'carbohydrates_100g': 0.7,
      'fat_100g': 9.5,
      'fiber_100g': 0,
      'salt_100g': 0.3
    },
    nutriscore_grade: 'a',
    nova_group: 1
  },
  {
    code: '8480000789012',
    product_name: 'Pechuga de Pollo Fileteada 500g',
    brands: 'Cárnicas del Valle',
    categories_tags: ['en:meats', 'en:poultries', 'en:chickens', 'en:chicken-breasts'],
    nutriments: {
      'energy-kcal_100g': 120,
      'proteins_100g': 22.5,
      'carbohydrates_100g': 0,
      'fat_100g': 2.6,
      'fiber_100g': 0,
      'salt_100g': 0.12
    },
    nutriscore_grade: 'a',
    nova_group: 1
  },
  {
    code: '8480000345678',
    product_name: 'Arroz Integral 1kg',
    brands: 'BioNatur',
    categories_tags: ['en:plant-based-foods', 'en:cereals-and-potatoes', 'en:cereals-and-their-products', 'en:whole-grain-foods', 'en:rices', 'en:brown-rices'],
    nutriments: {
      'energy-kcal_100g': 350,
      'proteins_100g': 7.5,
      'carbohydrates_100g': 74,
      'fat_100g': 2.8,
      'fiber_100g': 3.5,
      'salt_100g': 0.01
    },
    nutriscore_grade: 'a',
    nova_group: 1
  },
  {
    code: '8480000901234',
    product_name: 'Tomate Frito con Aceite de Oliva 400g',
    brands: 'Mata',
    categories_tags: ['en:plant-based-foods', 'en:canned-foods', 'en:canned-plant-based-foods', 'en:canned-vegetables', 'en:tomatoes-and-their-products', 'en:canned-tomatoes', 'en:fried-tomatoes'],
    nutriments: {
      'energy-kcal_100g': 78,
      'proteins_100g': 1.4,
      'carbohydrates_100g': 8.5,
      'fat_100g': 4.2,
      'fiber_100g': 1.2,
      'salt_100g': 0.9
    },
    nutriscore_grade: 'b',
    nova_group: 3
  },
  {
    code: '8480000567890',
    product_name: 'Copos de Avena Suaves 500g',
    brands: 'Kölln',
    categories_tags: ['en:plant-based-foods', 'en:cereals-and-potatoes', 'en:cereals-and-their-products', 'en:whole-grain-foods', 'en:rolled-oats'],
    nutriments: {
      'energy-kcal_100g': 370,
      'proteins_100g': 13.5,
      'carbohydrates_100g': 58,
      'fat_100g': 7.0,
      'fiber_100g': 10.0,
      'salt_100g': 0.02
    },
    nutriscore_grade: 'a',
    nova_group: 1
  },
  {
    code: '8480000432109',
    product_name: 'Lentejas Pardinas Cocidas 400g',
    brands: 'Luengo',
    categories_tags: ['en:plant-based-foods', 'en:legumes', 'en:pulses', 'en:cooked-legumes', 'en:lentils'],
    nutriments: {
      'energy-kcal_100g': 92,
      'proteins_100g': 7.1,
      'carbohydrates_100g': 11.5,
      'fat_100g': 0.6,
      'fiber_100g': 4.8,
      'salt_100g': 0.7
    },
    nutriscore_grade: 'a',
    nova_group: 1
  },
  {
    code: '8480000987654',
    product_name: 'Plátanos de Canarias (Bolsa 1kg)',
    brands: 'Plátano de Canarias',
    categories_tags: ['en:plant-based-foods', 'en:fruits', 'en:bananas', 'en:fresh-fruits'],
    nutriments: {
      'energy-kcal_100g': 89,
      'proteins_100g': 1.1,
      'carbohydrates_100g': 20.0,
      'fat_100g': 0.3,
      'fiber_100g': 2.6,
      'salt_100g': 0.01
    },
    nutriscore_grade: 'a',
    nova_group: 1
  }
];

export async function seedDemoData() {
  console.log('[DemoData] Sembrando datos de demostración...');

  // 1. Guardar productos en BD
  await db.products.bulkPut(DEMO_PRODUCTS);

  // 2. Stock inicial en Despensa (Pantry)
  await db.pantry.clear();
  await PantryStore.addStock('8480000123456', 1000, 'ml', 'food');
  await PantryStore.addStock('8480000654321', 12, 'unidad', 'food');
  await PantryStore.addStock('8480000789012', 500, 'g', 'food');
  await PantryStore.addStock('8480000345678', 1000, 'g', 'food');
  await PantryStore.addStock('8480000567890', 500, 'g', 'food');

  // 3. Recetas de ejemplo
  const existingRecipes = await db.recipes.toArray();
  if (existingRecipes.length === 0) {
    // Receta 1: Arroz con Pollo Saludable
    await RecipeStore.createRecipe({
      name: 'Arroz con Pollo Saludable',
      servings: 2,
      instructions: '1. Cocer el arroz integral.\n2. Dorar la pechuga en una sartén con aceite de oliva.\n3. Mezclar todo y servir templado.',
      tags: ['almuerzo', 'saludable', 'facil'],
      ingredients: [
        { productCode: '8480000345678', productName: 'Arroz Integral 1kg', amount: 150, unit: 'g' },
        { productCode: '8480000789012', productName: 'Pechuga de Pollo Fileteada 500g', amount: 250, unit: 'g' },
        { productCode: '8480000123456', productName: 'Aceite de Oliva Virgen Extra 1L', amount: 15, unit: 'ml' }
      ]
    });

    // Receta 2: Tortilla Española
    await RecipeStore.createRecipe({
      name: 'Tortilla Rápida de Huevos Camperos',
      servings: 2,
      instructions: '1. Batir 4 huevos camperos.\n2. Cuajar en sartén antiadherente con un chorrito de AOVE.\n3. Servir jugosa.',
      tags: ['cena', 'rapida', 'proteina'],
      ingredients: [
        { productCode: '8480000654321', productName: 'Huevos Camperos Clase M (Docena)', amount: 4, unit: 'unidad' },
        { productCode: '8480000123456', productName: 'Aceite de Oliva Virgen Extra 1L', amount: 10, unit: 'ml' }
      ]
    });

    // Receta 3: Porridge de Avena y Plátano
    await RecipeStore.createRecipe({
      name: 'Bowl de Avena y Plátano',
      servings: 1,
      instructions: '1. Calentar la avena con agua o leche.\n2. Añadir el plátano cortado en rodajas.',
      tags: ['desayuno', 'energia', 'fibra'],
      ingredients: [
        { productCode: '8480000567890', productName: 'Copos de Avena Suaves 500g', amount: 60, unit: 'g' },
        { productCode: '8480000987654', productName: 'Plátanos de Canarias (Bolsa 1kg)', amount: 120, unit: 'g' }
      ]
    });
  }

  // 4. Entradas en Diario (Agenda) para hoy
  const today = new Date().toISOString().slice(0, 10);
  const existingToday = await db.diary.where({ date: today }).toArray();
  if (existingToday.length === 0) {
    await db.diary.add({
      date: today,
      mealType: 'breakfast',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      context: { notes: 'Desayuno energético con avena' },
      items: [
        {
          type: 'product',
          productCode: '8480000567890',
          name: 'Copos de Avena Suaves 500g',
          servings: 1,
          nutrition: {
            kcal: 185,
            proteins_g: 6.75,
            carbs_g: 29,
            fat_g: 3.5,
            fiber_g: 5.0,
            sugars_g: 0.5,
            salt_g: 0.01
          }
        },
        {
          type: 'product',
          productCode: '8480000987654',
          name: 'Plátanos de Canarias (Bolsa 1kg)',
          servings: 1,
          nutrition: {
            kcal: 89,
            proteins_g: 1.1,
            carbs_g: 20,
            fat_g: 0.3,
            fiber_g: 2.6,
            sugars_g: 12.0,
            salt_g: 0.01
          }
        }
      ]
    });

    await db.diary.add({
      date: today,
      mealType: 'lunch',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      context: { notes: 'Almuerzo completo con arroz y pollo' },
      items: [
        {
          type: 'product',
          productCode: '8480000345678',
          name: 'Arroz Integral 1kg',
          servings: 1,
          nutrition: {
            kcal: 280,
            proteins_g: 6.0,
            carbs_g: 59.2,
            fat_g: 2.2,
            fiber_g: 2.8,
            sugars_g: 0.2,
            salt_g: 0.01
          }
        },
        {
          type: 'product',
          productCode: '8480000789012',
          name: 'Pechuga de Pollo Fileteada 500g',
          servings: 1,
          nutrition: {
            kcal: 180,
            proteins_g: 33.7,
            carbs_g: 0,
            fat_g: 3.9,
            fiber_g: 0,
            sugars_g: 0,
            salt_g: 0.18
          }
        }
      ]
    });
  }

  console.log('[DemoData] Datos de prueba cargados con éxito.');
  return true;
}

/**
 * Importa el catálogo de 12 recetas mediterráneas reales con resolución Smart Match
 * @returns {Promise<number>} Número de recetas importadas
 */
export async function seedMediterraneanPack() {
  const { resolveIngredientSmart } = await import('../products/PrimaryFoodStore.js');
  const NutritionCalc = await import('../nutrition/NutritionCalculator.js');

  let res = await fetch('/data/mediterranean_recipes.json');
  if (!res.ok) res = await fetch('./data/mediterranean_recipes.json');
  if (!res.ok) throw new Error(`HTTP ${res.status} al cargar mediterranean_recipes.json`);
  const pack = await res.json();

  let importedCount = 0;
  for (const item of pack) {
    const resolvedIngredients = [];
    for (const ing of (item.ingredients || [])) {
      if (ing.productCode) {
        resolvedIngredients.push(ing);
      } else {
        const match = await resolveIngredientSmart(ing.name || ing.productName);
        resolvedIngredients.push({
          productCode: match ? match.code : null,
          productName: match ? match.product_name : (ing.name || ing.productName),
          amount: ing.amount || 100,
          unit: ing.unit || 'g'
        });
      }
    }

    const servings = item.servings || 2;
    const nutritionPerServing = item.nutritionPerServing || 
      await NutritionCalc.calculateRecipeNutritionPerServing(resolvedIngredients, servings);

    await RecipeStore.createRecipe({
      name: item.name,
      servings,
      description: item.description || '',
      instructions: item.instructions || '',
      tags: item.tags || ['mediterránea'],
      ingredients: resolvedIngredients,
      nutritionPerServing
    });
    importedCount++;
  }

  console.log(`[DemoData] ${importedCount} recetas mediterráneas importadas con éxito.`);
  return importedCount;
}

