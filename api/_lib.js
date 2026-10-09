// Funções partilhadas pelo servidor da Navi (Vercel Serverless, Node 18+).
// Chaves lidas das variáveis de ambiente do Vercel — nunca no código.
const AEROPORTOS = require("./_aeroportos.json"); // IATA -> [cidade, fuso horário, país, lat, lon]

const TP_TOKEN = process.env.TRAVELPAYOUTS_TOKEN || "";
const TP_MARKER = process.env.TRAVELPAYOUTS_MARKER || "787293"; // marker de parceiro (público)
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
const MERCADOS = { BR: "br", PT: "pt", ES: "es", US: "us", GB: "uk", FR: "fr", DE: "de", IT: "it", AR: "ar", CL: "cl", CO: "co", MX: "mx", PE: "pe", CA: "ca" };
function mercado(code) { const a = AEROPORTOS[code]; return a ? (MERCADOS[a[2]] || "") : ""; }
// Código da cidade para aeroportos de cidades com vários aeroportos (a Travelpayouts guarda muitos preços pela cidade).
const CIDADE_DE = { HND: "TYO", NRT: "TYO", GRU: "SAO", CGH: "SAO", VCP: "SAO", GIG: "RIO", SDU: "RIO", LHR: "LON", LGW: "LON", STN: "LON", LTN: "LON", LCY: "LON", CDG: "PAR", ORY: "PAR", BVA: "PAR", JFK: "NYC", EWR: "NYC", LGA: "NYC", FCO: "ROM", CIA: "ROM", MXP: "MIL", LIN: "MIL", BGY: "MIL", EZE: "BUE", AEP: "BUE", ORD: "CHI", MDW: "CHI", IAD: "WAS", DCA: "WAS", YYZ: "YTO", YTZ: "YTO", ICN: "SEL", GMP: "SEL", PEK: "BJS", PKX: "BJS", PVG: "SHA", SHA: "SHA", KIX: "OSA", ITM: "OSA", DXB: "DXB", DWC: "DXB", IST: "IST", SAW: "IST", SVO: "MOW", DME: "MOW", ARN: "STO", BMA: "STO", TXL: "BER", BER: "BER", BSB: "BSB", CNF: "BHZ", PLU: "BHZ" };
const cidadeCod = c => (CIDADE_DE[c] && CIDADE_DE[c] !== c) ? CIDADE_DE[c] : null;
// Grandes aeroportos/cidades com muitos preços guardados, por país.
const HUBS_PAIS = { BR: ["SAO", "RIO", "BSB"], PT: ["LIS", "OPO"], ES: ["MAD", "BCN"], US: ["NYC", "MIA", "LAX"], AR: ["BUE"], CL: ["SCL"], CO: ["BOG"], MX: ["MEX"], PE: ["LIM"], GB: ["LON"], FR: ["PAR"], IT: ["ROM", "MIL"], DE: ["FRA", "MUC"], CA: ["YTO"] };
const HUB_COORD = { SAO: [-23.44, -46.47], RIO: [-22.81, -43.25], BSB: [-15.87, -47.92], LIS: [38.78, -9.14], OPO: [41.24, -8.68], MAD: [40.49, -3.57], BCN: [41.3, 2.08], NYC: [40.64, -73.78], MIA: [25.79, -80.29], LAX: [33.94, -118.41], BUE: [-34.82, -58.54], SCL: [-33.39, -70.79], BOG: [4.7, -74.15], MEX: [19.44, -99.07], LIM: [-12.02, -77.11], LON: [51.47, -0.45], PAR: [49.01, 2.55], ROM: [41.8, 12.25], MIL: [45.63, 8.72], FRA: [50.03, 8.56], MUC: [48.35, 11.79], YTO: [43.68, -79.63] };
const NOMES_HUB = { SAO: "São Paulo", RIO: "Rio de Janeiro", BSB: "Brasília", LIS: "Lisboa", OPO: "Porto", MAD: "Madrid", BCN: "Barcelona", NYC: "Nova Iorque", MIA: "Miami", LAX: "Los Angeles", BUE: "Buenos Aires", SCL: "Santiago", BOG: "Bogotá", MEX: "Cidade do México", LIM: "Lima", LON: "Londres", PAR: "Paris", ROM: "Roma", MIL: "Milão", FRA: "Frankfurt", MUC: "Munique", YTO: "Toronto" };
function km(a, b) { const R = 6371, r = x => x * Math.PI / 180; const dl = r(b[0] - a[0]), dn = r(b[1] - a[1]); const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dn / 2) ** 2; return Math.round(2 * R * Math.asin(Math.sqrt(h))); }
function hubsPerto(code) { const a = AEROPORTOS[code]; if (!a) return []; const lista = (HUBS_PAIS[a[2]] || []).filter(h => h !== code); return lista.map(h => ({ h, km: km([a[3], a[4]], HUB_COORD[h]) })).sort((x, y) => x.km - y.km); }
// Link de pesquisa ao vivo na Aviasales (com o marker de parceiro).
function linkAoVivo(o, d, ida, volta, adultos) {
  const dm = iso => iso.slice(8, 10) + iso.slice(5, 7);
  const path = `/search/${o}${dm(ida)}${d}${volta ? dm(volta) : ""}${Math.max(1, +adultos || 1)}`;
  return "https://www.aviasales.com" + path + (TP_MARKER ? "?marker=" + encodeURIComponent(TP_MARKER) : "");
}
function cidade(code) { return (typeof NOMES_HUB !== "undefined" && NOMES_HUB[code]) || (AEROPORTOS[code] && AEROPORTOS[code][0]) || code; }
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
      const r = await fetch("https://api.travelpayouts.com/data/en/airlines.json");
      const arr = await r.json();
      arr.forEach(a => { if (a.code) COMPANHIAS[a.code] = (a.name_translations && a.name_translations.en) || a.name || a.code; });
    } catch { /* sem nomes: usa o código */ }
  }
  return COMPANHIAS[code] || code;
}

/* ---------- Travelpayouts: pedidos ---------- */
// Pedido genérico à Data API da Travelpayouts (preços guardados das pesquisas na Aviasales).
async function tpGet(caminho, q, mk) {
  if (!TP_TOKEN) throw Object.assign(new Error("Falta configurar TRAVELPAYOUTS_TOKEN no Vercel."), { code: "config" });
  const u = new URL("https://api.travelpayouts.com" + caminho);
  Object.entries(q).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v)); });
  if (mk) u.searchParams.set("market", mk);
  u.searchParams.set("token", TP_TOKEN);
  const r = await fetch(u);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) throw Object.assign(new Error(j.error || `Travelpayouts respondeu ${r.status}`), { code: "upstream" });
  if (Array.isArray(j.data)) return j.data;
  if (j.data && typeof j.data === "object") return Object.values(j.data).flatMap(v => Array.isArray(v) ? v : [v]);
  return [];
}
// Cada mercado (Brasil, Portugal, EUA, etc.) tem os seus próprios preços guardados.
// Procura em vários mercados e em duas fontes (por datas e agrupado por dia) e junta tudo.
const MERCADOS_EXTRA = ["us", "ru"];
async function tpPricesForDates(q) {
  const base = [TP_MARKET || mercado(q.origin), mercado(q.destination)].filter(Boolean);
  const mercadosA = [...new Set(base.length ? base : ["us"])];
  const mercadosB = MERCADOS_EXTRA.filter(m => !mercadosA.includes(m));
  const seguro = pr => pr.catch(e => { if (e.code === "config") throw e; return []; });
  const grupo = Object.assign({}, q, { group_by: "departure_at" }); delete grupo.limit; delete grupo.sorting; delete grupo.unique;
  const ronda = ms => Promise.all(ms.flatMap(m => [seguro(tpGet("/aviasales/v3/prices_for_dates", q, m)), seguro(tpGet("/aviasales/v3/grouped_prices", grupo, m))])).then(x => x.flat());
  let dados = await ronda(mercadosA);
  if (dados.length < 3) dados = dados.concat(await ronda(mercadosB));
  const vistos = new Set();
  return dados.filter(t => { if (!t || !t.departure_at || !t.price) return false; const k = [t.departure_at, t.return_at || "", t.airline, t.flight_number, t.price].join("|"); if (vistos.has(k)) return false; vistos.add(k); return true; });
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

/*
 * Pesquisa com alternativas, para rotas com poucos preços guardados:
 * 1) datas exatas; 2) datas próximas no(s) mesmo(s) mês(es); 3) a partir do grande aeroporto mais próximo.
 * Devolve sempre o link de pesquisa ao vivo na Aviasales.
 */
async function pesquisarComAlternativas(input) {
  const o = iata(input.flyFrom), d = iata(input.flyTo);
  const ida = fromDMY(input.departureDate);
  const volta = fromDMY(input.returnDate);
  const nPed = input.nights_in_dst_from != null ? +input.nights_in_dst_from : (volta && ida ? daysDiff(ida, volta) : null);
  const aoVivo = (o && d && ida) ? linkAoVivo(o, d, ida, volta || (nPed != null ? addDays(ida, nPed) : null), input.adults) : null;
  if (!ida) return { itineraries: await pesquisar(input), aoVivo };
  const d2 = fromDMY(input.departureDateTo) || ida;
  const fimMes = iso => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7), 0)).toISOString().slice(0, 10);
  const dmy = iso => iso.split("-").reverse().join("/");
  const idaEVolta = !!volta || input.nights_in_dst_from != null;
  // Níveis: exato → mesmo mês, estadia ±7 dias → mesmo mês, qualquer estadia
  const niveis = [
    { nome: "exato", mk: base => base },
    { nome: "datas", mk: base => { const q = Object.assign({}, base, { departureDate: "01/" + ida.slice(5, 7) + "/" + ida.slice(0, 4), departureDateTo: dmy(fimMes(d2)), departureDateFlexDays: 0, returnDateFlexDays: 0, returnDate: null });
      if (idaEVolta && nPed != null) { const nMax = input.nights_in_dst_to != null ? +input.nights_in_dst_to : nPed; q.nights_in_dst_from = Math.max(1, nPed - 7); q.nights_in_dst_to = nMax + 7; } return q; } },
    { nome: "estadia", mk: base => { const q = Object.assign({}, base, { departureDate: "01/" + ida.slice(5, 7) + "/" + ida.slice(0, 4), departureDateTo: dmy(fimMes(d2)), departureDateFlexDays: 0, returnDateFlexDays: 0, returnDate: null });
      if (idaEVolta) { q.nights_in_dst_from = 1; q.nights_in_dst_to = 90; } return q; } }
  ];
  const origens = [{ code: o, km: 0 }].concat(cidadeCod(o) ? [{ code: cidadeCod(o), km: 0 }] : [], hubsPerto(o).filter(x => x.km <= 1200 && x.h !== cidadeCod(o)).slice(0, 2).map(x => ({ code: x.h, km: x.km })));
  const destinos = [d].concat(cidadeCod(d) ? [cidadeCod(d)] : []);
  for (const org of origens) {
    const outra = org.code !== o && org.km > 60; // até 60 km é a mesma cidade (ex.: GRU e SAO)
    for (const nv of niveis) {
      let itens = [];
      for (const dd of destinos) { if (itens.length) break; try { itens = await pesquisar(nv.mk(Object.assign({}, input, { flyFrom: org.code, flyTo: dd }))); } catch (e) { if (e.code === "config" || e.code === "input") throw e; } }
      if (!itens.length) continue;
      if (!outra && nv.nome === "exato") return { itineraries: itens, aoVivo };
      // Poucas opções? Junta também as de estadia diferente, para o cliente ter por onde escolher.
      if (nv.nome !== "estadia" && itens.length < 5) {
        try { const mais = await pesquisar(niveis[2].mk(Object.assign({}, input, { flyFrom: org.code }))); const ids = new Set(itens.map(x => x.id)); mais.forEach(x => { if (!ids.has(x.id)) { x.estadiaDiferente = true; itens.push(x); } }); itens.sort((a, b) => a.price - b.price); } catch { }
      }
      const partes = [];
      if (outra) partes.push(`A partir de ${cidade(o)} não encontrámos preços para estas datas. Mostramos voos a partir de ${cidade(org.code)}, a cerca de ${org.km} km: conte com a ligação até lá`);
      if (nv.nome === "datas") partes.push(`${partes.length ? "e as datas" : "Para as datas exatas não encontrámos preços. Estas"} são as mais próximas, no mesmo mês`);
      if (nv.nome === "estadia") partes.push(`${partes.length ? "e as datas e a duração da estadia" : "Para estas datas não encontrámos preços. Estas datas e estadias"} são as mais próximas que encontrámos`);
      itens.forEach(it => { it.approx = outra ? "origem" : "datas"; if (nv.nome !== "exato") it.approxDatas = true; });
      return { itineraries: itens, aoVivo, aviso: { tipo: outra ? "origem" : "datas", hub: outra ? org.code : null, km: org.km, texto: partes.join(", ") + "." } };
    }
  }
  // Nada nestas datas: procura alternativas para o cliente nunca ficar sem resposta.
  const sugestoes = await sugerirAlternativas(input, o, d, ida, origens);
  const texto = sugestoes.length
    ? "Para estas datas ainda não temos preços guardados, mas encontrámos estas alternativas. Toque numa para ver os voos."
    : "Para estas datas ainda não temos preços guardados. Veja os preços ao vivo, com a sua pesquisa já preenchida.";
  return { itineraries: [], aoVivo, sugestoes, aviso: { tipo: "vazio", texto } };
}

// Alternativas quando não há preços: outros meses, aeroportos de destino próximos.
async function sugerirAlternativas(input, o, d, ida, origens) {
  const out = []; const ymd = s => String(s || "").slice(0, 10);
  const idaEVolta = !!fromDMY(input.returnDate) || input.nights_in_dst_from != null;
  const fimMes = iso => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7), 0)).toISOString().slice(0, 10);
  const dmy = iso => iso.split("-").reverse().join("/");
  const mes = (base, k) => { const t = new Date(Date.UTC(+base.slice(0, 4), +base.slice(5, 7) - 1 + k, 1)); return t.toISOString().slice(0, 10); };
  const hoje = new Date().toISOString().slice(0, 10);
  const qMes = (from, to, ini) => { const q = Object.assign({}, input, { flyFrom: from, flyTo: to, departureDate: dmy(ini < hoje ? hoje : ini), departureDateTo: dmy(fimMes(ini)), departureDateFlexDays: 0, returnDateFlexDays: 0, returnDate: null }); if (idaEVolta) { q.nights_in_dst_from = 1; q.nights_in_dst_to = 90; } return q; };
  const melhor = async q => { try { const r = await pesquisar(q); return r[0] || null; } catch (e) { if (e.code === "config") throw e; return null; } };
  const orgs = origens.slice(0, 2).map(x => x.code);
  const tarefas = [];
  // 1) Meses vizinhos (o seguinte, o depois e o anterior se ainda não passou).
  for (const k of [1, 2, -1]) { const ini = mes(ida, k); if (fimMes(ini) < hoje) continue;
    for (const org of orgs) tarefas.push(melhor(qMes(org, d, ini)).then(it => it && { tipo: "mes", mes: ini.slice(0, 7), origem: org, it })); }
  // 2) Destinos próximos (outros grandes aeroportos do país de destino).
  for (const dh of hubsPerto(d).filter(x => x.km <= 700).slice(0, 2))
    for (const org of orgs) tarefas.push(melhor(qMes(org, dh.h, ida.slice(0, 8) + "01")).then(it => it && { tipo: "destino", destino: dh.h, cidade: cidade(dh.h), km: dh.km, origem: org, it }));
  const res = (await Promise.all(tarefas)).filter(Boolean);
  // O mais barato por mês e por destino.
  const chave = r => r.tipo + ":" + (r.mes || r.destino);
  const porChave = new Map(); res.forEach(r => { const c = chave(r); if (!porChave.has(c) || r.it.price < porChave.get(c).it.price) porChave.set(c, r); });
  [...porChave.values()].sort((a, b) => a.it.price - b.it.price).slice(0, 4).forEach(r => {
    out.push({ tipo: r.tipo, mes: r.mes || null, destino: r.destino || d, cidadeDestino: r.cidade || cidade(d), origem: r.origem, cidadeOrigem: cidade(r.origem), preco: r.it.price, ida: ymd(r.it.outbound.departureTime), volta: r.it.inbound ? ymd(r.it.inbound.departureTime) : null });
  });
  return out;
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

module.exports = { pesquisar, pesquisarComAlternativas, linkAoVivo, claude, textoDe, jsonDe, limitar, responder, erro, cidade, iata };
