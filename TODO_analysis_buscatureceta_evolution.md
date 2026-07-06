# 🥗 Evolución de buscatureceta → NutriAgenda

## El Proyecto Hoy

**buscatureceta** (antes OpenFoodFacts) es una PWA offline-first que:
- Carga el CSV de OpenFoodFacts Spain en IndexedDB del navegador
- Escanea códigos de barras con la cámara del móvil
- Muestra información nutricional e ingredientes del producto
- Permite construir listas de la compra con precios en tiempo real

**Stack actual:** Vite + Bootstrap + Tabulator + Papaparse + pako (descompresión gzip) + Dexie (IndexedDB)

---

## 🌍 Estado del Arte

### Apps comerciales líderes

| App | Enfoque clave | Diferenciador |
|---|---|---|
| **MyFitnessPal** | Todo en uno | 14M+ alimentos, barcode scan, restaurantes |
| **Cronometer** | Precisión micros | 80+ micronutrientes, datos USDA verificados |
| **MacroFactor** | Comportamiento | Modelo adaptativo no punitivo |
| **YAZIO AI** | UX | Recetas AI, planes semanales reordenables |
| **Fuel Nutrition** | Coaching IA | Logging conversacional, puntuación diaria |

### Tendencias 2024-2026

1. **Logging por foto/voz con IA** — ya no se teclea manualmente
2. **Inteligencia adaptativa** — los objetivos cambian según tendencia real del peso
3. **Calidad > Cantidad** — análisis de densidad nutricional, no solo calorías
4. **Local-first + privacidad** — tendencia a no depender de servidores externos
5. **Wearables integration** — ajuste calórico en función de actividad real

### Sistemas open-source/self-hosted relevantes

| Sistema | Fortaleza | Debilidad |
|---|---|---|
| **Mealie** | API REST excelente, comunidad activa, UI moderna | No tiene tracking nutricional diario nativo |
| **Tandoor** | Cálculo nutricional automático vía OpenFoodFacts | UI menos pulida, más compleja |
| **RecipeSage** | Tracking de macros por ración integrado | Menos extensible vía API |
| **Grocy** | Gestión de despensa + fechas de caducidad | No orientado a recetas/nutrición |

> **Insight clave:** Ninguna solución open-source combina bien el escáner de supermercado (tu punto fuerte actual) con el tracking de ingesta real y el análisis de *por qué no comes equilibrado*.

---

## 🎯 La Visión: De Scanner a NutriAgenda

Tu proyecto tiene una ventaja única: **el punto de entrada es la compra**, lo que permite trazar todo el ciclo:

```
Compra (escáner) → Despensa → Receta → Plato cocinado → Ingesta → Análisis
```

La mayoría de apps empiezan desde "qué comí hoy", perdiendo el contexto de por qué comes lo que comes.

---

## 🏗️ Arquitectura Propuesta

### Capas del sistema

```
┌─────────────────────────────────────────────────────────┐
│                    CAPA DE PRESENTACIÓN                  │
│  PWA Móvil (tu app actual, evolucionada)                 │
│  · Escáner · Despensa · Recetas · Agenda · Dashboard     │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                   CAPA DE DATOS LOCAL                    │
│  IndexedDB (Dexie) — offline-first                       │
│  · Productos OFF  · Despensa  · Recetas custom           │
│  · Registros de ingesta  · Métricas nutricionales        │
└────────────┬──────────────────────┬─────────────────────┘
             │                      │
┌────────────▼──────┐  ┌────────────▼──────────────────────┐
│  ADAPTADORES      │  │  ADAPTADORES EXTERNOS (opcionales) │
│  · OFF (local CSV)│  │  · Mealie API                     │
│  · OFF (API REST) │  │  · Tandoor API                    │
│                   │  │  · Custom recipe server           │
└───────────────────┘  └────────────────────────────────────┘
```

### Módulos nuevos a desarrollar

```
src/
├── modules/
│   ├── pantry/          # Despensa (ya existe parcialmente)
│   ├── recipes/         # Gestor de recetas (nuevo)
│   │   ├── local.js     # Recetas guardadas en IndexedDB
│   │   └── adapters/
│   │       ├── mealie.js
│   │       ├── tandoor.js
│   │       └── custom.js
│   ├── diary/           # Agenda de ingesta (nuevo - core)
│   │   ├── entry.js     # Registro de un plato/comida
│   │   └── scheduler.js # Planificación de comidas
│   ├── nutrition/       # Motor de cálculo nutricional
│   │   ├── calculator.js
│   │   └── goals.js
│   └── analytics/       # Estadísticas y patrones
│       ├── charts.js
│       └── insights.js  # ← El diferenciador clave
```

---

## 🔌 Integración con Sistemas de Recetas

### Estrategia: Adapter Pattern

Define una interfaz común para cualquier fuente de recetas:

```javascript
// Interface: RecipeAdapter
class RecipeAdapter {
  async search(query) { }       // buscar recetas
  async getById(id) { }         // obtener receta completa
  async getNutrition(recipe) { } // calcular nutrición
  async sync() { }              // sincronizar cambios
}
```

### Adaptador Mealie

Mealie tiene una API REST muy completa:
- `GET /api/recipes` — listar recetas
- `GET /api/recipes/{slug}` — detalle con ingredientes
- `GET /api-extras` — campos custom (puedes añadir tu tracking)

**Limitación:** Mealie no calcula nutrición automáticamente. Solución: cruzar sus ingredientes con tu base OFF local para calcularla tú.

### Adaptador Tandoor

Tandoor sí integra OpenFoodFacts nativamente y calcula macros por ración. Su API devuelve `nutritional_values` directamente. Más complejo de configurar pero más rico en datos.

### Recetas custom offline

Para el modo 100% offline, las recetas se almacenan en IndexedDB con estructura tipo:

```javascript
{
  id: "uuid",
  name: "Lentejas estofadas",
  servings: 4,
  ingredients: [
    { productBarcode: "8410036012046", amount: 200, unit: "g" },
    { productBarcode: "8480000123456", amount: 100, unit: "g" }
  ],
  source: "local" | "mealie" | "tandoor",
  externalId: "mealie-slug-or-tandoor-id"
}
```

---

## 📓 El Core: La Agenda de Ingesta

Esta es la pieza más importante y diferenciadora. Una **agenda de lo que comes** no es solo un diario: es el contexto de *cuándo, qué, cuánto y por qué*.

### Estructura de un registro de ingesta

```javascript
{
  id: "uuid",
  timestamp: "2026-07-06T14:30:00",
  mealType: "lunch",          // breakfast, lunch, dinner, snack
  entries: [
    {
      type: "recipe",          // "recipe" | "product" | "free"
      recipeId: "uuid",        // si es receta
      productBarcode: null,    // si es producto directo
      name: "Lentejas",        // nombre libre si es "free"
      servings: 1.5,           // raciones consumidas
      nutrition: {             // calculado al registrar
        kcal: 342,
        proteins: 18,
        carbs: 45,
        fats: 6,
        fiber: 12
      }
    }
  ],
  // Contexto (opcional, para analytics de comportamiento)
  context: {
    hunger_before: 7,          // 1-10
    fullness_after: 8,
    mood: "normal",
    ate_alone: true,
    ate_at_home: true,
    notes: ""
  }
}
```

### Vista de agenda

```
📅 Semana del 30 junio - 6 julio

          L   M   X   J   V   S   D
Desayuno  ✅  ✅  ⚠️  ✅  ❌  ✅  ✅
Comida    ✅  ✅  ✅  ⚠️  ✅  ✅  ✅
Cena      ✅  ❌  ✅  ✅  ✅  ✅  ⚠️

⚠️ = comida registrada pero nutrición desequilibrada
❌ = no registrado (posible no comida)
```

---

## 📊 Estadísticas y Analytics

### Nivel 1: Métricas básicas (fácil de implementar)

- Calorías diarias vs objetivo
- Macros (proteínas/carbohidratos/grasas) % sobre total
- Fibra, azúcares, sal por día
- Progresión semanal/mensual

### Nivel 2: Variedad alimentaria (el diferenciador real)

**El concepto clave:** en lugar de solo contar calorías, analizar la *diversidad* de lo que comes.

```javascript
// Grupos de alimentos según OFF categories
const foodGroups = {
  "legumes": ["lentejas", "garbanzos", "alubias"],
  "leafy-greens": ["espinacas", "lechuga", "acelgas"],
  "cruciferous": ["brócoli", "coliflor", "col"],
  "cereals-whole": ["avena", "arroz integral"],
  // ...
}

// Índice de diversidad semanal
function diversityScore(weekEntries) {
  const uniqueGroups = new Set(weekEntries.map(e => e.foodGroup))
  return uniqueGroups.size / totalFoodGroups.length
}
```

**Visualización:** Rueda de alimentos con sectores que se iluminan según lo que has comido esa semana.

### Nivel 3: Análisis de patrones y "¿por qué no comes X?"

Esta es la parte más ambiciosa y valiosa. La idea es detectar **brechas alimentarias** y correlacionarlas con contexto:

```
Insight automático: "Llevas 3 semanas sin comer legumbres"
Insight automático: "Los viernes sueles saltarte la cena"
Insight automático: "Tu ingesta de fibra cae un 40% en semanas de trabajo intenso"
```

**Cómo implementarlo:**
1. Detectar grupos de alimentos no comidos en X días
2. Detectar patrones temporales en los "huecos" del diario
3. Cruzar con el contexto de humor/hambre si se registra
4. Sugerir recetas específicas que cubran las carencias

### Nivel 4: Recomendaciones activas

```
🔔 "Esta semana te falta variedad de vegetales verdes"
   → [Ver recetas con espinacas] [Añadir a planificación]

🔔 "Llevas 5 días sin fuentes de omega-3"
   → [Ver recetas con pescado] [¿Qué tienes en la despensa?]
```

---

## 🗺️ Roadmap de Evolución

### Fase 1 — Recetas + Despensa (base)
> Prioridad alta, base para todo lo demás

- [ ] Gestor de recetas custom offline (ingredientes = productos OFF)
- [ ] Cálculo automático de nutrición por receta (desde IndexedDB OFF)
- [ ] Vista de despensa mejorada (qué tengo → qué puedo cocinar)
- [ ] Primer adaptador Mealie (solo lectura)

### Fase 2 — Agenda de ingesta
> El core de la nueva propuesta

- [ ] Modelo de datos de registro de ingesta en Dexie
- [ ] Vista de agenda semanal (calendario de comidas)
- [ ] Registro rápido: "He comido esta receta, X raciones"
- [ ] Registro rápido: "He comido este producto escaneado"
- [ ] Planificación de comidas futura

### Fase 3 — Dashboard nutricional
> Visualización y métricas

- [ ] Resumen diario de macros y calorías
- [ ] Gráfico de rueda de grupos de alimentos (variedad semanal)
- [ ] Histórico de tendencias (Chart.js o Recharts)
- [ ] Export de datos (CSV/JSON para privacidad)

### Fase 4 — Analytics e Insights
> El diferenciador clave

- [ ] Detección de brechas alimentarias (grupos no consumidos)
- [ ] Detección de patrones temporales (días/horas sin comer)
- [ ] Sistema de alertas/sugerencias proactivas
- [ ] Correlación contexto-ingesta (si se activa el registro de contexto)

### Fase 5 — Integraciones avanzadas
> Opcional según necesidades

- [ ] Adaptador Tandoor (con nutrición automática)
- [ ] Sincronización bidireccional con Mealie
- [ ] Import desde MyFitnessPal / Cronometer (CSV)
- [ ] Compartición P2P entre dispositivos (aprovechando lo de pingo)

---

## 💡 Ideas Diferenciadoras (que las apps comerciales no hacen bien)

### 1. "Mapa de lo que podrías comer" vs "lo que comiste"
En lugar de solo registro histórico, cruzar la despensa actual con las recetas disponibles para sugerir qué cocinar **basándose en lo que te falta nutricionalmente**.

### 2. "Score de equilibrio" basado en tu propio patrón
No compararte con tablas genéricas, sino detectar cuándo te desvías de **tu propio equilibrio habitual**. Si normalmente comes bien los lunes y mal los viernes, eso es tu baseline.

### 3. Ciclos de compra → ingesta
Como tienes el escáner de compra, puedes detectar: "compraste brócoli hace 5 días pero no lo has registrado como comido → ¿ya caducó? ¿No lo cocinaste?"

### 4. Privacidad radical
Todo en local, sin servidor, datos nunca salen del dispositivo. Esto es imposible de conseguir con MyFitnessPal o similares y es un argumento muy fuerte para ciertos usuarios.

### 5. Integración con tickets de compra (OCR)
Ya tenías esta idea en el README original. Con un motor OCR ligero (Tesseract.js) puedes escanear tickets y registrar automáticamente las compras sin código de barras, cerrando el ciclo completo.

---

## ⚠️ Riesgos y Consideraciones

> [!WARNING]
> **Calidad de datos nutricionales de OpenFoodFacts**: Los datos son crowdsourced y tienen variabilidad. Para un uso médico/clínico necesitarías validar contra AESAN (España) o USDA. Para uso personal/familiar es suficiente.

> [!NOTE]
> **Complejidad de UX del registro**: La principal causa de abandono en apps de tracking es la fricción del registro. Priorizar flujos ultra-rápidos (1-2 taps) antes que añadir campos de contexto opcionales.

> [!IMPORTANT]
> **La Fase 1 es el cuello de botella**: Sin un buen gestor de recetas que calcule nutrición, el resto no tiene datos con qué trabajar. Es la pieza fundamental a construir primero.

---

## 🔧 Stack Tecnológico Sugerido

| Necesidad | Opción recomendada | Alternativa |
|---|---|---|
| BD local | **Dexie 4** (ya la tenéis) | PouchDB (si necesitas sync) |
| Gráficas | **Chart.js** (ligero, compatible) | Apache ECharts |
| Calendario/Agenda | **FullCalendar** (lite) | Custom con CSS Grid |
| Nutrición | **Cálculo propio desde OFF CSV** | API Nutritionix |
| Recetas externas | **Mealie API** (self-hosted) | Tandoor API |
| OCR tickets | **Tesseract.js** (offline) | — |
| Compartición | **WebRTC/PeerJS** (de pingo) | — |

---

## Preguntas Abiertas

Antes de priorizar el desarrollo, sería útil clarificar:

1. **¿Tienes o planeas tener Mealie/Tandoor instalado?** O prefieres empezar con un gestor de recetas 100% interno.
2. **¿El foco es individual o familiar?** Cambia cómo diseñar las raciones y el tracking.
3. **¿Qué tan importante es el contexto comportamental?** (registrar humor, hambre, contexto de la comida) — esto añade valor analítico pero aumenta la fricción del usuario.
4. **¿Privacidad absoluta (solo local) o aceptas algún backend ligero?** Un backend propio (incluso en local con un servidor node simple) abre muchas más posibilidades de sync y análisis.
