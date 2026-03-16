document.addEventListener("DOMContentLoaded", () => {
  // =========================
  // SALVAR MALOTE
  // =========================
  document.querySelectorAll(".malote-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const serviceId = input.dataset.serviceId;
      const malote = input.value.trim();

      try {
        const response = await fetch(`/ffb-services/${serviceId}/malote`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ malote }),
        });

        const result = await response.json();

        if (!response.ok || !result.ok) {
          alert("Não foi possível salvar o malote.");
          return;
        }

        input.style.borderColor = "#16a34a";
        setTimeout(() => {
          input.style.borderColor = "";
        }, 1000);
      } catch (err) {
        console.error("Erro ao salvar malote:", err);
        alert("Erro ao salvar malote.");
        input.style.borderColor = "#dc2626";
      }
    });
  });

  // =========================
  // STATUS COM PENDÊNCIA
  // =========================
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