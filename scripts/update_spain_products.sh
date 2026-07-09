#!/usr/bin/env bash
# =============================================================================
#  update_spain_products.sh
#  Descarga el volcado oficial de OpenFoodFacts y genera spain_products.csv.gz
#  con únicamente los productos cuyo campo countries_tags contiene 'en:spain'.
#
#  Uso:
#    chmod +x scripts/update_spain_products.sh
#    ./scripts/update_spain_products.sh
#
#  Requisitos: curl, gzip/zcat, awk  (disponibles por defecto en cualquier Linux)
# =============================================================================

set -euo pipefail

# ── Configuración ─────────────────────────────────────────────────────────────
readonly OFF_URL="https://openfoodfacts-ds.s3.eu-west-3.amazonaws.com/en.openfoodfacts.org.products.csv.gz"
readonly OUTPUT_FILE="$(dirname "$0")/../src/public/spain_products.tsv.zz"
readonly TMP_FILE="$(mktemp /tmp/off_spain_XXXXXX.csv.gz)"


# ── Colores para el terminal ───────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

log()  { echo -e "${CYAN}[OFF]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC}  $*"; }
warn() { echo -e "${YELLOW}[!!]${NC}  $*"; }
err()  { echo -e "${RED}[ERR]${NC} $*" >&2; exit 1; }

# ── Dependencias ───────────────────────────────────────────────────────────────
for cmd in curl gzip awk node; do
  command -v "$cmd" &>/dev/null || err "Falta la herramienta: $cmd"
done

# Limpiar tmp si el script se interrumpe
trap 'rm -f "$TMP_FILE"' EXIT

# ── Descarga ───────────────────────────────────────────────────────────────────
log "Descargando volcado de OpenFoodFacts (puede tardar varios minutos)..."
log "Origen: ${OFF_URL}"

curl \
  --location \
  --fail \
  --silent \
  --show-error \
  --progress-bar \
  --output "$TMP_FILE" \
  "$OFF_URL"

ok "Descarga completada. Tamaño: $(du -sh "$TMP_FILE" | cut -f1)"

# ── Filtrado: sólo productos de España ────────────────────────────────────────
log "Filtrando productos de España... (esto puede tardar 1-5 minutos)"

# El fichero es TSV (separado por tabuladores).
# awk detecta en tiempo real qué columna es 'countries_tags' y filtra.
FILTER_RESULT=$(
  zcat "$TMP_FILE" \
    | awk -F'\t' '
        BEGIN {
          split("code url product_name brands ingredients_text image_url image_ingredients_url image_nutrition_url nutriscore_grade nova_group categories_tags energy-kcal_100g proteins_100g carbohydrates_100g fat_100g fiber_100g sugars_100g salt_100g", wanted, " ")
        }
        NR == 1 {
          for (i = 1; i <= NF; i++) {
            if ($i == "countries_tags") col = i
            for (w in wanted) {
               if ($i == wanted[w]) keep[i] = 1
            }
          }
          if (!col) { print "ERROR: columna countries_tags no encontrada" > "/dev/stderr"; exit 1 }
          
          # Print header
          out = ""
          for (i = 1; i <= NF; i++) {
            if (i in keep) out = out (out=="" ? "" : "\t") $i
          }
          print out
          next
        }
        $col ~ /en:spain/ {
          out = ""
          for (i = 1; i <= NF; i++) {
            if (i in keep) out = out (out=="" ? "" : "\t") $i
          }
          print out
        }
        NR % 100000 == 0 { printf "\r  [awk] Líneas procesadas: %d ...", NR > "/dev/stderr" }
      ' \
    | node -e "process.stdin.pipe(require('zlib').createDeflate()).pipe(process.stdout)" > "$OUTPUT_FILE"
  echo $?
)

echo "" # salto de línea tras el contador

if [[ "${FILTER_RESULT}" != "0" ]] && [[ -n "${FILTER_RESULT}" ]]; then
  err "El filtrado falló (código: ${FILTER_RESULT})"
fi

# ── Resultado ─────────────────────────────────────────────────────────────────
if [[ ! -f "$OUTPUT_FILE" ]] || [[ ! -s "$OUTPUT_FILE" ]]; then
  err "El archivo de salida está vacío o no existe: $OUTPUT_FILE"
fi

FINAL_SIZE=$(du -sh "$OUTPUT_FILE" | cut -f1)
ok "¡Completado!"
echo ""
echo -e "  📦 Archivo generado : ${GREEN}$(realpath "$OUTPUT_FILE")${NC}"
echo -e "  📊 Tamaño final     : ${GREEN}${FINAL_SIZE}${NC}"
echo ""
warn "Recuerda recargar la app en el navegador para que IndexedDB use los nuevos datos."
