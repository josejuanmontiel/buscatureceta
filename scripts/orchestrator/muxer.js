import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Formatea milisegundos a formato de tiempo SRT (HH:MM:SS,mmm)
 */
function msToSrtTime(ms) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = Math.floor(ms % 1000);

  const pad = (n, width = 2) => String(n).padStart(width, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

/**
 * Genera el archivo de subtítulos .srt a partir de la línea de tiempo
 */
export function generateSrt(timeline, srtPath) {
  let srtContent = '';
  let index = 1;

  for (const item of timeline) {
    if (!item.narration || item.narration.trim() === '') continue;

    const startTimeStr = msToSrtTime(item.startMs);
    const endTimeStr = msToSrtTime(item.endMs);

    srtContent += `${index}\n`;
    srtContent += `${startTimeStr} --> ${endTimeStr}\n`;
    srtContent += `${item.narration.trim()}\n\n`;
    index++;
  }

  fs.writeFileSync(srtPath, srtContent, 'utf8');
}

/**
 * Une los audios individuales, genera la pista maestra de audio,
 * crea los subtítulos y multiplexa con FFmpeg el vídeo grabado por Playwright.
 */
export function muxVideoAndAudio({ rawVideoPath, audioFiles, timeline, outputPath, srtPath, startOffsetSec = 0 }) {
  const outputDir = path.dirname(outputPath);
  const concatListPath = path.join(outputDir, 'audio_concat_list.txt');
  const masterAudioPath = path.join(outputDir, 'master_audio.wav');

  // 1. Crear lista de archivos de audio para concat demuxer
  const lines = [];
  for (const af of audioFiles) {
    if (fs.existsSync(af)) {
      lines.push(`file '${path.resolve(af)}'`);
    }
  }

  fs.writeFileSync(concatListPath, lines.join('\n'), 'utf8');

  // 2. Concatenar los audios en master_audio.wav
  try {
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${masterAudioPath}"`, { stdio: 'pipe' });
  } catch (err) {
    // Reintentar recodificando si los codecs o sample rates difieren
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c:a pcm_s16le "${masterAudioPath}"`, { stdio: 'pipe' });
  }

  // 3. Generar Subtítulos SRT
  if (srtPath && timeline) {
    generateSrt(timeline, srtPath);
  }

  // 4. Obtener duración del audio maestro
  const audioDurationProbe = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${masterAudioPath}"`,
    { encoding: 'utf8' }
  ).trim();
  const audioDurationSec = parseFloat(audioDurationProbe) || 10;

  // 5. Multiplexar Vídeo + Audio Maestro con FFmpeg
  // Usamos -filter_complex tpad para mantener el último frame si el vídeo termina antes que el audio
  const ssFlag = startOffsetSec > 0 ? `-ss ${startOffsetSec}` : '';
  const cmd = `ffmpeg -y ${ssFlag} -i "${rawVideoPath}" -i "${masterAudioPath}" -filter_complex "[0:v]tpad=stop_mode=clone:stop_duration=5,fps=30[v]" -map "[v]" -map 1:a -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -c:a aac -b:a 192k -t ${audioDurationSec} "${outputPath}"`;

  try {
    execSync(cmd, { stdio: 'pipe' });
  } catch (err) {
    // Fallback sin filtro tpad si hay incompatibilidad
    const fallbackCmd = `ffmpeg -y ${ssFlag} -i "${rawVideoPath}" -i "${masterAudioPath}" -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -c:a aac -b:a 192k -t ${audioDurationSec} -shortest "${outputPath}"`;
    execSync(fallbackCmd, { stdio: 'pipe' });
  }

  return {
    videoOutput: outputPath,
    srtOutput: srtPath,
    masterAudio: masterAudioPath,
    durationSeconds: audioDurationSec
  };
}
