// POST /api/vizinhos — aeroportos próximos e destinos "além" (para bilhetes com paragem no destino).
const { claude, textoDe, jsonDe, limitar, responder, erro } = require("./_lib");
module.exports = async (req, res) => {
  if (req.method !== "POST") return responder(res, 405, { error: "Use POST" });
  if (!limitar(req, 20, "vizinhos")) return responder(res, 429, { error: "Muitos pedidos.", code: "rate_limited" });
  const b = req.body || {}; const o = String(b.origem || "").slice(0, 80), d = String(b.destino || "").slice(0, 80), dc = String(b.destCode || "").slice(0, 3);
  try {
    const r = await claude({ rapido: true, maxTokens: 400, system: "Conheces aeroportos comerciais do mundo. Respondes apenas com JSON válido.",
      messages: [{ role: "user", content: `Viagem de "${o}" para "${d}"${dc ? ` (${dc})` : ""}.
1) "partida": até 2 outros aeroportos com voos comerciais regulares a menos de 450 km de ${o} (não o próprio).
2) "destino": até 2 outros aeroportos com voos comerciais regulares a menos de 450 km de ${d} (não o próprio).
3) "alem": até 6 aeroportos de destinos mais longe para onde os voos a partir de ${o} costumam fazer escala em ${d}.
Formato: {"partida":[{"iata":"IGU","cidade":"Foz do Iguaçu","km":140}],"destino":[{"iata":"OPO","cidade":"Porto","km":310}],"alem":["MAD"]}` }] });
    responder(res, 200, jsonDe(textoDe(r)) || { partida: [], destino: [], alem: [] });
  } catch (e) { erro(res, e); }
};
