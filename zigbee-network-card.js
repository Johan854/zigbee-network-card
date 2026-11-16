{ // bloc isolé
/*
 * Zigbee Network Card (FR)
 * Carte du réseau Zigbee2MQTT pour Home Assistant : carte des liaisons (qualité LQI),
 * liste des appareils (batterie, dernier message, indisponibles), ajout d'appareils
 * (appairage), renommage (avec les entités HA) et suppression.
 * Style verre, thème clair/sombre automatique, éditeur visuel, textes en français.
 */
const CARD_VERSION = "1.0.0";

/* === NUANCE COMMUNE v2 (cartes Johan854) === */
const GV_NUANCES = [["braise", "Braise (rouge)", "#e0524f"], ["ocean", "Océan (bleu)", "#2f8fd8"], ["lagon", "Lagon (turquoise)", "#1fb5a8"], ["foret", "Forêt (vert)", "#3fae5a"], ["lavande", "Lavande (violet)", "#8a63d8"], ["framboise", "Framboise (rose)", "#e05597"], ["ambre", "Ambre (orange)", "#e8902c"], ["ardoise", "Ardoise (neutre)", "#7d8595"]];
const GV_DEFAULTS = { nuance: "theme", intensite: 1 };
const gvAccent = (c) => {
  const p = c && c.nuance_perso;
  if (c && c.nuance === "perso") {
    if (Array.isArray(p) && p.length === 3) return "#" + p.map((v) => Math.max(0, Math.min(255, Math.round(+v || 0))).toString(16).padStart(2, "0")).join("");
    if (typeof p === "string" && /^#?[0-9a-f]{6}$/i.test(p.trim())) return "#" + p.trim().replace("#", "");
  }
  const n = GV_NUANCES.find((x) => x[0] === (c && c.nuance));
  return n ? n[2] : "var(--carte-nuance)";
};
const gvStyle = (c, dark) => {
  const i = Number(c && c.intensite), ai = Number.isFinite(i) ? Math.max(0, Math.min(2, i)) : 1;
  const m = (pct, base) => `color-mix(in srgb,var(--acc-ui) ${+(pct * ai).toFixed(1)}%,${base})`;
  const bg = dark ? `linear-gradient(160deg,${m(5, "#1b1e32")} 0%,${m(11, "#1f1b2c")} 55%,${m(22, "#1c1620")} 100%)`
    : `linear-gradient(160deg,${m(2, "#f8f9fd")} 0%,${m(5, "#eef1f8")} 55%,${m(11, "#f8f8fa")} 100%)`;
  return `--acc-ui:${gvAccent(c)};--g-bg-x:${bg};--acc-ui-x:color-mix(in srgb,var(--acc-ui) ${dark ? "80%,#fff" : "82%,#000"})`;
};
const GV_FIELDS = [
  { name: "nuance", selector: { select: { mode: "dropdown", options: [{ value: "theme", label: "Selon le thème (couleurs d'origine)" }, ...GV_NUANCES.map((n) => ({ value: n[0], label: n[1] })), { value: "perso", label: "Personnalisée" }] } } },
  { name: "nuance_perso", selector: { color_rgb: {} } },
  { name: "intensite", selector: { number: { min: 0, max: 2, step: 0.1, mode: "slider" } } }];
const GV_LABELS = { nuance: "Nuance de couleur", nuance_perso: "Couleur personnalisée (nuance « Personnalisée »)", intensite: "Intensité de la nuance" };
/* === FIN NUANCE COMMUNE === */

const DEFAULTS = {
  name: "Réseau Zigbee", theme: "auto", ...GV_DEFAULTS,
  base_topic: "zigbee2mqtt",
  bridge_prefix: "zigbee2mqtt_bridge", // préfixe des entités du pont (sensor.<préfixe>_network_map…)
  view: "carte", // carte | liste
  map_height: 340,
};

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lqiCol = (q) => (q == null || isNaN(q) ? "var(--mu)" : q >= 100 ? "#3fae5a" : q >= 50 ? "#e8902c" : "#e0524f");
const lqiTxt = (q) => (q == null || isNaN(q) ? "—" : q >= 100 ? "Bonne" : q >= 50 ? "Moyenne" : "Faible");
const ago = (ts) => {
  if (!ts) return "—";
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return "à l'instant"; if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`; return `il y a ${Math.round(s / 86400)} j`;
};
const TYPE = { Coordinator: "Coordinateur", Router: "Relais (secteur)", EndDevice: "Sur pile" };

class ZigbeeNetworkCard extends HTMLElement {
  static getConfigElement() { return document.createElement("zigbee-network-card-editor"); }
  static getStubConfig() { return { ...DEFAULTS }; }
  constructor() { super(); this.attachShadow({ mode: "open" }); this._view = null; this._edit = null; this._confirm = null; this._joinEnd = 0; this._msg = ""; }
  setConfig(c) { this._config = { ...DEFAULTS, ...(c || {}) }; this._view = this._view || this._config.view; this._sig = ""; this._render(); }
  set hass(h) {
    this._hass = h;
    const p = this._config.bridge_prefix, st = (e) => h.states[e];
    const nm = st(`sensor.${p}_network_map`), pj = st(`switch.${p}_permit_join`), cs = st(`binary_sensor.${p}_connection_state`);
    const sig = [nm && nm.state, pj && pj.state, cs && cs.state, h.themes && h.themes.darkMode, this._devSig(h)].join("|");
    if (sig !== this._sig) { this._sig = sig; this._render(); }
  }
  getCardSize() { return 8; }
  connectedCallback() { this._tick = setInterval(() => { if (this._joinEnd || this._view === "liste") this._render(); }, 1000); }
  disconnectedCallback() { clearInterval(this._tick); if (this._ro) this._ro.disconnect(); }
  _isDark() {
    const t = this._config.theme; if (t === "dark") return true; if (t === "light") return false;
    const dm = this._hass && this._hass.themes && this._hass.themes.darkMode;
    return typeof dm === "boolean" ? dm : !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
  /* appareils Zigbee2MQTT connus de HA (rattachés au pont) */
  _bridgeDevice(h) {
    const p = this._config.bridge_prefix, e = h.entities && h.entities[`binary_sensor.${p}_connection_state`];
    return e && e.device_id;
  }
  _haDevices(h) {
    h = h || this._hass; if (!h || !h.devices) return [];
    const br = this._bridgeDevice(h);
    return Object.values(h.devices).filter((d) => br && d.via_device_id === br);
  }
  _devSig(h) { return this._haDevices(h).map((d) => (d.name_by_user || d.name) + (d.created_at || "")).join(","); }
  _entitiesOf(devId) { const h = this._hass; return Object.values(h.entities || {}).filter((e) => e.device_id === devId).map((e) => e.entity_id); }
  _deviceInfo(name) {
    const h = this._hass, d = this._haDevices().find((x) => (x.name_by_user || x.name) === name);
    if (!d) return {};
    const ents = this._entitiesOf(d.id);
    const find = (pred) => ents.map((e) => h.states[e]).find((s) => s && pred(s));
    const bat = find((s) => s.attributes.device_class === "battery" && s.entity_id.startsWith("sensor."));
    const lq = find((s) => /_linkquality$/.test(s.entity_id));
    let last = null; ents.forEach((e) => { const s = h.states[e]; if (s && !/^(button|switch\.|select|number)/.test(e) && s.state !== "unavailable") { const t = s.last_reported || s.last_updated; if (!last || t > last) last = t; } });
    const unavail = ents.length > 0 && ents.every((e) => !h.states[e] || h.states[e].state === "unavailable");
    return { dev: d, battery: bat && !isNaN(Number(bat.state)) ? Number(bat.state) : null, lqi: lq && !isNaN(Number(lq.state)) ? Number(lq.state) : null, last, unavail, model: [d.manufacturer, d.model].filter(Boolean).join(" "), isNew: d.created_at && (Date.now() / 1000 - d.created_at < 1800) };
  }
  /* données de la carte réseau publiées par Zigbee2MQTT */
  _netmap() {
    const s = this._hass && this._hass.states[`sensor.${this._config.bridge_prefix}_network_map`];
    const a = s && s.attributes; if (!a || !Array.isArray(a.nodes)) return null;
    const nodes = a.nodes.map((n) => ({ id: n.ieeeAddr, name: n.friendlyName || n.ieeeAddr, type: n.type, failed: n.failed && n.failed.length }));
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const links = (a.links || []).map((l) => ({ s: l.source && (l.source.ieeeAddr || l.sourceIeeeAddr), t: l.target && (l.target.ieeeAddr || l.targetIeeeAddr), q: l.lqi != null ? l.lqi : l.linkquality, rel: l.relationship })).filter((l) => byId[l.s] && byId[l.t]);
    // parent de chaque appareil = voisin « parent » le mieux relié, sinon meilleur lien vers un relais/coordinateur
    nodes.forEach((n) => {
      if (n.type === "Coordinator") return;
      const cand = links.filter((l) => l.s === n.id && byId[l.t].type !== "EndDevice");
      cand.sort((x, y) => (x.rel === 1 ? 0 : 1) - (y.rel === 1 ? 0 : 1) || (y.q || 0) - (x.q || 0));
      if (cand[0]) { n.parent = cand[0].t; n.q = cand[0].q; }
    });
    return { nodes, links, byId, when: s.state };
  }
  _call(topic, payload) { this._hass.callService("mqtt", "publish", { topic: `${this._config.base_topic}/${topic}`, payload: JSON.stringify(payload) }); }
  _refresh() { this._call("bridge/request/networkmap", { type: "raw", routes: false }); this._msg = "Analyse du réseau en cours… (jusqu'à une minute)"; this._render(); }
  _permit(on) {
    const e = `switch.${this._config.bridge_prefix}_permit_join`;
    this._hass.callService("switch", on ? "turn_on" : "turn_off", { entity_id: e });
    this._joinEnd = on ? Date.now() + 254000 : 0; this._render();
  }
  _rename(from, to) {
    to = (to || "").trim(); if (!to || to === from) { this._edit = null; this._render(); return; }
    this._call("bridge/request/device/rename", { from, to, homeassistant_rename: true });
    this._msg = `« ${from} » renommé en « ${to} ». Les entités de HA suivent le nouveau nom.`; this._edit = null; this._render();
  }
  _remove(name) { this._call("bridge/request/device/remove", { id: name, force: false }); this._msg = `Suppression de « ${name} » demandée.`; this._confirm = null; this._render(); }

  _rows() {
    const nm = this._netmap(), seen = new Set(), rows = [];
    if (nm) nm.nodes.filter((n) => n.type !== "Coordinator").forEach((n) => { seen.add(n.name); rows.push({ name: n.name, type: n.type, q: n.q, parent: n.parent && (nm.byId[n.parent].type === "Coordinator" ? "le coordinateur" : nm.byId[n.parent].name), ...this._deviceInfo(n.name) }); });
    // appareils ajoutés depuis la dernière analyse du réseau
    this._haDevices().forEach((d) => { const nmn = d.name_by_user || d.name; if (!seen.has(nmn)) rows.push({ name: nmn, type: null, q: null, ...this._deviceInfo(nmn) }); });
    rows.forEach((r) => { r.lq = r.lqi != null ? r.lqi : r.q; });
    rows.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0) || (b.unavail ? 1 : 0) - (a.unavail ? 1 : 0) || (a.lq == null ? 999 : a.lq) - (b.lq == null ? 999 : b.lq));
    return rows;
  }

  _render() {
    const c = this._config, h = this._hass; if (!c) return;
    const dark = this._isDark(), p = c.bridge_prefix;
    const cs = h && h.states[`binary_sensor.${p}_connection_state`], pj = h && h.states[`switch.${p}_permit_join`];
    const online = cs && cs.state === "on", joining = pj && pj.state === "on";
    if (!joining && this._joinEnd && Date.now() > this._joinEnd) this._joinEnd = 0;
    const left = joining && this._joinEnd ? Math.max(0, Math.round((this._joinEnd - Date.now()) / 1000)) : null;
    const nm = h ? this._netmap() : null, rows = h ? this._rows() : [];
    const nb = rows.length, weak = rows.filter((r) => r.lq != null && r.lq < 50).length, off = rows.filter((r) => r.unavail).length, nw = rows.filter((r) => r.isNew).length;
    const view = this._view;
    const list = rows.map((r) => {
      const ed = this._edit === r.name, cf = this._confirm === r.name;
      const icon = r.type === "Router" ? "mdi:power-plug" : r.type === "EndDevice" ? "mdi:battery" : "mdi:zigbee";
      return `<div class="row ${r.unavail ? "off" : ""} ${r.isNew ? "new" : ""}">
        <ha-icon class="ty" icon="${icon}" title="${esc(TYPE[r.type] || "Appareil")}"></ha-icon>
        <div class="nm">${ed ? `<input id="ren" value="${esc(r.name)}" aria-label="Nouveau nom">` : `<b>${esc(r.name)}</b>${r.isNew ? '<span class="tag">Nouveau</span>' : ""}${r.unavail ? '<span class="tag red">Indisponible</span>' : ""}`}
          <small>${esc(r.model || TYPE[r.type] || "")}${r.parent ? ` · via ${esc(r.parent)}` : ""}</small></div>
        <div class="kv"><span class="dot" style="background:${lqiCol(r.lq)}"></span>${r.lq != null ? r.lq : "—"}<small>${lqiTxt(r.lq)}</small></div>
        <div class="kv">${r.battery != null ? `${Math.round(r.battery)} %` : "—"}<small>Batterie</small></div>
        <div class="kv">${ago(r.last)}<small>Dernier message</small></div>
        <div class="act">${ed ? `<button data-a="ok" data-n="${esc(r.name)}" title="Valider"><ha-icon icon="mdi:check"></ha-icon></button><button data-a="cancel" title="Annuler"><ha-icon icon="mdi:close"></ha-icon></button>`
          : cf ? `<span class="conf">Supprimer ?</span><button class="danger" data-a="rm" data-n="${esc(r.name)}" title="Confirmer la suppression"><ha-icon icon="mdi:delete"></ha-icon></button><button data-a="cancel" title="Annuler"><ha-icon icon="mdi:close"></ha-icon></button>`
          : `<button data-a="edit" data-n="${esc(r.name)}" title="Renommer"><ha-icon icon="mdi:pencil"></ha-icon></button><button data-a="ask" data-n="${esc(r.name)}" title="Supprimer"><ha-icon icon="mdi:delete-outline"></ha-icon></button>`}</div>
      </div>`;
    }).join("");
    const needMap = h && !h.states[`sensor.${p}_network_map`];
    this.shadowRoot.innerHTML = `<style>
      * { box-sizing:border-box; }
      ha-card.dark { --tx:#f4f6fb; --mu:#a9afc0; --bg:var(--g-bg-x,linear-gradient(160deg,#1b1e32 0%,#1f1b2c 55%,#1c1620 100%)); --bd:rgba(255,255,255,.14); --sh:0 .6em 2em rgba(0,0,0,.35); --gl:rgba(255,255,255,.07); --glb:rgba(255,255,255,.13); --fi:rgba(255,255,255,.1); --fib:rgba(255,255,255,.18); }
      ha-card.light { --tx:#1c2030; --mu:#5d6477; --bg:var(--g-bg-x,linear-gradient(160deg,#f8f9fd 0%,#eef1f8 55%,#f8f8fa 100%)); --bd:rgba(20,24,40,.12); --sh:0 .4em 1.4em rgba(20,24,40,.12); --gl:rgba(255,255,255,.7); --glb:rgba(20,24,40,.1); --fi:rgba(20,24,40,.06); --fib:rgba(20,24,40,.14); }
      ha-card { --ac:var(--acc-ui-x,#e8902c); display:flex; flex-direction:column; gap:12px; padding:16px; color:var(--tx); border-radius:24px; border:1px solid var(--bd); background:var(--bg); box-shadow:var(--sh); }
      .head { display:flex; align-items:center; gap:.7em; } .head ha-icon { --mdc-icon-size:1.6em; color:var(--ac); }
      .head b { font-size:1.1em; font-weight:650; } .head small { display:block; color:var(--mu); font-size:.8em; font-weight:600; }
      .st { margin-left:auto; display:flex; align-items:center; gap:.4em; font-size:.8em; font-weight:650; padding:.3em .7em; border-radius:2em; background:var(--gl); border:1px solid var(--glb); }
      .st i { width:.6em; height:.6em; border-radius:50%; background:${online ? "#3fae5a" : "#e0524f"}; box-shadow:0 0 0 3px ${online ? "rgba(63,174,90,.25)" : "rgba(224,82,79,.25)"}; }
      .kpi { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }
      .kpi div { padding:.45em .6em; border-radius:.9em; background:var(--gl); border:1px solid var(--glb); font-size:.74em; color:var(--mu); }
      .kpi b { display:block; font-size:1.55em; color:var(--tx); } .kpi .w b { color:#e8902c; } .kpi .r b { color:#e0524f; } .kpi .n b { color:var(--ac); }
      .bar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
      .seg { display:flex; padding:3px; border-radius:2em; background:var(--fi); border:1px solid var(--fib); }
      .seg button { font:inherit; font-size:.85em; font-weight:650; color:var(--mu); background:none; border:0; padding:.45em 1em; border-radius:2em; cursor:pointer; }
      .seg button.on { background:var(--ac); color:#fff; }
      .btn { font:inherit; font-size:.85em; font-weight:650; display:inline-flex; align-items:center; gap:.4em; padding:.5em .9em; border-radius:2em; border:1px solid var(--fib); background:var(--fi); color:var(--tx); cursor:pointer; min-height:36px; }
      .btn ha-icon { --mdc-icon-size:1.2em; } .btn.join { margin-left:auto; } .btn.joining { background:var(--ac); border-color:var(--ac); color:#fff; animation:pulse 1.6s infinite; }
      @keyframes pulse { 50% { box-shadow:0 0 0 6px color-mix(in srgb,var(--ac) 25%,transparent); } }
      @media (prefers-reduced-motion:reduce) { .btn.joining { animation:none; } }
      .msg { font-size:.82em; padding:.55em .8em; border-radius:.8em; background:color-mix(in srgb,var(--ac) 14%,transparent); border:1px solid color-mix(in srgb,var(--ac) 35%,transparent); }
      .hint { font-size:.8em; color:var(--mu); }
      .map { position:relative; height:${Number(c.map_height) || 340}px; border-radius:18px; background:var(--gl); border:1px solid var(--glb); overflow:hidden; }
      .map svg { position:absolute; inset:0; width:100%; height:100%; }
      .map text { font-size:11px; fill:var(--tx); paint-order:stroke; stroke:var(--gl-s,${dark ? "#1d1d2c" : "#f4f6fb"}); stroke-width:3px; }
      .map .q { font-size:9px; fill:var(--mu); }
      .leg { display:flex; gap:1em; flex-wrap:wrap; font-size:.75em; color:var(--mu); } .leg span { display:inline-flex; align-items:center; gap:.35em; }
      .leg i { width:1.4em; height:3px; border-radius:2px; display:inline-block; }
      .list { display:flex; flex-direction:column; gap:6px; }
      .row { display:grid; grid-template-columns:auto minmax(0,1fr) 4.6em 4.6em 6.4em auto; gap:.6em; align-items:center; padding:.5em .7em; border-radius:14px; background:var(--gl); border:1px solid var(--glb); }
      .row.off { border-color:rgba(224,82,79,.45); } .row.new { border-color:var(--ac); }
      .ty { color:var(--mu); --mdc-icon-size:1.25em; }
      .nm b { font-weight:650; } .nm small { display:block; font-size:.75em; color:var(--mu); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .nm input { font:inherit; font-size:16px; width:100%; padding:.3em .5em; border-radius:.6em; border:1px solid var(--ac); background:var(--fi); color:var(--tx); }
      .tag { margin-left:.4em; font-size:.68em; font-weight:700; padding:.15em .5em; border-radius:1em; background:var(--ac); color:#fff; vertical-align:middle; } .tag.red { background:#e0524f; }
      .kv { font-size:.85em; font-weight:650; text-align:right; white-space:nowrap; } .kv small { display:block; font-size:.72em; font-weight:500; color:var(--mu); }
      .dot { display:inline-block; width:.55em; height:.55em; border-radius:50%; margin-right:.3em; }
      .act { display:flex; gap:4px; align-items:center; } .conf { font-size:.75em; color:#e0524f; font-weight:650; }
      .act button { width:34px; height:34px; border-radius:50%; border:1px solid var(--fib); background:var(--fi); color:var(--tx); display:grid; place-items:center; cursor:pointer; } .act button ha-icon { --mdc-icon-size:18px; }
      .act button.danger { background:#e0524f; border-color:#e0524f; color:#fff; }
      button:focus-visible, input:focus-visible { outline:2px solid var(--ac); outline-offset:2px; }
      @media (max-width:560px) { .row { grid-template-columns:auto minmax(0,1fr) auto; } .row .kv:nth-of-type(4), .row .kv:nth-of-type(5) { display:none; } .kpi { grid-template-columns:repeat(2,minmax(0,1fr)); } }
    </style>
    <ha-card class="${dark ? "dark" : "light"}" style="${gvStyle(c, dark)}">
      <div class="head"><ha-icon icon="mdi:zigbee"></ha-icon><div><b>${esc(c.name)}</b><small>${nm ? `Analyse du réseau : ${esc(ago(nm.when))}` : "Zigbee2MQTT"}</small></div>
        <div class="st"><i></i>${online ? "En ligne" : "Hors ligne"}</div></div>
      <div class="kpi"><div>Appareils<b>${nb}</b></div><div class="w">Liaison faible<b>${weak}</b></div><div class="r">Indisponibles<b>${off}</b></div><div class="n">Nouveaux<b>${nw}</b></div></div>
      <div class="bar"><div class="seg"><button data-v="carte" class="${view === "carte" ? "on" : ""}">Carte</button><button data-v="liste" class="${view === "liste" ? "on" : ""}">Appareils</button></div>
        <button class="btn" data-a="refresh" title="Relancer l'analyse du réseau"><ha-icon icon="mdi:refresh"></ha-icon>Analyser</button>
        <button class="btn join ${joining ? "joining" : ""}" data-a="join"><ha-icon icon="${joining ? "mdi:stop" : "mdi:plus"}"></ha-icon>${joining ? `Appairage ouvert${left != null ? ` · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : ""} — Arrêter` : "Ajouter un appareil"}</button></div>
      ${this._msg ? `<div class="msg">${esc(this._msg)}</div>` : ""}
      ${joining ? `<div class="hint">Mets le nouvel appareil en mode appairage (en général un appui long sur son bouton). Il apparaîtra dans « Appareils » avec l'étiquette « Nouveau » : renomme-le aussitôt avec le crayon.</div>` : ""}
      ${view === "carte" ? (nm ? `<div class="map"><svg id="svg"></svg></div>
        <div class="leg"><span><i style="background:#3fae5a"></i>Bonne (≥ 100)</span><span><i style="background:#e8902c"></i>Moyenne (50-99)</span><span><i style="background:#e0524f"></i>Faible (&lt; 50)</span><span>● secteur (relais) · ○ sur pile</span></div>`
        : `<div class="hint">${needMap ? `L'entité <b>sensor.${esc(p)}_network_map</b> est introuvable : active-la dans Paramètres → Entités (elle est désactivée par défaut), puis appuie sur « Analyser ».` : "Pas encore de carte : appuie sur « Analyser »."}</div>`)
        : `<div class="list">${list || '<div class="hint">Aucun appareil trouvé.</div>'}</div>`}
    </ha-card>`;
    const r = this.shadowRoot;
    r.querySelectorAll("[data-v]").forEach((b) => b.addEventListener("click", () => { this._view = b.dataset.v; this._render(); }));
    r.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => {
      const a = b.dataset.a, n = b.dataset.n;
      if (a === "refresh") this._refresh();
      else if (a === "join") this._permit(!joining);
      else if (a === "edit") { this._edit = n; this._confirm = null; this._render(); const i = r.getElementById("ren"); if (i) { i.focus(); i.select(); } }
      else if (a === "ok") this._rename(n, r.getElementById("ren").value);
      else if (a === "ask") { this._confirm = n; this._edit = null; this._render(); }
      else if (a === "rm") this._remove(n);
      else if (a === "cancel") { this._edit = null; this._confirm = null; this._render(); }
    }));
    const inp = r.getElementById("ren");
    if (inp) inp.addEventListener("keydown", (e) => { if (e.key === "Enter") this._rename(this._edit, inp.value); if (e.key === "Escape") { this._edit = null; this._render(); } });
    if (view === "carte" && nm) this._draw(nm);
  }
  _draw(nm) {
    const svg = this.shadowRoot.getElementById("svg"); if (!svg) return;
    const W = svg.clientWidth || 600, H = svg.clientHeight || 340, cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 34;
    const pos = {}, coord = nm.nodes.find((n) => n.type === "Coordinator");
    if (coord) pos[coord.id] = [cx, cy];
    const routers = nm.nodes.filter((n) => n.type === "Router"), ends = nm.nodes.filter((n) => n.type === "EndDevice");
    routers.forEach((n, i) => { const a = (i / Math.max(1, routers.length)) * Math.PI * 2 - Math.PI / 2; pos[n.id] = [cx + Math.cos(a) * R * 0.48, cy + Math.sin(a) * R * 0.48]; n.a = a; });
    // appareils sur pile sur l'anneau extérieur, regroupés autour de leur parent
    const ang = (n) => { const p = n.parent && nm.byId[n.parent]; return p && p.a != null ? p.a : -Math.PI / 2; };
    ends.sort((x, y) => ang(x) - ang(y) || x.name.localeCompare(y.name));
    ends.forEach((n, i) => { const a = (i / Math.max(1, ends.length)) * Math.PI * 2 - Math.PI / 2 + (routers.length ? 0 : Math.PI / Math.max(1, ends.length)); pos[n.id] = [cx + Math.cos(a) * R, cy + Math.sin(a) * R * 0.92]; n.a2 = a; });
    let g = "";
    nm.nodes.forEach((n) => {
      if (!n.parent || !pos[n.id] || !pos[n.parent]) return;
      const [x1, y1] = pos[n.id], [x2, y2] = pos[n.parent], col = lqiCol(n.q);
      g += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="2" stroke-opacity=".85"/>`;
      if (n.q != null) g += `<text class="q" x="${(x1 * 0.45 + x2 * 0.55).toFixed(1)}" y="${(y1 * 0.45 + y2 * 0.55 - 3).toFixed(1)}" text-anchor="middle">${n.q}</text>`;
    });
    nm.nodes.forEach((n) => {
      const p = pos[n.id]; if (!p) return;
      const [x, y] = p, isC = n.type === "Coordinator", isR = n.type === "Router", info = this._deviceInfo(n.name);
      const fill = isC ? "var(--ac)" : info.unavail || n.failed ? "#e0524f" : isR ? lqiCol(n.q) : "var(--gl)";
      const stroke = isC ? "var(--ac)" : lqiCol(n.q);
      g += `<g><title>${esc(n.name)} — ${esc(TYPE[n.type] || "")}${n.q != null ? ` — LQI ${n.q}` : ""}</title><circle cx="${x}" cy="${y}" r="${isC ? 16 : isR ? 9 : 7}" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>`;
      const above = isC || y < cy, ta = isC ? "middle" : x < cx - 8 ? "end" : x > cx + 8 ? "start" : "middle", dx = ta === "end" ? -10 : ta === "start" ? 10 : 0;
      g += `<text x="${x + dx}" y="${isC ? y + 30 : above ? y - 10 : y + 18}" text-anchor="${ta}">${esc(isC ? "Coordinateur" : n.name)}</text></g>`;
    });
    svg.innerHTML = g;
    if (!this._ro) { this._ro = new ResizeObserver(() => { const m = this._netmap(); if (m && this._view === "carte") this._draw(m); }); }
    this._ro.disconnect(); this._ro.observe(svg);
  }
}

const LABELS = { ...GV_LABELS, name: "Titre", base_topic: "Topic de base Zigbee2MQTT", bridge_prefix: "Préfixe des entités du pont", view: "Vue au démarrage", map_height: "Hauteur de la carte (px)", theme: "Thème" };
class ZigbeeNetworkCardEditor extends HTMLElement {
  setConfig(c) { this._config = { ...DEFAULTS, ...c }; if (!this._form) this._build(); else this._form.data = this._config; }
  set hass(h) { this._hass = h; if (this._form) this._form.hass = h; }
  _build() {
    const el = document.createElement("ha-form");
    el.hass = this._hass; el.data = this._config; el.computeLabel = (s) => LABELS[s.name] || s.name;
    el.schema = [
      { name: "name", selector: { text: {} } },
      { type: "grid", name: "", schema: [
        { name: "view", selector: { select: { mode: "dropdown", options: [{ value: "carte", label: "Carte" }, { value: "liste", label: "Appareils" }] } } },
        { name: "map_height", selector: { number: { min: 200, max: 800, step: 10, mode: "box" } } }] },
      { type: "grid", name: "", schema: [
        { name: "base_topic", selector: { text: {} } },
        { name: "bridge_prefix", selector: { text: {} } }] },
      { name: "theme", selector: { select: { mode: "dropdown", options: [{ value: "auto", label: "Automatique" }, { value: "light", label: "Clair" }, { value: "dark", label: "Sombre" }] } } },
      { type: "expandable", name: "", title: "Nuance de couleur", schema: GV_FIELDS },
    ];
    el.addEventListener("value-changed", (ev) => { ev.stopPropagation(); this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: ev.detail.value }, bubbles: true, composed: true })); });
    this._form = el; this.appendChild(el);
  }
}

if (!customElements.get("zigbee-network-card")) {
  customElements.define("zigbee-network-card", ZigbeeNetworkCard);
  customElements.define("zigbee-network-card-editor", ZigbeeNetworkCardEditor);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: "zigbee-network-card", name: "Réseau Zigbee (FR)", description: "Carte du réseau Zigbee2MQTT : liaisons, batteries, appairage, renommage et suppression des appareils.", preview: false });
}
console.info(`%c ZIGBEE-NETWORK %c v${CARD_VERSION} `, "color:#fff;background:#e8902c;font-weight:700;border-radius:3px 0 0 3px;padding:2px 4px", "color:#e8902c;background:#fff;font-weight:700;border-radius:0 3px 3px 0;padding:2px 4px");
}
