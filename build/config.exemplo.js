// Copie este arquivo para `config.local.js` e preencha com os seus dados.
// `config.local.js` está no .gitignore e nunca vai para o repositório.
//
//   cp build/config.exemplo.js build/config.local.js
//
// Se o arquivo não existir, o build usa os valores de exemplo abaixo e o
// workflow gerado sai com placeholders, que é o que deve ir para o GitHub.

module.exports = {
  // Quem recebe o briefing
  para: 'seu-email@exemplo.com',

  // Conta que envia (a mesma da senha de app do SMTP)
  de: 'seu-email@gmail.com',

  // Horário do disparo, em formato cron. Padrão: 20h, de segunda a sexta.
  //
  // Por que 20h: a B3 encerra entre 16h55 e 18h dependendo do horário de verão
  // americano, o after-market vai até por volta das 18h, Nova York fecha às 18h
  // ou 19h pelo horário de Brasília, e os portais levam mais um tempo para
  // publicar as matérias de fechamento. Às 20h tudo já consolidou, em qualquer
  // época do ano. Rodar antes disso traz número parcial e notícia incompleta.
  cron: '0 20 * * 1-5',

  // Quem redige o texto do briefing: 'gemini' ou 'grok'.
  // Trocar aqui e rodar `node make.js` já gera o nó certo, com a URL,
  // o header de autenticação e o formato de corpo de cada um.
  provedor: 'gemini',

  // Modelo usado. Precisa existir no provedor escolhido acima.
  //   gemini → gemini-3.5-flash, gemini-2.5-flash, ...
  //   grok   → grok-4.6, grok-4.5, ...
  // Para ver o que a sua chave enxerga:
  //   Gemini: https://generativelanguage.googleapis.com/v1beta/models?key=SUA_CHAVE
  //   Grok:   https://api.x.ai/v1/models  (com header Authorization: Bearer SUA_CHAVE)
  modelo: 'gemini-3.5-flash',

  // Provedor de reserva. Se a chamada principal falhar (cota estourada, 503,
  // timeout), o fluxo desvia pela saída de erro e tenta este aqui.
  // Use um provedor DIFERENTE do principal: a cota é contada por provedor,
  // então um reserva na mesma casa não resolve dia de limite batido.
  // Deixe como null para não criar o nó de reserva.
  reserva: {
    provedor: 'groq',
    modelo: 'openai/gpt-oss-120b'
  }
};
