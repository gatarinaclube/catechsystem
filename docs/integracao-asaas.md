# Integração Asaas - PetGus

## Variáveis de ambiente

Configure no Render ou no servidor, sem gravar a chave no código:

```text
ASAAS_API_KEY=chave_api_asaas
ASAAS_USER_AGENT=PetGus/1.0
ASAAS_WEBHOOK_TOKEN=token_secreto_criado_para_o_webhook
ASAAS_PLAN_BASIC_CENTS=valor_em_centavos
ASAAS_PLAN_MASTER_CENTS=valor_em_centavos
ASAAS_PLAN_PREMIUM_CENTS=valor_em_centavos
ASAAS_PLAN_BASIC_ANNUAL_CARD_CENTS=valor_anual_cartao_em_centavos
ASAAS_PLAN_MASTER_ANNUAL_CARD_CENTS=valor_anual_cartao_em_centavos
ASAAS_PLAN_PREMIUM_ANNUAL_CARD_CENTS=valor_anual_cartao_em_centavos
ASAAS_PLAN_BASIC_ANNUAL_PIX_CENTS=valor_anual_pix_em_centavos
ASAAS_PLAN_MASTER_ANNUAL_PIX_CENTS=valor_anual_pix_em_centavos
ASAAS_PLAN_PREMIUM_ANNUAL_PIX_CENTS=valor_anual_pix_em_centavos
```

Exemplo de valor em centavos:

```text
ASAAS_PLAN_BASIC_CENTS=1490
ASAAS_PLAN_MASTER_CENTS=2490
ASAAS_PLAN_PREMIUM_CENTS=3490
ASAAS_PLAN_BASIC_ANNUAL_CARD_CENTS=14990
ASAAS_PLAN_MASTER_ANNUAL_CARD_CENTS=24990
ASAAS_PLAN_PREMIUM_ANNUAL_CARD_CENTS=34990
ASAAS_PLAN_BASIC_ANNUAL_PIX_CENTS=12000
ASAAS_PLAN_MASTER_ANNUAL_PIX_CENTS=20000
ASAAS_PLAN_PREMIUM_ANNUAL_PIX_CENTS=30000
```

O sistema usa produção automaticamente quando a chave começa com `$aact_prod_`.
Para sandbox, use uma chave de homologação ou configure:

```text
ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3
```

## Webhook

Configure no painel Asaas o webhook de cobranças apontando para:

```text
https://www.petgus.com.br/webhooks/asaas
```

Ao configurar o token de autenticação do webhook no Asaas, use o mesmo valor de:

```text
ASAAS_WEBHOOK_TOKEN
```

Eventos importantes:

- `PAYMENT_CONFIRMED`
- `PAYMENT_RECEIVED`
- `PAYMENT_OVERDUE`
- `PAYMENT_DELETED`
- `PAYMENT_REFUNDED`
- `CHARGEBACK_REQUESTED`

## Fluxo atual

1. O usuário escolhe um plano não associado.
2. O sistema cria o cadastro em teste Premium por 7 dias.
3. Se `ASAAS_API_KEY` e o valor do plano estiverem configurados, o sistema cria cliente e assinatura mensal no Asaas.
4. O usuário vê no painel o botão para abrir o pagamento.
5. Quando o Asaas confirma/recebe o pagamento via webhook, o sistema ativa o plano escolhido.
