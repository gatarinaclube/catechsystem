function renderNewCatPage({ countryOptions, breedOptions, motherOptions, fatherOptions }) {
  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <title>Add New Cat - CaTech System</title>
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
        .back-link {
          text-align: center;
          margin-top: 12px;
        }
        .back-link a {
          text-decoration: none;
          color: #4b5563;
        }
      </style>
    </head>
    <body>
      <div class="page-wrapper">
        <div class="card">
          <h1>Adicionar Novo Gato</h1>

          <form method="POST" action="/cats/new" enctype="multipart/form-data">
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
                  <input type="text" name="name" required size="40" placeholder="Nome completo do gato" />
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
                  <input type="text" name="emsCode" placeholder="Ex: BEN n 24" />
                </div>
              </div>

              <div class="form-row">
                <div class="field-medium">
                  <label>Birth Date (Data de Nascimento):</label>
                  <input type="date" name="birthDate" required />
                </div>

                <div class="field-medium">
                  <label>Gender (Sexo):</label>
                  <select name="gender" required>
                    <option value="Macho">Macho</option>
                    <option value="Fêmea">Fêmea</option>
                  </select>
                </div>

                <div class="field-medium">
                  <label>Neutered (Castrado):</label>
                  <select name="neutered">
                    <option value="">-- Select --</option>
                    <option value="Sim">Sim</option>
                    <option value="Não">Não</option>
                  </select>
                </div>
              </div>

              <div class="form-row">
                <div class="field">
                  <label>Microchip:</label>
                  <input 
                    type="text" 
                    name="microchip" 
                    required 
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
                    <option value="FIFE_BR">Fife Brasil</option>
                    <option value="FIFE_NON_BR">Fife Não Brasil</option>
                    <option value="NON_FIFE">Não Fife</option>
                  </select>
                </div>

                <div class="field-medium">
                  <label>Pedigree Type:</label>
                  <select name="pedigreeType">
                    <option value="">-- Select type --</option>
                    <option value="LO">LO</option>
                    <option value="RX">RX</option>
                  </select>
                </div>

                <div class="field">
                  <label>Número (number):</label>
                  <input type="text" name="pedigreeNumber" placeholder="Número do pedigree" />
                </div>
              </div>

              <div class="form-row">
                <div class="field">
                  <label>
                    <input type="checkbox" name="pedigreePending" />
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
                  <select
                    name="breederType"
                    id="breederTypeSelect"
                    onchange="document.getElementById('breederNameField').style.display = this.value === 'OTHER' ? 'block' : 'none';"
                  >
                    <option value="">-- Select --</option>
                    <option value="SELF">Eu mesmo</option>
                    <option value="OTHER">Outro</option>
                  </select>
                </div>

                <div class="field" id="breederNameField" style="display: none;">
                  <label>Breeder name (if OTHER):</label>
                  <input type="text" name="breederName" placeholder="Nome do criador (se Outro)" />
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
                  <label>Mother name:</label>
                  <input type="text" name="motherName" />
                </div>
                <div class="field">
                  <label>Mother breed:</label>
                  <input type="text" name="motherBreed" />
                </div>
                <div class="field-medium">
                  <label>Mother EMS code:</label>
                  <input type="text" name="motherEmsCode" />
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
                  <input type="text" name="fatherName" />
                </div>
                <div class="field">
                  <label>Father breed:</label>
                  <input type="text" name="fatherBreed" />
                </div>
                <div class="field-medium">
                  <label>Father EMS code:</label>
                  <input type="text" name="fatherEmsCode" />
                </div>
              </div>
            </fieldset>

            <fieldset>
              <legend>Documents (Upload)</legend>

              <div class="form-row">
                <div class="field">
                  <label>Pedigree (PDF/Imagem):</label>
                  <input type="file" name="pedigreeFile" accept=".pdf,image/*" />
                </div>
              </div>

              <div class="form-row">
                <div class="field">
                  <label>Atestado de Reprodução:</label>
                  <input type="file" name="reproductionFile" accept=".pdf,image/*" />
                </div>
              </div>

              <div class="form-row">
                <div class="field">
                  <label>Outros documentos:</label>
                  <input type="file" name="otherDocsFile" accept=".pdf,image/*" />
                </div>
              </div>
            </fieldset>

            <div class="actions">
              <button type="submit" class="btn btn-primary">💾 Save Cat</button>
              <a href="/cats" class="btn-secondary">Cancelar</a>
            </div>
          </form>

          <div class="back-link">
            <a href="/cats">← Back to list</a>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

module.exports = { renderNewCatPage };
