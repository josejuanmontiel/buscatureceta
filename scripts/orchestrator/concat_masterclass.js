import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function parseSrtTime(timeStr) {
  const [hms, mmm] = timeStr.split(',');
  const [h, m, s] = hms.split(':').map(Number);
  return (h * 3600 + m * 60 + s) * 1000 + Number(mmm);
}

function formatSrtTime(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mmm = Math.floor(ms % 1000);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(mmm, 3)}`;
}

export function concatMasterclass() {
  const tutorialsDir = path.join(ROOT_DIR, 'docs/tutorials');
  if (!fs.existsSync(tutorialsDir)) {
    fs.mkdirSync(tutorialsDir, { recursive: true });
  }

  const concatListPath = path.join(tutorialsDir, 'masterclass_video_concat.txt');
  const finalVideoPath = path.join(tutorialsDir, 'masterclass_completa_nutriagenda.mp4');
  const finalSrtPath = path.join(tutorialsDir, 'masterclass_completa_subtitulos.srt');
  const youtubeDescPath = path.join(tutorialsDir, 'YOUTUBE_DESCRIPCION.md');

  const videoListLines = [];
  const chaptersMeta = [];
  let currentAccumulatedSeconds = 0;
  let srtBlockIndex = 1;
  let unifiedSrtContent = '';

  const chapterTitles = {
    1: "Introducción & Filosofía Offline-First",
    2: "Supermercado Inteligente & Alertas de Aditivos (E250)",
    3: "De la Cesta a la Cocina: Checkout y Despensa",
    4: "Editor de Recetas & Análisis Nutricional de Macros",
    5: "NutriAgenda, Planificación y Registro Fotográfico",
    6: "Dashboard de Salud & Explorador OpenFoodFacts"
  };

  console.log(`\n======================================================`);
  console.log(`🎬 CONCATENANDO MASTERCLASS COMPLETA — NUTRIAGENDA`);
  console.log(`======================================================\n`);

  for (let ch = 1; ch <= 6; ch++) {
    const chOutputDir = path.join(tutorialsDir, `capitulo_${ch}/output`);
    const mp4Path = path.join(chOutputDir, `capitulo_${ch}_masterclass.mp4`);
    const srtPath = path.join(chOutputDir, `capitulo_${ch}_subtitulos.srt`);

    if (!fs.existsSync(mp4Path)) {
      console.warn(`⚠️ Capítulo ${ch} no encontrado en ${mp4Path}, omitiendo...`);
      continue;
    }

    const durationProbe = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${mp4Path}"`,
      { encoding: 'utf8' }
    ).trim();
    const duration = parseFloat(durationProbe) || 0;

    chaptersMeta.push({
      chapter: ch,
      title: chapterTitles[ch] || `Capítulo ${ch}`,
      startTimeFormatted: formatTime(currentAccumulatedSeconds),
      startSeconds: currentAccumulatedSeconds,
      duration: duration
    });

    videoListLines.push(`file '${path.resolve(mp4Path)}'`);

    // Procesar y desplazar subtítulos SRT
    if (fs.existsSync(srtPath)) {
      const srtRaw = fs.readFileSync(srtPath, 'utf8');
      const blocks = srtRaw.split(/\n\s*\n/).filter(b => b.trim().length > 0);
      const offsetMs = Math.round(currentAccumulatedSeconds * 1000);

      for (const block of blocks) {
        const lines = block.split('\n');
        if (lines.length >= 2 && lines[1].includes('-->')) {
          const [startStr, endStr] = lines[1].split('-->').map(s => s.trim());
          const newStartMs = parseSrtTime(startStr) + offsetMs;
          const newEndMs = parseSrtTime(endStr) + offsetMs;
          const text = lines.slice(2).join('\n');

          unifiedSrtContent += `${srtBlockIndex}\n`;
          unifiedSrtContent += `${formatSrtTime(newStartMs)} --> ${formatSrtTime(newEndMs)}\n`;
          unifiedSrtContent += `${text}\n\n`;
          srtBlockIndex++;
        }
      }
    }

    currentAccumulatedSeconds += duration;
  }

  if (videoListLines.length === 0) {
    console.error('❌ No se encontraron vídeos de capítulos para concatenar.');
    return;
  }

  // Escribir lista de concatenación
  fs.writeFileSync(concatListPath, videoListLines.join('\n'), 'utf8');
  fs.writeFileSync(finalSrtPath, unifiedSrtContent, 'utf8');

  console.log(`🎞️ Concatenando pistas de vídeo y audio en ${finalVideoPath}...`);
  try {
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${finalVideoPath}"`, { stdio: 'pipe' });
  } catch (err) {
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 192k "${finalVideoPath}"`, { stdio: 'pipe' });
  }

  // Generar descripción para YouTube
  let ytContent = `# OpenFoodFacts & NutriAgenda — Demostración y Masterclass Completa\n\n`;
  ytContent += `Aprende a dominar NutriAgenda: el gestor nutricional 100% offline-first y privado con la base de datos abierta de OpenFoodFacts.\n\n`;
  ytContent += `⏱️ **Marcas de Tiempo / Capítulos del Vídeo:**\n`;
  for (const ch of chaptersMeta) {
    ytContent += `${ch.startTimeFormatted} - Capítulo ${ch.chapter}: ${ch.title}\n`;
  }
  ytContent += `\n🔗 **Enlaces del Proyecto:**\n`;
  ytContent += `- 🌍 Web App: https://josejuanmontiel.github.io/OpenFoodFacts/\n`;
  ytContent += `- 💻 Repositorio: https://github.com/josejuanmontiel/buscatureceta\n`;

  fs.writeFileSync(youtubeDescPath, ytContent, 'utf8');

  console.log(`\n======================================================`);
  console.log(`🎉 MASTERCLASS UNIFICADA GENERADA CON ÉXITO!`);
  console.log(`📹 Vídeo Completo: ${finalVideoPath} (${formatTime(currentAccumulatedSeconds)} / ${currentAccumulatedSeconds.toFixed(2)}s)`);
  console.log(`💬 Subtítulos SRT: ${finalSrtPath}`);
  console.log(`📝 Ficha YouTube:   ${youtubeDescPath}`);
  console.log(`======================================================\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  concatMasterclass();
}
