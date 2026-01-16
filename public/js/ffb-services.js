document.querySelectorAll(".malote-input").forEach(input => {
  input.addEventListener("change", async () => {
    const serviceId = input.dataset.serviceId;
    const malote = input.value;

    await fetch(`/ffb-services/${serviceId}/malote`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ malote }),
    });
  });
});
