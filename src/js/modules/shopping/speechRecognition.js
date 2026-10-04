/**
 * Módulo para interactuar con la Web Speech API nativa del navegador.
 * Permite dictar productos a viva voz directamente desde el móvil o PC.
 */

export function isSpeechRecognitionSupported() {
  return typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
}

/**
 * Crea una sesión de reconocimiento de voz configurada para español.
 * @param {Object} options
 * @param {(text: string, isFinal: boolean) => void} options.onResult Callback de resultados parciales y finales
 * @param {(err: any) => void} options.onError Callback de errores
 * @param {() => void} [options.onStart]
 * @param {() => void} [options.onEnd]
 * @param {string} [options.lang='es-ES']
 */
export function createSpeechRecognizer({ onResult, onError, onStart, onEnd, lang = 'es-ES' }) {
  if (!isSpeechRecognitionSupported()) {
    throw new Error('El reconocimiento de voz no es compatible con este navegador.');
  }

  const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechClass();

  recognition.lang = lang;
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let finalTranscript = '';

  recognition.onstart = () => {
    finalTranscript = '';
    if (onStart) onStart();
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const part = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += part;
      } else {
        interimTranscript += part;
      }
    }

    const currentText = finalTranscript || interimTranscript;
    if (onResult) {
      onResult(currentText.trim(), Boolean(finalTranscript));
    }
  };

  recognition.onerror = (event) => {
    if (onError) onError(event);
  };

  recognition.onend = () => {
    if (onEnd) onEnd();
  };

  return {
    start: () => {
      try {
        recognition.start();
      } catch (e) {
        // En caso de que ya estuviera corriendo
        console.warn('Speech recognition start issue:', e);
      }
    },
    stop: () => {
      try {
        recognition.stop();
      } catch (e) {
        console.warn('Speech recognition stop issue:', e);
      }
    },
    abort: () => {
      try {
        recognition.abort();
      } catch (e) {
        console.warn('Speech recognition abort issue:', e);
      }
    }
  };
}
