// Lógica dos alertas de preço (partilhada pelo pedido do cliente e pela verificação diária).
const L = require("./_lib");
const SITE = process.env.SITE_URL || "https://www.voenavi.pt";
const dmy = iso => iso.split("-").reverse().join("/");
const dinheiro = (n, m) => { try { return new Intl.NumberFormat(m === "BRL" ? "pt-BR" : "pt-PT", { style: "currency", currency: m, maximumFractionDigits: 0 }).format(n); } catch { return Math.round(n) + " " + m; } };
const diaTxt = iso => { const [y, m, d] = iso.split("-").map(Number); const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]; return `${d} ${MES[m - 1]} ${y}`; };

function linkViagem(a, preco) {
  const q = new URLSearchParams({ de: a.o, para: a.d, ida: a.ida, on: a.on || L.cidade(a.o), dn: a.dn || L.cidade(a.d) });
  if (a.volta) q.set("volta", a.volta);
  if (preco) { q.set("p", String(preco)); q.set("m", a.moeda); q.set("v", new Date().toISOString().slice(0, 10)); }
  q.set("utm_source", "alerta"); q.set("utm_medium", "email");
  return SITE + "/?" + q.toString();
}
const linkCancelar = a => `${SITE}/api/alerta?cancelar=${encodeURIComponent(a.id)}&t=${encodeURIComponent(a.t)}`;
const rotaTxt = a => `${a.on || L.cidade(a.o)} → ${a.dn || L.cidade(a.d)}`;
const datasTxt = a => a.volta ? `${diaTxt(a.ida)} → ${diaTxt(a.volta)}` : `${diaTxt(a.ida)} · só ida`;

// Preço mais baixo de hoje: primeiro ao vivo (Ignav), senão os preços guardados.
async function precoAtual(a) {
  const input = { flyFrom: a.o, flyTo: a.d, departureDate: dmy(a.ida), returnDate: a.volta ? dmy(a.volta) : null, currency: a.moeda, adults: a.ad || 1, children: a.ch || 0, allow_self_transfer: true };
  try { const v = await L.ignavPesquisa(input); if (v.length) return { preco: Math.min(...v.map(x => x.price)), vivo: true }; } catch { }
  try { const r = await L.pesquisar(input); if (r.length) return { preco: Math.min(...r.map(x => x.price)), vivo: false }; } catch (e) { if (e.code === "config") throw e; }
  return null;
}

function emailConfirmacao(a) {
  const corpo = `<p style="font-size:16px;line-height:1.5;margin:0 0 8px"><b>${L.escHtml(rotaTxt(a))}</b><br>${L.escHtml(datasTxt(a))} · ${a.ad + (a.ch || 0)} pessoa${a.ad + (a.ch || 0) > 1 ? "s" : ""}</p>
<p style="font-size:15px;line-height:1.5;color:#3d4a5a">${a.alvo ? `Avisamos assim que o preço ficar abaixo de <b>${dinheiro(a.alvo, a.moeda)}</b>.` : "Avisamos sempre que o preço descer."}${a.ultimo ? ` Hoje o preço mais baixo é ${dinheiro(a.ultimo, a.moeda)}.` : ""} Verificamos uma vez por dia.</p>`;
  return L.emailBase("O seu alerta de preço está ativo ✈️", corpo, "Ver a viagem na Navi", linkViagem(a, a.ultimo), `Não quer receber mais avisos? <a href="${linkCancelar(a)}" style="color:#5b6776">Cancelar este alerta</a>.`);
}
function emailBaixou(a, preco, antes) {
  const corpo = `<p style="font-size:16px;line-height:1.5;margin:0 0 8px"><b>${L.escHtml(rotaTxt(a))}</b><br>${L.escHtml(datasTxt(a))}</p>
<p style="font-size:30px;font-weight:bold;color:#e4572e;margin:12px 0 4px">${dinheiro(preco, a.moeda)}</p>
<p style="font-size:15px;line-height:1.5;color:#3d4a5a;margin:0">${antes ? `Antes: ${dinheiro(antes, a.moeda)} · desceu ${dinheiro(antes - preco, a.moeda)}.` : ""} Os preços baixos costumam durar pouco.</p>`;
  return L.emailBase("Boa notícia: o preço baixou!", corpo, "Ver o preço de hoje", linkViagem(a, preco), `Recebe este e-mail porque criou um alerta na Navi. <a href="${linkCancelar(a)}" style="color:#5b6776">Cancelar este alerta</a>.`);
}
module.exports = { precoAtual, emailConfirmacao, emailBaixou, linkViagem, linkCancelar, rotaTxt, datasTxt, dinheiro };
