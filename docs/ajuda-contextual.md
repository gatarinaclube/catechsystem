# Ajuda contextual do sistema

Sempre que um modulo novo for criado, ou quando uma tela importante for alterada, revise a ajuda contextual do icone `i`.

## Onde atualizar

- Menu lateral: atualize o objeto `helpByLabel` em `views/partials/sidebar.ejs`.
- Caixas, abas e secoes internas: inclua um botao com `class="help-info-button"` e os atributos `data-help-title` e `data-help-text`.
- Titulos comuns de modulos e quadros: atualize o objeto `contextualHelp` em `public/js/help-popups.js`. Ele adiciona automaticamente o icone `i` em titulos conhecidos que ainda nao possuem ajuda manual.
- O comportamento do pop-up tambem fica em `public/js/help-popups.js`.
- O visual fica em `public/css/layout.css`.

## Padrao do botao

```html
<button
  class="help-info-button"
  type="button"
  data-help-title="Nome da secao"
  data-help-text="Explique em poucas palavras para que serve e como preencher."
>i</button>
```

## Checagem

Antes de publicar alteracoes em menus ou botoes de ajuda, rode:

```bash
npm run check:help
```

Essa checagem avisa quando:

- existe item novo no menu sem texto em `helpByLabel`;
- existe botao `i` sem `data-help-title` ou `data-help-text`.
