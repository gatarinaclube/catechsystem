(function () {
  const checkboxes = Array.from(document.querySelectorAll("[data-photo-checkbox]"));
  const count = document.getElementById("selectionCount");
  const total = document.getElementById("selectionTotal");
  const codes = document.getElementById("selectionCodes");
  const lightbox = document.getElementById("photoLightbox");
  const lightboxImage = document.getElementById("lightboxImage");
  const lightboxCode = document.getElementById("lightboxCode");
  const lightboxDownload = document.getElementById("lightboxDownload");
  const priceCents = Number(window.__PHOTO_PRICE_CENTS__ || 0);

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

  function openLightbox(src, code) {
    if (!lightbox || !lightboxImage || !lightboxCode || !lightboxDownload) return;
    lightboxImage.src = src;
    lightboxImage.alt = code;
    lightboxCode.textContent = code;
    lightboxDownload.href = src;
    lightboxDownload.download = `${code}-baixa.jpg`;
    lightbox.hidden = false;
    document.body.classList.add("is-lightbox-open");
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.hidden = true;
    lightboxImage.src = "";
    document.body.classList.remove("is-lightbox-open");
  }

  checkboxes.forEach((input) => input.addEventListener("change", syncSelection));
  document.querySelectorAll("[data-preview-src]").forEach((button) => {
    button.addEventListener("click", () => {
      openLightbox(button.dataset.previewSrc, button.dataset.previewCode);
    });
  });
  document.querySelectorAll("[data-close-lightbox]").forEach((button) => {
    button.addEventListener("click", closeLightbox);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeLightbox();
  });
  syncSelection();
})();
