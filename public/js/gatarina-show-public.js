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
  const photos = previewButtons.map((button) => ({
    id: button.dataset.previewId,
    src: button.dataset.previewSrc,
    code: button.dataset.previewCode,
  }));
  let currentIndex = 0;

  function money(cents) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(cents / 100);
  }

  function totalPriceCents(quantity) {
    if (quantity <= 0) return 0;
    if (quantity === 1) return 5000;
    if (quantity <= 3) return quantity * 3500;
    if (quantity <= 5) return quantity * 3000;
    return 15000 + ((quantity - 5) * 2000);
  }

  function syncSelection() {
    const selected = checkboxes.filter((input) => input.checked);
    count.textContent = `${selected.length} foto(s)`;
    total.textContent = money(totalPriceCents(selected.length));
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
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeLightbox();
    if (event.key === "ArrowLeft") moveLightbox(-1);
    if (event.key === "ArrowRight") moveLightbox(1);
  });
  syncSelection();
})();
