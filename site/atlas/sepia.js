/* A display preference shared by the interactive atlas and PNG handouts. */
(() => {
  let enabled = false;
  try { enabled = localStorage.getItem('saeroth-sepia') === 'true'; } catch {}
  const label = document.createElement('label');
  label.className = 'atlas-sepia';
  const input = document.createElement('input');
  input.type = 'checkbox'; input.id = 'sepiaMap'; input.checked = enabled;
  label.append(input, document.createTextNode('Sepia parchment palette'));
  document.querySelector('.atlas-presets').after(label);
  function apply() {
    enabled = input.checked;
    map.style.filter = enabled ? 'sepia(1)' : 'none';
    try { localStorage.setItem('saeroth-sepia', String(enabled)); } catch {}
  }
  input.addEventListener('change', apply);
  apply();
  window.ATLAS_SEPIA = {
    enabled: () => enabled,
    // Raster conversion also works on browsers without CanvasRenderingContext2D.filter.
    raster(image, width, height) {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height), data = pixels.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i+1], b = data[i+2];
        data[i] = Math.min(255, .393*r + .769*g + .189*b);
        data[i+1] = Math.min(255, .349*r + .686*g + .168*b);
        data[i+2] = Math.min(255, .272*r + .534*g + .131*b);
      }
      context.putImageData(pixels, 0, 0);
      return canvas;
    }
  };
})();
