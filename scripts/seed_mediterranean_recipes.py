#!/usr/bin/env python3
"""
seed_mediterranean_recipes.py — Inserta 12 recetas mediterráneas reales en Mealie y genera src/data/mediterranean_recipes.json
"""

import os, sys, json, re, urllib.request, urllib.error
from pathlib import Path

MEALIE_URL = os.environ.get("MEALIE_BASE_URL", "http://localhost:9925").rstrip("/")
MEALIE_API_KEY = os.environ.get(
    "MEALIE_API_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsb25nX3Rva2VuIjp0cnVlLCJpZCI6IjY0NTVhZGM5LWIzYzktNGQ4Yy1hOTMwLWIxM2JmNDY2MTkzOCIsIm5hbWUiOiJzb2NpYWwtdG8tbWVhbGllIiwiaW50ZWdyYXRpb25faWQiOiJnZW5lcmljIiwiZXhwIjoxOTQ1NzcxNTg5fQ.C7N3ZF-INvDcU70BiPxOxx4pFDPYL8yTLqDUJORGksY"
)

RECETAS_MEDITERRANEAS = [
    # ─── DESAYUNOS ───
    {
        "name": "Tostada de Tomate, AOVE y Jamón Ibérico",
        "category": "desayuno",
        "servings": 1,
        "description": "El desayuno mediterráneo por excelencia: pan tostado con tomate maduro rallado, aceite de oliva virgen extra y jamón ibérico de bellota.",
        "instructions": (
            "1. Tostar la rebanada de pan hasta que quede crujiente y dorada.\n"
            "2. Rallar el tomate maduro con un rallador fino y añadirle una pizca de sal marina.\n"
            "3. Untar ligeramente el ajo en la superficie del pan aún caliente si se desea un toque aromático.\n"
            "4. Extender el tomate rallado generosamente sobre la tostada.\n"
            "5. Rociar con un buen chorro de aceite de oliva virgen extra.\n"
            "6. Colocar las lonchas finas de jamón ibérico por encima y servir de inmediato."
        ),
        "tags": ["mediterránea", "desayuno", "fácil", "tradicional", "rápido"],
        "ingredients": [
            {"name": "Pan integral", "amount": 60, "unit": "g"},
            {"name": "Tomate maduro", "amount": 100, "unit": "g"},
            {"name": "Aceite de oliva virgen extra", "amount": 15, "unit": "g"},
            {"name": "Jamón ibérico", "amount": 40, "unit": "g"},
            {"name": "Ajo", "amount": 3, "unit": "g"}
        ]
    },
    {
        "name": "Porridge de Avena con Manzana, Nueces y Miel",
        "category": "desayuno",
        "servings": 1,
        "description": "Desayuno energético con carbohidratos complejos, grasas saludables omega-3 y fibra soluble beneficiosa para el colesterol.",
        "instructions": (
            "1. En un cazo pequeño, calentar la leche o bebida vegetal a fuego medio junto con la canela.\n"
            "2. Añadir los copos de avena y remover suavemente durante 4-5 minutos hasta que espese y adquiera una textura cremosa.\n"
            "3. Cortar la manzana en dados pequeños o láminas finas.\n"
            "4. Verter la avena en un bol, coronar con los dados de manzana, las nueces picadas y un hilo de miel cruda."
        ),
        "tags": ["mediterránea", "desayuno", "avena", "saludable", "fibra"],
        "ingredients": [
            {"name": "Copos de avena", "amount": 50, "unit": "g"},
            {"name": "Leche entera", "amount": 200, "unit": "ml"},
            {"name": "Manzana", "amount": 100, "unit": "g"},
            {"name": "Nueces", "amount": 20, "unit": "g"},
            {"name": "Canela", "amount": 2, "unit": "g"},
            {"name": "Miel", "amount": 10, "unit": "g"}
        ]
    },
    {
        "name": "Huevos Revueltos con Espinacas Frescas y Feta",
        "category": "desayuno",
        "servings": 1,
        "description": "Desayuno proteico y rico en hierro, luteína y calcio con espinacas salteadas y queso feta desmenuzado.",
        "instructions": (
            "1. En una sartén antiadherente, calentar el aceite de oliva a fuego medio.\n"
            "2. Añadir las espinacas frescas y saltear durante 1-2 minutos hasta que reduzcan su volumen.\n"
            "3. Batir los huevos con una pizca de sal marina y pimienta negra recién molida.\n"
            "4. Verter los huevos batidos en la sartén y remover suavemente a fuego bajo con una espátula.\n"
            "5. Antes de que cuajen por completo, retirar del fuego y esparcir el queso feta desmenuzado por encima."
        ),
        "tags": ["mediterránea", "desayuno", "huevos", "proteico", "sin gluten"],
        "ingredients": [
            {"name": "Huevo de gallina", "amount": 120, "unit": "g"},
            {"name": "Espinacas frescas", "amount": 100, "unit": "g"},
            {"name": "Queso feta", "amount": 30, "unit": "g"},
            {"name": "Aceite de oliva virgen extra", "amount": 10, "unit": "g"},
            {"name": "Sal", "amount": 2, "unit": "g"}
        ]
    },

    # ─── COMIDAS / ALMUERZOS ───
    {
        "name": "Gazpacho Andaluz Tradicional",
        "category": "comida",
        "servings": 4,
        "description": "Sopa fría andaluza repleta de antioxidantes, licopeno y vitamina C. Hidratante, refrescante y 100% natural.",
        "instructions": (
            "1. Lavar muy bien los tomates, el pepino y el pimiento verde.\n"
            "2. Trocear los tomates maduros, el pepino pelado parcialmente y el pimiento sin semillas.\n"
            "3. Pelar el diente de ajo y retirarle el germen central para suavizar el sabor.\n"
            "4. Colocar todas las hortalizas en el vaso de la batidora junto con el pan duro, el vinagre de Jerez y la sal.\n"
            "5. Triturar a máxima potencia durante 3 minutos hasta obtener una textura completamente lisa.\n"
            "6. Con la batidora en marcha a velocidad media, incorporar el aceite de oliva virgen extra en hilo para emulsionar.\n"
            "7. Refrigerar al menos 2 horas antes de servir bien frío."
        ),
        "tags": ["mediterránea", "comida", "gazpacho", "vegano", "sin cocción", "antioxidantes"],
        "ingredients": [
            {"name": "Tomate maduro", "amount": 600, "unit": "g"},
            {"name": "Pepino", "amount": 100, "unit": "g"},
            {"name": "Pimiento verde", "amount": 70, "unit": "g"},
            {"name": "Ajo", "amount": 5, "unit": "g"},
            {"name": "Aceite de oliva virgen extra", "amount": 40, "unit": "g"},
            {"name": "Vinagre", "amount": 15, "unit": "ml"},
            {"name": "Pan", "amount": 30, "unit": "g"},
            {"name": "Sal", "amount": 4, "unit": "g"}
        ]
    },
    {
        "name": "Lentejas Estofadas con Verduras de la Huerta",
        "category": "comida",
        "servings": 4,
        "description": "Guiso tradicional de legumbres con alto contenido en fibra, hierro y carbohidratos de absorción lenta.",
        "instructions": (
            "1. Picar finamente la cebolla, el pimiento rojo, la zanahoria y el ajo.\n"
            "2. En una cazuela, calentar el aceite de oliva virgen extra y pochar las verduras a fuego medio durante 8 minutos.\n"
            "3. Añadir el tomate rallado y sofreír 3 minutos más.\n"
            "4. Incorporar la cucharadita de pimentón dulce de la Vera, remover rápido para que no se queme y añadir las lentejas.\n"
            "5. Cubrir con agua o caldo de verduras (unos 800ml), añadir la hoja de laurel y una pizca de sal.\n"
            "6. Cocinar a fuego lento durante 35-40 minutos hasta que las lentejas estén tiernas y el caldo espeso."
        ),
        "tags": ["mediterránea", "comida", "legumbres", "vegano", "hierro", "guiso"],
        "ingredients": [
            {"name": "Lentejas", "amount": 250, "unit": "g"},
            {"name": "Cebolla", "amount": 120, "unit": "g"},
            {"name": "Zanahoria", "amount": 120, "unit": "g"},
            {"name": "Pimiento rojo", "amount": 80, "unit": "g"},
            {"name": "Tomate", "amount": 100, "unit": "g"},
            {"name": "Ajo", "amount": 10, "unit": "g"},
            {"name": "Aceite de oliva virgen extra", "amount": 25, "unit": "g"},
            {"name": "Pimentón dulce", "amount": 4, "unit": "g"},
            {"name": "Sal", "amount": 4, "unit": "g"}
        ]
    },
    {
        "name": "Salmón al Horno con Verduras Mediterráneas y Romero",
        "category": "comida",
        "servings": 2,
        "description": "Plato rico en ácidos grasos Omega-3 cardio-protectores y vitaminas antioxidantes de las verduras asadas.",
        "instructions": (
            "1. Precalentar el horno a 190°C con calor arriba y abajo.\n"
            "2. Cortar el calabacín en rodajas finas y los tomates cherry por la mitad.\n"
            "3. Disponer las verduras en una bandeja de horno, salpimentar y regar con la mitad del aceite de oliva.\n"
            "4. Hornear las verduras durante 10 minutos.\n"
            "5. Colocar los lomos de salmón fresco sobre el lecho de verduras, añadir las rodajas de limón, el romero y el resto del aceite.\n"
            "6. Hornear durante 12-14 minutos adicionales hasta que el salmón esté en su punto jugoso."
        ),
        "tags": ["mediterránea", "comida", "pescado", "omega3", "horno", "saludable"],
        "ingredients": [
            {"name": "Salmón", "amount": 300, "unit": "g"},
            {"name": "Calabacín", "amount": 200, "unit": "g"},
            {"name": "Tomate", "amount": 150, "unit": "g"},
            {"name": "Aceite de oliva virgen extra", "amount": 20, "unit": "g"},
            {"name": "Limón", "amount": 30, "unit": "g"},
            {"name": "Romero", "amount": 2, "unit": "g"},
            {"name": "Sal", "amount": 3, "unit": "g"}
        ]
    },
    {
        "name": "Pollo al Ajillo con Patatas Panaderas",
        "category": "comida",
        "servings": 2,
        "description": "Un clásico de la cocina española: pechuga o contramuslos de pollo dorados con ajos enteros, vino blanco y perejil fresco.",
        "instructions": (
            "1. Cortar las patatas en rodajas finas (panaderas) y pocharlas en una sartén con un poco de aceite hasta que estén tiernas.\n"
            "2. En otra sartén amplia, dorar los dientes de ajo enteros y ligeramente chafados en el aceite de oliva a fuego medio.\n"
            "3. Retirar los ajos cuando estén dorados y reservar.\n"
            "4. En el mismo aceite a fuego vivo, dorar los trozos de pechuga de pollo salpimentados hasta sellarlos.\n"
            "5. Reincorporar los ajos, verter el vino blanco y dejar reducir 5 minutos para evaporar el alcohol.\n"
            "6. Espolvorear perejil fresco picado y servir con las patatas panaderas."
        ),
        "tags": ["mediterránea", "comida", "pollo", "proteico", "tradicional"],
        "ingredients": [
            {"name": "Pechuga de pollo", "amount": 350, "unit": "g"},
            {"name": "Patata", "amount": 250, "unit": "g"},
            {"name": "Ajo", "amount": 20, "unit": "g"},
            {"name": "Aceite de oliva virgen extra", "amount": 25, "unit": "g"},
            {"name": "Perejil fresco", "amount": 5, "unit": "g"},
            {"name": "Sal", "amount": 4, "unit": "g"}
        ]
    },
    {
        "name": "Garbanzos Salteados con Espinacas y Pimentón",
        "category": "comida",
        "servings": 2,
        "description": "Receta andaluza clásica de cuchara ligera: garbanzos cocidos salteados con espinacas, ajo frito y toque de pimentón de la Vera.",
        "instructions": (
            "1. En una sartén amplia, dorar los ajos laminados en el aceite de oliva virgen extra.\n"
            "2. Añadir las espinacas frescas y saltear durante 2 minutos hasta que pierdan volumen.\n"
            "3. Agregar los garbanzos cocidos y bien escurridos.\n"
            "4. Espolvorear el pimentón dulce de la Vera, el comino molido y la sal.\n"
            "5. Saltear todo junto a fuego medio-alto durante 5 minutos para que se integren los sabores."
        ),
        "tags": ["mediterránea", "comida", "legumbres", "vegano", "rápido", "fibra"],
        "ingredients": [
            {"name": "Garbanzos", "amount": 300, "unit": "g"},
            {"name": "Espinacas frescas", "amount": 200, "unit": "g"},
            {"name": "Ajo", "amount": 10, "unit": "g"},
            {"name": "Aceite de oliva virgen extra", "amount": 20, "unit": "g"},
            {"name": "Pimentón dulce", "amount": 3, "unit": "g"},
            {"name": "Sal", "amount": 3, "unit": "g"}
        ]
    },

    # ─── MERIENDAS ───
    {
        "name": "Hummus Casero con Bastones de Zanahoria y Pepino",
        "category": "merienda",
        "servings": 2,
        "description": "Crema untable de garbanzos y sésamo acompañada de vegetales crudos crujientes. Rica en proteínas vegetales y fibra.",
        "instructions": (
            "1. Enjuagar y escurrir los garbanzos cocidos.\n"
            "2. En el vaso de la batidora, colocar los garbanzos, el diente de ajo pelado, el zumo de limón, el aceite de oliva, el comino y la sal.\n"
            "3. Triturar a velocidad alta hasta obtener una pasta suave y homogénea (añadir 1-2 cucharadas de agua fría si se desea más ligera).\n"
            "4. Lavar y pelar las zanahorias y el pepino, y cortarlos en bastones alargados.\n"
            "5. Servir el hummus en un cuenco con un hilo de AOVE y los bastones de verdura para dipear."
        ),
        "tags": ["mediterránea", "merienda", "vegano", "snack", "sin cocción", "proteína vegetal"],
        "ingredients": [
            {"name": "Garbanzos", "amount": 250, "unit": "g"},
            {"name": "Aceite de oliva virgen extra", "amount": 20, "unit": "g"},
            {"name": "Limón", "amount": 20, "unit": "g"},
            {"name": "Ajo", "amount": 4, "unit": "g"},
            {"name": "Zanahoria", "amount": 150, "unit": "g"},
            {"name": "Pepino", "amount": 150, "unit": "g"},
            {"name": "Sal", "amount": 2, "unit": "g"}
        ]
    },
    {
        "name": "Yogur Griego con Nueces, Frutos Rojos y Chía",
        "category": "merienda",
        "servings": 1,
        "description": "Merienda saciante con probióticos naturales, antioxidantes (antocianinas) y ácidos grasos esenciales.",
        "instructions": (
            "1. Verter el yogur griego natural en un bol.\n"
            "2. Lavar los arándanos o frutos rojos y colocarlos sobre el yogur.\n"
            "3. Añadir las nueces troceadas y espolvorear las semillas de chía.\n"
            "4. Si se desea un toque dulce natural, endulzar con una cucharadita de miel pura."
        ),
        "tags": ["mediterránea", "merienda", "probióticos", "antioxidantes", "rápido"],
        "ingredients": [
            {"name": "Yogur natural", "amount": 200, "unit": "g"},
            {"name": "Nueces", "amount": 25, "unit": "g"},
            {"name": "Arándanos", "amount": 80, "unit": "g"},
            {"name": "Semillas de chía", "amount": 10, "unit": "g"},
            {"name": "Miel", "amount": 10, "unit": "g"}
        ]
    },

    # ─── CENAS ───
    {
        "name": "Ensalada Caprese Mediterránea con Albahaca Fresca",
        "category": "cena",
        "servings": 2,
        "description": "Cena fresca, ligera y equilibrada con tomate maduro, mozzarella fresca, hojas de albahaca y aceite de oliva virgen extra.",
        "instructions": (
            "1. Lavar y cortar los tomates maduros en rodajas de medio centímetro de grosor.\n"
            "2. Cortar la bola de mozzarella fresca en rodajas del mismo grosor.\n"
            "3. En un plato plano, alternar rodajas de tomate y de mozzarella en forma circular.\n"
            "4. Colocar hojas de albahaca fresca limpia entre las rodajas.\n"
            "5. Sazonar con sal marina en escamas y rociar con un chorro generoso de aceite de oliva virgen extra y vinagre."
        ),
        "tags": ["mediterránea", "cena", "ligero", "sin cocción", "vegetariano"],
        "ingredients": [
            {"name": "Tomate maduro", "amount": 300, "unit": "g"},
            {"name": "Queso mozzarella", "amount": 125, "unit": "g"},
            {"name": "Aceite de oliva virgen extra", "amount": 20, "unit": "g"},
            {"name": "Albahaca fresca", "amount": 10, "unit": "g"},
            {"name": "Sal", "amount": 2, "unit": "g"}
        ]
    },
    {
        "name": "Crema Suave de Calabacín, Puerro y AOVE",
        "category": "cena",
        "servings": 2,
        "description": "Cena reconfortante y depurativa, muy baja en calorías y rica en agua, potasio y fibra soluble.",
        "instructions": (
            "1. Limpiar el puerro y cortarlo en rodajas. Lavar el calabacín y cortarlo en dados (con piel para conservar nutrientes).\n"
            "2. En una olla, rehogar el puerro con el aceite de oliva virgen extra durante 5 minutos a fuego medio.\n"
            "3. Añadir los dados de calabacín y la patata pelada y troceada.\n"
            "4. Cubrir con agua o caldo vegetal justo al ras de las verduras y sazonar con sal y pimienta.\n"
            "5. Cocinar a fuego medio durante 18-20 minutos hasta que la patata esté muy tierna.\n"
            "6. Triturar con la batidora hasta obtener una crema fina y aterciopelada."
        ),
        "tags": ["mediterránea", "cena", "crema", "depurativo", "vegano", "ligero"],
        "ingredients": [
            {"name": "Calabacín", "amount": 400, "unit": "g"},
            {"name": "Puerro", "amount": 150, "unit": "g"},
            {"name": "Patata", "amount": 100, "unit": "g"},
            {"name": "Aceite de oliva virgen extra", "amount": 20, "unit": "g"},
            {"name": "Sal", "amount": 3, "unit": "g"}
        ]
    }
]


def mealie_api_request(method: str, path: str, body=None):
    headers = {
        "Authorization": f"Bearer {MEALIE_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    url = f"{MEALIE_URL}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            content = resp.read().decode("utf-8")
            return json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        raise RuntimeError(f"Mealie API {method} {path} HTTP {e.code}: {err_msg}")


def subir_a_mealie(receta: dict):
    import unicodedata
    def slugify(text):
        text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('utf-8')
        return re.sub(r'[^a-zA-Z0-9]+', '-', text.lower()).strip('-')

    expected_slug = slugify(receta["name"])
    
    # Comprobar si ya existe
    base_recipe = None
    slug = expected_slug
    try:
        base_recipe = mealie_api_request("GET", f"/api/recipes/{slug}")
    except Exception:
        # No existe, crear
        try:
            res = mealie_api_request("POST", "/api/recipes", {"name": receta["name"]})
            slug = res if isinstance(res, str) else res.get("slug") or res.get("name")
            base_recipe = mealie_api_request("GET", f"/api/recipes/{slug}")
        except Exception as e:
            raise RuntimeError(f"Error creando {receta['name']}: {e}")

    # Ingredientes
    mealie_ingredients = []
    for ing in receta.get("ingredients", []):
        amount = ing.get("amount", 100)
        unit = ing.get("unit", "g")
        name = ing.get("name", "")
        note_text = f"{amount}{unit} {name}".strip()
        mealie_ingredients.append({
            "quantity": float(amount),
            "unit": None,
            "food": None,
            "note": note_text,
            "display": note_text,
            "title": None,
            "originalText": note_text,
            "referenceId": None
        })

    # Instrucciones
    steps = [s.strip() for s in receta.get("instructions", "").split("\n") if s.strip()]
    mealie_instructions = [{"title": "", "summary": "", "text": s, "ingredientReferences": []} for s in steps]

    # Partial update via PATCH
    patch_body = {
        "description": receta.get("description", ""),
        "recipeServings": receta.get("servings", 2),
        "recipeIngredient": mealie_ingredients,
        "recipeInstructions": mealie_instructions
    }

    mealie_api_request("PATCH", f"/api/recipes/{slug}", patch_body)
    return slug


def main():
    print(f"🚀 Sembrando {len(RECETAS_MEDITERRANEAS)} recetas mediterráneas...")
    print(f"📡 Conectando con Mealie en {MEALIE_URL}...")

    uploaded = 0
    for r in RECETAS_MEDITERRANEAS:
        try:
            slug = subir_a_mealie(r)
            uploaded += 1
            print(f"  ✅ [{uploaded}/{len(RECETAS_MEDITERRANEAS)}] Creada en Mealie: {r['name']} (slug: {slug})")
        except Exception as e:
            print(f"  ⚠️ Error subiendo {r['name']} a Mealie: {e}")

    # Guardar en src/data/mediterranean_recipes.json
    out_path = Path(__file__).resolve().parent.parent / "src" / "data" / "mediterranean_recipes.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(RECETAS_MEDITERRANEAS, indent=2, ensure_ascii=False))
    print(f"\n📦 Archivo guardado con éxito en: {out_path}")
    print(f"🎉 Proceso completado: {uploaded} recetas en Mealie y {len(RECETAS_MEDITERRANEAS)} en el pack JSON.")


if __name__ == "__main__":
    main()
