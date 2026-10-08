// GET /api/estado — diz à app que funcionalidades estão ligadas (sem revelar chaves).
module.exports = (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ precos: !!process.env.TRAVELPAYOUTS_TOKEN, agente: !!process.env.ANTHROPIC_API_KEY });
};
