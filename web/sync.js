/* Nestwise storage.
   Everything is saved on this device first (works offline). If a sync server is set up,
   changes are also sent to it and pulled from it.

   Two kinds of data:
   - household: shared with everyone who joined the household (lists, recipes, plan, chores...)
   - personal:  only the person who wrote it can ever read it (health, body stats, private events).
     The server enforces this with row-level security, not just the app. */

const HH_COLS = ["settings","members","diets","recipes","plan","shopping","pantry","chores","events","budget","expenses"];
const ME_COLS = ["profile","logs","myevents"];
const ALL_COLS = [...HH_COLS, ...ME_COLS];
const scopeOf = c => ME_COLS.includes(c) ? "personal" : "household";
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const Store = {
  key: "nestwise:v1",
  db: null,            // { records:{col:{id:rec}}, outbox:[{col,id}], since, sync:{url,key,session,hh,hhName,code} }
  listeners: [],
  status: "local",     // local | syncing | ok | offline | signedout
  lastError: "",

  load(){
    try { this.db = JSON.parse(localStorage.getItem(this.key)); } catch { this.db = null; }
    if (!this.db) this.db = { records:{}, outbox:[], since:null, sync:{} };
    ALL_COLS.forEach(c => this.db.records[c] = this.db.records[c] || {});
    const cfg = window.NESTWISE_CONFIG || {};
    if (!this.db.sync.url && cfg.supabaseUrl) { this.db.sync.url = cfg.supabaseUrl; this.db.sync.key = cfg.supabaseAnonKey; }
    this.status = this.cloudOn() ? "syncing" : "local";
  },
  save(){ try { localStorage.setItem(this.key, JSON.stringify(this.db)); } catch(e){ this.lastError = "This device's storage is full."; } },
  onChange(fn){ this.listeners.push(fn); },
  emit(){ this.listeners.forEach(f => f()); },

  /* who am I: the signed-in account, or "me" on a device without sync */
  uid(){ return this.db.sync.session?.user?.id || "me"; },
  pid(suffix){ return this.uid() + "." + (suffix ?? rid()); },

  list(c){ return Object.values(this.db.records[c] || {}).filter(r => !r._deleted && (scopeOf(c)==="household" || String(r.id).startsWith(this.uid()+"."))); },
  get(c, id){ const r = this.db.records[c]?.[id]; return r && !r._deleted ? r : null; },

  write(c, id, rec){
    this.db.records[c][id] = rec;
    if (this.cloudOn()) { this.db.outbox = this.db.outbox.filter(o => !(o.col===c && o.id===id)); this.db.outbox.push({ col:c, id }); }
    this.save(); this.emit(); this.schedulePush();
  },
  add(c, data){ const id = scopeOf(c)==="personal" ? this.pid() : rid(); this.write(c, id, { ...data, id, _t: Date.now() }); return id; },
  put(c, id, data){ this.write(c, id, { ...data, id, _t: Date.now() }); },
  update(c, id, patch){ const cur = this.db.records[c][id] || { id }; this.write(c, id, { ...cur, ...patch, id, _t: Date.now() }); },
  remove(c, id){ const cur = this.db.records[c][id]; if (!cur) return; this.write(c, id, { id, _deleted:true, _t: Date.now() }); },

  exportAll(){ const out = {}; ALL_COLS.forEach(c => out[c] = this.list(c)); return { app:"nestwise", version:1, exported:new Date().toISOString(), data:out }; },
  importAll(obj){
    if (!obj || obj.app !== "nestwise" || !obj.data) throw new Error("Not a Nestwise backup file.");
    ALL_COLS.forEach(c => (obj.data[c] || []).forEach(r => {
      let id = r.id;
      if (scopeOf(c)==="personal") id = this.uid() + "." + String(id).split(".").slice(1).join(".");
      this.put(c, id, { ...r });
    }));
  },
  wipeLocal(){ localStorage.removeItem(this.key); this.load(); this.emit(); },

  /* ---------------- cloud sync (Supabase) ---------------- */
  cloudOn(){ return !!(this.db.sync.url && this.db.sync.session && this.db.sync.hh); },
  configured(){ return !!(this.db.sync.url && this.db.sync.key); },
  setServer(url, key){ this.db.sync.url = String(url||"").trim().replace(/\/+$/,""); this.db.sync.key = String(key||"").trim(); this.save(); },

  async api(path, { method="GET", body, auth=true, headers={} } = {}){
    const s = this.db.sync;
    const h = { apikey: s.key, "Content-Type":"application/json", ...headers };
    /* New Supabase keys (sb_publishable_...) go only in "apikey"; Authorization carries the signed-in user's token.
       Older JWT-style anon keys also work this way. */
    if (auth && s.session?.access_token) h.Authorization = "Bearer " + s.session.access_token;
    else if (s.key && s.key.startsWith("eyJ")) h.Authorization = "Bearer " + s.key;
    let res;
    try { res = await fetch(s.url + path, { method, headers:h, body: body==null ? undefined : JSON.stringify(body) }); }
    catch { const e = new Error("Can't reach the sync server. Check your connection."); e.offline = true; throw e; }
    if (res.status === 401 && auth && s.session?.refresh_token && !path.includes("grant_type")) {
      if (await this.refresh()) return this.api(path, { method, body, auth, headers });
    }
    const txt = await res.text(); let data = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
    if (!res.ok) { const e = new Error(data?.msg || data?.error_description || data?.message || ("Server error " + res.status)); e.status = res.status; throw e; }
    return data;
  },
  async refresh(){
    try {
      const d = await this.api("/auth/v1/token?grant_type=refresh_token", { method:"POST", auth:false, body:{ refresh_token: this.db.sync.session.refresh_token } });
      this.db.sync.session = d; this.save(); return true;
    } catch(e) { if (!e.offline) { this.db.sync.session = null; this.status = "signedout"; this.save(); this.emit(); } return false; }
  },
  async signUp(email, password){
    const d = await this.api("/auth/v1/signup", { method:"POST", auth:false, body:{ email, password } });
    if (d?.access_token) { this.db.sync.session = d; this.save(); return "in"; }
    return "confirm";
  },
  async signIn(email, password){
    const d = await this.api("/auth/v1/token?grant_type=password", { method:"POST", auth:false, body:{ email, password } });
    this.db.sync.session = d; this.save();
  },
  async myHouseholds(){ return await this.api("/rest/v1/households?select=id,name,invite_code&order=created_at.asc") || []; },
  async createHousehold(name){
    const d = await this.api("/rest/v1/rpc/create_household", { method:"POST", body:{ p_name: name } });
    return Array.isArray(d) ? d[0] : d;
  },
  async joinHousehold(code){
    const d = await this.api("/rest/v1/rpc/join_household", { method:"POST", body:{ p_code: String(code).trim().toLowerCase() } });
    return Array.isArray(d) ? d[0] : d;
  },
  /* Use a household. upload=true sends what's already on this device (first person to set up). */
  async useHousehold(hh, upload){
    const s = this.db.sync;
    const old = this.db.records;
    s.hh = hh.id; s.hhName = hh.name; s.code = hh.invite_code;
    this.db.since = null; this.db.outbox = [];
    this.db.records = {}; ALL_COLS.forEach(c => this.db.records[c] = {});
    if (upload) {
      ALL_COLS.forEach(c => Object.values(old[c] || {}).forEach(r => {
        if (r._deleted) return;
        let id = r.id;
        if (scopeOf(c)==="personal") { const rest = String(id).split(".").slice(1).join(".") || rid(); id = this.uid() + "." + rest; }
        this.db.records[c][id] = { ...r, id }; this.db.outbox.push({ col:c, id });
      }));
    }
    this.save(); this.status = "syncing"; this.emit();
    await this.push(); await this.pull(); this.startLoop();
  },
  signOut(){
    const s = this.db.sync;
    this.db = { records:{}, outbox:[], since:null, sync:{ url:s.url, key:s.key } };
    ALL_COLS.forEach(c => this.db.records[c] = {});
    this.save(); this.status = "local"; this.stopLoop(); this.emit();
  },

  pushTimer: null,
  schedulePush(){ if (!this.cloudOn()) return; clearTimeout(this.pushTimer); this.pushTimer = setTimeout(() => this.push(), 600); },
  async push(){
    if (!this.cloudOn() || !this.db.outbox.length || this.pushing) return;
    this.pushing = true;
    try {
      while (this.db.outbox.length) {
        const batch = this.db.outbox.slice(0, 200);
        const rows = batch.map(o => { const r = this.db.records[o.col][o.id] || { _deleted:true };
          const { id, _deleted, ...data } = r; return { household_id:this.db.sync.hh, col:o.col, id:o.id, scope:scopeOf(o.col), data, deleted:!!_deleted }; });
        await this.api("/rest/v1/records?on_conflict=household_id,col,id", { method:"POST", body:rows, headers:{ Prefer:"resolution=merge-duplicates,return=minimal" } });
        const sent = new Set(batch.map(o => o.col+"|"+o.id));
        this.db.outbox = this.db.outbox.filter(o => !sent.has(o.col+"|"+o.id) || batch.indexOf(o) < 0);
        this.save();
      }
      this.status = "ok"; this.lastError = "";
    } catch(e) { this.status = e.offline ? "offline" : "error"; this.lastError = e.message; }
    this.pushing = false; this.emit();
  },
  async pull(){
    if (!this.cloudOn() || this.pulling) return;
    this.pulling = true;
    try {
      /* Re-read a few minutes back so rows saved by others at the same moment are never missed. */
      const since = this.db.since ? new Date(new Date(this.db.since).getTime() - 5*60e3).toISOString() : "1970-01-01T00:00:00Z";
      let changed = false, max = this.db.since;
      for (let page = 0; page < 50; page++) {
        const rows = await this.api(`/rest/v1/records?select=col,id,data,deleted,updated_at&household_id=eq.${this.db.sync.hh}&updated_at=gt.${encodeURIComponent(since)}&order=updated_at.asc&limit=1000&offset=${page*1000}`);
        const pending = new Set(this.db.outbox.map(o => o.col+"|"+o.id));
        rows.forEach(r => {
          if (!ALL_COLS.includes(r.col) || pending.has(r.col+"|"+r.id)) return;
          const cur = this.db.records[r.col][r.id];
          const next = r.deleted ? { id:r.id, _deleted:true, _t:r.data?._t } : { ...r.data, id:r.id };
          if (JSON.stringify(cur) !== JSON.stringify(next)) { this.db.records[r.col][r.id] = next; changed = true; }
          if (!max || r.updated_at > max) max = r.updated_at;
        });
        if (rows.length < 1000) break;
      }
      this.db.since = max; this.save();
      this.status = "ok"; this.lastError = "";
      if (changed) this.emit();
    } catch(e) { this.status = e.offline ? "offline" : (e.status===401 ? "signedout" : "error"); this.lastError = e.message; this.emit(); }
    this.pulling = false;
  },
  loop: null,
  startLoop(){
    this.stopLoop();
    const tick = () => { if (document.visibilityState === "visible") { this.push(); this.pull(); } };
    this.loop = setInterval(tick, 12000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("online", tick);
  },
  stopLoop(){ clearInterval(this.loop); this.loop = null; }
};
