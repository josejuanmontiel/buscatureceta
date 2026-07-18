#!/bin/bash

# Este script lanza la aplicación web Vite con soporte para HTTPS
# El plugin @vitejs/plugin-basic-ssl ya está configurado en vite.config.js
# Usamos --host para que la aplicación sea accesible en la red local
npm run start -- --host
