import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Genera el audio para un texto de locución y devuelve la duración exacta en milisegundos.
 * Prioridad 1: Kokoro TTS en http://localhost:8880/v1/audio/speech
 * Prioridad 2: edge-tts con Microsoft Neural Voice (es-ES-AlvaroNeural o es-ES-ElviraNeural)
 * Fallback determinista: Audio generado por FFmpeg con la duración estimada a 135 palabras/minuto
 */
export async function generateSpeechForScene(text, outputPath, voice = 'es-ES-AlvaroNeural') {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 1. Intentar Kokoro TTS (OpenAI compatible endpoint)
  try {
    const response = await fetch('http://localhost:8880/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'kokoro',
        input: text,
        voice: voice.includes('Alvaro') ? 'em_alex' : voice,
        response_format: 'mp3'
      }),
      signal: AbortSignal.timeout(4000)
    });

    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(outputPath, buffer);
      const durationMs = getAudioDurationMs(outputPath);
      return { success: true, engine: 'kokoro', outputPath, durationMs };
    }
  } catch (err) {
    // Kokoro no está activo, continuar
  }

  // 2. Intentar edge-tts
  const edgeTtsPaths = [
    `${process.env.HOME}/.local/bin/edge-tts`,
    'edge-tts',
    'python3 -m edge_tts'
  ];

  for (const bin of edgeTtsPaths) {
    try {
      const safeText = text.replace(/"/g, '\\"');
      execSync(`${bin} --voice ${voice} --text "${safeText}" --write-media "${outputPath}"`, {
        stdio: 'pipe',
        timeout: 30000
      });
      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        const durationMs = getAudioDurationMs(outputPath);
        return { success: true, engine: 'edge-tts', outputPath, durationMs };
      }
    } catch (err) {
      // Probar siguiente alternativa
    }
  }

  // 3. Fallback determinista: generar audio sintético con tono y silencios usando FFmpeg
  const words = text.trim().split(/\s+/).length;
  const estimatedSeconds = Math.max(3, Math.ceil((words / 2.25) + 1));

  try {
    execSync(`ffmpeg -y -f lavfi -i "sine=frequency=440:duration=0.1" -af "apad=pad_dur=${estimatedSeconds - 0.1}" "${outputPath}"`, {
      stdio: 'pipe'
    });
    const durationMs = getAudioDurationMs(outputPath);
    return { success: true, engine: 'synthetic_timed_pad', outputPath, durationMs };
  } catch (err) {
    throw new Error(`No se pudo generar audio para la escena: ${err.message}`);
  }
}

/**
 * Obtiene la duración exacta de un archivo de audio en milisegundos usando ffprobe.
 */
export function getAudioDurationMs(filePath) {
  try {
    const output = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf8' }
    ).trim();
    const seconds = parseFloat(output);
    return Math.round(seconds * 1000);
  } catch (e) {
    return 5000;
  }
}
