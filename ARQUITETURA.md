# Arquitetura do briefing — esqueleto lógico

> Leia este arquivo **antes** de mexer em qualquer coisa do workflow. Ele existe para que decisões já tomadas não sejam desfeitas por esquecimento.
> Versão corrente: **v6**. Arquivo gerado: `workflow/briefing-mercado.local.json`.

---

## 1. Invariantes (não quebrar, nunca)

1. **O LLM não gera HTML e não repete número.** Ele recebe dados prontos e devolve só texto em JSON. Layout e valores são montados em código. Isso impede alucinação de número e quebra de layout.
2. **O LLM não escolhe link nem imagem.** Ele seleciona a notícia **pelo índice** do catálogo; `link`, `imagem` e `fonte` são recuperados do feed pelo código.
3. **O JSON do workflow é gerado, nunca editado à mão.** Fonte da verdade: `build/`. Comando: `node make.js`.
4. **Todo nó de coleta usa `onError: continueRegularOutput`.** Uma API fora do ar não pode derrubar o briefing.
5. **Toda fonte que falha entra em `falhas[]`** e é impressa em vermelho no rodapé do e-mail. Proibido `catch` silencioso.
6. **O envio é SMTP (`n8n-nodes-base.emailSend`), não o nó Gmail.** O OAuth do Gmail expira a cada 7 dias enquanto o app estiver em modo de teste no Google Cloud, e publicar exigiria domínio próprio e política de privacidade. A senha de app não expira.
7. **Nome de nó é contrato.** Os nós de código referenciam os outros por nome exato (`$('Gemini — Análise do dia')`). Renomear ou duplicar um nó (virando "... dia1") quebra o fluxo em silêncio.
8. `make.js` **valida a sintaxe** dos dois nós de código antes de gerar. Se abortar, nada é gravado.
9. **Há um provedor de reserva.** O nó principal usa `onError: continueErrorOutput`: a falha sai por uma segunda saída em vez de derrubar o fluxo, e o nó de reserva assume. Os dois convergem na montagem, que lê de qualquer um dos dois. Use provedores de **casas diferentes**: cota é contada por provedor, então reserva na mesma casa não ajuda em dia de limite batido. O corpo dos dois lê o prompt de `$('Consolidar dados')`, nunca de `$json`, porque a entrada do reserva é a saída de erro do principal.
10. **O provedor de LLM é intercambiável.** O nó se chama `Análise do dia (LLM)`, nome neutro, porque é referenciado pelo nó de montagem. Trocar de provedor é editar `build/config.local.js` e rodar `node make.js`: a URL, o header e o formato do corpo mudam juntos. A leitura da resposta entende os dois dialetos (`candidates[].content.parts[].text` do Gemini e `choices[].message.content` do padrão OpenAI).

---

## 2. Cadeia de nós (ordem de execução)

A cadeia é **linear**: cada nó alimenta o próximo. 25 passos.

```
Seg-Sex 7h30  (schedule trigger, cron 30 7 * * 1-5, America/Sao_Paulo)
│
├─ COTAÇÕES ──────────────────────────────────────────────
│  Ibovespa (brapi)               quote/^BVSP          token brapi
│  Câmbio (AwesomeAPI)            last/USD-BRL,EUR-BRL sem chave
│  Histórico Dólar (AwesomeAPI)   daily/USD-BRL/6      série do sparkline
│  Histórico Euro (AwesomeAPI)    daily/EUR-BRL/6      série do sparkline
│
├─ MACRO ─────────────────────────────────────────────────
│  Selic (BCB)                    SGS série 432
│  IPCA (BCB)                     SGS série 433
│
├─ ÍNDICES E COMMODITIES (Yahoo com Stooq de reserva) ────
│  S&P 500 (Yahoo)    +  S&P 500 (Stooq)
│  Nasdaq (Yahoo)     +  Nasdaq (Stooq)
│  Petróleo WTI (Yahoo) + Petróleo WTI (Stooq)
│  Ouro (Yahoo)       +  Ouro (Stooq)
│
├─ AÇÕES ─────────────────────────────────────────────────
│  Ranking B3 (brapi)             quote/list sortBy=change  → maiores altas e quedas
│
├─ NOTÍCIAS (5 feeds RSS) ────────────────────────────────
│  InfoMoney · Money Times · Exame · G1 Economia · CNBC
│
├─ Consolidar dados   (Code)  → indicadores, macro, movimentos, noticias, falhas, prompt
├─ Análise do dia (LLM)  (HTTP POST)   → JSON com os textos (Gemini, Groq ou Grok)
│     └─ saída de erro → Análise do dia (reserva) → converge na montagem
├─ Montar e-mail (Malibu) (Code) → HTML final
└─ Enviar e-mail      (emailSend / SMTP)
```

### Credenciais a recolocar após cada importação
| Onde | O quê |
|---|---|
| `Ibovespa (brapi)` e `Ranking B3 (brapi)` | token brapi na URL (`SEU_TOKEN_BRAPI`) |
| `Análise do dia (LLM)` | chave do provedor escolhido: `x-goog-api-key` no Gemini, `Authorization: Bearer` no Groq e no Grok |
| `Enviar e-mail` | credencial SMTP (smtp.gmail.com:465, SSL, senha de app) |

---

## 3. Contrato de dados

`Consolidar dados` devolve um único item:

```js
{
  prompt,        // texto enviado ao Gemini
  indicadores,   // [{ nome, valor, delta, closes[] }]  → faixa escura + sparkline
  macro,         // [{ nome, valor, nota }]             → cards Selic / IPCA
  movimentos,    // [{ ticker, valor, delta }]          → maiores altas e quedas
  noticias,      // [{ fonte, titulo, link, imagem, resumo }]  catálogo bruto
  dataFmt, horaFmt, recorte, edicao,
  falhas         // [string] fontes indisponíveis nesta execução
}
```

O nó do LLM devolve (Gemini via `responseMimeType`, Groq e Grok via `response_format: json_object`):

```js
{
  manchete, lead, visao_geral, brasil, eua_mundo,
  implicacao, vetor,
  entenda: { titulo, texto },
  noticias: [{ i, titulo, contexto }]   // i = índice no catálogo acima
}
```

`Montar e-mail` cruza os dois e devolve `{ html }`.

---

## 4. Decisões editoriais e visuais

Referências estudadas: **Nousi Wealth** (estrutura de research) e **Exame Invest** (ritmo e tipografia).

- Tipografia: **Arial/Helvetica 14px** no corpo, igual à Exame. Serifa (Georgia) **só** na manchete. Courier New nos números. Sem webfont: e-mail não carrega.
- Estrutura: masthead → lead em itálico → faixa de mercados com sparkline → visão geral → cards macro → `01 // Brasil` → movimentos da B3 → `02 // EUA e mundo` → `03 // Implicação estratégica` + vetor a monitorar → box "Entenda" → `04 // O que importa hoje` (1 card com imagem grande + 4 linhas com miniatura) → assinatura → rodapé com procedência.
- Notícias: as 5 escolhas vêm de **pelo menos 3 portais diferentes**, no máximo 2 do mesmo. O catálogo é intercalado por fonte (round-robin) antes de ir ao modelo, senão ele pega as primeiras e todas saem do mesmo lugar.
- O texto se adapta à hora: antes das 10h fala do fechamento anterior; entre 10h e 18h trata os números locais como parciais; depois das 18h fala no passado.
- Prêmio de honestidade: o rodapé declara de onde vem cada número, a que horas foi capturado, e que o modelo escreve o texto mas não toca nos valores.

### Detalhes que já custaram bug
- `-0,00%`: variação quase nula mantinha o sinal negativo. Abaixo de 0,005% o chip vira cinza `0,00%`.
- Cor do sparkline tem que seguir **o mesmo delta do chip**, senão o gráfico fica vermelho ao lado de um chip verde.
- O n8n quebra resposta JSON em array em **itens separados**; ler `.json[0]` devolve `undefined`. Usar o helper `itens()`.
- URLs de RSS vêm com `&amp;`; decodificar antes de usar em `src`/`href`.
- Imagem de feed vem como miniatura de 300px. Para o card de destaque, remover os parâmetros de redimensionamento da query.

---

## 5. Ambiente

- n8n **self-hosted**, instalado global (`npm i -g n8n`), em `localhost:5678`.
- Subir pelo `scripts/start-n8n.cmd` da raiz do projeto: desliga telemetria e as chamadas a `api.n8n.io` que poluem o log, e fixa o fuso.
- O PowerShell bloqueia `npm.ps1`; usar o **cmd** para comandos npm.
- Agendador de Tarefas aponta para o `scripts/start-n8n.cmd`, gatilho "ao fazer logon".
- LLM: configurável em `build/config.local.js` (`provedor` + `modelo`). O nó já vem com Retry On Fail (3 tentativas, 10s), porque 429 e 503 são rotina em nível gratuito.

| provedor | endpoint | autenticação | onde pegar a chave |
|---|---|---|---|
| `gemini` | `generativelanguage.googleapis.com/.../{modelo}:generateContent` | header `x-goog-api-key` | aistudio.google.com/apikey |
| `groq` | `api.groq.com/openai/v1/chat/completions` | `Authorization: Bearer` | console.groq.com/keys |
| `grok` | `api.x.ai/v1/chat/completions` | `Authorization: Bearer` | console.x.ai |

Groq e Grok são empresas diferentes: Groq roda modelos abertos com cota diária generosa; Grok é o modelo da xAI.

---

## 6. Pendências conhecidas

- Se o PC estiver desligado no horário, aquele briefing não sai. n8n não recupera execução perdida.
- Gatilho "30 min após ligar o PC" ainda não implementado; exige trava para não enviar duas vezes no mesmo dia.
- Fase 2 do roadmap (gravar cada execução em base) continua sendo o próximo passo real. Ver `CLAUDE.md`.
