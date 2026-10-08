// GET /api/estado — diz à app que funcionalidades estão ligadas (sem revelar chaves secretas).
module.exports = (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    precos: !!process.env.TRAVELPAYOUTS_TOKEN,
    agente: !!process.env.ANTHROPIC_API_KEY,
    marker: process.env.TRAVELPAYOUTS_MARKER || "787293", // público
    kiwiP: process.env.TP_KIWI_P || "", // número do programa Kiwi.com na Travelpayouts (público)
    pais: String(req.headers["x-vercel-ip-country"] || "").toUpperCase().slice(0, 2) // país do cliente (dado pelo Vercel)
  });
};
