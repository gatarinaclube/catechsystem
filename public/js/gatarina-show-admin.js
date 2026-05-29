(function () {
  const form = document.getElementById("gatarinaUploadForm");
  const sourceInput = document.getElementById("photoInput");
  const compressedInput = document.getElementById("compressedPhotos");
  const status = document.getElementById("uploadStatus");
  const uploadButton = document.getElementById("uploadButton");
  const watermarkLogoPath = window.__GATARINA_WATERMARK_LOGO__ || "";

  if (!form || !sourceInput || !compressedInput) return;

  const MAX_WIDTH = 1800;
  const QUALITY = 0.72;
  let watermarkLogoPromise = null;

  function updateStatus(text) {
    status.textContent = text;
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = URL.createObjectURL(file);
    });
  }

  function loadImageUrl(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  function getWatermarkLogo() {
    if (!watermarkLogoPath) return Promise.resolve(null);
    if (!watermarkLogoPromise) {
      watermarkLogoPromise = loadImageUrl(watermarkLogoPath).catch(() => null);
    }
    return watermarkLogoPromise;
  }

  function drawWatermark(context, canvas, logo) {
    if (!logo) return;
    const maxWidth = canvas.width * 0.24;
    const maxHeight = canvas.height * 0.12;
    const scale = Math.min(maxWidth / logo.width, maxHeight / logo.height, 1);
    const width = Math.max(1, Math.round(logo.width * scale));
    const height = Math.max(1, Math.round(logo.height * scale));
    const x = Math.round((canvas.width - width) / 2);
    const y = Math.round(canvas.height - height - canvas.height * 0.035);
    context.save();
    context.globalAlpha = 0.88;
    context.drawImage(logo, x, y, width, height);
    context.restore();
  }

  async function compressFile(file, index, total) {
    updateStatus(`Comprimindo ${index + 1} de ${total}...`);
    const image = await loadImage(file);
    const logo = await getWatermarkLogo();
    const scale = Math.min(1, MAX_WIDTH / image.width);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.drawImage(image, 0, 0, width, height);
    drawWatermark(context, canvas, logo);
    URL.revokeObjectURL(image.src);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        const safeName = (file.name || `foto-${index + 1}.jpg`).replace(/\.[^.]+$/, ".jpg");
        resolve(new File([blob], safeName, { type: "image/jpeg" }));
      }, "image/jpeg", QUALITY);
    });
  }

  sourceInput.addEventListener("change", () => {
    const count = sourceInput.files ? sourceInput.files.length : 0;
    updateStatus(count ? `${count} arquivo(s) selecionado(s).` : "Nenhum arquivo selecionado.");
  });

  form.addEventListener("submit", async (event) => {
    if (!sourceInput.files || !sourceInput.files.length) {
      event.preventDefault();
      updateStatus("Selecione pelo menos uma foto.");
      return;
    }

    event.preventDefault();
    uploadButton.disabled = true;

    try {
      const files = Array.from(sourceInput.files);
      const dataTransfer = new DataTransfer();
      for (const [index, file] of files.entries()) {
        dataTransfer.items.add(await compressFile(file, index, files.length));
      }
      compressedInput.files = dataTransfer.files;
      updateStatus("Enviando fotos comprimidas...");
      form.submit();
    } catch (err) {
      uploadButton.disabled = false;
      updateStatus("Não foi possível comprimir as imagens. Tente enviar um lote menor.");
    }
  });
})();
