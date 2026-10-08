// POST /api/agente — o agente Navi testa estratégias com a ferramenta de pesquisa e escolhe o melhor preço.
const { pesquisar, claude, textoDe, jsonDe, limitar, responder, erro, cidade } = require("./_lib");
const FERRAMENTA = {
  name: "procurar_voos",
  description: "Procura voos com o mesmo número de pessoas e moeda do cliente. Devolve até 5 itinerários mais baratos (preço total estimado para todos os passageiros, taxas incluídas). Datas em AAAA-MM-DD.",
  input_schema: { type: "object", properties: {
    origem: { type: "string", description: "Código IATA de partida (ex.: CAC)" },
    destino: { type: "string", description: "Código IATA de chegada (ex.: LIS)" },
    partida_de: { type: "string", description: "Primeira data de partida possível, AAAA-MM-DD" },
    partida_ate: { type: "string", description: "Última data de partida possível (opcional)" },
    regresso: { type: "string", description: "Data exata de regresso (opcional)" },
    ficar_min: { type: "integer", description: "Mínimo de noites no destino (opcional)" },
    ficar_max: { type: "integer", description: "Máximo de noites no destino (opcional)" },
    so_ida: { type: "boolean" }, max_paragens: { type: "integer" } }, required: ["origem", "destino", "partida_de"] }
};
const dmy = iso => iso.split("-").reverse().join("/");
module.exports = async (req, res) => {
  if (req.method !== "POST") return responder(res, 405, { error: "Use POST" });
  if (!limitar(req, 6, "agente")) return responder(res, 429, { error: "Muitos pedidos ao agente. Tente daqui a um minuto.", code: "rate_limited" });
  const { pedido = {}, base = {}, factos = {}, perfil = {} } = req.body || {};
  const found = {}; const log = []; let chamadas = 0;
  const brief = it => ({ id: it.id, preco: it.price, ida: it.outbound.departureTime.slice(0, 16), volta: it.inbound ? it.inbound.departureTime.slice(0, 16) : null, rota: `${it.outbound.from}-${it.outbound.to}`, escalas_ida: it.outbound.stops, escalas_volta: it.inbound ? it.inbound.stops : null, horas_total: +(it.totalDurationSeconds / 3600).toFixed(1), companhia: it.outbound.segments[0].carrierName });
  async function executar(inp) {
    chamadas++; if (chamadas > 6) return { erro: "Limite de pesquisas atingido. Escolhe a melhor opção já encontrada." };
    const q = { flyFrom: inp.origem, flyTo: inp.destino, departureDate: dmy(String(inp.partida_de)), currency: pedido.moeda, adults: pedido.adultos, children: pedido.criancas };
    if (inp.partida_ate) q.departureDateTo = dmy(String(inp.partida_ate));
    if (!inp.so_ida) { if (inp.regresso) q.returnDate = dmy(String(inp.regresso)); else if (inp.ficar_min) { q.nights_in_dst_from = +inp.ficar_min; q.nights_in_dst_to = +(inp.ficar_max || inp.ficar_min); } }
    if (inp.max_paragens != null) q.max_sector_stopovers = +inp.max_paragens;
    const txt = `${cidade(String(inp.origem).toUpperCase())} → ${cidade(String(inp.destino).toUpperCase())}, partida ${inp.partida_de}${inp.partida_ate ? " a " + inp.partida_ate : ""}${inp.so_ida ? " (só ida)" : ""}`;
    try {
      const l = (await pesquisar(q)).slice(0, 5); l.forEach(it => { found[it.id] = it; });
      log.push(l.length ? `${txt}: desde ${l[0].price} ${String(pedido.moeda || "").toUpperCase()}` : `${txt}: sem voos`);
      return { resultados: l.map(brief) };
    } catch (e) { log.push(`${txt}: erro`); return { erro: e.message }; }
  }
  const system = "És a Navi, agente de preços de voos. A tua missão é encontrar o preço total mais baixo para o cliente, sem o enganar. Usa a ferramenta para testar estratégias concretas e no fim respondes apenas com JSON.";
  const user = `Pedido do cliente: ${JSON.stringify(pedido)}
Perfil: ${JSON.stringify(perfil)}. Respeita o número máximo de escalas que aceita.
Melhor opção da pesquisa normal: ${JSON.stringify(base)}
Factos: ${JSON.stringify(factos)}
Hoje é ${new Date().toISOString().slice(0, 10)}.
Regras: no máximo 5 pesquisas; testa aeroportos próximos da origem e do destino (até ~450 km), datas um pouco diferentes dentro do que o cliente aceita, e duas viagens só de ida. Só recomendas itinerários devolvidos pela ferramenta (pelo id) ou a opção base (id ${base.id}). Os preços são das últimas 48 horas e a bagagem não é conhecida: diz que o cliente deve confirmar no site.
Responde no fim só com JSON: {"melhor_ids":["id"],"resumo":"2-3 frases em português europeu simples, a tratar o cliente por si","poupanca":numero}`;
  const messages = [{ role: "user", content: user }];
  try {
    let r;
    for (let ronda = 0; ronda < 7; ronda++) {
      r = await claude({ system, messages, tools: [FERRAMENTA], maxTokens: 1500 });
      if (r.stop_reason !== "tool_use") break;
      messages.push({ role: "assistant", content: r.content });
      const resultados = [];
      for (const b of r.content) if (b.type === "tool_use") resultados.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(await executar(b.input || {})) });
      messages.push({ role: "user", content: resultados });
    }
    const j = jsonDe(textoDe(r)) || {};
    const escolhidos = (Array.isArray(j.melhor_ids) ? j.melhor_ids : []).map(id => found[id]).filter(Boolean);
    responder(res, 200, { resumo: j.resumo || "", escolhidos, log });
  } catch (e) { erro(res, e); }
};
