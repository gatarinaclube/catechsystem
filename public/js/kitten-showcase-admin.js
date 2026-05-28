(function () {
  const root = document.getElementById("littersRoot");
  const form = document.getElementById("showcaseForm");
  const payloadInput = document.getElementById("payload");
  const litterTemplate = document.getElementById("litterTemplate");
  const kittenTemplate = document.getElementById("kittenTemplate");
  const addLitterButton = document.getElementById("addLitterButton");
  const slugInput = document.getElementById("slug");
  const publicLinkButton = document.getElementById("publicLinkButton");
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

  function addParentPreview(litter, type, url) {
    const preview = litter.querySelector(`[data-parent-preview="${type}"]`);
    if (!preview) return;
    preview.src = url || "";
    preview.style.display = url ? "block" : "none";
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
      "fatherPhoto",
      "fatherColor",
      "fatherPkdef",
      "fatherPra",
      "fatherHcm",
      "motherName",
      "motherPhoto",
      "motherColor",
      "motherPkdef",
      "motherPra",
      "motherHcm",
    ].forEach((name) => setValue(field(node, name), data?.[name]));

    ["father", "mother"].forEach((type) => {
      const photoInput = node.querySelector(`[data-parent-photo="${type}"]`);
      const currentPhoto = data?.[`${type}Photo`] || "";
      photoInput.name = `${type}Photo_${key}`;
      addParentPreview(node, type, currentPhoto);
      photoInput.addEventListener("change", () => {
        const file = photoInput.files && photoInput.files[0];
        addParentPreview(node, type, file ? URL.createObjectURL(file) : currentPhoto);
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
      fatherPhoto: getValue(field(litter, "fatherPhoto")),
      fatherColor: getValue(field(litter, "fatherColor")),
      fatherPkdef: getValue(field(litter, "fatherPkdef")),
      fatherPra: getValue(field(litter, "fatherPra")),
      fatherHcm: getValue(field(litter, "fatherHcm")),
      motherName: getValue(field(litter, "motherName")),
      motherPhoto: getValue(field(litter, "motherPhoto")),
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
      published: document.getElementById("published").checked,
      litters,
    };
  }

  addLitterButton.addEventListener("click", () => addLitter());
  slugInput.addEventListener("input", updatePublicLink);
  form.addEventListener("submit", () => {
    payloadInput.value = JSON.stringify(collectPayload());
  });

  if (initial.litters && initial.litters.length) {
    initial.litters.forEach(addLitter);
  } else {
    addLitter();
  }
  updatePublicLink();
})();
