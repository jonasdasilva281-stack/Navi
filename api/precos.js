// POST /api/precos — pesquisa de voos (preços Travelpayouts/Aviasales).
const { pesquisar, limitar, responder, erro } = require("./_lib");
module.exports = async (req, res) => {
  if (req.method !== "POST") return responder(res, 405, { error: "Use POST" });
  if (!limitar(req, 60, "precos")) return responder(res, 429, { error: "Muitos pedidos. Tente daqui a um minuto.", code: "rate_limited" });
  try { const itineraries = await pesquisar(req.body || {}); responder(res, 200, { itineraries }); }
  catch (e) { erro(res, e); }
};
