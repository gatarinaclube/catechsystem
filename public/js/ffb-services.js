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
