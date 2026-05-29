(function () {
  const MAX_PHOTO_MB = 5;
  const MAX_PHOTO_BYTES = MAX_PHOTO_MB * 1024 * 1024;
  const root = document.getElementById("littersRoot");
  const form = document.getElementById("showcaseForm");
  const payloadInput = document.getElementById("payload");
  const litterTemplate = document.getElementById("litterTemplate");
  const kittenTemplate = document.getElementById("kittenTemplate");
  const addLitterButton = document.getElementById("addLitterButton");
  const slugInput = document.getElementById("slug");
  const publicLinkButton = document.getElementById("publicLinkButton");
  const paymentCardInstallments = document.getElementById("paymentCardInstallments");
  const paymentInstallmentsField = document.getElementById("paymentInstallmentsField");
  const initial = window.__SHOWCASE__ || {};

  function makeKey(prefix) {
    return `${prefix}_${Date.now()}_${Math.round(Math.random() * 100000)}`;
  }

  function field(container, name) {
    return container.querySelector(`[data-field="${name}"]`);
  }

  function kittenField(container, name) {
    return container.querySelector(`[data-kitten-field="${name}"]`);
  }

  function setValue(input, value) {
    if (!input) return;
    if (input.type === "checkbox") {
      input.checked = value !== false;
    } else {
      input.value = value || "";
    }
  }

  function getValue(input) {
    if (!input) return "";
    return input.type === "checkbox" ? input.checked : input.value.trim();
  }

  function updateTitles() {
    root.querySelectorAll("[data-litter]").forEach((litter, index) => {
      const title = litter.querySelector("[data-litter-title]");
      title.textContent = `Ninhada ${index + 1}`;
      litter.querySelectorAll("[data-kitten]").forEach((kitten, kittenIndex) => {
        const kittenTitle = kitten.querySelector("[data-kitten-title]");
        kittenTitle.textContent = `Filhote ${kittenIndex + 1}`;
      });
    });
  }

  function updatePublicLink() {
    const slug = (slugInput.value || "").trim();
    publicLinkButton.href = slug ? `/${slug}` : "#";
  }

  function syncPaymentInstallments() {
    paymentInstallmentsField.style.display = paymentCardInstallments.checked ? "flex" : "none";
  }

  function addParentPreview(litter, type, url) {
    const grid = litter.querySelector(`[data-parent-photo-grid="${type}"]`);
    if (!grid || !url) return;
    grid.appendChild(makeParentPhotoCard(url));
  }

  function filesAreWithinLimit(input) {
    return Array.from(input.files || []).every((file) => file.size <= MAX_PHOTO_BYTES);
  }

  function validateFiles(input) {
    if (filesAreWithinLimit(input)) return true;
    input.value = "";
    alert(`Cada imagem deve ter no máximo ${MAX_PHOTO_MB} MB.`);
    return false;
  }

  function makePhotoCard(path) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "showcase-photo-card";
    card.draggable = true;
    card.dataset.path = path;
    card.innerHTML = `<img src="${path}" alt="" /><span>Remover</span>`;
    card.addEventListener("click", () => card.remove());
    addDragHandlers(card, ".showcase-photo-card");
    return card;
  }

  function makeParentPhotoCard(path) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "showcase-photo-card";
    card.dataset.path = path;
    card.innerHTML = `<img src="${path}" alt="" /><span>Remover</span>`;
    card.addEventListener("click", () => card.remove());
    return card;
  }

  function addDragHandlers(item, selector) {
    item.addEventListener("dragstart", () => item.classList.add("dragging"));
    item.addEventListener("dragend", () => item.classList.remove("dragging"));
    item.addEventListener("dragover", (event) => {
      event.preventDefault();
      const list = item.parentElement;
      const dragging = list.querySelector(".dragging");
      if (!dragging || dragging === item || !item.matches(selector)) return;
      const rect = item.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      list.insertBefore(dragging, before ? item : item.nextSibling);
      updateTitles();
    });
  }

  function addKitten(litter, data) {
    const key = data?.key || makeKey("kitten");
    const node = kittenTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.key = key;
    setValue(kittenField(node, "name"), data?.name);
    setValue(kittenField(node, "color"), data?.color);
    setValue(kittenField(node, "sex"), data?.sex || "M");
    setValue(kittenField(node, "available"), data?.available !== false);

    const input = node.querySelector("[data-photo-input]");
    input.name = `kittenPhotos_${key}`;
    input.addEventListener("change", () => {
      if (!validateFiles(input)) return;
      const grid = node.querySelector("[data-photo-grid]");
      Array.from(input.files || []).forEach((file) => {
        const card = makePhotoCard(URL.createObjectURL(file));
        card.classList.add("is-new");
        grid.prepend(card);
      });
    });

    (data?.photos || []).forEach((photo) => {
      node.querySelector("[data-photo-grid]").appendChild(makePhotoCard(photo));
    });

    node.querySelector("[data-remove-kitten]").addEventListener("click", () => {
      node.remove();
      updateTitles();
    });

    addDragHandlers(node, "[data-kitten]");
    litter.querySelector("[data-kittens]").appendChild(node);
    updateTitles();
  }

  function addLitter(data) {
    const key = data?.key || makeKey("litter");
    const node = litterTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.key = key;

    [
      "birthDate",
      "deliveryForecast",
      "published",
      "fatherName",
      "fatherColor",
      "fatherPkdef",
      "fatherPra",
      "fatherHcm",
      "motherName",
      "motherColor",
      "motherPkdef",
      "motherPra",
      "motherHcm",
    ].forEach((name) => setValue(field(node, name), data?.[name]));

    ["father", "mother"].forEach((type) => {
      const photoInput = node.querySelector(`[data-parent-photo="${type}"]`);
      const grid = node.querySelector(`[data-parent-photo-grid="${type}"]`);
      const currentPhotos = data?.[`${type}Photos`] || [data?.[`${type}Photo`]].filter(Boolean);
      photoInput.name = `${type}Photos_${key}`;
      currentPhotos.slice(0, 2).forEach((photo) => addParentPreview(node, type, photo));
      photoInput.addEventListener("change", () => {
        if (!validateFiles(photoInput)) {
          return;
        }
        grid.querySelectorAll(".showcase-photo-card.is-new").forEach((card) => card.remove());
        Array.from(photoInput.files || []).slice(0, 2).reverse().forEach((file) => {
          const card = makeParentPhotoCard(URL.createObjectURL(file));
          card.classList.add("is-new");
          grid.prepend(card);
        });
        if ((photoInput.files || []).length > 2) {
          alert("Use no máximo 2 fotos para o pai ou para a mãe.");
        }
      });
    });

    node.querySelector("[data-remove-litter]").addEventListener("click", () => {
      node.remove();
      updateTitles();
    });

    node.querySelector("[data-add-kitten]").addEventListener("click", () => {
      addKitten(node, { sex: "M", available: true, photos: [] });
    });

    root.appendChild(node);
    const kittens = data?.kittens && data.kittens.length ? data.kittens : [{ sex: "M", available: true, photos: [] }];
    kittens.forEach((kitten) => addKitten(node, kitten));
    updateTitles();
  }

  function collectPayload() {
    const litters = Array.from(root.querySelectorAll("[data-litter]")).map((litter) => ({
      key: litter.dataset.key,
      birthDate: getValue(field(litter, "birthDate")),
      deliveryForecast: getValue(field(litter, "deliveryForecast")),
      published: getValue(field(litter, "published")),
      fatherName: getValue(field(litter, "fatherName")),
      fatherPhotos: Array.from(litter.querySelectorAll('[data-parent-photo-grid="father"] .showcase-photo-card:not(.is-new)'))
        .map((card) => card.dataset.path)
        .filter(Boolean),
      fatherColor: getValue(field(litter, "fatherColor")),
      fatherPkdef: getValue(field(litter, "fatherPkdef")),
      fatherPra: getValue(field(litter, "fatherPra")),
      fatherHcm: getValue(field(litter, "fatherHcm")),
      motherName: getValue(field(litter, "motherName")),
      motherPhotos: Array.from(litter.querySelectorAll('[data-parent-photo-grid="mother"] .showcase-photo-card:not(.is-new)'))
        .map((card) => card.dataset.path)
        .filter(Boolean),
      motherColor: getValue(field(litter, "motherColor")),
      motherPkdef: getValue(field(litter, "motherPkdef")),
      motherPra: getValue(field(litter, "motherPra")),
      motherHcm: getValue(field(litter, "motherHcm")),
      kittens: Array.from(litter.querySelectorAll("[data-kitten]")).map((kitten) => ({
        key: kitten.dataset.key,
        name: getValue(kittenField(kitten, "name")),
        color: getValue(kittenField(kitten, "color")),
        sex: getValue(kittenField(kitten, "sex")),
        available: getValue(kittenField(kitten, "available")),
        photos: Array.from(kitten.querySelectorAll(".showcase-photo-card:not(.is-new)"))
          .map((card) => card.dataset.path)
          .filter(Boolean),
      })),
    }));

    litters.sort((a, b) => (a.birthDate || "").localeCompare(b.birthDate || ""));

    return {
      title: document.getElementById("title").value.trim(),
      slug: slugInput.value.trim(),
      intro: document.getElementById("intro").value.trim(),
      logoPath: document.getElementById("logoPath").value.trim(),
      websiteUrl: document.getElementById("websiteUrl").value.trim(),
      instagramUrl: document.getElementById("instagramUrl").value.trim(),
      whatsappUrl: document.getElementById("whatsappUrl").value.trim(),
      paymentPix: document.getElementById("paymentPix").checked,
      paymentCardCash: document.getElementById("paymentCardCash").checked,
      paymentCardInstallments: document.getElementById("paymentCardInstallments").checked,
      paymentInstallments: document.getElementById("paymentInstallments").value.trim(),
      published: document.getElementById("published").checked,
      litters,
    };
  }

  addLitterButton.addEventListener("click", () => addLitter());
  slugInput.addEventListener("input", updatePublicLink);
  paymentCardInstallments.addEventListener("change", syncPaymentInstallments);
  form.addEventListener("submit", (event) => {
    const oversized = Array.from(form.querySelectorAll('input[type="file"]'))
      .some((input) => !filesAreWithinLimit(input));
    if (oversized) {
      alert(`Cada imagem deve ter no máximo ${MAX_PHOTO_MB} MB.`);
      event.preventDefault();
      return;
    }
    payloadInput.value = JSON.stringify(collectPayload());
  });

  if (initial.litters && initial.litters.length) {
    initial.litters.forEach(addLitter);
  } else {
    addLitter();
  }
  updatePublicLink();
  syncPaymentInstallments();
})();
