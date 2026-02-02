document.querySelectorAll(".malote-input").forEach(input => {
  input.addEventListener("change", async () => {
    const serviceId = input.dataset.serviceId;
    const malote = input.value;

    try {
      const response = await fetch(`/ffb-services/${serviceId}/malote`, {
        method: "POST",
        credentials: "same-origin", // 🔥 ISSO É O QUE FALTAVA
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ malote }),
      });

      if (!response.ok) {
        alert("Não foi possível salvar o malote.");
      }
    } catch (err) {
      console.error("Erro ao salvar malote:", err);
      alert("Erro ao salvar malote.");
    }
  });
});

document.addEventListener("DOMContentLoaded", () => {
  document
    .querySelectorAll("form[action*='/ffb-services/'][action$='/status']")
    .forEach((form) => {
      const select = form.querySelector(".status-select");
      const wrap = form.querySelector(".pending-note-wrap");
      const textarea = form.querySelector("textarea[name='pendingNote']");

      if (!select || !wrap || !textarea) return;

      const toggle = () => {
        if (select.value === "COM_PENDENCIA") {
          wrap.style.display = "block";
          textarea.required = true;
        } else {
          wrap.style.display = "none";
          textarea.required = false;
          textarea.value = "";
        }
      };

      select.addEventListener("change", toggle);
      toggle();

      form.addEventListener("submit", (e) => {
        if (select.value === "COM_PENDENCIA" && !textarea.value.trim()) {
          e.preventDefault();
          alert("Informe o que está pendente antes de atualizar o status.");
          textarea.focus();
        }
      });
    });
});

