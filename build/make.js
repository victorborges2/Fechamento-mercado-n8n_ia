const fs = require('fs');
const path = require('path');
const { montarEmail } = require('./builder');

const OUT = require('path').join(__dirname, '..');

// Configuração local. `config.local.js` fica fora do repositório (ver .gitignore);
// sem ele, o build usa os valores de exemplo e o workflow sai com placeholders.
let cfg = require('./config.exemplo');
try { cfg = Object.assign({}, cfg, require('./config.local')); } catch (e) {
  console.log('Usando config.exemplo (crie build/config.local.js para os seus dados).');
}
const PARA = cfg.para;
const DE = cfg.de;
const CRON = cfg.cron;
const MODELO = cfg.modelo;
const PROVEDOR = (cfg.provedor || 'gemini').toLowerCase();

// Nome do nó que redige o texto. É referenciado pelo nó "Montar e-mail",
// então fica neutro de provedor para não quebrar ao trocar de API.
const NO_LLM = 'Análise do dia (LLM)';

// Cada provedor define URL, header de autenticação e formato do corpo.
// Groq e Grok falam o dialeto da OpenAI; o Gemini tem o seu próprio.
// O prompt é lido sempre do nó Consolidar, nunca de $json: o nó de reserva
// recebe como entrada a saída de ERRO do principal, que não tem o prompt.
const PROMPT = "$('Consolidar dados').first().json.prompt";
const corpoOpenAI = (modelo) => "={{ JSON.stringify({ model: '" + modelo + "', temperature: 0.3, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: " + PROMPT + " }] }) }}";

const catalogo = (MODELO) => ({
  gemini: {
    rotulo: 'Gemini (Google AI Studio)',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/' + MODELO + ':generateContent',
    headers: [
      { name: 'x-goog-api-key', value: 'SUA_CHAVE_GEMINI' },
      { name: 'Content-Type', value: 'application/json' }
    ],
    body: "={{ JSON.stringify({ contents: [{ parts: [{ text: " + PROMPT + " }] }], generationConfig: { responseMimeType: 'application/json' } }) }}",
    chaveEm: 'header x-goog-api-key',
    onde: 'https://aistudio.google.com/apikey'
  },
  groq: {
    rotulo: 'Groq (inferência de modelos abertos)',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    headers: [
      { name: 'Authorization', value: 'Bearer SUA_CHAVE_GROQ' },
      { name: 'Content-Type', value: 'application/json' }
    ],
    body: corpoOpenAI(MODELO),
    chaveEm: 'header Authorization, no formato "Bearer sua-chave"',
    onde: 'https://console.groq.com/keys'
  },
  grok: {
    rotulo: 'Grok (xAI)',
    url: 'https://api.x.ai/v1/chat/completions',
    headers: [
      { name: 'Authorization', value: 'Bearer SUA_CHAVE_GROK' },
      { name: 'Content-Type', value: 'application/json' }
    ],
    body: corpoOpenAI(MODELO),
    chaveEm: 'header Authorization, no formato "Bearer sua-chave"',
    onde: 'https://console.x.ai'
  }
});

const resolver = (prov, modelo, rotuloCfg) => {
  const p = catalogo(modelo)[String(prov || '').toLowerCase()];
  if (!p) {
    console.error('\nProvedor desconhecido em ' + rotuloCfg + ': "' + prov + '". Use gemini, groq ou grok.\n');
    process.exit(1);
  }
  return p;
};

const LLM = resolver(PROVEDOR, MODELO, 'config.provedor');

// Reserva: opcional. Só vira nó se estiver configurado.
const cfgRes = cfg.reserva;
const RESERVA = (cfgRes && cfgRes.provedor) ? resolver(cfgRes.provedor, cfgRes.modelo, 'config.reserva.provedor') : null;
const NO_RESERVA = 'Análise do dia (reserva)';
if (RESERVA && String(cfgRes.provedor).toLowerCase() === PROVEDOR) {
  console.log('Aviso: reserva usa o mesmo provedor do principal. Em dia de cota estourada, os dois falham juntos.');
}
const builderSrc = fs.readFileSync(path.join(__dirname, 'builder.js'), 'utf8')
  .replace(/\nif \(typeof module[\s\S]*$/, '\n'); // remove export p/ n8n
const consolidarSrc = fs.readFileSync(path.join(__dirname, 'consolidar.js'), 'utf8');

// Checagem de sintaxe ANTES de gerar o workflow.
// O código dos nós Code só é validado quando o n8n roda, então um erro bobo
// de aspas passaria direto e só apareceria na execução. Isto aborta o build.
function checarSintaxe(rotulo, codigo) {
  try {
    // os nós Code rodam dentro de uma função e usam $(), que não existe aqui;
    // o construtor só analisa a sintaxe, não executa nada
    new Function('$', '$json', '$now', codigo);
  } catch (e) {
    console.error('\nERRO DE SINTAXE em ' + rotulo + ': ' + e.message + '\nBuild abortado, nada foi gerado.\n');
    process.exit(1);
  }
}

// ---------- 1) PREVIEW com dados de exemplo ----------
// Números reais da execução de 21/10/2026 (o texto de exemplo serve só para conferir o layout)
const baseExemplo = {
  dataFmt: 'quarta-feira, 21 de outubro de 2026',
  horaFmt: '20:58',
  recorte: 'após o fechamento',
  edicao: 'Briefing diário',
  indicadores: [
    { nome: 'Ibovespa', valor: '206.495 pts', delta: -0.86, closes: [208900, 209400, 208100, 208290, 206495] },
    { nome: 'Dólar', valor: 'R$ 5,02', delta: -0.003979, closes: [5.05, 5.04, 5.03, 5.02, 5.02] },
    { nome: 'Euro', valor: 'R$ 5,64', delta: 0.086888, closes: [5.62, 5.63, 5.62, 5.64, 5.64] },
    { nome: 'S&P 500', valor: '7.757,17', delta: 0.50, closes: [7690, 7705, 7721, 7718, 7757.17] },
    { nome: 'Nasdaq', valor: '26.702,86', delta: 0.04, closes: [26610, 26680, 26590, 26692, 26702.86] },
    { nome: 'Petróleo WTI', valor: 'US$ 97,99', delta: -3.37, closes: [101.4, 102.1, 101.2, 101.4, 97.99] },
    { nome: 'Ouro', valor: 'US$ 4.143,00', delta: -0.91, closes: [4180, 4201, 4188, 4181, 4143] }
  ],
  macro: [
    { nome: 'Selic (meta)', valor: '13,75% a.a.', nota: 'vigente' },
    { nome: 'IPCA', valor: '0,82%', nota: 'último mês fechado' }
  ],
  movimentos: [
    { ticker: 'TEND3', valor: 'R$ 23,01', delta: 10.2 },
    { ticker: 'SUZB3', valor: 'R$ 47,40', delta: 10.08 },
    { ticker: 'NATU3', valor: 'R$ 5,50', delta: -6.94 },
    { ticker: 'VALE3', valor: 'R$ 63,00', delta: -2.14 }
  ],
  // catálogo bruto dos feeds (itens REAIS puxados do RSS da InfoMoney em 27/10/2026)
  noticias: [
    { fonte: 'InfoMoney', titulo: 'Ação BBAS3 fecha em queda após tombo de quase 30%; mercado mantém cautela', link: 'https://www.infomoney.com.br/mercados/bbas3-desempenho-acao-do-banco-do-brasil-apos-tombo-de-quase-30-mercado-mantem-cautela/', imagem: 'https://www.infomoney.com.br/wp-content/uploads/2024/05/Captura-de-tela-2024-05-28-170356.png?fit=300%2C169&quality=70&strip=all' },
    { fonte: 'InfoMoney', titulo: 'Prefixados do Tesouro caem até 47 pontos-base após recorde, mas IPCA+ longos sobem', link: 'https://www.infomoney.com.br/onde-investir/tesouro-direto-abertura-fechamento-27102026/', imagem: 'https://www.infomoney.com.br/wp-content/uploads/2026/02/joelfotos-money-1194986_1280.jpg?fit=300%2C200&quality=70&strip=all' },
    { fonte: 'InfoMoney', titulo: 'Gerdau agrada no 3T com desempenho nos EUA e geração de caixa robusta, mas GGBR4 cai', link: 'https://www.infomoney.com.br/mercados/gerdau-ggbr4-agrada-no-3t26-com-desempenho-nos-eua-e-geracao-de-caixa-robusta-desempenho-acoes/', imagem: 'https://www.infomoney.com.br/wp-content/uploads/2019/06/gerdau-05-fabrica.jpg?fit=300%2C198&quality=70&strip=all' },
    { fonte: 'InfoMoney', titulo: 'GM terá modelos híbridos em mudança estratégica ante elétricos', link: 'https://www.infomoney.com.br/business/gm-tera-modelos-hibridos-em-mudanca-estrategica-ante-eletricos/', imagem: 'https://www.infomoney.com.br/wp-content/uploads/2026/08/2026-08-05T113435Z_1_LYNXMPEM7410D_RTROPTP_4_GM-CHINA.jpg?fit=300%2C200&quality=70&strip=all' },
    { fonte: 'InfoMoney', titulo: 'Pesquisas de boca de urna apontam impasse em Israel e dificultam formação de governo', link: 'https://www.infomoney.com.br/mundo/pesquisas-de-bocas-de-urna-apontam-impasse-em-israel-e-dificultam-formacao-de-governo/', imagem: 'https://www.infomoney.com.br/wp-content/uploads/2026/10/2026-10-27T202839Z_1_LYNXNPEM9Q20H_RTROPTP_4_ISRAEL-ELECTION.jpg?fit=300%2C200&quality=70&strip=all' }
  ],
  falhas: []
};
const iaExemplo = {
  manchete: 'Risco eleitoral e queda do petróleo pressionam a B3, enquanto tech sustenta Nova York',
  lead: 'A quatro dias do segundo turno, o hedge contra o risco doméstico ficou mais caro e o Ibovespa fechou em queda, apesar de um cenário externo construtivo. Lá fora, balanços de tecnologia seguraram os índices americanos; no mercado de commodities, o petróleo cedeu mais de 3% e levou o ouro junto.',
  visao_geral: 'O mercado brasileiro operou descolado do exterior. Enquanto Nova York avançava com resultados corporativos acima do esperado, a B3 recuou sob o peso da incerteza eleitoral e da queda das commodities, que pesa sobre as duas maiores ações do índice.',
  brasil: 'O Ibovespa fechou em queda de 0,86%, aos 206.495 pontos, puxado pelo recuo das commodities e pela maior percepção de risco doméstico. O mercado de opções refletiu o mesmo movimento, com alta da volatilidade implícita em BBAS3, PETR4 e BOVA11 na reta final antes da votação. O dólar encerrou praticamente estável, a R$ 5,02, sustentado pelo juro de 13,75% ao ano, enquanto o IPCA de 0,82% no último mês fechado mantém o Copom sem pressa.',
  eua_mundo: 'Nas bolsas americanas, o S&P 500 subiu 0,50% e o Nasdaq avançou 0,04%, sustentados pela recepção favorável aos balanços de grandes empresas de tecnologia. No mercado de commodities, o petróleo WTI recuou 3,37%, a US$ 97,99, refletindo ajustes nas projeções de demanda e desdobramentos ligados à oferta de combustíveis. O ouro acompanhou, com queda de 0,91%, a US$ 4.143,00 a onça-troy.',
  implicacao: 'A combinação de bolsa local em queda com câmbio estável sugere que o estresse está concentrado em renda variável doméstica, não numa fuga de capital do país. Enquanto o diferencial de juros seguir nesse patamar, o real tende a absorver melhor o ruído político do que a B3, o que favorece quem monta proteção via índice em vez de via moeda.',
  entenda: { titulo: 'Por que o prêmio das opções sobe antes de uma eleição?', texto: 'Opção é um seguro: o investidor paga um prêmio para travar o preço de venda da ação. Quando cresce a chance de oscilação forte, mais gente quer esse seguro ao mesmo tempo, e o preço dele sobe. Por isso o prêmio funciona como termômetro do nervosismo, mesmo quando a bolsa ainda não caiu.' },
  vetor: 'O prêmio das opções de BOVA11 nos dias seguintes à votação: se recuar rápido, o movimento era posicionamento eleitoral e não mudança de tese.',
  noticias: [
    { i: 0, titulo: 'BBAS3 fecha em queda após tombo de quase 30% e mercado segue cauteloso', contexto: 'O Banco do Brasil concentra o estresse do setor bancário nesta semana; a reação dos analistas nos próximos pregões diz se o movimento foi exagero ou revisão de tese.' },
    { i: 1, titulo: 'Prefixados do Tesouro recuam até 47 pontos-base após recorde', contexto: 'A queda das taxas depois do pico indica demanda voltando aos títulos públicos, o que alivia a pressão sobre a curva de juros.' },
    { i: 2, titulo: 'Gerdau agrada no 3º trimestre com operação nos EUA, mas ação cai', contexto: 'Resultado forte com ação em queda costuma sinalizar que o mercado já tinha precificado o balanço e olha para o guidance.' },
    { i: 3, titulo: 'GM muda estratégia e amplia aposta em híbridos', contexto: 'A revisão de rota da maior montadora americana mexe com toda a cadeia de baterias e com as projeções de demanda por lítio.' },
    { i: 4, titulo: 'Boca de urna aponta impasse em Israel', contexto: 'Instabilidade política no Oriente Médio costuma reaparecer no prêmio de risco do petróleo em poucos pregões.' }
  ]
};
fs.mkdirSync(path.join(OUT, 'docs'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'workflow'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'docs', 'preview-email.html'), montarEmail(baseExemplo, iaExemplo));

// ---------- 2) Código do nó "Montar e-mail" ----------
// A leitura da resposta é agnóstica de provedor: Gemini devolve em
// candidates[].content.parts[].text; Groq e Grok, no formato OpenAI,
// devolvem em choices[].message.content.
const montarNodeCode = builderSrc + `
// Pode ter vindo do provedor principal ou do reserva. Tenta os dois.
function respostaLLM() {
  const nomes = ${JSON.stringify(RESERVA ? [NO_LLM, NO_RESERVA] : [NO_LLM])};
  for (const nome of nomes) {
    try {
      const r = $(nome).first().json;
      if (r && (r.candidates || r.choices)) return r;
    } catch (e) {}
  }
  return {};
}
const resp = respostaLLM();

function textoBruto(r) {
  try { return r.candidates[0].content.parts[0].text; } catch (e) {}      // Gemini
  try { return r.choices[0].message.content; } catch (e) {}               // Groq / Grok / OpenAI
  return '';
}

// alguns modelos embrulham o JSON em bloco de markdown
function soJSON(t) {
  const m = String(t).match(/\\{[\\s\\S]*\\}/);
  return m ? m[0] : t;
}

let ia = {};
const bruto = textoBruto(resp);
try {
  ia = JSON.parse(soJSON(bruto));
} catch (e) {
  ia = {
    manchete: 'Resumo do mercado',
    lead: '',
    visao_geral: bruto ? String(bruto).slice(0, 600) : 'Análise indisponível nesta execução. Os dados do painel acima vêm direto das fontes e seguem válidos.',
    brasil: '', eua_mundo: '', implicacao: '', vetor: '', noticias: []
  };
}
const base = $('Consolidar dados').first().json;
return [{ json: { html: montarEmail(base, ia) } }];
`;

checarSintaxe('consolidar.js (nó Consolidar dados)', consolidarSrc);
checarSintaxe('builder.js (nó Montar e-mail)', montarNodeCode);

// ---------- 3) Workflow v2 ----------
const http = (name, url, x, extra) => Object.assign({
  parameters: { url, options: {} },
  name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
  position: [x, 0], executeOnce: true, onError: 'continueRegularOutput'
}, extra || {});
const ua = { sendHeaders: true, headerParameters: { parameters: [{ name: 'User-Agent', value: 'Mozilla/5.0' }] } };
const rss = (name, url, x) => ({
  parameters: { url, options: {} },
  name, type: 'n8n-nodes-base.rssFeedRead', typeVersion: 1.1,
  position: [x, 0], executeOnce: true, onError: 'continueRegularOutput'
});

const nodes = [
  {
    parameters: { content: '## Briefing Diário de Mercado\n\nRedação por: ' + LLM.rotulo + ' (' + MODELO + ')\n\nAntes de ativar:\n1. Token brapi nos nós "Ibovespa (brapi)" e "Ranking B3" — grátis em brapi.dev\n2. Chave do provedor no ' + LLM.chaveEm + ' do nó "' + NO_LLM + '" — obtenha em ' + LLM.onde + '\n3. Selecionar a credencial SMTP no nó "Enviar e-mail" (senha de app)\n4. Testar com Execute Workflow\n\nPara trocar de provedor: edite build/config.local.js e rode node make.js', height: 300, width: 380 },
    name: 'Instruções', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [-200, -260]
  },
  {
    parameters: { rule: { interval: [{ field: 'cronExpression', expression: CRON }] } },
    name: 'Seg-Sex 7h30', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [-200, 0]
  },
  http('Ibovespa (brapi)', 'https://brapi.dev/api/quote/%5EBVSP?token=SEU_TOKEN_BRAPI', 20),
  http('Ibovespa 5d (Yahoo)', 'https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?range=5d&interval=1d', 20, { position: [20, 180] }),
  http('Câmbio (AwesomeAPI)', 'https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL', 240),
  http('Histórico Dólar (AwesomeAPI)', 'https://economia.awesomeapi.com.br/json/daily/USD-BRL/6', 460),
  http('Histórico Euro (AwesomeAPI)', 'https://economia.awesomeapi.com.br/json/daily/EUR-BRL/6', 680),
  http('Selic (BCB)', 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json', 900),
  http('IPCA (BCB)', 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/1?formato=json', 1120),
  http('S&P 500 (Yahoo)', 'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=5d&interval=1d', 1340),
  http('S&P 500 (Stooq)', 'https://stooq.com/q/d/l/?s=%5Espx&i=d', 1340, { position: [1340, 180] }),
  http('Nasdaq (Yahoo)', 'https://query1.finance.yahoo.com/v8/finance/chart/%5EIXIC?range=5d&interval=1d', 1560),
  http('Nasdaq (Stooq)', 'https://stooq.com/q/d/l/?s=%5Endq&i=d', 1560, { position: [1560, 180] }),
  http('Petróleo WTI (Yahoo)', 'https://query1.finance.yahoo.com/v8/finance/chart/CL=F?range=5d&interval=1d', 1780),
  http('Petróleo WTI (Stooq)', 'https://stooq.com/q/d/l/?s=cl.f&i=d', 1780, { position: [1780, 180] }),
  http('Ouro (Yahoo)', 'https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=5d&interval=1d', 2000),
  http('Ouro (Stooq)', 'https://stooq.com/q/d/l/?s=gc.f&i=d', 2000, { position: [2000, 180] }),
  http('Ranking B3 altas (brapi)', 'https://brapi.dev/api/quote/list?sortBy=change&sortOrder=desc&limit=80&token=SEU_TOKEN_BRAPI', 2120),
  http('Ranking B3 baixas (brapi)', 'https://brapi.dev/api/quote/list?sortBy=change&sortOrder=asc&limit=80&token=SEU_TOKEN_BRAPI', 2170, { position: [2120, 180] }),
  rss('Notícias BR (InfoMoney)', 'https://www.infomoney.com.br/feed/', 2220),
  rss('Notícias BR (Money Times)', 'https://www.moneytimes.com.br/feed/', 2320),
  rss('Notícias BR (Exame)', 'https://exame.com/feed/', 2420),
  rss('Notícias BR (G1 Economia)', 'https://g1.globo.com/rss/g1/economia/', 2520),
  rss('Notícias Global (CNBC)', 'https://www.cnbc.com/id/100003114/device/rss/rss.html', 2620),
  {
    parameters: { jsCode: consolidarSrc },
    name: 'Consolidar dados', type: 'n8n-nodes-base.code', typeVersion: 2, position: [2760, 0]
  },
  {
    parameters: {
      method: 'POST',
      url: LLM.url,
      sendHeaders: true,
      headerParameters: { parameters: LLM.headers },
      sendBody: true, specifyBody: 'json',
      jsonBody: LLM.body,
      options: {}
    },
    name: NO_LLM, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
    retryOnFail: true, maxTries: 3, waitBetweenTries: 10000,
    // com reserva, a falha sai por uma segunda saída em vez de derrubar o fluxo
    onError: RESERVA ? 'continueErrorOutput' : 'stopWorkflow',
    position: [2960, 0], executeOnce: true
  },
  ...(RESERVA ? [{
    parameters: {
      method: 'POST',
      url: RESERVA.url,
      sendHeaders: true,
      headerParameters: { parameters: RESERVA.headers },
      sendBody: true, specifyBody: 'json',
      jsonBody: RESERVA.body,
      options: {}
    },
    name: NO_RESERVA, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
    position: [2960, 200], executeOnce: true,
    retryOnFail: true, maxTries: 2, waitBetweenTries: 8000,
    onError: 'continueRegularOutput'
  }] : []),
  {
    parameters: { jsCode: montarNodeCode },
    name: 'Montar e-mail (Malibu)', type: 'n8n-nodes-base.code', typeVersion: 2, position: [3160, 0]
  },
  {
    // SMTP (senha de app do Gmail), não o nó Gmail OAuth: o token OAuth expirava a cada 7 dias
    parameters: {
      fromEmail: DE,
      toEmail: PARA,
      subject: "={{ 'Briefing de Mercado — ' + $now.setZone('America/Sao_Paulo').toFormat('dd/LL/yyyy') }}",
      emailFormat: 'html',
      html: '={{ $json.html }}',
      options: {}
    },
    name: 'Enviar e-mail', type: 'n8n-nodes-base.emailSend', typeVersion: 2.1, position: [3360, 0], executeOnce: true
  }
];

const ordem = ['Seg-Sex 7h30', 'Ibovespa (brapi)', 'Ibovespa 5d (Yahoo)', 'Câmbio (AwesomeAPI)', 'Histórico Dólar (AwesomeAPI)', 'Histórico Euro (AwesomeAPI)', 'Selic (BCB)', 'IPCA (BCB)',
  'S&P 500 (Yahoo)', 'S&P 500 (Stooq)', 'Nasdaq (Yahoo)', 'Nasdaq (Stooq)', 'Petróleo WTI (Yahoo)', 'Petróleo WTI (Stooq)', 'Ouro (Yahoo)', 'Ouro (Stooq)',
  'Ranking B3 altas (brapi)', 'Ranking B3 baixas (brapi)',
  'Notícias BR (InfoMoney)', 'Notícias BR (Money Times)', 'Notícias BR (Exame)', 'Notícias BR (G1 Economia)', 'Notícias Global (CNBC)',
  'Consolidar dados', NO_LLM, 'Montar e-mail (Malibu)', 'Enviar e-mail'];
// aplica User-Agent nos nós Yahoo
for (const n of nodes) if (n.name && n.name.includes('(Yahoo)')) Object.assign(n.parameters, ua);

const connections = {};
for (let i = 0; i < ordem.length - 1; i++) {
  connections[ordem[i]] = { main: [[{ node: ordem[i + 1], type: 'main', index: 0 }]] };
}

// Com reserva, o nó do LLM ganha duas saídas:
//   índice 0 = sucesso  → segue para a montagem do e-mail
//   índice 1 = erro     → desvia para o provedor de reserva, que depois converge
// para a mesma montagem. Quem falhar não derruba o briefing.
if (RESERVA) {
  const montagem = [{ node: 'Montar e-mail (Malibu)', type: 'main', index: 0 }];
  connections[NO_LLM] = { main: [montagem, [{ node: NO_RESERVA, type: 'main', index: 0 }]] };
  connections[NO_RESERVA] = { main: [montagem] };
}

const wf = { name: 'Briefing Diário de Mercado', nodes, connections, settings: { timezone: 'America/Sao_Paulo', executionOrder: 'v1' }, pinData: {} };

// 1) versão pública: sem e-mail pessoal, pronta para o repositório
const publico = JSON.parse(JSON.stringify(wf));
JSON.stringify(publico); // garante serializável
const limpo = JSON.stringify(publico, null, 2)
  .split(PARA).join('seu-email@exemplo.com')
  .split(DE).join('seu-email@gmail.com');
fs.writeFileSync(path.join(OUT, 'workflow', 'briefing-mercado.json'), limpo);

// 2) versão local: com os seus dados, fora do repositório (.gitignore)
fs.writeFileSync(path.join(OUT, 'workflow', 'briefing-mercado.local.json'), JSON.stringify(wf, null, 2));

console.log('OK: sintaxe validada. Gerados preview, briefing-mercado.json (público) e briefing-mercado.local.json (seu).');
