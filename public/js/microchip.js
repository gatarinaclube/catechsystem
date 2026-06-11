(function () {
  function onlyDigits(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 15);
  }

  function formatMicrochip(value) {
    return onlyDigits(value).replace(/(\d{3})(?=\d)/g, "$1.").replace(/\.$/, "");
  }

  function syncMicrochipInputs() {
    document.querySelectorAll('input[name="microchip"]').forEach((input) => {
      input.addEventListener("input", () => {
        input.value = formatMicrochip(input.value);
      });
    });
  }

  function updateBreedFields(form) {
    const species = form.querySelector(".microchip-species");
    const breedSelect = form.querySelector(".microchip-breed-select");
    const breedWrap = form.querySelector(".microchip-breed-select-wrap");
    const customWrap = form.querySelector(".microchip-custom-breed-wrap");
    if (!species || !breedSelect || !breedWrap || !customWrap) return;

    const selected = breedSelect.dataset.selected || breedSelect.value;
    const value = species.value;
    const isOther = value === "Outro";

    breedWrap.style.display = isOther ? "none" : "";
    customWrap.style.display = isOther ? "" : "none";

    if (!isOther) {
      const breeds = (window.microchipBreeds && window.microchipBreeds[value]) || [];
      breedSelect.innerHTML = "";
      breeds.forEach((breed) => {
        const option = document.createElement("option");
        option.value = breed;
        option.textContent = breed;
        if (breed === selected) option.selected = true;
        breedSelect.appendChild(option);
      });
    }
  }

  function syncSpeciesFields() {
    document.querySelectorAll(".microchip-form").forEach((form) => {
      updateBreedFields(form);
      const species = form.querySelector(".microchip-species");
      const breedSelect = form.querySelector(".microchip-breed-select");
      if (breedSelect) {
        breedSelect.addEventListener("change", () => {
          breedSelect.dataset.selected = breedSelect.value;
        });
      }
      if (species) {
        species.addEventListener("change", () => {
          if (breedSelect) breedSelect.dataset.selected = "";
          updateBreedFields(form);
        });
      }
    });
  }

  function buildPhoneRow() {
    const row = document.createElement("div");
    row.className = "microchip-phone-row";
    row.innerHTML = `
      <select name="phoneType">
        <option value="Fixo">Fixo</option>
        <option value="Celular">Celular</option>
        <option value="WhatsApp" selected>WhatsApp</option>
      </select>
      <input type="tel" name="phoneNumber" placeholder="Telefone com DDD" />
      <button type="button" class="microchip-remove-phone">Remover</button>
    `;
    return row;
  }

  function syncPhoneRows() {
    document.addEventListener("click", (event) => {
      const add = event.target.closest(".microchip-add-phone");
      if (add) {
        const block = add.closest(".microchip-phone-block");
        const list = block && block.querySelector(".microchip-phone-list");
        if (list) list.appendChild(buildPhoneRow());
        return;
      }

      const remove = event.target.closest(".microchip-remove-phone");
      if (remove) {
        const row = remove.closest(".microchip-phone-row");
        const list = row && row.parentElement;
        if (list && list.children.length > 1) row.remove();
      }
    });
  }

  syncMicrochipInputs();
  syncSpeciesFields();
  syncPhoneRows();
})();
