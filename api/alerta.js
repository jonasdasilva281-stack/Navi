// POST /api/alerta — cria um alerta de preço.  GET /api/alerta?cancelar=ID&t=TOKEN — cancela.
const crypto = require("crypto");
const L = require("./_lib");
const A = require("./_alertas");
const MAX_POR_EMAIL = 5;

function pagina(res, titulo, texto) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(`<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo} · Navi</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1a2c;font-family:Arial,sans-serif;padding:16px">
<div style="max-width:420px;background:#fff;border-radius:18px;padding:28px;text-align:center;color:#0b1a2c">
<p style="font-family:Georgia,serif;font-size:28px;margin:0 0 12px">na<span style="color:#e4572e">v</span>i</p>
<h1 style="font-family:Georgia,serif;font-weight:normal;font-size:22px">${titulo}</h1><p style="color:#5b6776;line-height:1.5">${texto}</p>
<p><a href="/" style="display:inline-block;background:#e4572e;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:999px">Ir para a Navi</a></p></div></body></html>`);
}

module.exports = async (req, res) => {
  try {
    if (req.method === "GET" && req.query && req.query.cancelar) {
      const id = String(req.query.cancelar), t = String(req.query.t || "");
      const raw = await L.redis("GET", "alerta:" + id);
      if (!raw) return pagina(res, "Alerta já cancelado", "Este alerta já não existe. Não vai receber mais avisos sobre ele.");
      const a = JSON.parse(raw);
      if (a.t !== t) return pagina(res, "Link inválido", "Não conseguimos confirmar este pedido. Use o link do último e-mail que recebeu.");
      await L.redis("DEL", "alerta:" + id); await L.redis("SREM", "alertas", id); await L.redis("SREM", "alertas:email:" + a.email, id);
      return pagina(res, "Alerta cancelado", `Não vai receber mais avisos sobre ${L.escHtml(A.rotaTxt(a))}.`);
    }
    if (req.method !== "POST") return L.responder(res, 405, { error: "Use POST" });
    if (!L.limitar(req, 10, "alerta")) return L.responder(res, 429, { error: "Muitos pedidos. Tente daqui a um minuto.", code: "rate_limited" });
    const b = req.body || {};
    const email = String(b.email || "").trim().toLowerCase();
    if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email)) return L.responder(res, 400, { error: "Escreva um e-mail válido.", code: "input" });
    const o = L.iata(b.origem), d = L.iata(b.destino), ida = String(b.ida || ""), volta = b.volta ? String(b.volta) : null;
    if (!o || !d || !/^\d{4}-\d{2}-\d{2}$/.test(ida) || (volta && !/^\d{4}-\d{2}-\d{2}$/.test(volta))) return L.responder(res, 400, { error: "Escolha primeiro a viagem (origem, destino e datas).", code: "input" });
    if (ida < new Date().toISOString().slice(0, 10)) return L.responder(res, 400, { error: "A data de ida já passou.", code: "input" });
    const moeda = /^[A-Z]{3}$/.test(String(b.moeda || "").toUpperCase()) ? String(b.moeda).toUpperCase() : "EUR";
    const atuais = await L.redis("SMEMBERS", "alertas:email:" + email) || [];
    if (atuais.length >= MAX_POR_EMAIL) return L.responder(res, 400, { error: `Já tem ${MAX_POR_EMAIL} alertas ativos com este e-mail. Cancele um para criar outro.`, code: "input" });
    const a = { id: crypto.randomBytes(8).toString("hex"), t: crypto.randomBytes(16).toString("hex"), email, o, d, ida, volta,
      ad: Math.max(1, Math.min(9, +b.adultos || 1)), ch: Math.max(0, Math.min(8, +b.criancas || 0)), moeda,
      alvo: +b.alvo > 0 ? Math.round(+b.alvo) : null, ultimo: +b.precoAtual > 0 ? Math.round(+b.precoAtual) : null, avisado: null,
      criado: new Date().toISOString(), verificado: null,
      on: String(b.nomeOrigem || "").slice(0, 40) || null, dn: String(b.nomeDestino || "").slice(0, 40) || null };
    await L.redis("SET", "alerta:" + a.id, JSON.stringify(a));
    await L.redis("SADD", "alertas", a.id); await L.redis("SADD", "alertas:email:" + email, a.id);
    const enviado = await L.enviarEmail(email, `Alerta ativo: ${A.rotaTxt(a)}`, A.emailConfirmacao(a)).catch(() => false);
    L.responder(res, 200, { ok: true, id: a.id, t: a.t, email: enviado });
  } catch (e) { L.erro(res, e); }
};
