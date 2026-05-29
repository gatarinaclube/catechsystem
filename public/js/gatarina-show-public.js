(function () {
  const checkboxes = Array.from(document.querySelectorAll("[data-photo-checkbox]"));
  const count = document.getElementById("selectionCount");
  const total = document.getElementById("selectionTotal");
  const codes = document.getElementById("selectionCodes");
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

  checkboxes.forEach((input) => input.addEventListener("change", syncSelection));
  syncSelection();
})();
