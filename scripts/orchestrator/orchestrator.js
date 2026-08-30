import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { generateSpeechForScene } from './tts_engine.js';
import { muxVideoAndAudio } from './muxer.js';

import { chapter1Data } from './chapters/chapter_1.js';
import { chapter2Data } from './chapters/chapter_2.js';
import { chapter3Data } from './chapters/chapter_3.js';
import { chapter4Data } from './chapters/chapter_4.js';
import { chapter5Data } from './chapters/chapter_5.js';
import { chapter6Data } from './chapters/chapter_6.js';
import { chapter7Data } from './chapters/chapter_7.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

const CHAPTER_REGISTRY = {
  1: chapter1Data,
  2: chapter2Data,
  3: chapter3Data,
  4: chapter4Data,
  5: chapter5Data,
  6: chapter6Data,
  7: chapter7Data
};

import { spawn } from 'child_process';

let devServerProcess = null;

async function ensureServerRunning(baseURL = 'https://localhost:8080') {
  try {
    const res = await fetch(`${baseURL}/#home`, { signal: AbortSignal.timeout(1500) });
    if (res) return;
  } catch (_) {}

  console.log(`🚀 [Server] Iniciando servidor local en ${baseURL}...`);
  devServerProcess = spawn('npx', ['vite', '--host', '0.0.0.0', '--port', '8080'], {
    cwd: ROOT_DIR,
    stdio: 'ignore',
    detached: true
  });
  devServerProcess.unref();

  // Esperar a que el servidor responda
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch(`${baseURL}/#home`, { signal: AbortSignal.timeout(1000) });
      if (res) {
        console.log(`   ✅ Servidor Vite listo en ${baseURL}`);
        return;
      }
    } catch (_) {}
  }
}

/**
 * Inicializa la base de datos local y carga datos de prueba para asegurar que todas
 * las vistas tengan productos y elementos visuales listos para la demostración.
 */
async function initializeAppDatabase(page, baseURL) {
  try {
    await page.goto(`${baseURL}/#home`);
    await page.waitForTimeout(800);

    // Cargar pack mediterráneo para que haya recetas completas
    const packBtn = await page.$('#btn-import-mediterranean-pack');
    if (packBtn) {
      await packBtn.click();
      await page.waitForTimeout(300);
      const confirmBtn = await page.$('#btn-global-confirm');
      if (confirmBtn) {
        await confirmBtn.click();
        await page.waitForTimeout(800);
      }
    }
  } catch (err) {
    console.log(`ℹ️ [DB Setup] Nota de inicialización: ${err.message}`);
  }
}

/**
 * Procesa la producción completa de un capítulo
 */
async function processChapter(chapterNum, options = {}) {
  const chapterData = CHAPTER_REGISTRY[chapterNum];
  if (!chapterData) {
    console.error(`❌ El Capítulo ${chapterNum} no está registrado.`);
    return false;
  }

  const outputDir = path.join(ROOT_DIR, `docs/tutorials/capitulo_${chapterNum}/output`);
  const audioDir = path.join(outputDir, 'audio_clips');
  const rawVideoDir = path.join(outputDir, 'raw_video');

  // Limpiar directorios previos
  if (fs.existsSync(rawVideoDir)) {
    fs.rmSync(rawVideoDir, { recursive: true, force: true });
  }
  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(rawVideoDir, { recursive: true });

  console.log(`\n======================================================`);
  console.log(`🎬 INICIANDO PRODUCCIÓN DE VÍDEO — CAPÍTULO ${chapterNum}`);
  console.log(`📌 Título: ${chapterData.title}`);
  console.log(`======================================================\n`);

  // 1. GENERACIÓN DE LOCUCIÓN Y AUDIO
  console.log(`🎙️ [FASE 1/3] Sintetizando locuciones y calculando duraciones...`);
  const audioFiles = [];
  const sceneDurations = [];
  const voice = options.voice || 'es-ES-AlvaroNeural';

  for (let i = 0; i < chapterData.scenes.length; i++) {
    const scene = chapterData.scenes[i];
    const audioPath = path.join(audioDir, `scene_${i + 1}.mp3`);
    console.log(`   🗣️ [Escena ${i + 1}/${chapterData.scenes.length}] "${scene.title}"`);

    const result = await generateSpeechForScene(scene.narration, audioPath, voice);
    audioFiles.push(result.outputPath);
    sceneDurations.push(result.durationMs);
    console.log(`      ⏱️ Duración: ${(result.durationMs / 1000).toFixed(2)}s (Motor: ${result.engine})`);
  }

  // 2. GRABACIÓN DE INTERFAZ CON PLAYWRIGHT
  console.log(`\n📹 [FASE 2/3] Coreografiando navegación y grabando en 1080p...`);
  const baseURL = options.baseURL || 'https://localhost:8080';
  await ensureServerRunning(baseURL);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors', '--use-fake-ui-for-media-stream']
  });

  const context = await browser.newContext({
    baseURL: baseURL,
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
    permissions: ['camera', 'clipboard-read', 'clipboard-write'],
    recordVideo: {
      dir: rawVideoDir,
      size: { width: 1920, height: 1080 }
    }
  });

  const page = await context.newPage();

  // Configurar listeners
  page.on('dialog', dialog => dialog.accept());

  // Preparar BD inicial
  await initializeAppDatabase(page, baseURL);

  const timeline = [];
  let currentAccumulatedMs = 0;

  // Inicio de la coreografía
  for (let i = 0; i < chapterData.scenes.length; i++) {
    const scene = chapterData.scenes[i];
    const durationMs = sceneDurations[i];
    const startMs = currentAccumulatedMs;
    const endMs = startMs + durationMs;

    timeline.push({
      id: scene.id,
      title: scene.title,
      narration: scene.narration,
      startMs,
      endMs
    });

    console.log(`   ▶️ Ejecutando [${i + 1}/${chapterData.scenes.length}]: ${scene.title} (~${(durationMs / 1000).toFixed(1)}s)...`);

    const startTime = Date.now();
    try {
      await scene.action(page, durationMs);
    } catch (actionErr) {
      console.warn(`      ⚠️ Aviso en acción de escena ${i + 1}: ${actionErr.message}`);
    }

    // Asegurar sincronización exacta con la pista de audio
    const elapsed = Date.now() - startTime;
    const remainingWait = durationMs - elapsed;
    if (remainingWait > 50) {
      await page.waitForTimeout(remainingWait);
    }

    currentAccumulatedMs = endMs;
  }

  // Pequeña pausa final para cierre fluido
  await page.waitForTimeout(1000);

  const video = page.video();
  await page.close();
  await context.close();
  await browser.close();

  // 3. POSTPRODUCCIÓN Y MULTIPLEXADO FFMPEG
  console.log(`\n🎞️ [FASE 3/3] Multiplexando vídeo MP4 1080p, audio y subtítulos SRT...`);
  const rawVideoPath = await video.path();
  console.log(`   ✅ Vídeo grabado: ${rawVideoPath}`);

  const finalVideoPath = path.join(outputDir, `capitulo_${chapterNum}_masterclass.mp4`);
  const finalSrtPath = path.join(outputDir, `capitulo_${chapterNum}_subtitulos.srt`);

  const muxResult = muxVideoAndAudio({
    rawVideoPath,
    audioFiles,
    timeline,
    outputPath: finalVideoPath,
    srtPath: finalSrtPath
  });

  console.log(`\n✨ ======================================================`);
  console.log(`🎉 CAPÍTULO ${chapterNum} COMPLETADO CON ÉXITO!`);
  console.log(`📹 Vídeo Final: ${muxResult.videoOutput} (${muxResult.durationSeconds.toFixed(2)}s)`);
  console.log(`💬 Subtítulos:  ${muxResult.srtOutput}`);
  console.log(`🎵 Audio Master: ${muxResult.masterAudio}`);
  console.log(`======================================================\n`);

  return true;
}

// CLI Runner
async function runCLI() {
  const args = process.argv.slice(2);
  let chapterArg = null;
  let runAll = false;
  let baseURL = 'https://localhost:8080';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--chapter' && args[i + 1]) {
      chapterArg = parseInt(args[i + 1], 10);
    }
    if (args[i] === '--all') {
      runAll = true;
    }
    if (args[i] === '--url' && args[i + 1]) {
      baseURL = args[i + 1];
    }
  }

  if (runAll) {
    for (const ch of Object.keys(CHAPTER_REGISTRY)) {
      await processChapter(parseInt(ch, 10), { baseURL });
    }
  } else if (chapterArg) {
    await processChapter(chapterArg, { baseURL });
  } else {
    // Por defecto procesar Capítulo 1
    await processChapter(1, { baseURL });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCLI().catch(err => {
    console.error('❌ Error en el orquestador:', err);
    process.exit(1);
  });
}
