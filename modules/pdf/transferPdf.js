const {
  createServiceDoc,
  drawDocumentHeader,
  drawKeyValueBox,
  drawStatusBox,
  formatDateBR,
  formatDateTimeBR,
} = require("./pdfTheme");

async function generateTransferPDF(service, transfer, cat, user, resStream) {
  const doc = createServiceDoc(resStream, "Pedido de Transferencia");
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  let y = doc.y;

  drawDocumentHeader(doc, "PEDIDO DE TRANSFERENCIA", "Transferencia de Propriedade - TRA");
  y = doc.y;

  const regNumber = `${cat?.pedigreeType || ""} ${cat?.pedigreeNumber || ""}`.trim() || "-";
  const breedEms = [cat?.breed, cat?.emsCode].filter(Boolean).join(" ") || "-";
  const genderText = cat?.gender === "M" ? "Macho" : cat?.gender === "F" ? "Femea" : "-";
  const breedingText = transfer?.breedingStatus === "BREEDING" ? "For Breeding" : "Not For Breeding";

  y = drawKeyValueBox(doc, "DADOS DO SERVICO", [
    { label: "Codigo do servico", value: service.id },
    { label: "Tipo de servico", value: "Transferencia de Propriedade - TRA" },
    { label: "Data da solicitacao", value: formatDateTimeBR(service.createdAt) },
    { label: "Associado", value: user?.name },
  ], left, y, width);

  y = drawKeyValueBox(doc, "DADOS DO GATO", [
    { label: "Nome do gato", value: cat?.name },
    { label: "Registro", value: regNumber },
    { label: "Raca, EMS e Cor", value: breedEms },
    { label: "Microchip", value: cat?.microchip },
    { label: "Sexo", value: genderText },
    { label: "Data de nascimento", value: formatDateBR(cat?.birthDate) },
  ], left, y, width);

  const transferItems = [
    { label: "Uso para reproducao", value: breedingText },
    { label: "Proprietario atual", value: transfer?.oldOwnerName },
    { label: "Novo proprietario", value: transfer?.newOwnerName },
  ];

  if (transfer?.memberType) {
    transferItems.push({
      label: "Membro FIFe",
      value: transfer.memberType === "FIFE" ? "Sim" : "Nao",
    });
  }

  if (transfer?.memberType === "NAO_FIFE") {
    transferItems.push(
      { label: "Endereco", value: transfer.address },
      { label: "Bairro", value: transfer.district },
      { label: "Cidade", value: transfer.city },
      { label: "Estado", value: transfer.state },
      { label: "CEP", value: transfer.cep },
      { label: "Telefone", value: transfer.phone },
      { label: "E-mail", value: transfer.email }
    );
  }

  if (transfer?.authorizationFile) {
    transferItems.push({
      label: "Autorizacao de transferencia",
      value: "ANEXADA AO PROCESSO",
    });
  }

  y = drawKeyValueBox(doc, "INFORMACOES DE TRANSFERENCIA", transferItems, left, y, width, {
    columns: 2,
    rowHeight: 15,
  });

  drawStatusBox(doc, service.statuses, left, y, width);
  doc.end();
}

module.exports = { generateTransferPDF };
