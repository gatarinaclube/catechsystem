(function () {
  const lightbox = document.getElementById("showcaseLightbox");
  const image = document.getElementById("lightboxImage");
  const closeButton = lightbox.querySelector(".lightbox-close");
  const prevButton = lightbox.querySelector(".lightbox-prev");
  const nextButton = lightbox.querySelector(".lightbox-next");
  let gallery = [];
  let index = 0;
  const mobileParents = window.matchMedia("(max-width: 620px)");

  function syncParentDetails() {
    document.querySelectorAll(".public-parent").forEach((details) => {
      if (mobileParents.matches) {
        details.removeAttribute("open");
      } else {
        details.setAttribute("open", "");
      }
    });
  }

  function showPhoto() {
    if (!gallery.length) return;
    image.src = gallery[index];
  }

  function openGallery(nextGallery, nextIndex) {
    gallery = nextGallery;
    index = Number(nextIndex) || 0;
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
    showPhoto();
  }

  function closeGallery() {
    lightbox.hidden = true;
    image.removeAttribute("src");
    document.body.style.overflow = "";
  }

  function move(step) {
    if (!gallery.length) return;
    index = (index + step + gallery.length) % gallery.length;
    showPhoto();
  }

  document.querySelectorAll(".gallery-trigger").forEach((button) => {
    button.addEventListener("click", () => {
      try {
        openGallery(JSON.parse(button.dataset.gallery || "[]"), button.dataset.index);
      } catch {
        openGallery([], 0);
      }
    });
  });

  closeButton.addEventListener("click", closeGallery);
  prevButton.addEventListener("click", () => move(-1));
  nextButton.addEventListener("click", () => move(1));
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) closeGallery();
  });

  document.addEventListener("keydown", (event) => {
    if (lightbox.hidden) return;
    if (event.key === "Escape") closeGallery();
    if (event.key === "ArrowLeft") move(-1);
    if (event.key === "ArrowRight") move(1);
  });

  document.addEventListener("contextmenu", (event) => {
    if (event.target.closest(".protected-image")) {
      event.preventDefault();
    }
  });

  document.querySelectorAll(".protected-image").forEach((img) => {
    img.addEventListener("dragstart", (event) => event.preventDefault());
  });

  syncParentDetails();
  mobileParents.addEventListener("change", syncParentDetails);
})();
