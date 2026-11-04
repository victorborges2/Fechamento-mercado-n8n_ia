# Pesquisa — O que os melhores agentes de análise de mercado olham

> Base para o projeto de Inteligência de Mercado. Pesquisa feita em 25/07/2026 nos principais repositórios open-source do GitHub.

## 1. O que esses agentes analisam (as 5 camadas)

Todos os grandes frameworks convergem para as mesmas 5 camadas de informação:

| Camada | O que é | Exemplos de dados |
|---|---|---|
| **Preço / Técnico** | Cotações, índices, indicadores técnicos | OHLCV, MACD, RSI, médias móveis, volume |
| **Fundamentos** | Saúde financeira das empresas | Balanços, lucro, múltiplos (P/L, EV/EBITDA), dividendos |
| **Notícias** | Eventos que movem o mercado | Manchetes, earnings, decisões de bancos centrais, geopolítica |
| **Sentimento** | Humor do mercado | Redes sociais (Reddit, X), tom das notícias, fear & greed |
| **Macro** | Contexto econômico | Juros (Selic, Fed), inflação, câmbio, commodities, PIB |

O padrão de arquitetura dominante é **multi-agente**: um agente especialista por camada (analista técnico, de notícias, de sentimento, fundamentalista), que debatem entre si (visão bull vs bear) e um agente final consolida a conclusão. É o modelo do TradingAgents e do FinRobot.

## 2. Principais repositórios estudados

| Repositório | Stars | O que faz | Fontes de dados que usa |
|---|---|---|---|
| [TradingAgents](https://github.com/TauricResearch/TradingAgents) (TauricResearch) | ~73k | Framework multi-agente que simula uma mesa de trading: analistas (fundamentos, sentimento, notícias, técnico) → pesquisadores bull/bear debatem → trader → gestão de risco | Alpha Vantage, Yahoo Finance, Finnhub, Google News, Reddit |
| [ai-hedge-fund](https://github.com/virattt/ai-hedge-fund) (virattt) | ~59k | 19 agentes: 13 personas de investidores (Buffett, Munger, Lynch, Burry...) + agentes de valuation, sentimento, fundamentos, técnico, risco e portfólio | Financial Datasets API |
| [FinRobot](https://github.com/ai4finance-foundation/finrobot) (AI4Finance) | — | Plataforma de equity research multi-agente com agente líder orquestrando pesquisa modular e auditável | Finnhub, yfinance, FMP, SEC filings |
| [FinGPT](https://github.com/AI4Finance-Foundation/FinGPT) (AI4Finance) | — | LLMs financeiros open-source focados em análise de sentimento de notícias e previsão | Notícias financeiras, redes sociais |
| [OpenBB](https://github.com/OpenBB-finance/OpenBB) | — | "Bloomberg open-source": plataforma que agrega dezenas de provedores de dados num só lugar (bom p/ referência de quais APIs existem) | Yahoo, FRED, Polygon, FMP, Benzinga, +30 provedores |
| [awesome-quant](https://github.com/wilsonfreitas/awesome-quant) / [awesome-ai-in-finance](https://github.com/georgezouq/awesome-ai-in-finance) | — | Listas curadas de bibliotecas, APIs e ferramentas | Catálogos de referência |

**Lição principal:** nenhum desses projetos depende de uma fonte só. Eles cruzam preço + notícia + macro + sentimento e deixam o LLM sintetizar — exatamente o que nossa automação vai fazer em versão simplificada.

## 3. APIs e fontes gratuitas escolhidas para o projeto

Escopo definido: **Brasil (B3, dólar) + EUA (S&P 500, Nasdaq) + macro global**, só fontes gratuitas.

### Brasil

| Fonte | O que dá | Custo / limite |
|---|---|---|
| [brapi.dev](https://brapi.dev) | Cotações B3, Ibovespa (`^BVSP`), fundamentos básicos | Grátis com token (cadastro simples), ~15.000 req/mês |
| [AwesomeAPI](https://docs.awesomeapi.com.br/api-de-moedas) | Câmbio em tempo real (USD-BRL, EUR-BRL) | Grátis, sem chave ✅ testada |
| [API SGS do Banco Central](https://dadosabertos.bcb.gov.br) | Selic (série 432), IPCA (433), CDI (12) e +20 mil séries | Grátis, sem chave ✅ testada |
| RSS InfoMoney (`infomoney.com.br/feed/`) | Manchetes do mercado brasileiro | Grátis |

### EUA / Global

| Fonte | O que dá | Custo / limite |
|---|---|---|
| Yahoo Finance (endpoint `query1.finance.yahoo.com/v8/finance/chart/`) | Índices (^GSPC, ^IXIC, ^DJI), commodities (CL=F petróleo, GC=F ouro), qualquer ticker | Grátis, sem chave (exige header User-Agent) |
| [Alpha Vantage](https://www.alphavantage.co) | Cotações, indicadores técnicos, notícias com sentimento | Grátis: 25 req/dia (usar como reserva) |
| [FRED](https://fred.stlouisfed.org/docs/api/fred/) (Fed St. Louis) | Séries macro dos EUA (juros, inflação, emprego) | Grátis com chave |
| RSS CNBC / Reuters | Manchetes globais | Grátis |

### Para evoluir depois (ainda grátis ou baratas)

- **Finnhub** (grátis: 60 req/min) — notícias por empresa, earnings calendar
- **NewsAPI.org** (grátis p/ dev) — busca de notícias por tema
- **Financial Datasets API** — a fonte do ai-hedge-fund, fundamentos detalhados
- **Reddit API** — sentimento de varejo (r/wallstreetbets, r/investimentos)

## 4. Blueprint da automação n8n (fase 1)

Workflow: **`n8n - Resumo Diario de Mercado.json`** (na mesma pasta, pronto para importar).

```
Agendamento (seg-sex 7h30)
  → Ibovespa (brapi)
  → Câmbio USD/EUR (AwesomeAPI)
  → Selic + IPCA (Banco Central)
  → S&P 500, Nasdaq, Petróleo, Ouro (Yahoo Finance)
  → Notícias BR (RSS InfoMoney) + Notícias globais (RSS CNBC)
  → Code: consolida tudo num prompt
  → Claude (API Anthropic): escreve o resumo do dia em HTML
  → Gmail: envia o e-mail
```

### Setup (n8n self-hosted)

1. **Importar**: n8n → Workflows → Import from File → selecionar o JSON.
2. **Token brapi**: criar conta grátis em [brapi.dev](https://brapi.dev/dashboard), copiar o token e substituir `SEU_TOKEN_BRAPI` no nó "Ibovespa (brapi)".
3. **Chave Anthropic**: criar em [console.anthropic.com](https://console.anthropic.com) e substituir `SUA_CHAVE_ANTHROPIC` no nó "Claude — Resumo do dia". (Dá para trocar por OpenAI/outro LLM se preferir.)
4. **Gmail**: criar credencial OAuth2 do Gmail no n8n (Credentials → Gmail OAuth2) e selecionar no nó "Enviar e-mail". Destinatário já configurado: seu-email@exemplo.com.
5. **Timezone**: o workflow já está com `America/Sao_Paulo`; confirme em Settings.
6. Rodar uma vez manual (Execute Workflow) para testar antes de ativar.

## 5. Próximos passos (fases futuras)

1. **Fase 2 — Multi-agente**: replicar o padrão do TradingAgents: um sub-workflow por camada (técnico, notícias, macro) e um agente que consolida com visão bull/bear.
2. **Fase 3 — Histórico**: gravar cada resumo em planilha/banco (Google Sheets ou Postgres) para comparar previsões vs realizado.
3. **Fase 4 — Watchlist**: acompanhar ações específicas (ex.: carteira pessoal) com fundamentos via brapi/Finnhub.
4. **Alertas intraday**: segundo workflow que dispara e-mail/WhatsApp se Ibovespa ou dólar variar mais que X% no dia.

---

### Fontes da pesquisa

- [TradingAgents — TauricResearch](https://github.com/TauricResearch/TradingAgents)
- [ai-hedge-fund — virattt](https://github.com/virattt/ai-hedge-fund)
- [FinRobot — AI4Finance](https://github.com/ai4finance-foundation/finrobot)
- [Awesome AI4Finance](https://github.com/AI4Finance-Foundation/Awesome_AI4Finance)
- [awesome-quant](https://github.com/wilsonfreitas/awesome-quant)
- [awesome-ai-in-finance](https://github.com/georgezouq/awesome-ai-in-finance)
- [Best Open Source AI Trading Agents 2026 — GPTrader](https://gptrader.app/ai-trading/best-open-source-ai-trading-agents-github-2026)
- [Best AI Trading Agents 2026 — Pinggy](https://pinggy.io/blog/best_ai_trading_agents/)
