// POST /api/datas — dias mais baratos de um mês, com preços de hoje (Ignav).
const { ignavDatas, limitar, responder, erro } = require("./_lib");
module.exports = async (req, res) => {
  if (req.method !== "POST") return responder(res, 405, { error: "Use POST" });
  if (!limitar(req, 20, "datas")) return responder(res, 429, { error: "Muitos pedidos. Tente daqui a um minuto.", code: "rate_limited" });
  try { const datas = await ignavDatas(req.body || {}); responder(res, 200, { vivo: datas !== null, datas: datas || [] }); }
  catch (e) { erro(res, e); }
};
