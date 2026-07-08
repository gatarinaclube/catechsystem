(function () {
  const root = document.getElementById("littersRoot");
  const form = document.getElementById("showcaseForm");
  const payloadInput = document.getElementById("payload");
  const litterTemplate = document.getElementById("litterTemplate");
  const kittenTemplate = document.getElementById("kittenTemplate");
  const comparisonsRoot = document.getElementById("comparisonsRoot");
  const comparisonTemplate = document.getElementById("comparisonTemplate");
  const addLitterButton = document.getElementById("addLitterButton");
  const addComparisonButton = document.getElementById("addComparisonButton");
  const slugInput = document.getElementById("slug");
  const publicLinkButton = document.getElementById("publicLinkButton");
  const paymentCardInstallments = document.getElementById("paymentCardInstallments");
  const paymentInstallmentsField = document.getElementById("paymentInstallmentsField");
  const themePreview = document.getElementById("showcaseThemePreview");
  const themeColorInputs = ["backgroundColor", "cardColor", "textColor", "accentColor"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const initial = window.__SHOWCASE__ || {};
  const limits = window.__SHOWCASE_LIMITS__ || {};
  const uploadLimitBytes = Number(limits.uploadLimitBytes) || 5 * 1024 * 1024;
  const uploadLimitLabel = limits.uploadLimitLabel || "5 MB";
  const maxCompressibleImageBytes = 50 * 1024 * 1024;
  const maxKittenPhotos = 20;
  const maxParentPhotos = 2;
  const pendingFilesByInput = new WeakMap();

  function makeKey(prefix) {
    return `${prefix}_${Date.now()}_${Math.round(Math.random() * 100000)}`;
  }

  function field(container, name) {
    return container.querySelector(`[data-field="${name}"]`);
  }

  function kittenField(container, name) {
    return container.querySelector(`[data-kitten-field="${name}"]`);
  }

  function comparisonField(container, name) {
    return container.querySelector(`[data-comparison-field="${name}"]`);
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
    let visibleIndex = 0;
    let hiddenIndex = 0;
    root.querySelectorAll("[data-litter]").forEach((litter, index) => {
      const title = litter.querySelector("[data-litter-title]");
      const published = getValue(field(litter, "published")) !== false;
      if (published) {
        visibleIndex += 1;
        title.textContent = `Ninhada ${visibleIndex}`;
      } else {
        hiddenIndex += 1;
        title.textContent = `Ninhada oculta ${hiddenIndex}`;
      }
      litter.querySelectorAll("[data-kitten]").forEach((kitten, kittenIndex) => {
        const kittenTitle = kitten.querySelector("[data-kitten-title]");
        kittenTitle.textContent = `Filhote ${kittenIndex + 1}`;
      });
      syncLitterSummary(litter);
    });
    comparisonsRoot.querySelectorAll("[data-comparison]").forEach((comparison, comparisonIndex) => {
      const comparisonTitle = comparison.querySelector("[data-comparison-title]");
      if (comparisonTitle) comparisonTitle.textContent = `Comparativo ${comparisonIndex + 1}`;
    });
  }

  function updatePublicLink() {
    const slug = (slugInput.value || "").trim();
    publicLinkButton.href = slug ? `/vitrine/${slug}` : "#";
  }

  function syncPaymentInstallments() {
    paymentInstallmentsField.style.display = paymentCardInstallments.checked ? "flex" : "none";
  }

  function syncThemePreview() {
    if (!themePreview) return;
    const background = document.getElementById("backgroundColor")?.value || "#f5f7f3";
    const card = document.getElementById("cardColor")?.value || "#ffffff";
    const text = document.getElementById("textColor")?.value || "#1f2933";
    const accent = document.getElementById("accentColor")?.value || "#8a5a20";
    themePreview.style.setProperty("--preview-bg", background);
    themePreview.style.setProperty("--preview-card", card);
    themePreview.style.setProperty("--preview-text", text);
    themePreview.style.setProperty("--preview-accent", accent);
  }

  function litterLimitReached() {
    if (!Number.isInteger(limits.litters)) return false;
    return publishedLitterCount() >= limits.litters;
  }

  function publishedLitterCount(exceptLitter) {
    return Array.from(root.querySelectorAll("[data-litter]"))
      .filter((litter) => litter !== exceptLitter)
      .filter((litter) => getValue(field(litter, "published")) !== false)
      .length;
  }

  function canPublishLitter(litter) {
    return !Number.isInteger(limits.litters) || publishedLitterCount(litter) < limits.litters;
  }

  function syncLitterLimit() {
    if (!Number.isInteger(limits.litters)) return;
    addLitterButton.disabled = litterLimitReached();
    addLitterButton.title = addLitterButton.disabled
      ? `Seu perfil permite ${limits.littersLabel || `${limits.litters} ninhada(s) por vez`}. Remova uma ninhada para incluir outra.`
      : "";
  }

  function moveHiddenLittersToEnd() {
    Array.from(root.querySelectorAll("[data-litter]"))
      .sort((a, b) => {
        const hiddenA = getValue(field(a, "published")) === false;
        const hiddenB = getValue(field(b, "published")) === false;
        return Number(hiddenA) - Number(hiddenB);
      })
      .forEach((litter) => root.appendChild(litter));
  }

  function addParentPreview(litter, type, url) {
    const grid = litter.querySelector(`[data-parent-photo-grid="${type}"]`);
    if (!grid || !url) return;
    grid.appendChild(makeParentPhotoCard(url));
  }

  function syncLitterSummary(litter) {
    const father = getValue(field(litter, "fatherName")) || "Padreador não informado";
    const mother = getValue(field(litter, "motherName")) || "Matriz não informada";
    const birthDate = getValue(field(litter, "birthDate"));
    const title = litter.querySelector("[data-litter-summary-title]");
    const subtitle = litter.querySelector("[data-litter-summary-sub]");
    const compact = litter.querySelector("[data-litter-compact]");
    if (title) title.textContent = `${father} × ${mother}`;
    if (subtitle) subtitle.textContent = birthDate ? `Nascimento: ${birthDate}` : "Clique para editar esta ninhada";
    if (compact) compact.textContent = birthDate
      ? `${father} × ${mother} · nascimento ${birthDate}`
      : `${father} × ${mother}`;
  }

  function setCollapsedControls(litter, collapsed) {
    litter.querySelectorAll("[data-litter-body] input, [data-litter-body] select, [data-litter-body] textarea, [data-litter-body] button")
      .forEach((control) => {
        control.disabled = collapsed;
      });
  }

  function syncLitterVisibility(litter, options = {}) {
    const publishedInput = field(litter, "published");
    const published = getValue(publishedInput) !== false;
    litter.classList.toggle("is-hidden-litter", !published);

    const hideButton = litter.querySelector("[data-hide-litter]");
    if (hideButton) hideButton.textContent = published ? "Ocultar" : "Reativar";

    if (options.move !== false) moveHiddenLittersToEnd();

    setCollapsedControls(litter, !published);
    syncLitterSummary(litter);
    updateTitles();
    syncLitterLimit();
  }

  function fileLimitForInput(file) {
    if (file.type === "application/pdf") {
      return { bytes: uploadLimitBytes, label: uploadLimitLabel };
    }
    return { bytes: maxCompressibleImageBytes, label: "50 MB" };
  }

  function filesAreWithinLimit(input) {
    return Array.from(input.files || []).every((file) => {
      const limit = fileLimitForInput(file);
      return file.size <= limit.bytes;
    });
  }

  function isCompressibleImage(file) {
    return /^image\/(jpeg|jpg|png|webp)$/i.test(file.type || "");
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Não foi possível ler a imagem selecionada."));
      };
      image.src = url;
    });
  }

  function canvasToBlob(canvas, quality) {
    return new Promise((resolve) => {
      canvas.toBlob(resolve, "image/webp", quality);
    });
  }

  async function compressImageFile(file) {
    if (!isCompressibleImage(file) || file.size <= uploadLimitBytes) return file;

    const image = await loadImage(file);
    const baseWidth = Math.min(image.naturalWidth || image.width || 1600, 1800);
    const attempts = [
      { width: baseWidth, quality: 0.82 },
      { width: Math.min(baseWidth, 1500), quality: 0.76 },
      { width: Math.min(baseWidth, 1250), quality: 0.7 },
      { width: Math.min(baseWidth, 1050), quality: 0.64 },
      { width: Math.min(baseWidth, 900), quality: 0.58 },
      { width: Math.min(baseWidth, 760), quality: 0.52 },
      { width: Math.min(baseWidth, 640), quality: 0.46 },
      { width: Math.min(baseWidth, 520), quality: 0.4 },
    ];

    let bestBlob = null;
    for (const attempt of attempts) {
      const ratio = Math.min(1, attempt.width / (image.naturalWidth || image.width || attempt.width));
      const width = Math.max(1, Math.round((image.naturalWidth || image.width || attempt.width) * ratio));
      const height = Math.max(1, Math.round((image.naturalHeight || image.height || width) * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, width, height);
      const blob = await canvasToBlob(canvas, attempt.quality);
      if (!blob) continue;
      bestBlob = blob;
      if (blob.size <= uploadLimitBytes) break;
    }

    if (!bestBlob || bestBlob.size > uploadLimitBytes) {
      throw new Error(`Não foi possível reduzir automaticamente "${file.name}" para ${uploadLimitLabel}. Tente uma foto menor.`);
    }

    const baseName = (file.name || "imagem").replace(/\.[^.]+$/, "");
    return new File([bestBlob], `${baseName}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  }

  function replaceInputFiles(input, files) {
    const dataTransfer = new DataTransfer();
    files.forEach((file) => dataTransfer.items.add(file));
    input.files = dataTransfer.files;
  }

  function getPendingFiles(input) {
    return pendingFilesByInput.get(input) || Array.from(input.files || []);
  }

  function setPendingFiles(input, files) {
    const normalized = Array.from(files || []);
    pendingFilesByInput.set(input, normalized);
    replaceInputFiles(input, normalized);
  }

  function syncInputOrderFromGrid(input, grid) {
    if (!input || !grid) return;
    const files = getPendingFiles(input);
    const newCards = Array.from(grid.querySelectorAll(".showcase-photo-card.is-new"));
    if (!newCards.length) {
      setPendingFiles(input, []);
      return;
    }
    if (!files.length) return;
    const orderedIndexes = newCards
      .map((card) => Number(card.dataset.fileIndex))
      .filter((index) => Number.isInteger(index) && files[index]);
    if (!orderedIndexes.length) return;
    setPendingFiles(input, orderedIndexes.map((index) => files[index]));
    newCards.forEach((card, index) => {
      card.dataset.fileIndex = String(index);
      card.dataset.newToken = `new:${index}`;
    });
  }

  async function prepareFiles(input) {
    const files = Array.from(input.files || []);
    if (!files.length) return true;

    const hasPdf = files.some((file) => file.type === "application/pdf");
    const oversizedRaw = files.find((file) => file.size > fileLimitForInput(file).bytes);
    if (oversizedRaw) {
      input.value = "";
      alert(hasPdf && oversizedRaw.type === "application/pdf"
        ? `O PDF deve ter no máximo ${uploadLimitLabel}.`
        : "Cada imagem pode ter até 50 MB para que a vitrine consiga reduzir automaticamente.");
      return false;
    }

    try {
      const prepared = [];
      let changed = false;
      for (const file of files) {
        const nextFile = await compressImageFile(file);
        prepared.push(nextFile);
        if (nextFile !== file) changed = true;
      }
      if (changed) replaceInputFiles(input, prepared);
      return true;
    } catch (err) {
      input.value = "";
      alert(err.message || "Não foi possível reduzir automaticamente a imagem selecionada.");
      return false;
    }
  }

  async function validateFiles(input) {
    if (filesAreWithinLimit(input) && Array.from(input.files || []).every((file) => file.size <= uploadLimitBytes || file.type !== "application/pdf")) {
      return prepareFiles(input);
    }
    const hasPdf = Array.from(input.files || []).some((file) => file.type === "application/pdf");
    input.value = "";
    alert(hasPdf
      ? `O PDF deve ter no máximo ${uploadLimitLabel}.`
      : "Cada imagem pode ter até 50 MB. A vitrine reduzirá automaticamente para o limite do seu plano ao salvar.");
    return false;
  }

  async function appendSelectedPhotos(input, grid, maxTotal, limitMessage, makeCard) {
    const previousFiles = getPendingFiles(input);
    const selectedFiles = Array.from(input.files || []);
    const savedCount = grid.querySelectorAll(".showcase-photo-card:not(.is-new)").length;
    const remainingSlots = Math.max(0, maxTotal - savedCount - previousFiles.length);

    if (!selectedFiles.length) {
      setPendingFiles(input, previousFiles);
      return;
    }

    if (remainingSlots <= 0) {
      setPendingFiles(input, previousFiles);
      alert(limitMessage);
      return;
    }

    replaceInputFiles(input, selectedFiles);
    if (!(await validateFiles(input))) {
      setPendingFiles(input, previousFiles);
      return;
    }

    const preparedFiles = Array.from(input.files || []);
    const acceptedFiles = preparedFiles.slice(0, remainingSlots);
    if (preparedFiles.length > acceptedFiles.length) alert(limitMessage);

    setPendingFiles(input, previousFiles.concat(acceptedFiles));
    grid.querySelectorAll(".showcase-photo-card.is-new").forEach((card) => card.remove());
    getPendingFiles(input).forEach((file, fileIndex) => {
      const card = makeCard(URL.createObjectURL(file), {
        fileIndex,
        grid,
        input,
        newToken: `new:${fileIndex}`,
      });
      card.classList.add("is-new");
      grid.appendChild(card);
    });
  }

  function makeReorderablePhotoCard(path, options = {}) {
    const card = document.createElement("div");
    card.className = "showcase-photo-card";
    card.draggable = false;
    card.dataset.path = path;
    if (options.newToken) card.dataset.newToken = options.newToken;
    if (Number.isInteger(options.fileIndex)) card.dataset.fileIndex = String(options.fileIndex);

    const image = document.createElement("img");
    image.src = path;
    image.alt = "";

    const moveButton = document.createElement("button");
    moveButton.type = "button";
    moveButton.className = "showcase-photo-move";
    moveButton.textContent = "+";
    moveButton.title = "Mover foto";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "showcase-photo-remove";
    removeButton.textContent = "x";
    removeButton.title = "Remover foto";

    moveButton.addEventListener("pointerdown", () => {
      card.dataset.dragEnabled = "true";
      card.draggable = true;
      card.classList.add("is-drag-ready");
    });
    moveButton.addEventListener("click", (event) => event.stopPropagation());

    removeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      card.remove();
      if (options.input && options.grid) syncInputOrderFromGrid(options.input, options.grid);
    });

    card.append(image, moveButton, removeButton);
    addDragHandlers(card, ".showcase-photo-card");
    return card;
  }

  function makePhotoCard(path, options = {}) {
    return makeReorderablePhotoCard(path, options);
  }

  function makeParentPhotoCard(path, options = {}) {
    return makeReorderablePhotoCard(path, options);
  }

  function makeComparisonPhotoCard(path, hiddenInput) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "showcase-photo-card";
    card.dataset.path = path;
    card.innerHTML = `<img src="${path}" alt="" /><span>Remover</span>`;
    card.addEventListener("click", () => {
      if (hiddenInput && hiddenInput.value === path) hiddenInput.value = "";
      card.remove();
    });
    return card;
  }

  function addDragHandlers(item, selector) {
    item.addEventListener("dragstart", (event) => {
      if (item.classList.contains("showcase-photo-card") && item.dataset.dragEnabled !== "true") {
        event.preventDefault();
        return;
      }
      item.classList.add("dragging");
    });
    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      if (item.classList.contains("showcase-photo-card")) {
        item.draggable = false;
        item.dataset.dragEnabled = "";
        item.classList.remove("is-drag-ready");
      }
      const list = item.parentElement;
      const input = list?.closest("[data-kitten], [data-litter]")?.querySelector(
        list.matches("[data-photo-grid]") ? "[data-photo-input]" : `[name="${list.dataset.inputName || ""}"]`
      );
      if (input) syncInputOrderFromGrid(input, list);
    });
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
    setValue(kittenField(node, "note"), data?.note);
    setValue(kittenField(node, "sex"), data?.sex || "M");
    setValue(kittenField(node, "available"), data?.available !== false);

    const input = node.querySelector("[data-photo-input]");
    input.name = `kittenPhotos_${key}`;
    input.addEventListener("change", async () => {
      const grid = node.querySelector("[data-photo-grid]");
      await appendSelectedPhotos(
        input,
        grid,
        maxKittenPhotos,
        "Use no máximo 20 fotos para cada filhote.",
        makePhotoCard
      );
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
    node.classList.toggle("is-editor-collapsed", Boolean(data));

    [
      "birthDate",
      "deliveryForecast",
      "published",
      "note",
      "fatherName",
      "fatherColor",
      "fatherNote",
      "fatherPkdef",
      "fatherPra",
      "fatherHcm",
      "motherName",
      "motherColor",
      "motherNote",
      "motherPkdef",
      "motherPra",
      "motherHcm",
    ].forEach((name) => setValue(field(node, name), data?.[name]));

    ["birthDate", "fatherName", "motherName"].forEach((name) => {
      const input = field(node, name);
      if (input) input.addEventListener("input", () => syncLitterSummary(node));
    });

    const publishedInput = field(node, "published");
    publishedInput.addEventListener("change", () => {
      if (publishedInput.checked && !canPublishLitter(node)) {
        publishedInput.checked = false;
        alert(limits.littersNote || "O limite considera apenas ninhadas publicadas. Oculte uma ninhada para liberar espaço na vitrine.");
      }
      syncLitterVisibility(node);
    });

    ["father", "mother"].forEach((type) => {
      const photoInput = node.querySelector(`[data-parent-photo="${type}"]`);
      const grid = node.querySelector(`[data-parent-photo-grid="${type}"]`);
      const currentPhotos = data?.[`${type}Photos`] || [data?.[`${type}Photo`]].filter(Boolean);
      photoInput.name = `${type}Photos_${key}`;
      grid.dataset.inputName = photoInput.name;
      currentPhotos.slice(0, 2).forEach((photo) => addParentPreview(node, type, photo));
      photoInput.addEventListener("change", async () => {
        await appendSelectedPhotos(
          photoInput,
          grid,
          maxParentPhotos,
          "Use no máximo 2 fotos para o pai ou para a mãe.",
          makeParentPhotoCard
        );
      });
    });

    node.querySelector("[data-remove-litter]").addEventListener("click", () => {
      node.remove();
      updateTitles();
      syncLitterLimit();
    });

    node.querySelector("[data-hide-litter]").addEventListener("click", () => {
      const isPublished = getValue(publishedInput) !== false;
      if (!isPublished && !canPublishLitter(node)) {
        alert(limits.littersNote || "O limite considera apenas ninhadas publicadas. Oculte uma ninhada para liberar espaço na vitrine.");
        return;
      }
      publishedInput.checked = !isPublished;
      syncLitterVisibility(node);
    });

    node.querySelector("[data-litter-summary]").addEventListener("click", () => {
      if (!node.classList.contains("is-hidden-litter")) return;
      node.classList.remove("is-hidden-litter");
      node.classList.remove("is-editor-collapsed");
      setCollapsedControls(node, false);
      syncLitterSummary(node);
    });

    node.querySelector("[data-toggle-litter-editor]").addEventListener("click", () => {
      node.classList.toggle("is-editor-collapsed");
    });

    node.querySelector("[data-add-kitten]").addEventListener("click", () => {
      addKitten(node, { sex: "M", available: true, photos: [] });
    });

    root.appendChild(node);
    const kittens = data?.kittens && data.kittens.length ? data.kittens : [{ sex: "M", available: true, photos: [] }];
    kittens.forEach((kitten) => addKitten(node, kitten));
    syncLitterVisibility(node, { move: false });
    moveHiddenLittersToEnd();
    updateTitles();
    syncLitterLimit();
  }

  function comparisonLimitReached() {
    if (!Number.isInteger(limits.evolutionComparisons)) return false;
    return comparisonsRoot.querySelectorAll("[data-comparison]").length >= limits.evolutionComparisons;
  }

  function syncComparisonLimit() {
    if (!addComparisonButton || !Number.isInteger(limits.evolutionComparisons)) return;
    addComparisonButton.disabled = comparisonLimitReached();
    addComparisonButton.title = addComparisonButton.disabled
      ? `Seu perfil permite ${limits.evolutionComparisonsLabel || `${limits.evolutionComparisons} comparativo(s)`}.`
      : "";
  }

  function setComparisonPhoto(comparison, fieldName, path) {
    const hidden = comparisonField(comparison, fieldName);
    const preview = comparison.querySelector(`[data-comparison-preview="${fieldName}"]`);
    if (!hidden || !preview || !path) return;
    hidden.value = path;
    preview.innerHTML = "";
    preview.appendChild(makeComparisonPhotoCard(path, hidden));
  }

  function addComparison(data) {
    if (comparisonLimitReached()) {
      alert(`Seu perfil permite ${limits.evolutionComparisonsLabel || `${limits.evolutionComparisons} comparativo(s)`}.`);
      syncComparisonLimit();
      return;
    }

    const key = data?.key || makeKey("comparison");
    const node = comparisonTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.key = key;
    setValue(comparisonField(node, "caption"), data?.caption);
    setComparisonPhoto(node, "reservePhoto", data?.reservePhoto);
    setComparisonPhoto(node, "deliveryPhoto", data?.deliveryPhoto);
    setComparisonPhoto(node, "oneYearPhoto", data?.oneYearPhoto);

    node.querySelectorAll("[data-comparison-photo]").forEach((input) => {
      const fieldName = input.dataset.comparisonPhoto;
      input.name = `comparison${fieldName.charAt(0).toUpperCase()}${fieldName.slice(1)}_${key}`;
      input.addEventListener("change", async () => {
        if (!(await validateFiles(input))) return;
        const file = input.files?.[0];
        if (!file) return;
        const hidden = comparisonField(node, fieldName);
        const preview = node.querySelector(`[data-comparison-preview="${fieldName}"]`);
        hidden.value = "";
        preview.innerHTML = "";
        const card = makeComparisonPhotoCard(URL.createObjectURL(file), hidden);
        card.classList.add("is-new");
        preview.appendChild(card);
      });
    });

    node.querySelector("[data-remove-comparison]").addEventListener("click", () => {
      node.remove();
      updateTitles();
      syncComparisonLimit();
    });

    addDragHandlers(node, "[data-comparison]");
    comparisonsRoot.appendChild(node);
    updateTitles();
    syncComparisonLimit();
  }

  function collectPayload() {
    const photoOrder = (container) => Array.from(container?.querySelectorAll(".showcase-photo-card") || [])
      .map((card) => card.dataset.newToken || card.dataset.path)
      .filter(Boolean);

    const litters = Array.from(root.querySelectorAll("[data-litter]")).map((litter) => ({
      key: litter.dataset.key,
      birthDate: getValue(field(litter, "birthDate")),
      deliveryForecast: getValue(field(litter, "deliveryForecast")),
      published: getValue(field(litter, "published")),
      note: getValue(field(litter, "note")),
      fatherName: getValue(field(litter, "fatherName")),
      fatherPhotos: Array.from(litter.querySelectorAll('[data-parent-photo-grid="father"] .showcase-photo-card:not(.is-new)'))
        .map((card) => card.dataset.path)
        .filter(Boolean),
      fatherPhotoOrder: photoOrder(litter.querySelector('[data-parent-photo-grid="father"]')),
      fatherColor: getValue(field(litter, "fatherColor")),
      fatherNote: getValue(field(litter, "fatherNote")),
      fatherPkdef: getValue(field(litter, "fatherPkdef")),
      fatherPra: getValue(field(litter, "fatherPra")),
      fatherHcm: getValue(field(litter, "fatherHcm")),
      motherName: getValue(field(litter, "motherName")),
      motherPhotos: Array.from(litter.querySelectorAll('[data-parent-photo-grid="mother"] .showcase-photo-card:not(.is-new)'))
        .map((card) => card.dataset.path)
        .filter(Boolean),
      motherPhotoOrder: photoOrder(litter.querySelector('[data-parent-photo-grid="mother"]')),
      motherColor: getValue(field(litter, "motherColor")),
      motherNote: getValue(field(litter, "motherNote")),
      motherPkdef: getValue(field(litter, "motherPkdef")),
      motherPra: getValue(field(litter, "motherPra")),
      motherHcm: getValue(field(litter, "motherHcm")),
      kittens: Array.from(litter.querySelectorAll("[data-kitten]")).map((kitten) => ({
        key: kitten.dataset.key,
        name: getValue(kittenField(kitten, "name")),
        color: getValue(kittenField(kitten, "color")),
        note: getValue(kittenField(kitten, "note")),
        sex: getValue(kittenField(kitten, "sex")),
        available: getValue(kittenField(kitten, "available")),
        photos: Array.from(kitten.querySelectorAll(".showcase-photo-card:not(.is-new)"))
          .map((card) => card.dataset.path)
          .filter(Boolean),
        photoOrder: photoOrder(kitten.querySelector("[data-photo-grid]")),
      })),
    }));

    litters.sort((a, b) => {
      const publishedOrder = Number(a.published === false) - Number(b.published === false);
      if (publishedOrder !== 0) return publishedOrder;
      return (a.birthDate || "").localeCompare(b.birthDate || "");
    });

    return {
      title: document.getElementById("title").value.trim(),
      slug: slugInput.value.trim(),
      intro: document.getElementById("intro").value.trim(),
      logoPath: document.getElementById("logoPath").value.trim(),
      backgroundColor: document.getElementById("backgroundColor").value,
      cardColor: document.getElementById("cardColor").value,
      textColor: document.getElementById("textColor").value,
      accentColor: document.getElementById("accentColor").value,
      websiteUrl: document.getElementById("websiteUrl").value.trim(),
      instagramUrl: document.getElementById("instagramUrl").value.trim(),
      whatsappUrl: document.getElementById("whatsappUrl").value.trim(),
      paymentPix: document.getElementById("paymentPix").checked,
      paymentCardCash: document.getElementById("paymentCardCash").checked,
      paymentCardInstallments: document.getElementById("paymentCardInstallments").checked,
      paymentInstallments: document.getElementById("paymentInstallments").value.trim(),
      paymentText: document.getElementById("paymentText").value.trim(),
      aboutText: document.getElementById("aboutText").value.trim(),
      aboutPdfPath: document.getElementById("aboutPdfPath").value.trim(),
      aboutYoutubeUrl: document.getElementById("aboutYoutubeUrl")?.value.trim() || "",
      aboutYoutubeCaption: document.getElementById("aboutYoutubeCaption")?.value.trim() || "",
      aboutYoutubeText: document.getElementById("aboutYoutubeText")?.value.trim() || "",
      evolutionText: document.getElementById("evolutionText").value.trim(),
      published: document.getElementById("published").checked,
      litters,
      evolutionComparisons: Array.from(comparisonsRoot.querySelectorAll("[data-comparison]")).map((comparison) => ({
        key: comparison.dataset.key,
        caption: getValue(comparisonField(comparison, "caption")),
        reservePhoto: getValue(comparisonField(comparison, "reservePhoto")),
        deliveryPhoto: getValue(comparisonField(comparison, "deliveryPhoto")),
        oneYearPhoto: getValue(comparisonField(comparison, "oneYearPhoto")),
      })),
    };
  }

  addLitterButton.addEventListener("click", () => {
    if (litterLimitReached()) {
      alert(limits.littersNote || "O limite considera apenas ninhadas publicadas. Oculte uma ninhada para liberar espaço na vitrine.");
      syncLitterLimit();
      return;
    }
    addLitter();
  });
  addComparisonButton.addEventListener("click", () => addComparison());
  slugInput.addEventListener("input", updatePublicLink);
  paymentCardInstallments.addEventListener("change", syncPaymentInstallments);
  themeColorInputs.forEach((input) => input.addEventListener("input", syncThemePreview));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const prepared = await Promise.all(
      Array.from(form.querySelectorAll('input[type="file"]')).map((input) => prepareFiles(input))
    );
    if (prepared.some((ok) => !ok)) return;
    payloadInput.value = JSON.stringify(collectPayload());
    form.submit();
  });

  if (initial.litters && initial.litters.length) {
    initial.litters.forEach(addLitter);
  } else {
    addLitter();
  }
  (initial.evolutionComparisons || []).forEach(addComparison);
  updatePublicLink();
  syncPaymentInstallments();
  syncThemePreview();
  syncLitterLimit();
  syncComparisonLimit();
})();
