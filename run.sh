#!/bin/bash

# Este script compila la versión de producción en ./dist y la sirve
# imitando exactamente el despliegue de PRO (archivos generados en dist/).

echo "📦 Compilando versión de producción (dist)..."
npm run build

echo "🚀 Sirviendo versión de producción desde ./dist..."
npm run preview -- --host --port 8080
