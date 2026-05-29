(function () {
  const form = document.getElementById("gatarinaUploadForm");
  const sourceInput = document.getElementById("photoInput");
  const compressedInput = document.getElementById("compressedPhotos");
  const status = document.getElementById("uploadStatus");
  const uploadButton = document.getElementById("uploadButton");
  const bulkDeleteForm = document.getElementById("bulkDeletePhotosForm");
  const selectAllButton = document.getElementById("selectAllPhotos");
  const clearSelectedButton = document.getElementById("clearSelectedPhotos");
  const deleteSelectedButton = document.getElementById("deleteSelectedPhotos");
  const photoCheckboxes = Array.from(document.querySelectorAll("[data-admin-photo-checkbox]"));

  const MAX_WIDTH = 1800;
  const QUALITY = 0.72;

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

  async function compressFile(file, index, total) {
    updateStatus(`Comprimindo ${index + 1} de ${total}...`);
    const image = await loadImage(file);
    const scale = Math.min(1, MAX_WIDTH / image.width);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.drawImage(image, 0, 0, width, height);
    URL.revokeObjectURL(image.src);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        const safeName = (file.name || `foto-${index + 1}.jpg`).replace(/\.[^.]+$/, ".jpg");
        resolve(new File([blob], safeName, { type: "image/jpeg" }));
      }, "image/jpeg", QUALITY);
    });
  }

  function syncBulkActions() {
    if (!deleteSelectedButton) return;
    const selectedCount = photoCheckboxes.filter((input) => input.checked).length;
    deleteSelectedButton.disabled = selectedCount === 0;
    deleteSelectedButton.textContent = selectedCount
      ? `Excluir ${selectedCount} selecionada(s)`
      : "Excluir selecionadas";
  }

  if (form && sourceInput && compressedInput) {
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
  }

  photoCheckboxes.forEach((input) => input.addEventListener("change", syncBulkActions));
  selectAllButton?.addEventListener("click", () => {
    photoCheckboxes.forEach((input) => {
      input.checked = true;
    });
    syncBulkActions();
  });
  clearSelectedButton?.addEventListener("click", () => {
    photoCheckboxes.forEach((input) => {
      input.checked = false;
    });
    syncBulkActions();
  });
  bulkDeleteForm?.addEventListener("submit", (event) => {
    const selectedCount = photoCheckboxes.filter((input) => input.checked).length;
    if (!selectedCount) {
      event.preventDefault();
      return;
    }
    if (!confirm(`Excluir ${selectedCount} foto(s) selecionada(s)?`)) {
      event.preventDefault();
    }
  });
  syncBulkActions();
})();
