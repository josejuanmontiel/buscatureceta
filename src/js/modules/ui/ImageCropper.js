/**
 * ImageCropper.js
 * Componente canvas interactivo y responsivo para recortar y rotar imágenes en la web/móvil.
 * Sin dependencias externas. Soporta ratón y eventos táctiles (touch).
 */

export class ImageCropper {
  /**
   * @param {Object} options
   * @param {HTMLCanvasElement} options.canvas - Elemento canvas donde se dibuja el cropper
   * @param {Blob|File|string} options.image - Imagen a cargar (Blob o URL)
   * @param {string} [options.aspectRatio] - 'free' | '1:1' | '4:3' | '3:4' | '16:9'
   * @param {Function} [options.onChange] - Callback cuando cambia el recorte { x, y, width, height }
   */
  constructor(options) {
    this.canvas = options.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.aspectRatio = options.aspectRatio || 'free';
    this.onChange = options.onChange || null;

    this.image = new Image();
    this.rotation = 0; // 0, 90, 180, 270

    // Rectángulo de recorte relativo a las dimensiones originales de la imagen (o rotada)
    this.cropRect = { x: 0, y: 0, width: 0, height: 0 };

    // Estado de interacción
    this.isDragging = false;
    this.dragMode = null; // 'move', 'nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'
    this.dragStart = { x: 0, y: 0 };
    this.cropStart = { x: 0, y: 0, width: 0, height: 0 };

    // Dimensiones de renderizado en el canvas
    this.drawBounds = { x: 0, y: 0, width: 0, height: 0, scale: 1 };

    this.handleRadius = 10;
    this.minCropSize = 30;

    this._bindEvents();
    this._loadImage(options.image);
  }

  _loadImage(imageSource) {
    this.image.onload = () => {
      this._resetCropToDefault();
      this.render();
    };

    if (imageSource instanceof Blob) {
      this.currentObjectUrl = URL.createObjectURL(imageSource);
      this.image.src = this.currentObjectUrl;
    } else if (typeof imageSource === 'string') {
      this.image.src = imageSource;
    }
  }

  _getImageWidth() {
    return (this.rotation === 90 || this.rotation === 270) ? this.image.height : this.image.width;
  }

  _getImageHeight() {
    return (this.rotation === 90 || this.rotation === 270) ? this.image.width : this.image.height;
  }

  _resetCropToDefault() {
    const imgW = this._getImageWidth();
    const imgH = this._getImageHeight();

    if (!imgW || !imgH) return;

    let targetW = imgW * 0.85;
    let targetH = imgH * 0.85;

    const ratio = this._getNumericAspectRatio();
    if (ratio) {
      if (targetW / targetH > ratio) {
        targetW = targetH * ratio;
      } else {
        targetH = targetW / ratio;
      }
    }

    this.cropRect = {
      x: Math.round((imgW - targetW) / 2),
      y: Math.round((imgH - targetH) / 2),
      width: Math.round(targetW),
      height: Math.round(targetH),
    };

    if (this.onChange) this.onChange(this.cropRect);
  }

  _getNumericAspectRatio() {
    switch (this.aspectRatio) {
      case '1:1': return 1;
      case '4:3': return 4 / 3;
      case '3:4': return 3 / 4;
      case '16:9': return 16 / 9;
      default: return null;
    }
  }

  setAspectRatio(ratioStr) {
    this.aspectRatio = ratioStr;
    const ratio = this._getNumericAspectRatio();
    if (ratio) {
      let newW = this.cropRect.width;
      let newH = newW / ratio;
      const imgH = this._getImageHeight();
      const imgW = this._getImageWidth();

      if (this.cropRect.y + newH > imgH) {
        newH = imgH - this.cropRect.y;
        newW = newH * ratio;
      }
      if (this.cropRect.x + newW > imgW) {
        newW = imgW - this.cropRect.x;
        newH = newW / ratio;
      }

      this.cropRect.width = Math.round(newW);
      this.cropRect.height = Math.round(newH);
    }
    this.render();
  }

  rotateClockwise() {
    this.rotation = (this.rotation + 90) % 360;
    this._resetCropToDefault();
    this.render();
  }

  render() {
    if (!this.image.width || !this.image.height) return;

    const canvasW = this.canvas.parentElement ? this.canvas.parentElement.clientWidth : 400;
    const canvasH = Math.min(window.innerHeight * 0.55, 420);

    this.canvas.width = canvasW;
    this.canvas.height = canvasH;

    const imgW = this._getImageWidth();
    const imgH = this._getImageHeight();

    const scale = Math.min(canvasW / imgW, canvasH / imgH, 1);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const drawX = (canvasW - drawW) / 2;
    const drawY = (canvasH - drawH) / 2;

    this.drawBounds = { x: drawX, y: drawY, width: drawW, height: drawH, scale };

    this.ctx.clearRect(0, 0, canvasW, canvasH);

    // Fondo tablero ajedrez para transparencias
    this.ctx.fillStyle = '#1a1a1a';
    this.ctx.fillRect(0, 0, canvasW, canvasH);

    // Dibujar la imagen con su rotación
    this.ctx.save();
    this.ctx.translate(drawX + drawW / 2, drawY + drawH / 2);
    this.ctx.rotate((this.rotation * Math.PI) / 180);

    if (this.rotation === 90 || this.rotation === 270) {
      this.ctx.drawImage(this.image, -drawH / 2, -drawW / 2, drawH, drawW);
    } else {
      this.ctx.drawImage(this.image, -drawW / 2, -drawH / 2, drawW, drawH);
    }
    this.ctx.restore();

    // Coordenadas del cuadro de recorte en el canvas
    const screenCropX = drawX + this.cropRect.x * scale;
    const screenCropY = drawY + this.cropRect.y * scale;
    const screenCropW = this.cropRect.width * scale;
    const screenCropH = this.cropRect.height * scale;

    // 1. Sombra oscura sobre el resto
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    this.ctx.beginPath();
    this.ctx.rect(0, 0, canvasW, canvasH);
    this.ctx.rect(screenCropX, screenCropY, screenCropW, screenCropH);
    this.ctx.fill('evenodd');
    this.ctx.restore();

    // 2. Borde del recorte
    this.ctx.strokeStyle = '#0dcaf0';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(screenCropX, screenCropY, screenCropW, screenCropH);

    // 3. Cuadrícula de tercios (regla de composición fotográfica)
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    // Líneas verticales
    this.ctx.moveTo(screenCropX + screenCropW / 3, screenCropY);
    this.ctx.lineTo(screenCropX + screenCropW / 3, screenCropY + screenCropH);
    this.ctx.moveTo(screenCropX + (screenCropW * 2) / 3, screenCropY);
    this.ctx.lineTo(screenCropX + (screenCropW * 2) / 3, screenCropY + screenCropH);
    // Líneas horizontales
    this.ctx.moveTo(screenCropX, screenCropY + screenCropH / 3);
    this.ctx.lineTo(screenCropX + screenCropW, screenCropY + screenCropH / 3);
    this.ctx.moveTo(screenCropX, screenCropY + (screenCropH * 2) / 3);
    this.ctx.lineTo(screenCropX + screenCropW, screenCropY + (screenCropH * 2) / 3);
    this.ctx.stroke();

    // 4. Asideros en las 4 esquinas y en los puntos medios
    this._drawHandle(screenCropX, screenCropY); // nw
    this._drawHandle(screenCropX + screenCropW, screenCropY); // ne
    this._drawHandle(screenCropX, screenCropY + screenCropH); // sw
    this._drawHandle(screenCropX + screenCropW, screenCropY + screenCropH); // se

    this._drawHandle(screenCropX + screenCropW / 2, screenCropY); // n
    this._drawHandle(screenCropX + screenCropW / 2, screenCropY + screenCropH); // s
    this._drawHandle(screenCropX, screenCropY + screenCropH / 2); // w
    this._drawHandle(screenCropX + screenCropW, screenCropY + screenCropH / 2); // e
  }

  _drawHandle(x, y) {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.strokeStyle = '#0dcaf0';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(x, y, 7, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();
  }

  _getCanvasPointerPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  _hitTest(x, y) {
    const { scale, x: drawX, y: drawY } = this.drawBounds;
    const scX = drawX + this.cropRect.x * scale;
    const scY = drawY + this.cropRect.y * scale;
    const scW = this.cropRect.width * scale;
    const scH = this.cropRect.height * scale;
    const r = this.handleRadius + 4;

    // Comprobar esquinas
    if (Math.hypot(x - scX, y - scY) <= r) return 'nw';
    if (Math.hypot(x - (scX + scW), y - scY) <= r) return 'ne';
    if (Math.hypot(x - scX, y - (scY + scH)) <= r) return 'sw';
    if (Math.hypot(x - (scX + scW), y - (scY + scH)) <= r) return 'se';

    // Comprobar lados
    if (Math.hypot(x - (scX + scW / 2), y - scY) <= r) return 'n';
    if (Math.hypot(x - (scX + scW / 2), y - (scY + scH)) <= r) return 's';
    if (Math.hypot(x - scX, y - (scY + scH / 2)) <= r) return 'w';
    if (Math.hypot(x - (scX + scW), y - (scY + scH / 2)) <= r) return 'e';

    // Comprobar interior (arrastre completo)
    if (x >= scX && x <= scX + scW && y >= scY && y <= scY + scH) {
      return 'move';
    }

    return null;
  }

  _onPointerDown(e) {
    const pos = this._getCanvasPointerPos(e);
    const hit = this._hitTest(pos.x, pos.y);

    if (hit) {
      if (e.cancelable) e.preventDefault();
      this.isDragging = true;
      this.dragMode = hit;
      this.dragStart = pos;
      this.cropStart = { ...this.cropRect };
    }
  }

  _onPointerMove(e) {
    const pos = this._getCanvasPointerPos(e);

    if (!this.isDragging) {
      const hit = this._hitTest(pos.x, pos.y);
      switch (hit) {
        case 'nw':
        case 'se': this.canvas.style.cursor = 'nwse-resize'; break;
        case 'ne':
        case 'sw': this.canvas.style.cursor = 'nesw-resize'; break;
        case 'n':
        case 's': this.canvas.style.cursor = 'ns-resize'; break;
        case 'w':
        case 'e': this.canvas.style.cursor = 'ew-resize'; break;
        case 'move': this.canvas.style.cursor = 'move'; break;
        default: this.canvas.style.cursor = 'default'; break;
      }
      return;
    }

    if (e.cancelable) e.preventDefault();

    const scale = this.drawBounds.scale;
    const deltaX = (pos.x - this.dragStart.x) / scale;
    const deltaY = (pos.y - this.dragStart.y) / scale;

    const imgW = this._getImageWidth();
    const imgH = this._getImageHeight();

    if (this.dragMode === 'move') {
      let newX = this.cropStart.x + deltaX;
      let newY = this.cropStart.y + deltaY;

      newX = Math.max(0, Math.min(imgW - this.cropStart.width, newX));
      newY = Math.max(0, Math.min(imgH - this.cropStart.height, newY));

      this.cropRect.x = Math.round(newX);
      this.cropRect.y = Math.round(newY);
    } else {
      let { x, y, width, height } = this.cropStart;
      const ratio = this._getNumericAspectRatio();

      if (this.dragMode.includes('e')) {
        width = Math.max(this.minCropSize, Math.min(imgW - x, width + deltaX));
      }
      if (this.dragMode.includes('s')) {
        height = Math.max(this.minCropSize, Math.min(imgH - y, height + deltaY));
      }
      if (this.dragMode.includes('w')) {
        const potentialW = width - deltaX;
        if (potentialW >= this.minCropSize && x + deltaX >= 0) {
          x += deltaX;
          width = potentialW;
        }
      }
      if (this.dragMode.includes('n')) {
        const potentialH = height - deltaY;
        if (potentialH >= this.minCropSize && y + deltaY >= 0) {
          y += deltaY;
          height = potentialH;
        }
      }

      // Si hay aspect ratio fijo, ajustar
      if (ratio) {
        if (this.dragMode.includes('e') || this.dragMode.includes('w')) {
          height = width / ratio;
          if (y + height > imgH) {
            height = imgH - y;
            width = height * ratio;
          }
        } else {
          width = height * ratio;
          if (x + width > imgW) {
            width = imgW - x;
            height = width / ratio;
          }
        }
      }

      this.cropRect = {
        x: Math.round(Math.max(0, x)),
        y: Math.round(Math.max(0, y)),
        width: Math.round(width),
        height: Math.round(height),
      };
    }

    if (this.onChange) this.onChange(this.cropRect);
    this.render();
  }

  _onPointerUp() {
    this.isDragging = false;
    this.dragMode = null;
  }

  _bindEvents() {
    this._boundDown = (e) => this._onPointerDown(e);
    this._boundMove = (e) => this._onPointerMove(e);
    this._boundUp = () => this._onPointerUp();
    this._boundResize = () => this.render();

    this.canvas.addEventListener('mousedown', this._boundDown);
    window.addEventListener('mousemove', this._boundMove);
    window.addEventListener('mouseup', this._boundUp);

    this.canvas.addEventListener('touchstart', this._boundDown, { passive: false });
    window.addEventListener('touchmove', this._boundMove, { passive: false });
    window.addEventListener('touchend', this._boundUp);

    window.addEventListener('resize', this._boundResize);
  }

  /**
   * Genera el Blob de la imagen recortada con la rotación aplicada.
   * @param {string} [format='image/jpeg']
   * @param {number} [quality=0.88]
   * @returns {Promise<Blob>}
   */
  async getCroppedBlob(format = 'image/jpeg', quality = 0.88) {
    const offCanvas = document.createElement('canvas');
    const { width, height, x, y } = this.cropRect;

    offCanvas.width = width;
    offCanvas.height = height;
    const ctx = offCanvas.getContext('2d');

    // Canvas intermedio para rotar la imagen completa si es necesario
    const rotCanvas = document.createElement('canvas');
    const imgW = this._getImageWidth();
    const imgH = this._getImageHeight();

    rotCanvas.width = imgW;
    rotCanvas.height = imgH;
    const rotCtx = rotCanvas.getContext('2d');

    rotCtx.translate(imgW / 2, imgH / 2);
    rotCtx.rotate((this.rotation * Math.PI) / 180);

    if (this.rotation === 90 || this.rotation === 270) {
      rotCtx.drawImage(this.image, -this.image.width / 2, -this.image.height / 2);
    } else {
      rotCtx.drawImage(this.image, -this.image.width / 2, -this.image.height / 2);
    }

    // Extraer solo el rectángulo de recorte
    ctx.drawImage(rotCanvas, x, y, width, height, 0, 0, width, height);

    return new Promise((resolve) => {
      offCanvas.toBlob((blob) => resolve(blob), format, quality);
    });
  }

  resetCrop() {
    this._resetCropToDefault();
    this.render();
  }

  getCropData() {
    return {
      aspectRatio: this.aspectRatio,
      rotation: this.rotation,
      cropRect: { ...this.cropRect }
    };
  }

  destroy() {
    this.canvas.removeEventListener('mousedown', this._boundDown);
    window.removeEventListener('mousemove', this._boundMove);
    window.removeEventListener('mouseup', this._boundUp);

    this.canvas.removeEventListener('touchstart', this._boundDown);
    window.removeEventListener('touchmove', this._boundMove);
    window.removeEventListener('touchend', this._boundUp);

    window.removeEventListener('resize', this._boundResize);

    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
    }
  }
}
