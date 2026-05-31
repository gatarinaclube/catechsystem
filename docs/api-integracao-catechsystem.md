# CaTechSystem - Documentacao de API para Integracao

Versao: 1.0  
Data: 2026-05-31  
Status: contrato tecnico proposto para integracao entre sistemas

## Objetivo

Esta documentacao descreve uma API para permitir que sistemas externos consultem, mediante autorizacao do usuario, informacoes cadastradas no CaTechSystem.

O foco inicial da integracao e permitir acesso aos dados de:

- usuario/criador;
- gatil;
- gatos cadastrados;
- documentos relacionados aos gatos;
- ninhadas e filhotes;
- vitrine publica de filhotes, quando publicada.

Esta API deve ser usada apenas por sistemas autorizados, com consentimento do usuario titular dos dados.

## URL Base

Producao:

```text
https://catechsystem.com.br/api/v1
```

Homologacao, se disponibilizada:

```text
https://homolog.catechsystem.com.br/api/v1
```

## Autenticacao Recomendada

O modelo recomendado e OAuth 2.0 Authorization Code.

Fluxo esperado:

1. O sistema externo redireciona o usuario para o CaTechSystem.
2. O usuario faz login no CaTechSystem.
3. O usuario autoriza o compartilhamento dos dados.
4. O CaTechSystem retorna um `authorization_code`.
5. O sistema externo troca o codigo por um `access_token`.
6. O sistema externo usa o `access_token` para consultar a API.

### Scopes

| Scope | Descricao |
| --- | --- |
| `profile:read` | Consultar dados basicos do usuario e gatil |
| `cats:read` | Consultar gatos cadastrados |
| `cats:documents:read` | Consultar links de documentos dos gatos |
| `litters:read` | Consultar ninhadas e filhotes |
| `showcase:read` | Consultar vitrine de filhotes publicada |

### Cabecalho de Autorizacao

Todas as rotas privadas devem receber:

```http
Authorization: Bearer ACCESS_TOKEN
```

## Padrao de Resposta

Respostas de sucesso devem retornar JSON:

```json
{
  "data": {},
  "meta": {}
}
```

Respostas de erro:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Token invalido ou expirado."
  }
}
```

## Codigos de Erro

| HTTP | Codigo | Descricao |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | Parametros invalidos |
| 401 | `UNAUTHORIZED` | Token ausente, invalido ou expirado |
| 403 | `FORBIDDEN` | Token sem permissao para o recurso |
| 404 | `NOT_FOUND` | Registro nao encontrado |
| 409 | `CONFLICT` | Registro duplicado ou conflito de dados |
| 429 | `RATE_LIMITED` | Limite de requisicoes excedido |
| 500 | `INTERNAL_ERROR` | Erro interno |

## Paginacao

Rotas de listagem devem aceitar:

| Parametro | Tipo | Padrao | Descricao |
| --- | --- | --- | --- |
| `page` | integer | `1` | Pagina atual |
| `perPage` | integer | `50` | Itens por pagina, maximo recomendado `100` |

Exemplo de `meta`:

```json
{
  "meta": {
    "page": 1,
    "perPage": 50,
    "total": 123,
    "totalPages": 3
  }
}
```

## Formato de Datas

Todas as datas devem ser retornadas em ISO 8601:

```text
2026-05-31T10:30:00.000Z
```

Campos de data sem horario tambem podem ser retornados em ISO:

```text
2026-05-31
```

## Usuario e Gatil

### Consultar Perfil do Usuario Autorizado

```http
GET /me
```

Scope necessario:

```text
profile:read
```

Resposta:

```json
{
  "data": {
    "id": 123,
    "name": "Nome do Usuario",
    "email": "usuario@exemplo.com",
    "cpf": "00000000000",
    "phones": "(00) 00000-0000",
    "address": "Rua Exemplo, 100",
    "city": "Cidade",
    "state": "UF",
    "country": "Brasil",
    "cep": "00000-000",
    "clubs": "Clube/associacao",
    "role": "PREMIUM",
    "hasFifeCattery": "YES",
    "fifeCatteryName": "Nome FIFe do Gatil",
    "createdAt": "2026-05-31T10:30:00.000Z",
    "settings": {
      "catteryName": "Nome do Gatil",
      "catteryEmail": "gatil@exemplo.com",
      "logoUrl": "https://catechsystem.com.br/uploads/logo.png",
      "memberships": ["FFB", "FIFe"],
      "breeds": ["Maine Coon", "Persa"]
    }
  }
}
```

## Gatos

### Listar Gatos do Usuario

```http
GET /cats
```

Scope necessario:

```text
cats:read
```

Parametros opcionais:

| Parametro | Tipo | Descricao |
| --- | --- | --- |
| `page` | integer | Pagina |
| `perPage` | integer | Itens por pagina |
| `gender` | string | `M` ou `F` |
| `status` | string | Status interno do cadastro |
| `breedingProspect` | boolean | Filhote marcado como futuro reprodutor |
| `deceased` | boolean | Filtrar gatos falecidos |
| `microchip` | string | Buscar por microchip |

Resposta:

```json
{
  "data": [
    {
      "id": 456,
      "externalReference": "catech-cat-456",
      "name": "Nome do Gato",
      "country": "BR",
      "microchip": "000000000000000",
      "birthDate": "2024-01-15",
      "gender": "M",
      "neutered": false,
      "breed": "Maine Coon",
      "emsCode": "MCO n 22",
      "titleBeforeName": "CH",
      "titleAfterName": null,
      "fifeStatus": "Fife Brasil",
      "pedigreeType": "LO",
      "pedigreeNumber": "FFB LO 000000",
      "pedigreePending": false,
      "breederType": "ME",
      "breederName": "Nome do Criador",
      "ownershipType": "OWNER",
      "father": {
        "id": 111,
        "name": "Nome do Pai",
        "breed": "Maine Coon",
        "emsCode": "MCO n"
      },
      "mother": {
        "id": 222,
        "name": "Nome da Mae",
        "breed": "Maine Coon",
        "emsCode": "MCO f"
      },
      "fatherText": {
        "name": "Nome do Pai quando nao cadastrado",
        "breed": "Maine Coon",
        "emsCode": "MCO n"
      },
      "motherText": {
        "name": "Nome da Mae quando nao cadastrada",
        "breed": "Maine Coon",
        "emsCode": "MCO f"
      },
      "photoUrl": "https://catechsystem.com.br/uploads/cats/foto.jpg",
      "kittenNumber": null,
      "sold": false,
      "delivered": false,
      "breedingProspect": true,
      "kittenAvailabilityStatus": "BREEDER",
      "deceased": false,
      "historyNotes": "Observacoes internas",
      "status": "NOVO",
      "createdAt": "2026-05-31T10:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "perPage": 50,
    "total": 1,
    "totalPages": 1
  }
}
```

### Consultar um Gato

```http
GET /cats/{catId}
```

Scope necessario:

```text
cats:read
```

Resposta:

```json
{
  "data": {
    "id": 456,
    "name": "Nome do Gato",
    "microchip": "000000000000000",
    "birthDate": "2024-01-15",
    "gender": "M",
    "breed": "Maine Coon",
    "emsCode": "MCO n 22",
    "pedigreeType": "LO",
    "pedigreeNumber": "FFB LO 000000",
    "documents": {
      "pedigreeUrl": "https://catechsystem.com.br/uploads/cats/pedigree.pdf",
      "reproductionAuthorizationUrl": "https://catechsystem.com.br/uploads/cats/reproducao.pdf",
      "otherDocsUrl": "https://catechsystem.com.br/uploads/cats/outros.pdf",
      "examDocs": {
        "pkdef": "https://catechsystem.com.br/uploads/cats/pkdef.pdf",
        "hcm": "https://catechsystem.com.br/uploads/cats/hcm.pdf"
      }
    },
    "father": {
      "id": 111,
      "name": "Nome do Pai"
    },
    "mother": {
      "id": 222,
      "name": "Nome da Mae"
    },
    "createdAt": "2026-05-31T10:30:00.000Z"
  }
}
```

## Ninhadas e Filhotes

### Listar Ninhadas do Usuario

```http
GET /litters
```

Scope necessario:

```text
litters:read
```

Resposta:

```json
{
  "data": [
    {
      "id": 789,
      "litterNumber": "FFB-2026-0001",
      "catteryName": "Nome do Gatil",
      "catteryCountry": "BR",
      "litterBreed": "Maine Coon",
      "litterCount": 4,
      "litterBirthDate": "2026-04-10",
      "femaleCount": 2,
      "maleCount": 2,
      "deadCount": 0,
      "male": {
        "name": "Nome do Padreador",
        "ffbLo": "FFB LO 000001",
        "breed": "Maine Coon",
        "ems": "MCO n",
        "microchip": "000000000000001",
        "ownership": "OWNER"
      },
      "female": {
        "name": "Nome da Matriz",
        "ffbLo": "FFB LO 000002",
        "breed": "Maine Coon",
        "ems": "MCO f",
        "microchip": "000000000000002"
      },
      "kittens": [
        {
          "id": 1,
          "kittenCatId": 456,
          "index": 1,
          "kittenNumber": "0001",
          "name": "Nome do Filhote",
          "breed": "Maine Coon",
          "emsEyes": "MCO n 22",
          "sex": "M",
          "microchip": "000000000000003",
          "breeding": "BREEDING",
          "breedingRole": "NEW_SIRE",
          "obs": "Observacao",
          "deceased": false
        }
      ],
      "createdAt": "2026-05-31T10:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "perPage": 50,
    "total": 1,
    "totalPages": 1
  }
}
```

### Consultar uma Ninhada

```http
GET /litters/{litterId}
```

Scope necessario:

```text
litters:read
```

Resposta: mesmo formato de um item da listagem de ninhadas.

## Vitrine Publica de Filhotes

### Consultar Vitrine Publicada do Usuario

```http
GET /showcase
```

Scope necessario:

```text
showcase:read
```

Resposta:

```json
{
  "data": {
    "slug": "nome-do-gatil",
    "publicUrl": "https://catechsystem.com.br/vitrine/nome-do-gatil",
    "title": "Filhotes Disponiveis",
    "intro": "Texto de apresentacao",
    "logoUrl": "https://catechsystem.com.br/uploads/logo.png",
    "theme": {
      "backgroundColor": "#f5f7f3",
      "cardColor": "#ffffff",
      "textColor": "#1f2933",
      "accentColor": "#8a5a20"
    },
    "contacts": {
      "websiteUrl": "https://exemplo.com",
      "instagramUrl": "https://instagram.com/exemplo",
      "whatsappUrl": "https://wa.me/5500000000000"
    },
    "payments": {
      "pix": true,
      "cardCash": true,
      "cardInstallments": true,
      "installments": 3
    },
    "litters": [
      {
        "id": 10,
        "birthDate": "2026-04-10",
        "deliveryForecast": "2026-07-10",
        "note": "Observacao da ninhada",
        "father": {
          "name": "Nome do Pai",
          "color": "MCO n",
          "note": "Observacao do pai",
          "photos": [
            "https://catechsystem.com.br/uploads/father-1.jpg"
          ],
          "exams": {
            "pkdef": "N/N",
            "pra": "N/N",
            "hcm": "Normal"
          }
        },
        "mother": {
          "name": "Nome da Mae",
          "color": "MCO f",
          "note": "Observacao da mae",
          "photos": [
            "https://catechsystem.com.br/uploads/mother-1.jpg"
          ],
          "exams": {
            "pkdef": "N/N",
            "pra": "N/N",
            "hcm": "Normal"
          }
        },
        "kittens": [
          {
            "id": 20,
            "name": "Nome do Filhote",
            "sex": "F",
            "color": "MCO f 22",
            "note": "Observacao do filhote",
            "available": true,
            "photos": [
              "https://catechsystem.com.br/uploads/kitten-1.jpg"
            ]
          }
        ]
      }
    ],
    "updatedAt": "2026-05-31T10:30:00.000Z"
  }
}
```

## Documentos e Arquivos

Arquivos devem ser retornados como URLs absolutas, preferencialmente com tempo de expiracao quando forem documentos privados.

Exemplo:

```json
{
  "pedigreeUrl": "https://catechsystem.com.br/api/v1/files/signed/abc123"
}
```

Recomendacao:

- fotos publicas podem ser URLs diretas;
- documentos privados devem usar URL assinada e temporaria;
- o sistema externo nao deve armazenar documentos sem autorizacao explicita do usuario.

## Webhooks Opcionais

Caso o outro sistema precise manter dados sincronizados, pode ser disponibilizado webhook.

Eventos sugeridos:

| Evento | Descricao |
| --- | --- |
| `cat.created` | Novo gato cadastrado |
| `cat.updated` | Gato atualizado |
| `cat.deleted` | Gato removido/inativado |
| `litter.created` | Nova ninhada cadastrada |
| `litter.updated` | Ninhada atualizada |
| `showcase.updated` | Vitrine publica atualizada |

Exemplo de payload:

```json
{
  "event": "cat.updated",
  "occurredAt": "2026-05-31T10:30:00.000Z",
  "data": {
    "catId": 456,
    "ownerId": 123
  }
}
```

## Limites de Uso

Sugestao inicial:

| Limite | Valor |
| --- | --- |
| Requisicoes por minuto por token | 60 |
| Itens por pagina | 100 |
| Tempo de expiracao de URL assinada | 15 minutos |

## Campos Criticos para Mapeamento

Para evitar duplicidade entre sistemas, usar esta ordem de prioridade:

1. `microchip`;
2. `pedigreeNumber`;
3. `id` do CaTechSystem;
4. combinacao de `name`, `birthDate`, `gender` e `ownerId`.

## Observacoes de Seguranca

- O CaTechSystem nao deve compartilhar senha do usuario com terceiros.
- O sistema externo nao deve solicitar login e senha do CaTechSystem fora da tela oficial do CaTechSystem.
- O usuario deve conseguir revogar a autorizacao.
- Tokens devem ser armazenados criptografados.
- Documentos privados devem exigir scope especifico.
- Toda comunicacao deve ocorrer via HTTPS.

## Dados Necessarios do Sistema Externo

Para liberar a integracao, o sistema externo deve informar:

| Informacao | Descricao |
| --- | --- |
| Nome do sistema | Nome comercial e tecnico |
| URL oficial | Dominio do sistema |
| E-mail tecnico | Contato para manutencao |
| Redirect URI | URL de retorno OAuth |
| Scopes necessarios | Quais dados deseja acessar |
| Finalidade da integracao | Motivo do acesso aos dados |
| Politica de privacidade | URL publica da politica |
| Ambiente de teste | URL ou instrucoes, se houver |

## Exemplo de Cabecalho para Consumo

```http
GET /api/v1/cats HTTP/1.1
Host: catechsystem.com.br
Authorization: Bearer ACCESS_TOKEN
Accept: application/json
```

## Observacao Final

Esta documentacao representa o contrato recomendado para integracao. Antes do desenvolvimento definitivo, as partes devem confirmar:

- quais endpoints serao liberados primeiro;
- quais scopes serao obrigatorios;
- quais dados podem ser compartilhados;
- se documentos privados serao enviados por URL assinada;
- regras de LGPD e consentimento do usuario.
