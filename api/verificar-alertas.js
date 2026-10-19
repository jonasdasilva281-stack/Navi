// GET /api/verificar-alertas — corre uma vez por dia (Vercel Cron) e envia e-mail quando o preço baixa.
const L = require("./_lib");
const A = require("./_alertas");
module.exports = async (req, res) => {
  const segredo = process.env.CRON_SECRET;
  if (segredo && req.headers.authorization !== "Bearer " + segredo) return L.responder(res, 401, { error: "Não autorizado" });
  try {
    const ids = (await L.redis("SMEMBERS", "alertas")) || [];
    const hoje = new Date().toISOString().slice(0, 10);
    const r = { total: ids.length, verificados: 0, avisos: 0, expirados: 0 };
    const t0 = Date.now();
    for (const id of ids.slice(0, 250)) {
      if (Date.now() - t0 > 50000) break; // limite de tempo do Vercel; os restantes ficam para amanhã
      const raw = await L.redis("GET", "alerta:" + id);
      if (!raw) { await L.redis("SREM", "alertas", id); continue; }
      const a = JSON.parse(raw);
      if (a.ida < hoje) { await L.redis("DEL", "alerta:" + id); await L.redis("SREM", "alertas", id); await L.redis("SREM", "alertas:email:" + a.email, id); r.expirados++; continue; }
      if (a.verificado === hoje) continue;
      const p = await A.precoAtual(a).catch(() => null);
      a.verificado = hoje; r.verificados++;
      if (p) {
        const preco = p.preco, antes = a.ultimo;
        const abaixoAlvo = a.alvo && preco <= a.alvo && (!a.avisado || preco < a.avisado * 0.97);
        const desceu = !a.alvo && antes && preco <= antes * 0.95 && (!a.avisado || preco < a.avisado * 0.97);
        if (abaixoAlvo || desceu) {
          const ok = await L.enviarEmail(a.email, `Baixou: ${A.rotaTxt(a)} por ${A.dinheiro(preco, a.moeda)}`, A.emailBaixou(a, preco, antes)).catch(() => false);
          if (ok) { a.avisado = preco; r.avisos++; }
        }
        a.ultimo = preco;
      }
      await L.redis("SET", "alerta:" + id, JSON.stringify(a));
    }
    L.responder(res, 200, r);
  } catch (e) { L.erro(res, e); }
};
