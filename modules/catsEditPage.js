// catsEditPage.js

function renderEditCatPage({
  cat,
  countryOptions,
  breedOptions,
  motherOptions,
  fatherOptions,
  birthDateISO,
  microchipDisplay,
}) {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Editar Gato - CaTech System</title>
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f5f5f7;
      margin: 0;
    }
    .page-wrapper {
      min-height: 100vh;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 40px 16px;
      box-sizing: border-box;
    }
    .card {
      background: #ffffff;
      border-radius: 10px;
      padding: 24px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
      border: 1px solid #e5e7eb;
      max-width: 800px;
      width: 100%;
    }
    h1 {
      text-align: center;
      margin-top: 0;
      font-size: 22px;
    }
    h2 {
      text-align: center;
      margin-top: 4px;
      margin-bottom: 16px;
      color: #374151;
      font-size: 20px;
    }
    fieldset {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      margin-bottom: 18px;
      padding: 12px 16px 16px 16px;
    }
    legend {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
      padding: 0 6px;
    }
    label {
      font-size: 13px;
      color: #4b5563;
      display: block;
      margin-bottom: 4px;
    }
    input[type="text"],
    input[type="date"],
    select {
      width: 100%;
      box-sizing: border-box;
      padding: 6px 8px;
      border-radius: 6px;
      border: 1px solid #d1d5db;
      font-size: 14px;
    }
    input[type="file"] {
      font-size: 13px;
    }
    .form-row {
      display: flex;
      gap: 12px;
      margin-bottom: 10px;
      flex-wrap: wrap;
    }
    .field {
      flex: 1;
      min-width: 140px;
    }
    .field-small {
      flex: 0 0 140px;
    }
    .field-medium {
      flex: 0 0 220px;
    }
    .actions {
      margin-top: 20px;
      display: flex;
      gap: 12px;
      justify-content: center;
      align-items: center;
      flex-wrap: wrap;
    }
    .btn {
      padding: 8px 18px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-size: 14px;
    }
    .btn-primary {
      background: #2563eb;
      color: #ffffff;
    }
    .btn-secondary {
      background: #e5e7eb;
      color: #374151;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 7px 16px;
      border-radius: 6px;
      font-size: 14px;
    }
    .file-list {
      font-size: 13px;
      color: #4b5563;
    }
    .file-list li {
      margin-bottom: 4px;
    }
  </style>
</head>
<body>
  <div class="page-wrapper">
    <div class="card">
      <h1>Editar Gato</h1>
      <h2>${cat.name}</h2>

      <form method="POST" action="/cats/${cat.id}/edit" enctype="multipart/form-data">
        <fieldset>
          <legend>Identificação</legend>

          <div class="form-row">
            <div class="field-small">
              <label>Country (País):</label>
              <select name="country">
                <option value="">-- Select --</option>
                ${countryOptions}
              </select>
            </div>

            <div class="field">
              <label>Cat Name (Nome):</label>
              <input
                type="text"
                name="name"
                value="${cat.name}"
                required
                size="40"
                placeholder="Nome completo do gato"
              />
            </div>
          </div>

          <div class="form-row">
            <div class="field">
              <label>Breed (Raça):</label>
              <select name="breed" required>
                <option value="">-- Select breed --</option>
                ${breedOptions}
              </select>
            </div>

            <div class="field-medium">
              <label>EMS Code / Colour:</label>
              <input
                type="text"
                name="emsCode"
                value="${cat.emsCode || ""}"
                placeholder="Ex: BEN n 24"
              />
            </div>
          </div>

          <div class="form-row">
            <div class="field-medium">
              <label>Birth Date (Data de Nascimento):</label>
              <input type="date" name="birthDate" value="${birthDateISO}" required />
            </div>

            <div class="field-medium">
              <label>Gender (Sexo):</label>
              <select name="gender" required>
                <option value="Macho" ${cat.gender === "Macho" ? "selected" : ""}>Macho</option>
                <option value="Fêmea" ${cat.gender === "Fêmea" ? "selected" : ""}>Fêmea</option>
              </select>
            </div>

            <div class="field-medium">
              <label>Neutered (Castrado):</label>
              <select name="neutered">
                <option value="">-- Select --</option>
                <option value="Sim" ${cat.neutered === true ? "selected" : ""}>Sim</option>
                <option value="Não" ${cat.neutered === false ? "selected" : ""}>Não</option>
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="field">
              <label>Microchip:</label>
              <input 
                type="text"
                name="microchip"
                value="${microchipDisplay}"
                maxlength="19"
                pattern="\\d{3}\\.\\d{3}\\.\\d{3}\\.\\d{3}\\.\\d{3}"
                placeholder="000.000.000.000.000"
                oninput="
                  this.value = this.value
                    .replace(/\\D/g, '')
                    .replace(/(\\d{3})(\\d)/, '$1.$2')
                    .replace(/(\\d{3})(\\d)/, '$1.$2')
                    .replace(/(\\d{3})(\\d)/, '$1.$2')
                    .replace(/(\\d{3})(\\d)/, '$1.$2');
                "
              />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>FIFe / Pedigree</legend>

          <div class="form-row">
            <div class="field-medium">
              <label>FIFe status:</label>
              <select name="fifeStatus">
                <option value="">-- Select --</option>
                <option value="FIFE_BR" ${cat.fifeStatus === "FIFE_BR" ? "selected" : ""}>Fife Brasil</option>
                <option value="FIFE_NON_BR" ${cat.fifeStatus === "FIFE_NON_BR" ? "selected" : ""}>Fife Não Brasil</option>
                <option value="NON_FIFE" ${cat.fifeStatus === "NON_FIFE" ? "selected" : ""}>Não Fife</option>
              </select>
            </div>

            <div class="field-medium">
              <label>Pedigree Type:</label>
              <select name="pedigreeType">
                <option value="">-- Select type --</option>
                <option value="LO" ${cat.pedigreeType === "LO" ? "selected" : ""}>LO</option>
                <option value="RX" ${cat.pedigreeType === "RX" ? "selected" : ""}>RX</option>
              </select>
            </div>

            <div class="field">
              <label>Número (number):</label>
              <input type="text" name="pedigreeNumber" value="${cat.pedigreeNumber || ""}" />
            </div>
          </div>

          <div class="form-row">
            <div class="field">
              <label>
                <input type="checkbox" name="pedigreePending" ${
                  cat.pedigreePending ? "checked" : ""
                } />
                Serviço Pendente
              </label>
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Criador (Breeder)</legend>

          <div class="form-row">
            <div class="field-medium">
              <label>Breeder type:</label>
              <select name="breederType">
                <option value="">-- Select --</option>
                <option value="SELF" ${cat.breederType === "SELF" ? "selected" : ""}>Eu Mesmo</option>
                <option value="OTHER" ${cat.breederType === "OTHER" ? "selected" : ""}>Outro</option>
              </select>
            </div>

            <div class="field">
              <label>Nome se outro criador:</label>
              <input type="text" name="breederName" value="${cat.breederName || ""}" />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Pais (Parents)</legend>

          <h3>Mãe (Mother)</h3>
          <div class="form-row">
            <div class="field">
              <label>Select from database:</label>
              <select name="motherId">
                <option value="">-- None / Not from DB --</option>
                ${motherOptions}
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="field">
              <label>Mother name (Nome da mãe):</label>
              <input type="text" name="motherName" value="${cat.motherName || ""}" />
            </div>
            <div class="field">
              <label>Mother breed:</label>
              <input type="text" name="motherBreed" value="${cat.motherBreed || ""}" />
            </div>
            <div class="field-medium">
              <label>Mother EMS code:</label>
              <input type="text" name="motherEmsCode" value="${cat.motherEmsCode || ""}" />
            </div>
          </div>

          <h3>Pai (Father)</h3>
          <div class="form-row">
            <div class="field">
              <label>Select from database:</label>
              <select name="fatherId">
                <option value="">-- None / Not from DB --</option>
                ${fatherOptions}
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="field">
              <label>Father name:</label>
              <input type="text" name="fatherName" value="${cat.fatherName || ""}" />
            </div>
            <div class="field">
              <label>Father breed:</label>
              <input type="text" name="fatherBreed" value="${cat.fatherBreed || ""}" />
            </div>
            <div class="field-medium">
              <label>Father EMS code:</label>
              <input type="text" name="fatherEmsCode" value="${cat.fatherEmsCode || ""}" />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Documents (Upload)</legend>

          <p class="file-list">Arquivos atuais (se existirem):</p>
          <ul class="file-list">
            <li>
              Pedigree:
              ${
                cat.pedigreeFile
                  ? `<a href="/uploads/${cat.pedigreeFile}" target="_blank">Ver arquivo</a>`
                  : "Nenhum"
              }
            </li>
            <li>
              Atestado Reprodução:
              ${
                cat.reproductionFile
                  ? `<a href="/uploads/${cat.reproductionFile}" target="_blank">Ver arquivo</a>`
                  : "Nenhum"
              }
            </li>
            <li>
              Outros:
              ${
                cat.otherDocsFile
                  ? `<a href="/uploads/${cat.otherDocsFile}" target="_blank">Ver arquivo</a>`
                  : "Nenhum"
              }
            </li>
          </ul>

          <div class="form-row">
            <div class="field">
              <label>Substituir Pedigree:</label>
              <input type="file" name="pedigreeFile" accept=".pdf,image/*" />
            </div>
          </div>

          <div class="form-row">
            <div class="field">
              <label>Substituir Atestado de Reprodução:</label>
              <input type="file" name="reproductionFile" accept=".pdf,image/*" />
            </div>
          </div>

          <div class="form-row">
            <div class="field">
              <label>Substituir outros documentos:</label>
              <input type="file" name="otherDocsFile" accept=".pdf,image/*" />
            </div>
          </div>
        </fieldset>

        <div class="actions">
          <button type="submit" class="btn btn-primary">💾 Salvar alterações</button>
          <a href="/cats/${cat.id}" class="btn-secondary">Cancelar</a>
        </div>
      </form>
    </div>
  </div>
</body>
</html>
`;
}

module.exports = { renderEditCatPage };
