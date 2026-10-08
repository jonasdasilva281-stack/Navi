// Funções partilhadas pelo servidor da Navi (Vercel Serverless, Node 18+).
// Chaves lidas das variáveis de ambiente do Vercel — nunca no código.
const AEROPORTOS = require("./_aeroportos.json"); // IATA -> [cidade, fuso horário]

const TP_TOKEN = process.env.TRAVELPAYOUTS_TOKEN || "";
const TP_MARKER = process.env.TRAVELPAYOUTS_MARKER || "";
const TP_MARKET = process.env.TRAVELPAYOUTS_MARKET || ""; // ex.: "br" ou "pt" (opcional)
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODELO = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const MODELO_RAPIDO = process.env.ANTHROPIC_MODEL_RAPIDO || "claude-haiku-4-5-20251001";

/* ---------- utilitários ---------- */
function fromDMY(s) { if (!s) return null; const m = String(s).match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null); }
function addDays(iso, n) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function monthsBetween(a, b) { const out = []; let y = +a.slice(0, 4), m = +a.slice(5, 7); const ye = +b.slice(0, 4), me = +b.slice(5, 7); while (y < ye || (y === ye && m <= me)) { out.push(`${y}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; y++; } if (out.length > 3) break; } return out; }
function daysDiff(a, b) { return Math.round((new Date(b.slice(0, 10) + "T00:00:00Z") - new Date(a.slice(0, 10) + "T00:00:00Z")) / 86400000); }
function iata(s) { const m = String(s || "").match(/\(([A-Za-z]{3})\)/); if (m) return m[1].toUpperCase(); const w = String(s || "").trim(); return /^[A-Za-z]{3}$/.test(w) ? w.toUpperCase() : ""; }
function cidade(code) { return (AEROPORTOS[code] && AEROPORTOS[code][0]) || code; }
// Hora local no aeroporto de chegada, a partir da partida (com fuso) + duração.
function chegadaLocal(partidaISO, minutos, codigoDestino) {
  const t = new Date(partidaISO).getTime() + minutos * 60000;
  const tz = AEROPORTOS[codigoDestino] && AEROPORTOS[codigoDestino][1];
  try {
    const p = new Intl.DateTimeFormat("sv-SE", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(t));
    return p.replace(" ", "T") + ":00";
  } catch { return new Date(t).toISOString().slice(0, 19); }
}

/* ---------- companhias aéreas (nome a partir do código) ---------- */
let COMPANHIAS = null;
async function nomeCompanhia(code) {
  if (!COMPANHIAS) {
    COMPANHIAS = {};
    try {
      const r = await fetch("https://api.travelpayouts.com/data/en/airlines.json", { headers: { "Accept-Encoding": "gzip, deflate" } });
      const arr = await r.json();
      arr.forEach(a => { if (a.code) COMPANHIAS[a.code] = (a.name_translations && a.name_translations.en) || a.name || a.code; });
    } catch { /* sem nomes: usa o código */ }
  }
  return COMPANHIAS[code] || code;
}

/* ---------- Travelpayouts: pedidos ---------- */
async function tpPricesForDates(q) {
  if (!TP_TOKEN) throw Object.assign(new Error("Falta configurar TRAVELPAYOUTS_TOKEN no Vercel."), { code: "config" });
  const u = new URL("https://api.travelpayouts.com/aviasales/v3/prices_for_dates");
  Object.entries(q).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v)); });
  if (TP_MARKET) u.searchParams.set("market", TP_MARKET);
  u.searchParams.set("token", TP_TOKEN);
  const r = await fetch(u, { headers: { "Accept-Encoding": "gzip, deflate" } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) throw Object.assign(new Error(j.error || `Travelpayouts respondeu ${r.status}`), { code: "upstream" });
  return Array.isArray(j.data) ? j.data : [];
}

function linkAfiliado(link) {
  if (!link) return null;
  const base = "https://www.aviasales.com" + (link.startsWith("/") ? link : "/" + link);
  return TP_MARKER ? base + (base.includes("?") ? "&" : "?") + "marker=" + encodeURIComponent(TP_MARKER) : base;
}

// Converte um resultado do Travelpayouts no formato de itinerário usado pela app.
async function normalizar(t, pax) {
  const nome = await nomeCompanhia(t.airline);
  const o = t.origin_airport || t.origin, d = t.destination_airport || t.destination;
  const durIda = t.duration_to || t.duration || 0, durVolta = t.duration_back || 0;
  const perna = (de, para, partida, minutos, escalas) => ({
    from: de, to: para, departureTime: String(partida).slice(0, 19), arrivalTime: chegadaLocal(partida, minutos, para),
    durationSeconds: minutos * 60, stops: escalas || 0, route: [de, para],
    segments: [{ from: de, to: para, fromCity: cidade(de), toCity: cidade(para), departureTime: String(partida).slice(0, 19), arrivalTime: chegadaLocal(partida, minutos, para), carrier: t.airline, carrierName: nome, flightNumber: String(t.flight_number || "") }]
  });
  const it = {
    id: [o, d, t.departure_at, t.return_at || "", t.airline, t.flight_number, t.price].join("|"),
    price: Math.round(t.price * pax), unitPrice: t.price,
    totalDurationSeconds: (durIda + durVolta) * 60,
    bookingUrl: linkAfiliado(t.link),
    baggage: null, // a API não indica a bagagem
    cached: true,
    outbound: perna(o, d, t.departure_at, durIda, t.transfers)
  };
  if (t.return_at) it.inbound = perna(d, o, t.return_at, durVolta, t.return_transfers);
  return it;
}

/*
 * Pesquisa de voos com os mesmos parâmetros que a app usa
 * (flyFrom, flyTo, departureDate dd/mm/aaaa, departureDateTo, returnDate,
 *  nights_in_dst_from/to, max_sector_stopovers, currency, adults, children, sort).
 */
async function pesquisar(input) {
  const origem = iata(input.flyFrom), destino = iata(input.flyTo);
  if (!origem || !destino) throw Object.assign(new Error("Escolha a origem e o destino da lista de sugestões (com o código do aeroporto)."), { code: "input" });
  const pax = Math.max(1, (+input.adults || 1) + (+input.children || 0));
  const moeda = String(input.currency || "BRL").toLowerCase();
  let d1 = fromDMY(input.departureDate); if (!d1) throw Object.assign(new Error("Data de partida inválida."), { code: "input" });
  let d2 = fromDMY(input.departureDateTo) || d1;
  let ret = fromDMY(input.returnDate);
  let nMin = input.nights_in_dst_from != null ? +input.nights_in_dst_from : null;
  let nMax = input.nights_in_dst_to != null ? +input.nights_in_dst_to : nMin;
  // "± dias" à volta de datas certas: vira um intervalo de partida e de estadia.
  const fx = Math.min(10, +input.departureDateFlexDays || 0);
  if (fx) { const base = d1; d1 = addDays(base, -fx); d2 = addDays(base, fx); if (ret) { const n = daysDiff(base, ret); const rf = Math.min(10, +input.returnDateFlexDays || 0); nMin = Math.max(1, n - fx - rf); nMax = n + fx + rf; ret = null; } }
  const hoje = new Date().toISOString().slice(0, 10); if (d1 < hoje) d1 = hoje;
  const idaVolta = !!ret || nMin != null;
  const maxEsc = input.max_sector_stopovers != null && input.max_sector_stopovers !== "" ? +input.max_sector_stopovers : null;

  // Que pedidos fazer ao Travelpayouts (por dia exato ou por mês).
  const partidas = d1 === d2 ? [d1] : monthsBetween(d1, d2);
  let regressos = [null];
  if (ret) regressos = [ret];
  else if (nMin != null) regressos = monthsBetween(addDays(d1, nMin), addDays(d2, nMax));
  const pedidos = [];
  for (const p of partidas) for (const r of regressos) pedidos.push({ origin: origem, destination: destino, departure_at: p, return_at: r || undefined, one_way: idaVolta ? "false" : "true", direct: maxEsc === 0 ? "true" : "false", currency: moeda, sorting: "price", limit: 300, unique: "false" });
  const lotes = await Promise.all(pedidos.slice(0, 6).map(q => tpPricesForDates(q).catch(e => { if (e.code === "config") throw e; return []; })));
  let dados = lotes.flat();

  // Filtros que a API não faz sozinha.
  dados = dados.filter(t => {
    const dep = String(t.departure_at).slice(0, 10);
    if (dep < d1 || dep > d2) return false;
    if (idaVolta && !t.return_at) return false;
    if (!idaVolta && t.return_at) return false;
    if (ret && String(t.return_at).slice(0, 10) !== ret) return false;
    if (nMin != null) { const n = daysDiff(dep, String(t.return_at)); if (n < nMin || n > nMax) return false; }
    if (maxEsc != null && ((t.transfers || 0) > maxEsc || (t.return_transfers || 0) > maxEsc)) return false;
    return true;
  });
  const vistos = new Set();
  const itens = [];
  for (const t of dados) { const it = await normalizar(t, pax); if (!vistos.has(it.id)) { vistos.add(it.id); itens.push(it); } }
  itens.sort(input.sort === "duration" ? (a, b) => a.totalDurationSeconds - b.totalDurationSeconds : (a, b) => a.price - b.price);
  return itens.slice(0, 60);
}

/* ---------- Anthropic ---------- */
async function claude({ system, messages, tools, rapido, maxTokens }) {
  if (!ANTHROPIC_KEY) throw Object.assign(new Error("Falta configurar ANTHROPIC_API_KEY no Vercel."), { code: "config" });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: rapido ? MODELO_RAPIDO : MODELO, max_tokens: maxTokens || 1200, system, messages, tools })
  });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error((j.error && j.error.message) || `Anthropic respondeu ${r.status}`), { code: "upstream" });
  return j;
}
function textoDe(resposta) { return (resposta.content || []).filter(b => b.type === "text").map(b => b.text).join("\n"); }
function jsonDe(texto) {
  try { return JSON.parse(texto); } catch {}
  const a = texto.indexOf("{"), b = texto.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(texto.slice(a, b + 1)); } catch {} }
  return null;
}

/* ---------- limite simples de pedidos por IP (por instância) ---------- */
const JANELA = new Map();
function limitar(req, max = 30, chave = "geral") {
  const ip = chave + ":" + ((req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "anon");
  const agora = Date.now(); const reg = JANELA.get(ip) || []; const recentes = reg.filter(t => agora - t < 60000);
  recentes.push(agora); JANELA.set(ip, recentes);
  return recentes.length <= max;
}
function responder(res, status, body) { res.setHeader("Cache-Control", "no-store"); res.status(status).json(body); }
function erro(res, e) { const st = e.code === "input" ? 400 : e.code === "config" ? 500 : 502; responder(res, st, { error: e.message || "Erro", code: e.code || "erro" }); }

module.exports = { pesquisar, claude, textoDe, jsonDe, limitar, responder, erro, cidade, iata };
