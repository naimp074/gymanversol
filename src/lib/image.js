// Comprime fotos en el navegador para que la base no crezca de más.
export async function imageDataUrl(file, maxBytes = 2 * 1024 * 1024, maxSize = 1280) {
  if (!file || !file.size) return null;
  const type = (file.type || '').toLowerCase();
  if (type && !type.startsWith('image/')) throw new Error('Elegí una foto desde la cámara o la galería.');
  if (file.size > 30 * 1024 * 1024) throw new Error('La foto es demasiado pesada. Sacala de nuevo o elegí otra.');
  const img = await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la foto. En el celular usá la cámara o una imagen JPG.')); };
    image.src = url;
  });
  const canvas = document.createElement('canvas');
  const draw = size => {
    const width = img.naturalWidth || img.width, height = img.naturalHeight || img.height;
    const scale = Math.min(1, size / Math.max(width, height, 1));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };
  let size = maxSize, quality = 0.82, data = '';
  for (let i = 0; i < 8; i++) {
    draw(size);
    data = canvas.toDataURL('image/jpeg', quality);
    if (Math.ceil((data.length - 23) * 3 / 4) <= maxBytes) return data;
    quality -= 0.12;
    if (quality < 0.45) { quality = 0.72; size = Math.round(size * 0.72); }
  }
  throw new Error('No se pudo comprimir la foto. Probá sacarla otra vez.');
}

export async function readAttachment(file, { pdf = false, maxMb = 2, maxSize = 1280 } = {}) {
  if (!file || !file.size) return null;
  if (file.type === 'application/pdf') {
    if (!pdf) throw new Error('El formato del archivo no está permitido. Usá JPG, PNG o WebP.');
    if (file.size > maxMb * 1024 * 1024) throw new Error(`Cada archivo puede pesar hasta ${maxMb} MB.`);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      reader.readAsDataURL(file);
    });
  }
  return imageDataUrl(file, maxMb * 1024 * 1024, maxSize);
}
