document.addEventListener("DOMContentLoaded", () => {
  const inputs = document.querySelectorAll(".malote-input");

  async function saveMalote(input) {
    const serviceId = input.dataset.serviceId;
    const malote = (input.value || "").trim();

    // aceita vazio ou formato 00/26
    if (malote && !/^\d{2}\/\d{2}$/.test(malote)) {
      alert("Formato inválido. Use 00/26");
      input.focus();
      return;
    }

    try {
      const res = await fetch(`/ffb-services/${serviceId}/malote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ malote }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao salvar");
      }

      // feedback visual rápido
      input.style.outline = "2px solid #4caf50";
      setTimeout(() => (input.style.outline = ""), 600);
    } catch (err) {
      console.error("Erro ao salvar malote:", err);
      alert("Não foi possível salvar o malote.");
    }
  }

  inputs.forEach((input) => {
    // salva ao sair do campo
    input.addEventListener("blur", () => saveMalote(input));

    // salva se apertar Enter
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      }
    });
  });
});
