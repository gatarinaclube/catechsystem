(function () {
  const form = document.getElementById("academy-lesson-editor-form");
  const holder = document.getElementById("academy-editorjs");
  const fallback = document.getElementById("academy-editor-fallback");
  const contentJson = document.getElementById("academy-content-json");

  if (!form || !holder || !fallback || !contentJson) return;

  function parseInitialData() {
    if (!contentJson.value) return null;
    try {
      return JSON.parse(contentJson.value);
    } catch (err) {
      return null;
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function inlineHtml(value) {
    return String(value || "")
      .replace(/<script/gi, "&lt;script")
      .replace(/<\/script>/gi, "&lt;/script&gt;");
  }

  function listItems(items, tag) {
    return `<${tag}>${(items || []).map((item) => `<li>${inlineHtml(item)}</li>`).join("")}</${tag}>`;
  }

  function blocksToHtml(blocks) {
    return (blocks || [])
      .map((block) => {
        const data = block.data || {};
        if (block.type === "header") return `<h${data.level || 2}>${inlineHtml(data.text)}</h${data.level || 2}>`;
        if (block.type === "paragraph") return `<p>${inlineHtml(data.text)}</p>`;
        if (block.type === "list") return listItems(data.items, data.style === "ordered" ? "ol" : "ul");
        if (block.type === "checklist") {
          return `<ul>${(data.items || []).map((item) => `<li>${item.checked ? "[x]" : "[ ]"} ${inlineHtml(item.text)}</li>`).join("")}</ul>`;
        }
        if (block.type === "quote") return `<blockquote>${inlineHtml(data.text)}${data.caption ? `<footer>${inlineHtml(data.caption)}</footer>` : ""}</blockquote>`;
        if (block.type === "delimiter") return "<hr />";
        if (block.type === "table") {
          return `<table>${(data.content || []).map((row) => `<tr>${row.map((cell) => `<td>${inlineHtml(cell)}</td>`).join("")}</tr>`).join("")}</table>`;
        }
        if (block.type === "embed") return `<figure><iframe src="${escapeHtml(data.embed || data.source)}" allowfullscreen></iframe>${data.caption ? `<figcaption>${inlineHtml(data.caption)}</figcaption>` : ""}</figure>`;
        return "";
      })
      .join("\n");
  }

  const initialData = parseInitialData() || {
    time: Date.now(),
    blocks: fallback.value
      ? [{ type: "paragraph", data: { text: fallback.value } }]
      : [{ type: "paragraph", data: { text: "" } }],
  };

  let editor = null;

  if (window.EditorJS) {
    const tools = {};
    if (window.Header) tools.header = { class: window.Header, inlineToolbar: true, config: { levels: [2, 3, 4], defaultLevel: 2 } };
    if (window.EditorjsList) tools.list = { class: window.EditorjsList, inlineToolbar: true };
    if (window.Checklist) tools.checklist = { class: window.Checklist, inlineToolbar: true };
    if (window.Quote) tools.quote = { class: window.Quote, inlineToolbar: true };
    if (window.Delimiter) tools.delimiter = window.Delimiter;
    if (window.Table) tools.table = { class: window.Table, inlineToolbar: true };
    if (window.Embed) tools.embed = { class: window.Embed, inlineToolbar: true };

    fallback.classList.add("hidden");
    editor = new window.EditorJS({
      holder: "academy-editorjs",
      data: initialData,
      autofocus: false,
      placeholder: "Escreva a aula aqui...",
      tools,
    });
  }

  form.addEventListener("submit", async function (event) {
    if (!editor) {
      contentJson.value = "";
      return;
    }

    event.preventDefault();
    const output = await editor.save();
    contentJson.value = JSON.stringify(output);
    fallback.value = blocksToHtml(output.blocks);
    form.submit();
  });
})();
