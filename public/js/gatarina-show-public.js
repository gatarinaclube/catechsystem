(function () {
  const checkboxes = Array.from(document.querySelectorAll("[data-photo-checkbox]"));
  const count = document.getElementById("selectionCount");
  const total = document.getElementById("selectionTotal");
  const codes = document.getElementById("selectionCodes");
  const lightbox = document.getElementById("photoLightbox");
  const lightboxImage = document.getElementById("lightboxImage");
  const lightboxCode = document.getElementById("lightboxCode");
  const lightboxPosition = document.getElementById("lightboxPosition");
  const lightboxSelect = document.getElementById("lightboxSelect");
  const lightboxDownload = document.getElementById("lightboxDownload");
  const previewButtons = Array.from(document.querySelectorAll("[data-preview-src]"));
  const priceCents = Number(window.__PHOTO_PRICE_CENTS__ || 0);
  const watermarkLogoPath = window.__GATARINA_WATERMARK_LOGO__ || "";
  const photos = previewButtons.map((button) => ({
    id: button.dataset.previewId,
    src: button.dataset.previewSrc,
    code: button.dataset.previewCode,
  }));
  let currentIndex = 0;
  let watermarkLogoPromise = null;

  function money(cents) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(cents / 100);
  }

  function syncSelection() {
    const selected = checkboxes.filter((input) => input.checked);
    count.textContent = `${selected.length} foto(s)`;
    total.textContent = money(selected.length * priceCents);
    codes.textContent = selected.length
      ? selected.map((input) => input.dataset.code).join(", ")
      : "Nenhuma foto selecionada.";
  }

  function getCheckboxById(id) {
    return checkboxes.find((input) => input.value === String(id));
  }

  function renderLightboxPhoto() {
    const photo = photos[currentIndex];
    if (!photo || !lightboxImage || !lightboxCode || !lightboxDownload) return;
    lightboxImage.src = photo.src;
    lightboxImage.alt = photo.code;
    lightboxCode.textContent = photo.code;
    if (lightboxPosition) {
      lightboxPosition.textContent = `${currentIndex + 1} de ${photos.length}`;
    }
    lightboxDownload.href = photo.src;
    lightboxDownload.download = `${photo.code}-baixa.jpg`;
    lightboxDownload.dataset.photoSrc = photo.src;
    lightboxDownload.dataset.photoCode = photo.code;
    if (lightboxSelect) {
      const checkbox = getCheckboxById(photo.id);
      lightboxSelect.checked = Boolean(checkbox?.checked);
    }
  }

  function openLightbox(index) {
    if (!lightbox || !photos.length) return;
    currentIndex = index;
    renderLightboxPhoto();
    lightbox.hidden = false;
    document.body.classList.add("is-lightbox-open");
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.hidden = true;
    lightboxImage.src = "";
    document.body.classList.remove("is-lightbox-open");
  }

  function moveLightbox(direction) {
    if (!photos.length || !lightbox || lightbox.hidden) return;
    currentIndex = (currentIndex + direction + photos.length) % photos.length;
    renderLightboxPhoto();
  }

  function syncLightboxSelection() {
    const photo = photos[currentIndex];
    const checkbox = photo ? getCheckboxById(photo.id) : null;
    if (!checkbox || !lightboxSelect) return;
    checkbox.checked = lightboxSelect.checked;
    syncSelection();
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

  function triggerDownload(url, filename) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function downloadWatermarkedPhoto(event) {
    const link = event.currentTarget;
    const src = link.dataset.photoSrc || link.href;
    const code = link.dataset.photoCode || "foto";
    if (!watermarkLogoPath || !src) return;

    event.preventDefault();
    const [photo, logo] = await Promise.all([loadImageUrl(src), getWatermarkLogo()]);
    const canvas = document.createElement("canvas");
    canvas.width = photo.naturalWidth || photo.width;
    canvas.height = photo.naturalHeight || photo.height;
    const context = canvas.getContext("2d", { alpha: false });
    context.drawImage(photo, 0, 0, canvas.width, canvas.height);
    drawWatermark(context, canvas, logo);
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `${code}-baixa.jpg`);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/jpeg", 0.9);
  }

  checkboxes.forEach((input) => input.addEventListener("change", syncSelection));
  previewButtons.forEach((button, index) => {
    button.addEventListener("click", () => {
      openLightbox(index);
    });
  });
  document.querySelector("[data-lightbox-prev]")?.addEventListener("click", () => moveLightbox(-1));
  document.querySelector("[data-lightbox-next]")?.addEventListener("click", () => moveLightbox(1));
  lightboxSelect?.addEventListener("change", syncLightboxSelection);
  document.querySelectorAll("[data-close-lightbox]").forEach((button) => {
    button.addEventListener("click", closeLightbox);
  });
  document.querySelectorAll("[data-download-low]").forEach((link) => {
    link.addEventListener("click", downloadWatermarkedPhoto);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeLightbox();
    if (event.key === "ArrowLeft") moveLightbox(-1);
    if (event.key === "ArrowRight") moveLightbox(1);
  });
  syncSelection();
})();
