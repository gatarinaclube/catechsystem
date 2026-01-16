const TITLE_CONFIG = {
  KCH: { qty: 3, label: "Certificado CACC" },
  JCH: { qty: 3, label: "Certificado CACJ" },
  JW:  { qty: 3, label: "Certificado BIS" },
  CH:  { qty: 3, label: "Certificado CAC" },
  PR:  { qty: 3, label: "Certificado CAP" },
  IC:  { qty: 3, label: "Certificado CACIB" },
  IP:  { qty: 3, label: "Certificado CAPIB" },
  GIC: { qty: 6, label: "Certificado CAGCIB" },
  GIP: { qty: 6, label: "Certificado CAGPIB" },
  SC:  { qty: 9, label: "Certificado CACS" },
  SP:  { qty: 9, label: "Certificado CAPS" },
  DSM: { qty: 10, label: "Certificado BIS" },
  DVM: { qty: 10, label: "Certificado BIV" },
  DM:  { qty: 5, label: "Certificado Filhotes" },
  NW:  { qty: 1, label: "Certificado NW" },
  AW:  { qty: 1, label: "Certificado AW/BIS" },
  WW:  { qty: 1, label: "Certificado WW/BIS" },
  SW:  { qty: 1, label: "Certificado SW/BIS" },
  BW:  { qty: 1, label: "Certificado BW/BIS" },
  MW:  { qty: 1, label: "Certificado MW/BIS" },
  NSW: { qty: 1, label: "Certificado NSW/BIS" },
};

const titleSelect = document.getElementById("titleSelect");
const container = document.getElementById("certificatesContainer");
const warningBox = document.getElementById("titleWarning");

titleSelect.addEventListener("change", () => {
  container.innerHTML = "";

  // 🔴 limpa aviso
  if (warningBox) {
    warningBox.style.display = "none";
    warningBox.innerHTML = "";
  }

  const selectedTitle = titleSelect.value;

  // 🔔 AVISOS POR TÍTULO
  const sameColorTitles = [
    "CH", "PR", "IC", "IP", "GIC", "GIP", "SC", "SP"
  ];

  if (warningBox) {
    if (sameColorTitles.includes(selectedTitle)) {
      warningBox.innerHTML =
        "⚠️ <strong>O gato deve conter a mesma cor em todos os certificados.</strong>";
      warningBox.style.display = "block";
    } else if (selectedTitle === "DVM") {
      warningBox.innerHTML =
        "⚠️ <strong>O primeiro BIV e o último devem ter intervalo maior que 2 anos.</strong>";
      warningBox.style.display = "block";
    } else if (selectedTitle === "DSM") {
      warningBox.innerHTML =
        "⚠️ <strong>O primeiro BIS e o último devem ter intervalo maior que 2 anos (somente BIS como adulto).</strong>";
      warningBox.style.display = "block";
    }
  }

  const cfg = TITLE_CONFIG[selectedTitle];
  if (!cfg) return;

  for (let i = 1; i <= cfg.qty; i++) {
    const row = document.createElement("div");
    row.className = "grid-3 cert-row";

    row.innerHTML = `
      <div class="field">
        <label>${cfg.label} ${i}</label>
        <input
          type="file"
          class="cert-file"
          name="certificatesFiles"
          accept=".pdf,.jpg,.jpeg,.png"
          required
        />
      </div>

      <div class="field">
        <label>Data</label>
        <input type="date" class="cert-date" required />
      </div>

      <div class="field">
        <label>Juiz</label>
        <select class="cert-judge" required>
          <option value="">Selecione...</option>
          ${window.JUDGES.map(j => `<option value="${j}">${j}</option>`).join("")}
        </select>
      </div>
    `;

    container.appendChild(row);
  }
});

document.querySelector("form").addEventListener("submit", () => {
  const data = [];

  document.querySelectorAll(".cert-row").forEach(row => {
    data.push({
      date: row.querySelector(".cert-date").value,
      judge: row.querySelector(".cert-judge").value
    });
  });

  document.getElementById("certificatesJson").value = JSON.stringify(data);
});
