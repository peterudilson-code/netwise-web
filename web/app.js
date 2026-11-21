/* Nestwise: a household organizer for any home.
   Members, diet styles and recipes are all made by the household. */

/* ---------- helpers ---------- */
const $ = (s, el=document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad = n => String(n).padStart(2,"0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse = s => { const [y,m,d] = String(s).split("-").map(Number); return new Date(y, m-1, d); };
const deviceTZ = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };
function nowParts(){
  const tz = settings().tz || deviceTZ();
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA",{ timeZone:tz, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23" }).formatToParts(new Date()).map(x=>[x.type,x.value]));
    return { date:`${p.year}-${p.month}-${p.day}`, h:Number(p.hour)%24, m:Number(p.minute) };
  } catch { const d = new Date(); return { date:ymd(d), h:d.getHours(), m:d.getMinutes() }; }
}
const today = () => nowParts().date;
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate()+n); return ymd(d); };
const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / 864e5);
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const fmtDate = s => { const d = parse(s); return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`; };
const shortDate = s => { const d = parse(s); return `${DAYS[d.getDay()].slice(0,3)} ${MONTHS[d.getMonth()].slice(0,3)} ${d.getDate()}`; };
const relDay = s => { const n = diffDays(s, today()); if (n===0) return "today"; if (n===1) return "tomorrow"; if (n===-1) return "yesterday"; return n<0 ? `${-n} days ago` : `in ${n} days`; };
const plural = (n, w) => `${n} ${w}${n===1?"":"s"}`;
const num = v => v===""||v==null||isNaN(Number(v)) ? null : Number(v);
const fmtNum = n => +Number(n||0).toFixed(2);
/* Share text with the phone's share sheet (Android app, then browser), else copy it. */
async function shareText(t, copied="Copied. Paste it in a message."){
  try {
    if (window.NestwiseAndroid) { window.NestwiseAndroid.share(t); return; }
    if (navigator.share) { await navigator.share({ text:t }); return; }
    await navigator.clipboard.writeText(t); toast(copied);
  } catch {}
}
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast.t); toast.t=setTimeout(()=>t.hidden=true,2400); }
function money(n){
  if (n==null || n==="" || isNaN(n)) return "–";
  const cur = settings().currency || "EUR";
  try { return new Intl.NumberFormat(undefined,{ style:"currency", currency:cur, minimumFractionDigits:Number(n)%1?2:0, maximumFractionDigits:2 }).format(n); }
  catch { return `${fmtNum(n)} ${cur}`; }
}

/* ---------- reference data ---------- */
/* What a recipe contains. Diet styles avoid some of these. */
const CONTAINS = [["meat","Meat"],["pork","Pork"],["fish","Fish"],["shellfish","Shellfish"],["dairy","Dairy"],["eggs","Eggs"],["gluten","Gluten"],["nuts","Tree nuts"],["peanuts","Peanuts"],["soy","Soy"],["sesame","Sesame"],["alcohol","Alcohol"],["sugar","Added sugar"]];
const containsName = k => (CONTAINS.find(c=>c[0]===k)||[k,k])[1];
const CATS = ["Fruits","Vegetables","Meat","Fish & seafood","Dairy & eggs","Bakery","Pantry staples","Frozen","Drinks","Cleaning","Household","Personal care","Other"];
const catOf = x => CATS.includes(x.cat) ? x.cat : "Other";
const catIdx = x => CATS.indexOf(catOf(x));
const SLOTS = [["b","Breakfast"],["l","Lunch"],["d","Dinner"],["s","Snack"]];
const slotName = k => (SLOTS.find(s=>s[0]===k)||[k,k])[1];
const EMOJIS = ["🙂","😀","😎","🧑","👩","👨","👧","👦","👵","👴","🧒","👶","🐶","🐱","🦊","🐻","🐼","🌻","⭐","🔥"];
const ACTIVITIES = [["Walking",3.5],["Brisk walking",4.3],["Running",9.8],["Cycling",7.5],["Swimming",6],["Gym / weights",5],["Yoga / stretching",2.5],["Dancing",5],["Gardening",3.8],["Housework",3.3],["Team sports",7],["Hiking",6]];
const ACT_LEVELS = [["1.2","Mostly sitting"],["1.375","Light (1–3 workouts a week)"],["1.55","Moderate (3–5 a week)"],["1.725","Very active"]];
const CURRENCIES = ["EUR","USD","GBP","CAD","AUD","MXN","BRL","ARS","COP","CLP","CHF","SEK","NOK","DKK","PLN","INR","JPY","CNY","ZAR"];

/* Starter diet styles a household can add, edit or delete. */
const DIET_TEMPLATES = [
  { key:"any", name:"No restrictions", emoji:"🍽️", avoid:[], desc:"Eats everything." },
  { key:"veg", name:"Vegetarian", emoji:"🥕", avoid:["meat","pork","fish","shellfish"], desc:"No meat or fish." },
  { key:"vegan", name:"Vegan", emoji:"🌱", avoid:["meat","pork","fish","shellfish","dairy","eggs"], desc:"Only plant foods." },
  { key:"pesc", name:"Pescatarian", emoji:"🐟", avoid:["meat","pork"], desc:"Fish and seafood, no meat." },
  { key:"med", name:"Mediterranean", emoji:"🫒", avoid:[], desc:"Olive oil, vegetables, legumes, fish, whole grains; little red meat.", prefer:["Extra virgin olive oil","Tomatoes","Chickpeas","Lentils","Salmon","Sardines","Spinach","Whole-grain bread","Plain yogurt","Lemons"] },
  { key:"lowcarb", name:"Low carb", emoji:"🥩", avoid:["sugar"], maxCarbs:20, desc:"About 20 g net carbs or less per serving." },
  { key:"keto", name:"Keto", emoji:"🥑", avoid:["sugar"], maxCarbs:10, desc:"Very low carb, high fat." },
  { key:"heart", name:"Heart healthy", emoji:"❤️", avoid:[], desc:"Low saturated fat; lean protein, oily fish, fiber and unsaturated fats.", prefer:["Salmon","Sardines","Oats","Lentils","Avocados","Extra virgin olive oil","Skinless chicken breast","Broccoli","Berries"] },
  { key:"gf", name:"Gluten free", emoji:"🌾", avoid:["gluten"], desc:"No wheat, barley or rye." },
  { key:"nutfree", name:"Nut allergy", emoji:"🥜", avoid:["nuts","peanuts"], desc:"No tree nuts or peanuts." },
  { key:"dairyfree", name:"Dairy free", emoji:"🥛", avoid:["dairy"], desc:"No milk, cheese or yogurt." }
];

/* Optional starter recipes (from the original app), tagged so diet filters work. */
const STARTER_RECIPES = [
  { title:"Baked salmon with asparagus and lemon", slot:"d", servings:2, time:"25 min", carbs:5, kcal:420, contains:["fish"],
    ing:"300 g salmon fillets\n400 g asparagus\n2 tbsp extra virgin olive oil\n1 pcs lemon\n2 cloves garlic\nDill, salt and pepper",
    steps:"Heat the oven to 200 °C / 400 °F.\nToss the asparagus on a sheet pan with 1 tbsp oil, minced garlic, salt and pepper.\nLay the salmon on top, drizzle with the rest of the oil and the juice of half a lemon.\nBake 12 to 15 minutes. Finish with dill and lemon slices." },
  { title:"Garlic chicken with broccoli", slot:"d", servings:3, time:"30 min", carbs:7, kcal:380, contains:["meat"],
    ing:"450 g skinless chicken breast\n1 head broccoli\n4 cloves garlic\n3 tbsp olive oil\nParsley, paprika, salt",
    steps:"Cube the chicken and season with salt and paprika.\nBrown the chicken in 2 tbsp oil, about 8 minutes. Set aside.\nIn the same pan, sauté sliced garlic and the broccoli with 3 tbsp water, covered, 5 minutes.\nReturn the chicken, stir, add parsley and the remaining oil." },
  { title:"Scrambled eggs with spinach and mushrooms", slot:"b", servings:1, time:"10 min", carbs:4, kcal:260, contains:["eggs"],
    ing:"3 pcs eggs\n30 g spinach\n4 pcs mushrooms\n1 tbsp olive oil\nSalt, pepper, chives",
    steps:"Sauté the mushrooms in the oil for 3 minutes.\nAdd the spinach until wilted.\nAdd the beaten eggs and stir over low heat.\nServe with chopped chives." },
  { title:"Chickpea and spinach curry", slot:"d", servings:4, time:"30 min", carbs:38, kcal:360, contains:[],
    ing:"2 can chickpeas\n200 g spinach\n1 can coconut milk\n1 pcs onion\n2 cloves garlic\n2 tbsp curry paste\n1 can diced tomatoes",
    steps:"Soften the chopped onion and garlic in a little oil.\nStir in the curry paste for 1 minute.\nAdd tomatoes, coconut milk and drained chickpeas. Simmer 15 minutes.\nStir in the spinach until wilted. Serve with rice." },
  { title:"Overnight oats with berries", slot:"b", servings:2, time:"5 min + overnight", carbs:45, kcal:330, contains:["dairy","gluten"],
    ing:"100 g rolled oats\n250 ml milk\n150 g plain yogurt\n150 g berries\n1 tbsp honey",
    steps:"Mix oats, milk and yogurt in two jars.\nRefrigerate overnight.\nTop with berries and honey in the morning." },
  { title:"Chia pudding with berries", slot:"s", servings:2, time:"5 min + 4 h", carbs:6, kcal:210, contains:["soy"],
    ing:"4 tbsp chia seeds\n250 ml unsweetened soy milk\n100 g raspberries\nCinnamon and vanilla",
    steps:"Mix chia, soy milk, vanilla and cinnamon.\nRefrigerate at least 4 hours or overnight.\nTop with the berries." }
];

/* ---------- data access ---------- */
const L = c => Store.list(c);
const settings = () => (Store.db && Store.get("settings","home")) || {};
const members = () => L("members").sort((a,b)=>(a.order??0)-(b.order??0) || String(a.name).localeCompare(b.name));
const member = id => Store.get("members", id);
const diets = () => L("diets").sort((a,b)=>String(a.name).localeCompare(b.name));
const diet = id => Store.get("diets", id);
const recipes = () => L("recipes").sort((a,b)=>String(a.title).localeCompare(b.title));
const myProfile = () => Store.get("profile", Store.pid("profile")) || {};
const meId = () => myProfile().memberId || null;
const whoName = id => { const m = member(id); return m ? `${m.emoji||""} ${m.name}`.trim() : ""; };

/* ---------- diet logic ---------- */
/* Why a recipe doesn't fit a diet style (empty list = fits). */
function conflicts(r, d){
  if (!r || !d) return [];
  const out = [];
  (d.avoid||[]).forEach(a => { if ((r.contains||[]).includes(a)) out.push(`has ${containsName(a).toLowerCase()}`); });
  const avoidWords = String(d.avoidFoods||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
  const text = (String(r.ing||"") + " " + String(r.title||"")).toLowerCase();
  avoidWords.forEach(w => { if (text.includes(w)) out.push(`has ${w}`); });
  if (d.maxCarbs!=null && r.carbs!=null && Number(r.carbs) > Number(d.maxCarbs)) out.push(`${r.carbs} g carbs (limit ${d.maxCarbs})`);
  if (d.maxKcal!=null && r.kcal!=null && Number(r.kcal) > Number(d.maxKcal)) out.push(`${r.kcal} kcal (limit ${d.maxKcal})`);
  return out;
}
/* Problems for each person eating it. */
function memberConflicts(r, memberIds){
  const out = [];
  (memberIds || members().map(m=>m.id)).forEach(id => { const m = member(id); if (!m) return;
    (m.diets||[]).forEach(did => { const d = diet(did); const c = conflicts(r, d); if (c.length) out.push({ m, d, c }); });
    const al = String(m.allergies||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
    const text = (String(r.ing||"")+" "+String(r.title||"")).toLowerCase();
    al.forEach(w => { if (text.includes(w) || (r.contains||[]).some(k => containsName(k).toLowerCase()===w || k===w)) out.push({ m, d:{ name:"Allergy" }, c:[w] }); });
  });
  return out;
}
const fitsAll = (r, ids) => memberConflicts(r, ids).length === 0;

/* ---------- ingredients ---------- */
const UNITS = ["g","kg","ml","l","tbsp","tsp","cup","cups","pcs","can","cans","clove","cloves","oz","lb","head","bunch","slice","slices","pack"];
const FRAC = { "¼":0.25, "½":0.5, "¾":0.75 };
function parseIng(line){
  line = String(line).trim(); if (!line) return null;
  const m = line.match(/^(\d+(?:[.,]\d+)?(?:\/\d+)?|[¼½¾]|\d+\s*[¼½¾])\s*([a-zA-Z]+)?\s+(.+)$/);
  if (!m) return { qty:null, unit:"", name:line };
  let q = m[1].replace(",", ".").trim();
  let qty;
  if (q.includes("/")) { const [a,b] = q.split("/").map(Number); qty = a/b; }
  else if (/[¼½¾]/.test(q)) { const w = parseFloat(q) || 0; qty = w + FRAC[q.slice(-1)]; }
  else qty = Number(q);
  let unit = (m[2]||"").toLowerCase(), name = m[3];
  if (unit && !UNITS.includes(unit)) { name = m[2] + " " + name; unit = ""; }
  if (unit==="cups") unit="cup"; if (unit==="cans") unit="can"; if (unit==="cloves") unit="clove"; if (unit==="slices") unit="slice";
  return { qty, unit: unit || (qty!=null ? "pcs" : ""), name: name.trim() };
}
const ingList = r => String(r.ing||"").split("\n").map(parseIng).filter(Boolean);
const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
function guessCat(name){
  const n = name.toLowerCase();
  const rules = [["Fish & seafood",/salmon|tuna|cod|sardine|shrimp|prawn|fish|trout|mackerel|scallop|sea bass/],["Meat",/chicken|beef|pork|turkey|lamb|ham|bacon|sausage|steak|mince/],["Dairy & eggs",/milk|cheese|yogurt|yoghurt|butter|cream|egg|skyr|kefir/],["Fruits",/apple|banana|berr|lemon|lime|orange|avocado|grape|pear|peach|mango|melon/],["Vegetables",/spinach|lettuce|tomato|onion|garlic|pepper|broccoli|carrot|potato|zucchini|cucumber|asparagus|cabbage|kale|mushroom|celery|cauliflower|ginger|herb|parsley|dill/],["Bakery",/bread|bun|tortilla|bagel|pita/],["Drinks",/juice|water|coffee|tea|wine|beer|soda/],["Frozen",/frozen|ice cream/]];
  for (const [c, re] of rules) if (re.test(n)) return c;
  return "Pantry staples";
}
/* Add ingredients to Shopping: skip what's in the pantry, merge amounts with what's already listed. */
function addToShopping(items){
  let added = 0;
  items.forEach(({ name, qty, unit }) => {
    if (!name || qty==null) return; /* lines without an amount, like "salt to taste", are skipped */
    const pan = L("pantry").find(p => sameName(p.name, name));
    if (pan && (qty==null || (pan.unit===unit && Number(pan.qty) >= qty))) return;
    const need = pan && qty!=null && pan.unit===unit ? qty - Number(pan.qty||0) : qty;
    const cur = L("shopping").find(s => !s.done && sameName(s.name, name));
    if (cur) { if (need!=null && cur.unit===unit) Store.update("shopping", cur.id, { qty: fmtNum(Number(cur.qty||0) + need) }); }
    else { Store.add("shopping", { name, qty: need!=null ? fmtNum(need) : null, unit: need!=null ? unit : "", cat: guessCat(name), done:false }); added++; }
  });
  return added;
}

/* ---------- generic dialog form ---------- */
function openForm({ title, intro, fields, values = {}, onSave, onDelete, saveLabel = "Save" }){
  const f = $("#dlgForm");
  f.innerHTML = `<h2>${esc(title)}</h2>${intro?`<p class="sub" style="margin:0">${intro}</p>`:""}` + fields.map(fl => {
    const v = values[fl.k] ?? fl.def ?? "";
    const id = "f_" + fl.k;
    let input;
    if (fl.type === "select") input = `<select id="${id}" name="${fl.k}">${fl.opts.map(o => `<option value="${esc(o[0])}" ${String(v)===String(o[0])?"selected":""}>${esc(o[1])}</option>`).join("")}</select>`;
    else if (fl.type === "textarea") input = `<textarea id="${id}" name="${fl.k}" rows="${fl.rows||4}" placeholder="${esc(fl.ph||"")}">${esc(v)}</textarea>`;
    else if (fl.type === "checks") { const sel = new Set(Array.isArray(v) ? v : []); input = `<div class="ck" id="${id}">${fl.opts.length ? fl.opts.map(o => `<label><input type="checkbox" name="${fl.k}" value="${esc(o[0])}" ${sel.has(o[0])?"checked":""}>${esc(o[1])}</label>`).join("") : `<span class="sub">${esc(fl.none||"Nothing to pick yet.")}</span>`}</div>`; }
    else if (fl.type === "toggle") input = `<span class="ck"><label><input type="checkbox" id="${id}" name="${fl.k}" ${v?"checked":""}>${esc(fl.text||"Yes")}</label></span>`;
    else input = `<input id="${id}" name="${fl.k}" type="${fl.type||"text"}" value="${esc(v)}" placeholder="${esc(fl.ph||"")}" ${fl.req?"required":""} ${fl.min!=null?`min="${fl.min}"`:""} ${fl.type==="number"?'step="any" inputmode="decimal"':""} ${fl.list?`list="${id}_l"`:""} autocomplete="off">${fl.list?`<datalist id="${id}_l">${fl.list.map(o=>`<option value="${esc(o)}">`).join("")}</datalist>`:""}`;
    return `<label class="f" for="${id}" ${fl.half?'data-half':''}>${esc(fl.label)}${input}${fl.help?`<span class="sub">${esc(fl.help)}</span>`:""}</label>`;
  }).join("") + `<div class="row" style="justify-content:space-between;margin-top:4px">
      <div>${onDelete ? `<button type="button" class="btn danger" id="dlgDel">Delete</button>` : ""}</div>
      <div class="row"><button type="button" class="btn" id="dlgCancel">Cancel</button><button type="submit" class="btn primary">${esc(saveLabel)}</button></div></div>`;
  const halves = [...f.querySelectorAll("label[data-half]")];
  for (let i=0;i<halves.length;i+=2){ const g=document.createElement("div"); g.className="grid2"; halves[i].before(g); g.append(halves[i]); if (halves[i+1]) g.append(halves[i+1]); }
  const dlg = $("#dlg");
  f.onsubmit = ev => {
    ev.preventDefault();
    const out = {};
    fields.forEach(fl => {
      if (fl.type === "checks") { out[fl.k] = [...f.querySelectorAll(`input[name="${fl.k}"]:checked`)].map(x=>x.value); return; }
      if (fl.type === "toggle") { out[fl.k] = f.querySelector(`#f_${fl.k}`).checked; return; }
      let v = f.elements[fl.k].value.trim(); if (fl.type==="number") v = num(v); out[fl.k]=v;
    });
    dlg.close(); onSave(out);
  };
  $("#dlgCancel").onclick = () => dlg.close();
  if (onDelete) $("#dlgDel").onclick = () => {
    const b = $("#dlgDel");
    if (b.dataset.sure) { dlg.close(); onDelete(); } else { b.dataset.sure = "1"; b.textContent = "Sure? Tap again"; }
  };
  dlg.showModal();
  setTimeout(()=>f.querySelector("input:not([type=checkbox]),select,textarea")?.focus(), 30);
}
function confirmTap(btn, fn){ if (btn.dataset.sure) fn(); else { btn.dataset.sure="1"; btn.dataset.txt = btn.textContent; btn.textContent = "Sure? Tap again"; setTimeout(()=>{ if (btn.isConnected){ delete btn.dataset.sure; btn.textContent = btn.dataset.txt; } }, 3000); } }

/* ---------- navigation ---------- */
const ICON = {
  today:'<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  shopping:'<path d="M6 7h15l-2 9H8L6 3H3"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/>',
  pantry:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 6h4M10 12h4M10 18h4"/>',
  meals:'<path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8M7 7h4M17 3c-2 2-2 6 0 8v10"/>',
  chores:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  me:'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  budget:'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 15h2"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>'
};
const svg = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
const TABS = [["today","Today"],["shopping","Shopping"],["pantry","Pantry"],["meals","Meals"],["chores","Chores"],["me","Me"],["budget","Budget"],["settings","Settings"]];
let tab = (location.hash.slice(1) && TABS.some(t=>t[0]===location.hash.slice(1))) ? location.hash.slice(1) : "today";
function go(t){ tab = t; history.replaceState(null, "", "#"+t); render(); window.scrollTo(0,0); }

/* ---------- small UI bits ---------- */
const delBtn = (c, id, label) => `<button class="del" data-act="del" data-c="${c}" data-id="${esc(id)}" aria-label="Delete ${esc(label||"")}" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>`;
const memberOpts = (blank="Anyone") => [["", blank], ...members().map(m=>[m.id, `${m.emoji||""} ${m.name}`.trim()])];
const dietPills = ids => (ids||[]).map(diet).filter(Boolean).map(d=>`<span class="pill">${esc(d.emoji||"")} ${esc(d.name)}</span>`).join(" ");
const privateTag = `<span class="lock" title="Only you can see this">🔒 only you</span>`;

/* ---------- setup (first launch) ---------- */
let setup = { step:1, name:"", people:[{ name:"", emoji:"🙂" }], currency:"EUR", tz:deviceTZ(), templates:["any"], starters:true, mode:"new", err:"", busy:false };
function vSetup(){
  const s = setup;
  if (s.step === 1) return `<section class="hero">
    <div><h1>Nestwise</h1><p class="sub" style="font-size:15px">Shopping, pantry, meals, chores and budget for your home. Your household, your recipes, your diet styles.</p></div>
    <div class="card" style="display:flex;flex-direction:column;gap:12px">
      <label class="f">What do you call your household?<input id="s_name" value="${esc(s.name)}" placeholder="e.g. The García home" autocomplete="off"></label>
      <h3>Who lives here?</h3>
      ${s.people.map((p,i)=>`<div class="memrow"><select data-s-emoji="${i}" aria-label="Icon">${EMOJIS.map(e=>`<option ${e===p.emoji?"selected":""}>${e}</option>`).join("")}</select>
        <input data-s-person="${i}" value="${esc(p.name)}" placeholder="${i===0?"Your name":"Name"}" autocomplete="off">
        ${s.people.length>1?`<button class="btn ghost" data-act="s-rm" data-i="${i}" aria-label="Remove">✕</button>`:"<span></span>"}</div>`).join("")}
      <button class="btn sm" data-act="s-add" style="align-self:flex-start">+ Add someone</button>
      <div class="grid2">
        <label class="f">Currency<select id="s_cur">${CURRENCIES.map(c=>`<option ${c===s.currency?"selected":""}>${c}</option>`).join("")}</select></label>
        <label class="f">Time zone<input id="s_tz" value="${esc(s.tz)}"></label>
      </div>
      ${s.err?`<div class="banner">${esc(s.err)}</div>`:""}
      <button class="btn primary" data-act="s-next">Next</button>
    </div>
    ${Store.configured() ? `<button class="btn ghost" data-act="s-join">Someone already set up our household: join it</button>` : ""}
  </section>`;
  return `<section class="hero">
    <div><h2>Diet styles</h2><p class="sub">Pick any to start with. You can edit them, make your own and give each person theirs in Settings.</p></div>
    <div class="card" style="display:flex;flex-direction:column;gap:12px">
      <div class="ck">${DIET_TEMPLATES.map(t=>`<label><input type="checkbox" data-s-tpl="${t.key}" ${s.templates.includes(t.key)?"checked":""}>${t.emoji} ${esc(t.name)}</label>`).join("")}</div>
      <span class="ck"><label><input type="checkbox" id="s_starters" ${s.starters?"checked":""}>Add 6 starter recipes</label></span>
      <div class="row" style="justify-content:space-between"><button class="btn" data-act="s-back">Back</button><button class="btn primary" data-act="s-finish">Start</button></div>
    </div></section>`;
}
function readSetup(){
  if ($("#s_name")) setup.name = $("#s_name").value;
  document.querySelectorAll("[data-s-person]").forEach(el => setup.people[+el.dataset.sPerson].name = el.value);
  document.querySelectorAll("[data-s-emoji]").forEach(el => setup.people[+el.dataset.sEmoji].emoji = el.value);
  if ($("#s_cur")) setup.currency = $("#s_cur").value;
  if ($("#s_tz")) setup.tz = $("#s_tz").value.trim();
  if ($("#s_starters")) { setup.starters = $("#s_starters").checked; setup.templates = [...document.querySelectorAll("[data-s-tpl]:checked")].map(x=>x.dataset.sTpl); }
}
function finishSetup(){
  const tplIds = {};
  DIET_TEMPLATES.filter(t => setup.templates.includes(t.key)).forEach(t => { const { key, ...d } = t; tplIds[key] = Store.add("diets", d); });
  const ppl = setup.people.filter(p => p.name.trim());
  ppl.forEach((p, i) => { const id = Store.add("members", { name:p.name.trim(), emoji:p.emoji, order:i, diets: tplIds.any ? [tplIds.any] : [] }); if (i===0) Store.put("profile", Store.pid("profile"), { ...myProfile(), memberId:id }); });
  if (setup.starters) STARTER_RECIPES.forEach(r => Store.add("recipes", { ...r }));
  Store.add("budget", { name:"Groceries", limit:null });
  Store.put("settings", "home", { name: setup.name.trim() || "Our home", currency: setup.currency, tz: setup.tz || deviceTZ() });
  go("today"); toast("All set. Welcome home!");
}

/* ---------- Today ---------- */
function vToday(){
  const t = today(), me = meId();
  const meals = SLOTS.map(([k,n]) => [n, Store.get("plan", `${t}_${k}`)]).filter(x=>x[1]);
  const late = L("chores").filter(c => !c.done && c.next && c.next <= t).sort((a,b)=>a.next.localeCompare(b.next));
  const low = L("pantry").filter(isLow);
  const shop = L("shopping").filter(s=>!s.done);
  const evs = upcomingEvents(t, addDays(t, 14));
  return `<section class="view">
    <div class="stats">
      <button class="stat" data-go="shopping"><b>${shop.length}</b><span>to buy</span></button>
      <button class="stat" data-go="chores"><b>${late.length}</b><span>chores due</span></button>
      <button class="stat" data-go="pantry"><b>${low.length}</b><span>running low</span></button>
      <button class="stat" data-go="meals"><b>${meals.length}</b><span>meals planned today</span></button>
    </div>
    <div class="card"><div class="row" style="justify-content:space-between"><h3>Today's meals</h3><button class="btn ghost sm" data-go="meals">Plan</button></div>
      ${meals.length ? `<ul class="list">${meals.map(([n,p]) => { const r = p.recipeId && Store.get("recipes", p.recipeId); return `<li><div class="grow"><div class="meta">${esc(n)}</div><div class="name">${esc(r ? r.title : p.text||"")}</div></div>${(p.eaters||[]).map(id=>`<span title="${esc(whoName(id))}">${esc(member(id)?.emoji||"")}</span>`).join("")}</li>`; }).join("")}</ul>` : `<p class="empty">Nothing planned. Open Meals to plan your week.</p>`}
    </div>
    <div class="card"><h3>Chores due</h3>
      ${late.length ? `<ul class="list">${late.map(choreLi).join("")}</ul>` : `<p class="empty">You're all caught up.</p>`}
    </div>
    <div class="card"><div class="row" style="justify-content:space-between"><h3>Coming up</h3><button class="btn sm" data-act="ev-add">+ Event</button></div>
      ${evs.length ? `<ul class="list">${evs.map(e => `<li data-act="ev-edit" data-id="${esc(e.id)}" data-priv="${e._priv?1:""}" style="cursor:pointer"><div class="grow"><div class="name">${esc(e.title)} ${e._priv?privateTag:""}</div><div class="meta">${esc(shortDate(e._date))}${e.time?` · ${esc(e.time)}`:""} · ${relDay(e._date)}${e.who?` · ${esc(whoName(e.who))}`:""}</div></div></li>`).join("")}</ul>` : `<p class="empty">No events in the next two weeks.</p>`}
    </div>
    ${!me && members().length ? `<div class="banner">Tell Nestwise which member you are in the Me tab so it can show your chores and health.</div>` : ""}
  </section>`;
}
function upcomingEvents(from, to){
  const out = [];
  const one = (e, priv) => {
    if (!e.date) return;
    if (!e.repeat || e.repeat==="none") { if (e.date >= from && e.date <= to) out.push({ ...e, _date:e.date, _priv:priv }); return; }
    let d = e.date, guard = 0;
    while (d < from && guard++ < 1000) d = nextRepeat(d, e.repeat, e.date);
    guard = 0;
    while (d <= to && guard++ < 60) { out.push({ ...e, _date:d, _priv:priv }); d = nextRepeat(d, e.repeat, e.date); }
  };
  L("events").forEach(e => one(e, false)); L("myevents").forEach(e => one(e, true));
  return out.sort((a,b)=> a._date.localeCompare(b._date) || String(a.time||"").localeCompare(String(b.time||"")));
}
function nextRepeat(d, rep, orig){
  if (rep==="weekly") return addDays(d, 7);
  const o = parse(orig), c = parse(d);
  const months = rep==="yearly" ? 12 : 1;
  const n = new Date(c.getFullYear(), c.getMonth()+months, 1);
  const last = new Date(n.getFullYear(), n.getMonth()+1, 0).getDate();
  n.setDate(Math.min(o.getDate(), last)); return ymd(n);
}
const evFields = priv => [
  { k:"title", label:"What", req:true, ph:"Dentist, school play, birthday…" },
  { k:"date", label:"Date", type:"date", half:true, req:true, def:today() },
  { k:"time", label:"Time (optional)", type:"time", half:true },
  { k:"who", label:"Who", type:"select", opts:memberOpts("Everyone"), half:true },
  { k:"repeat", label:"Repeats", type:"select", opts:[["none","No"],["weekly","Every week"],["monthly","Every month"],["yearly","Every year"]], half:true },
  ...(priv==null ? [{ k:"priv", label:"Privacy", type:"toggle", text:"Private: only I can see it" }] : [])
];
function editEvent(id, priv){
  const c = priv ? "myevents" : "events";
  const cur = id ? Store.get(c, id) : null;
  openForm({ title: cur ? "Edit event" : "New event", fields: evFields(cur ? true : null), values: cur || {},
    onSave: v => { const { priv:p, ...data } = v; if (cur) Store.update(c, id, data); else Store.add(p ? "myevents" : "events", data); },
    onDelete: cur ? () => Store.remove(c, id) : null });
}

/* ---------- Shopping ---------- */
let shopFilter = "todo";
function vShopping(){
  const items = L("shopping").sort((a,b)=> (a.done-b.done) || catIdx(a)-catIdx(b) || String(a.name).localeCompare(b.name));
  const vis = shopFilter==="todo" ? items.filter(i=>!i.done) : items;
  const nDone = items.filter(i=>i.done).length;
  let lastCat = null;
  const total = items.filter(i=>!i.done && i.price!=null).reduce((t,i)=>t+Number(i.price),0);
  return `<section class="view">
    <form class="card row" id="quickShop" autocomplete="off"><input class="grow" name="q" placeholder="Add an item, e.g. 2 kg potatoes" style="flex:1" aria-label="Item"><button class="btn primary">Add</button></form>
    <div class="row" style="justify-content:space-between">
      <div class="seg"><button data-act="shop-f" data-v="todo" aria-pressed="${shopFilter==="todo"}">To buy</button><button data-act="shop-f" data-v="all" aria-pressed="${shopFilter==="all"}">All</button></div>
      <div class="row">${nDone?`<button class="btn sm" data-act="shop-clear">Clear ${nDone} bought</button>`:""}<button class="btn sm" data-act="shop-share">Share list</button></div>
    </div>
    <div class="card">${vis.length ? `<ul class="list">${vis.map(i => { const c = catOf(i); const head = c!==lastCat && !i.done ? `<li style="border:0;padding:12px 2px 2px"><h3>${esc(c)}</h3></li>` : ""; if (!i.done) lastCat = c;
      return head + `<li class="${i.done?"done":""}"><button class="check ${i.done?"on":""}" data-act="shop-tick" data-id="${esc(i.id)}" aria-label="Bought ${esc(i.name)}"></button>
        <div class="grow" data-act="shop-edit" data-id="${esc(i.id)}" style="cursor:pointer"><div class="name">${esc(i.name)}</div><div class="meta">${[i.qty!=null?`${fmtNum(i.qty)} ${esc(i.unit||"")}`:"", i.price!=null?money(i.price):"", i.note?esc(i.note):""].filter(Boolean).join(" · ")}</div></div>
        ${delBtn("shopping", i.id, i.name)}</li>`; }).join("")}</ul>` : `<p class="empty">${shopFilter==="todo"?"Nothing to buy.":"The list is empty."}</p>`}
      ${total ? `<p class="sub" style="margin:10px 0 0">Estimated total: <b>${money(total)}</b></p>` : ""}
    </div>
    ${preferredPanel()}
  </section>`;
}
/* Quick-add chips from everyone's diet styles. */
function preferredPanel(){
  const used = new Set(members().flatMap(m=>m.diets||[]));
  const lists = diets().filter(d => used.has(d.id) && String(d.prefer||"").trim() || (Array.isArray(d.prefer) && d.prefer.length && used.has(d.id)));
  if (!lists.length) return "";
  return `<details class="card quick"><summary><span>Foods that fit your diet styles</span><span class="sub">Show</span></summary>
    ${lists.map(d => { const foods = (Array.isArray(d.prefer) ? d.prefer : String(d.prefer).split(",")).map(s=>s.trim()).filter(Boolean);
      return `<h3 style="margin:12px 0 6px">${esc(d.emoji||"")} ${esc(d.name)}</h3><div class="chips">${foods.map(n => { const on = L("shopping").some(s=>!s.done && sameName(s.name,n)); return `<button class="chip ${on?"on":""}" data-act="chip" data-n="${esc(n)}" aria-pressed="${on}">${esc(n)}</button>`; }).join("")}</div>`; }).join("")}
  </details>`;
}
const shopFields = [
  { k:"name", label:"Item", req:true },
  { k:"qty", label:"Amount", type:"number", half:true }, { k:"unit", label:"Unit", half:true, list:UNITS, ph:"pcs" },
  { k:"cat", label:"Aisle", type:"select", opts:CATS.map(c=>[c,c]), half:true }, { k:"price", label:"Price (optional)", type:"number", half:true },
  { k:"note", label:"Note", ph:"Brand, size…" }
];
function shoppingText(){
  const items = L("shopping").filter(i=>!i.done).sort((a,b)=>catIdx(a)-catIdx(b));
  let last = null, out = `${settings().name||"Shopping"} list\n`;
  items.forEach(i => { const c = catOf(i); if (c!==last) { out += `\n${c}\n`; last = c; } out += `• ${i.name}${i.qty!=null?` (${fmtNum(i.qty)} ${i.unit||""})`.replace(" )",")"):""}\n`; });
  return out;
}

/* ---------- Pantry ---------- */
let pantryQ = "";
const isLow = p => p.min != null && Number(p.qty||0) <= Number(p.min);
function vPantry(){
  const q = pantryQ.toLowerCase();
  const items = L("pantry").filter(p => !q || String(p.name).toLowerCase().includes(q)).sort((a,b)=> catIdx(a)-catIdx(b) || String(a.name).localeCompare(b.name));
  const low = L("pantry").filter(isLow);
  let lastCat = null;
  return `<section class="view">
    <div class="row"><input id="pantryQ" class="grow" style="flex:1" placeholder="Search the pantry" value="${esc(pantryQ)}" aria-label="Search"><button class="btn primary" data-act="pan-add">+ Add</button></div>
    ${low.length ? `<div class="banner row" style="justify-content:space-between"><span>${plural(low.length,"item")} running low</span><button class="btn sm" data-act="pan-low">Add to shopping</button></div>` : ""}
    <div class="card">${items.length ? `<ul class="list">${items.map(p => { const c = catOf(p); const head = c!==lastCat ? `<li style="border:0;padding:12px 2px 2px"><h3>${esc(c)}</h3></li>` : ""; lastCat = c;
      const exp = p.expires ? diffDays(p.expires, today()) : null;
      return head + `<li><div class="grow" data-act="pan-edit" data-id="${esc(p.id)}" style="cursor:pointer"><div class="name">${esc(p.name)} ${isLow(p)?`<span class="pill warn">low</span>`:""} ${exp!=null && exp<0?`<span class="pill bad">expired</span>`:exp!=null && exp<=3?`<span class="pill warn">use ${relDay(p.expires)}</span>`:""}</div>
        <div class="meta">${p.min!=null?`keep at least ${fmtNum(p.min)} ${esc(p.unit||"")}`:""}${p.expires?` · best before ${esc(shortDate(p.expires))}`:""}</div></div>
        <div class="stepper"><button data-act="pan-step" data-id="${esc(p.id)}" data-d="-1" aria-label="Less">−</button><span class="qty">${fmtNum(p.qty)} ${esc(p.unit||"")}</span><button data-act="pan-step" data-id="${esc(p.id)}" data-d="1" aria-label="More">+</button></div></li>`; }).join("")}</ul>`
      : `<p class="empty">${q?"Nothing matches.":"Track what you have at home. Items you check off in Shopping can be added here."}</p>`}</div>
  </section>`;
}
const panFields = [
  { k:"name", label:"Item", req:true },
  { k:"qty", label:"How much you have", type:"number", half:true, def:1 }, { k:"unit", label:"Unit", half:true, list:UNITS, ph:"pcs" },
  { k:"min", label:"Warn me below", type:"number", half:true }, { k:"expires", label:"Best before", type:"date", half:true },
  { k:"cat", label:"Aisle", type:"select", opts:CATS.map(c=>[c,c]) }
];

/* ---------- Meals: week plan + recipes ---------- */
let mealView = "week", weekStart = null, recQ = "", recFor = "all", recSlot = "";
const mondayOf = s => addDays(s, -((parse(s).getDay()+6)%7));
function vMeals(){
  return `<section class="view">
    <div class="seg"><button data-act="meal-v" data-v="week" aria-pressed="${mealView==="week"}">Week plan</button><button data-act="meal-v" data-v="recipes" aria-pressed="${mealView==="recipes"}">Recipes</button><button data-act="meal-v" data-v="diets" aria-pressed="${mealView==="diets"}">Diet styles</button></div>
    ${mealView==="week" ? vWeek() : mealView==="recipes" ? vRecipes() : vDiets()}
  </section>`;
}
function vWeek(){
  weekStart = weekStart || mondayOf(today());
  const days = [...Array(7)].map((_,i)=>addDays(weekStart, i)), t = today();
  const slots = settings().slots || ["b","l","d"];
  return `<div class="row" style="justify-content:space-between"><div class="row"><button class="btn sm" data-act="wk" data-d="-7" aria-label="Previous week">‹</button><b>${esc(shortDate(days[0]))} – ${esc(shortDate(days[6]))}</b><button class="btn sm" data-act="wk" data-d="7" aria-label="Next week">›</button>${weekStart!==mondayOf(t)?`<button class="btn ghost sm" data-act="wk" data-d="0">This week</button>`:""}</div>
    <button class="btn sm primary" data-act="wk-shop">Add week to shopping</button></div>
    <div class="week">${days.map(d => `<div class="day ${d===t?"today":""}"><div class="row" style="justify-content:space-between"><b>${esc(fmtDate(d))}</b>${d===t?`<span class="pill ok">today</span>`:""}</div>
      ${slots.map(s => { const p = Store.get("plan", `${d}_${s}`); const r = p?.recipeId && Store.get("recipes", p.recipeId);
        const cf = r ? memberConflicts(r, p.eaters) : [];
        return `<button class="slot" data-act="plan" data-date="${d}" data-slot="${s}"><span class="lbl">${esc(slotName(s))}</span><span class="grow">${p ? `<span class="name">${esc(r ? r.title : p.text||"")}</span> ${cf.length?`<span class="pill warn" title="${esc(cf.map(x=>`${x.m.name}: ${x.c.join(", ")}`).join("; "))}">check diets</span>`:""}<br><span class="meta">${(p.eaters||[]).map(whoName).join(", ")}</span>` : `<span class="meta">+ plan</span>`}</span></button>`; }).join("")}
    </div>`).join("")}</div>
    <p class="sub">Tip: choose which meals you plan in Settings.</p>`;
}
function planSlot(date, slot){
  const id = `${date}_${slot}`, cur = Store.get("plan", id);
  const eat = cur?.eaters || members().map(m=>m.id);
  const rs = recipes().filter(r => !r.slot || r.slot===slot || slot==="s");
  const sorted = [...rs].sort((a,b)=> (fitsAll(b,eat)-fitsAll(a,eat)) || String(a.title).localeCompare(b.title));
  openForm({ title:`${slotName(slot)}, ${fmtDate(date)}`,
    intro: "Recipes that suit everyone eating are listed first. ⚠️ marks a clash with someone's diet style.",
    fields:[
      { k:"recipeId", label:"Recipe", type:"select", opts:[["","No recipe (type below)"], ...sorted.map(r => [r.id, `${fitsAll(r,eat)?"":"⚠️ "}${r.title}`])] },
      { k:"text", label:"Or just write it", ph:"Leftovers, eating out…" },
      { k:"eaters", label:"Who's eating", type:"checks", opts:members().map(m=>[m.id, `${m.emoji||""} ${m.name}`]) },
      { k:"servings", label:"Servings to cook", type:"number", help:"Leave empty to cook one serving per person." }
    ],
    values: { ...(cur||{}), eaters: eat },
    onSave: v => { if (!v.recipeId && !v.text) { if (cur) Store.remove("plan", id); return; }
      Store.put("plan", id, { date, slot, recipeId:v.recipeId||null, text:v.text, eaters:v.eaters, servings:v.servings });
      const r = v.recipeId && Store.get("recipes", v.recipeId); const cf = r ? memberConflicts(r, v.eaters) : [];
      if (cf.length) toast(`Heads up: ${cf.map(x=>`${x.m.name} (${x.d.name}: ${x.c[0]})`).join(", ")}`); },
    onDelete: cur ? () => Store.remove("plan", id) : null });
}
function weekToShopping(){
  const items = [];
  [...Array(7)].map((_,i)=>addDays(weekStart, i)).forEach(d => SLOTS.forEach(([s]) => {
    const p = Store.get("plan", `${d}_${s}`); const r = p?.recipeId && Store.get("recipes", p.recipeId); if (!r) return;
    const want = p.servings || (p.eaters||[]).length || r.servings || 1, k = want / (r.servings || 1);
    ingList(r).forEach(i => items.push({ ...i, qty: i.qty!=null ? i.qty*k : null }));
  }));
  const merged = [];
  items.forEach(i => { const m = merged.find(x => sameName(x.name,i.name) && x.unit===i.unit); if (m) { if (m.qty!=null && i.qty!=null) m.qty += i.qty; } else merged.push({ ...i }); });
  if (!merged.length) { toast("No recipes planned this week yet."); return; }
  const n = addToShopping(merged); toast(n ? `Added ${plural(n,"item")} to Shopping.` : "You already have everything on the list or in the pantry.");
}
function vRecipes(){
  const q = recQ.toLowerCase();
  let list = recipes().filter(r => !q || (r.title+" "+(r.ing||"")).toLowerCase().includes(q)).filter(r => !recSlot || r.slot===recSlot);
  if (recFor==="everyone") list = list.filter(r => fitsAll(r));
  else if (recFor!=="all") list = list.filter(r => fitsAll(r, [recFor]));
  return `<div class="row"><input id="recQ" style="flex:1" class="grow" placeholder="Search recipes or ingredients" value="${esc(recQ)}" aria-label="Search recipes"><button class="btn primary" data-act="rec-add">+ New recipe</button></div>
    <div class="row">
      <select id="recFor" style="width:auto" aria-label="Suits"><option value="all">All recipes</option><option value="everyone" ${recFor==="everyone"?"selected":""}>Suits everyone</option>${members().map(m=>`<option value="${esc(m.id)}" ${recFor===m.id?"selected":""}>Suits ${esc(m.name)}</option>`).join("")}</select>
      <select id="recSlot" style="width:auto" aria-label="Meal"><option value="">Any meal</option>${SLOTS.map(([k,n])=>`<option value="${k}" ${recSlot===k?"selected":""}>${n}</option>`).join("")}</select>
    </div>
    ${list.length ? list.map(recipeHTML).join("") : `<p class="empty">${recipes().length ? "No recipes match." : "No recipes yet. Add your family's favorites with “New recipe”."}</p>`}`;
}
function recipeHTML(r){
  const cf = memberConflicts(r);
  const fits = members().filter(m => !cf.some(x=>x.m.id===m.id));
  return `<details class="recipe"><summary><div class="grow"><div class="name" style="font-size:16px">${esc(r.title)}</div>
      <div class="meta">${[r.slot?slotName(r.slot):"", r.time, r.servings?`serves ${r.servings}`:"", r.kcal!=null?`${r.kcal} kcal/serving`:"", r.carbs!=null?`${r.carbs} g carbs`:""].filter(Boolean).map(esc).join(" · ")}</div>
      <div class="row" style="gap:4px;margin-top:4px">${(r.contains||[]).map(k=>`<span class="pill">${esc(containsName(k))}</span>`).join("")}</div></div>
      <div style="text-align:right">${members().length ? (cf.length ? `<span class="pill warn">${fits.length}/${members().length} can eat</span>` : `<span class="pill ok">suits everyone</span>`) : ""}</div></summary>
    <div class="body">
      ${cf.length ? `<div class="banner">${cf.map(x=>`${esc(x.m.emoji||"")} ${esc(x.m.name)} · ${esc(x.d.name)}: ${esc(x.c.join(", "))}`).join("<br>")}</div>` : ""}
      ${r.notes?`<div class="why">${esc(r.notes)}</div>`:""}
      <div><h3>Ingredients</h3><ul>${String(r.ing||"").split("\n").filter(s=>s.trim()).map(i=>`<li>${esc(i)}</li>`).join("")}</ul></div>
      <div><h3>Steps</h3><ol>${String(r.steps||"").split("\n").filter(s=>s.trim()).map(i=>`<li>${esc(i)}</li>`).join("")}</ol></div>
      <div class="row"><button class="btn sm" data-act="rec-shop" data-id="${esc(r.id)}">Add ingredients to shopping</button><button class="btn sm" data-act="rec-edit" data-id="${esc(r.id)}">Edit</button></div>
    </div></details>`;
}
const recFields = () => [
  { k:"title", label:"Name", req:true },
  { k:"slot", label:"Meal", type:"select", opts:[["","Any"], ...SLOTS], half:true }, { k:"time", label:"Time", ph:"30 min", half:true },
  { k:"servings", label:"Serves", type:"number", def:2, half:true }, { k:"kcal", label:"kcal per serving", type:"number", half:true },
  { k:"carbs", label:"Net carbs per serving (g)", type:"number", half:true }, { k:"protein", label:"Protein per serving (g)", type:"number", half:true },
  { k:"ing", label:"Ingredients, one per line", type:"textarea", rows:6, ph:"200 g chicken breast\n1 pcs onion\n2 tbsp olive oil\nSalt to taste", help:"Start a line with amount and unit (g, kg, ml, tbsp, cup, pcs…) so Nestwise can add it to Shopping. Lines without an amount (like salt to taste) are skipped." },
  { k:"steps", label:"Steps, one per line", type:"textarea", rows:5 },
  { k:"contains", label:"Contains", type:"checks", opts:CONTAINS, help:"Used to check each person's diet styles." },
  { k:"notes", label:"Notes", ph:"Grandma's version, kids love it…" }
];
function editRecipe(id){
  const cur = id ? Store.get("recipes", id) : null;
  openForm({ title: cur ? "Edit recipe" : "New recipe", fields: recFields(), values: cur || {},
    onSave: v => { if (cur) Store.update("recipes", id, v); else Store.add("recipes", v); toast("Recipe saved."); },
    onDelete: cur ? () => Store.remove("recipes", id) : null });
}
function vDiets(){
  const ds = diets();
  return `<div class="row" style="justify-content:space-between"><p class="sub" style="margin:0;flex:1">Diet styles describe how someone eats. Give each person theirs in Settings > Members, and recipes that clash get flagged.</p><button class="btn primary" data-act="diet-add">+ New style</button></div>
    ${ds.length ? `<div class="card"><ul class="list">${ds.map(d => { const who = members().filter(m=>(m.diets||[]).includes(d.id));
      return `<li data-act="diet-edit" data-id="${esc(d.id)}" style="cursor:pointer"><span class="avatar">${esc(d.emoji||"🍽️")}</span><div class="grow"><div class="name">${esc(d.name)}</div>
        <div class="meta">${[d.desc, (d.avoid||[]).length?`avoids ${(d.avoid||[]).map(containsName).join(", ").toLowerCase()}`:"", d.avoidFoods?`and ${d.avoidFoods}`:"", d.maxCarbs!=null?`≤ ${d.maxCarbs} g carbs`:"", d.maxKcal!=null?`≤ ${d.maxKcal} kcal`:""].filter(Boolean).map(esc).join(" · ")}</div>
        ${who.length?`<div class="meta">${who.map(m=>esc(`${m.emoji||""} ${m.name}`)).join(", ")}</div>`:""}</div></li>`; }).join("")}</ul></div>` : `<p class="empty">No diet styles yet.</p>`}
    <details class="card quick"><summary><span>Add from templates</span><span class="sub">Show</span></summary><div class="chips">${DIET_TEMPLATES.filter(t => !ds.some(d=>d.name===t.name)).map(t=>`<button class="chip" data-act="diet-tpl" data-k="${t.key}">${t.emoji} ${esc(t.name)}</button>`).join("") || `<span class="sub">All templates added.</span>`}</div></details>`;
}
const dietFields = [
  { k:"name", label:"Name", req:true, ph:"e.g. Dad's low-sodium" },
  { k:"emoji", label:"Icon", half:true, def:"🍽️", list:["🍽️","🥗","🌱","🥕","🐟","🥩","🥑","❤️","🌾","🥜","🥛","🫒","💪","🍎","🧂"] },
  { k:"maxCarbs", label:"Max carbs / serving (g)", type:"number", half:true },
  { k:"maxKcal", label:"Max kcal / serving", type:"number", half:true }, { k:"proteinMin", label:"Protein goal / day (g)", type:"number", half:true },
  { k:"avoid", label:"Avoids", type:"checks", opts:CONTAINS },
  { k:"avoidFoods", label:"Other foods to avoid", ph:"mushrooms, cilantro, grapefruit", help:"Comma separated. Recipes that mention them get flagged." },
  { k:"prefer", label:"Good foods to keep around", type:"textarea", rows:3, ph:"Salmon, lentils, spinach…", help:"Comma separated. They show up as quick-add chips in Shopping." },
  { k:"desc", label:"Description", ph:"What this style is about" }
];
function editDiet(id){
  const cur = id ? diet(id) : null;
  const vals = cur ? { ...cur, prefer: Array.isArray(cur.prefer) ? cur.prefer.join(", ") : cur.prefer } : {};
  openForm({ title: cur ? "Edit diet style" : "New diet style", fields: dietFields, values: vals,
    onSave: v => { if (cur) Store.update("diets", id, v); else Store.add("diets", v); },
    onDelete: cur ? () => { Store.remove("diets", id); members().forEach(m => (m.diets||[]).includes(id) && Store.update("members", m.id, { diets: m.diets.filter(x=>x!==id) })); } : null });
}

/* ---------- Chores ---------- */
let choreFilter = "todo";
function choreState(c){ if (c.done) return "done"; if (!c.next) return "later"; const n = diffDays(c.next, today()); return n<0 ? "overdue" : n===0 ? "today" : n<=7 ? "soon" : "later"; }
function choreLi(c){
  const st = choreState(c), cls = { overdue:"bad", today:"ok", soon:"warn" }[st] || "";
  const txt = st==="done" ? "done" : st==="overdue" ? `${-diffDays(c.next,today())} d overdue` : c.next ? relDay(c.next) : "";
  return `<li class="${c.done?"done":""}"><button class="check ${c.done?"on":""}" data-act="chore-done" data-id="${esc(c.id)}" aria-label="Done: ${esc(c.title)}"></button>
    <div class="grow" data-act="chore-edit" data-id="${esc(c.id)}" style="cursor:pointer"><div class="name">${esc(c.title)}</div><div class="meta">${[Number(c.every)?`every ${plural(Number(c.every),"day")}`:"one time", c.who?whoName(c.who):"anyone"].map(esc).join(" · ")}</div></div>
    ${txt?`<span class="pill ${cls}">${esc(txt)}</span>`:""}</li>`;
}
function vChores(){
  const me = meId();
  let all = L("chores").sort((a,b)=> (a.done-b.done) || String(a.next||"9").localeCompare(String(b.next||"9")));
  if (choreFilter==="todo") all = all.filter(c=>!c.done);
  if (choreFilter==="mine") all = all.filter(c=>!c.done && (!c.who || c.who===me));
  return `<section class="view">
    <div class="row" style="justify-content:space-between"><div class="seg"><button data-act="chore-f" data-v="todo" aria-pressed="${choreFilter==="todo"}">To do</button>${me?`<button data-act="chore-f" data-v="mine" aria-pressed="${choreFilter==="mine"}">Mine</button>`:""}<button data-act="chore-f" data-v="all" aria-pressed="${choreFilter==="all"}">All</button></div>
    <button class="btn primary" data-act="chore-add">+ Chore</button></div>
    <div class="card">${all.length ? `<ul class="list">${all.map(choreLi).join("")}</ul>` : `<p class="empty">No chores here. Add the jobs that keep your home running, like “Water the plants every 3 days”.</p>`}</div>
  </section>`;
}
const choreFields = () => [
  { k:"title", label:"Chore", req:true },
  { k:"every", label:"Repeat every (days)", type:"number", half:true, help:"Leave empty for one time." }, { k:"next", label:"Next due", type:"date", half:true, def:today() },
  { k:"who", label:"Whose turn", type:"select", opts:memberOpts("Anyone") },
  { k:"rotate", label:"Rotation", type:"toggle", text:"Rotate between everyone after each time" }
];
function choreDone(id){
  const c = Store.get("chores", id); if (!c) return;
  if (c.done) { Store.update("chores", id, { done:false }); return; }
  if (Number(c.every)) {
    let who = c.who;
    if (c.rotate && members().length) { const ms = members(); const i = ms.findIndex(m=>m.id===c.who); who = ms[(i+1) % ms.length].id; }
    Store.update("chores", id, { next: addDays(today(), Number(c.every)), last: today(), who });
    toast(`Done. Next ${relDay(addDays(today(), Number(c.every)))}${who && who!==c.who ? `, ${member(who)?.name}'s turn` : ""}.`);
  } else Store.update("chores", id, { done:true, last: today() });
}

/* ---------- Me (private health) ---------- */
let meDate = null;
function targetKcal(p){ if (!p.age || !p.weight || !p.height) return null; const bmr = 10*p.weight + 6.25*p.height - 5*p.age + (p.sex==="m"?5:p.sex==="f"?-161:-78); return Math.round(bmr*Number(p.activity||1.375) + Number(p.goalAdj||0)); }
function vMe(){
  const p = myProfile(), m = p.memberId && member(p.memberId);
  meDate = meDate || today();
  const logId = Store.pid("log_"+meDate), log = Store.get("logs", logId) || { date:meDate, extras:[], exercise:[], ate:{} };
  const planned = SLOTS.map(([s,n]) => { const pl = Store.get("plan", `${meDate}_${s}`); if (!pl || (p.memberId && pl.eaters && !pl.eaters.includes(p.memberId))) return null; const r = pl.recipeId && Store.get("recipes", pl.recipeId); return { s, n, pl, r }; }).filter(Boolean);
  const eaten = planned.filter(x => log.ate?.[x.s]).reduce((t,x)=> t + (x.r?.kcal ? Number(x.r.kcal) : 0), 0) + (log.extras||[]).reduce((t,e)=>t+Number(e.kcal||0),0);
  const burned = (log.exercise||[]).reduce((t,e)=>t+Number(e.kcal||0),0);
  const target = targetKcal(p);
  const left = target!=null ? target - eaten + burned : null;
  return `<section class="view">
    <div class="card row"><span class="avatar">${esc(m?.emoji||"🙂")}</span><div class="grow"><div class="name">${esc(m?.name || "Who are you?")}</div><div class="meta">${m ? dietPills(m.diets) : "Pick yourself so your meals and chores show here."}</div></div><button class="btn sm" data-act="me-edit">${m?"My details":"Choose"}</button></div>
    <p class="lock" style="margin:-6px 2px 0">🔒 Everything on this page is private. Other people in your household can't see it.</p>
    <div class="row" style="justify-content:space-between"><div class="row"><button class="btn sm" data-act="me-day" data-d="-1" aria-label="Previous day">‹</button><b>${esc(fmtDate(meDate))}</b><button class="btn sm" data-act="me-day" data-d="1" aria-label="Next day">›</button></div>${meDate!==today()?`<button class="btn ghost sm" data-act="me-day" data-d="0">Today</button>`:""}</div>
    <div class="stats">
      <div class="stat"><b>${target ?? "–"}</b><span>daily target kcal</span></div>
      <div class="stat"><b>${Math.round(eaten)}</b><span>eaten</span></div>
      <div class="stat"><b>${Math.round(burned)}</b><span>burned</span></div>
      <div class="stat"><b style="color:${left!=null && left<0?"var(--bad)":"inherit"}">${left!=null?Math.round(left):"–"}</b><span>${left!=null && left<0?"over":"left"}</span></div>
    </div>
    ${target==null ? `<div class="banner">Add your age, height and weight in “My details” to get a daily calorie target.</div>` : ""}
    <div class="card"><h3>Meals</h3>${planned.length ? `<ul class="list">${planned.map(x => `<li><button class="check ${log.ate?.[x.s]?"on":""}" data-act="me-ate" data-s="${x.s}" aria-label="I ate ${esc(x.n)}"></button><div class="grow"><div class="meta">${esc(x.n)}</div><div class="name">${esc(x.r?.title || x.pl.text || "")}</div></div><span class="meta">${x.r?.kcal!=null?`${x.r.kcal} kcal`:""}</span></li>`).join("")}</ul>` : `<p class="empty">No meals planned for you this day.</p>`}</div>
    <div class="card"><div class="row" style="justify-content:space-between"><h3>Other food</h3><button class="btn sm" data-act="me-extra">+ Food</button></div>
      ${(log.extras||[]).length ? `<ul class="list">${log.extras.map((e,i)=>`<li><div class="grow name">${esc(e.name)}</div><span class="meta">${fmtNum(e.kcal)} kcal</span><button class="del" data-act="me-rm" data-k="extras" data-i="${i}" aria-label="Remove">✕</button></li>`).join("")}</ul>` : `<p class="empty">Snacks, drinks, eating out…</p>`}</div>
    <div class="card"><div class="row" style="justify-content:space-between"><h3>Exercise</h3><button class="btn sm" data-act="me-ex">+ Exercise</button></div>
      ${(log.exercise||[]).length ? `<ul class="list">${log.exercise.map((e,i)=>`<li><div class="grow"><div class="name">${esc(e.name)}</div><div class="meta">${e.min} min</div></div><span class="meta">${Math.round(e.kcal)} kcal</span><button class="del" data-act="me-rm" data-k="exercise" data-i="${i}" aria-label="Remove">✕</button></li>`).join("")}</ul>` : `<p class="empty">No exercise logged.</p>`}</div>
    <div class="card"><div class="row" style="justify-content:space-between"><h3>Weight</h3><button class="btn sm" data-act="me-weight">Log weight</button></div>${weightHistory()}</div>
  </section>`;
}
function weightHistory(){
  const ws = L("logs").filter(l => l.weight!=null).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6);
  return ws.length ? `<ul class="list">${ws.map(w=>`<li><span class="grow">${esc(shortDate(w.date))}</span><b>${fmtNum(w.weight)} kg</b></li>`).join("")}</ul>` : `<p class="empty">Nothing logged yet.</p>`;
}
function updLog(fn){ const id = Store.pid("log_"+meDate); const cur = Store.get("logs", id) || { date:meDate, extras:[], exercise:[], ate:{} }; Store.put("logs", id, fn({ ...cur, extras:[...(cur.extras||[])], exercise:[...(cur.exercise||[])], ate:{ ...(cur.ate||{}) } })); }

/* ---------- Budget ---------- */
let budMonth = null;
function vBudget(){
  budMonth = budMonth || today().slice(0,7);
  const cats = L("budget").sort((a,b)=>String(a.name).localeCompare(b.name));
  const ex = L("expenses").filter(e => String(e.date||"").slice(0,7) === budMonth).sort((a,b)=>b.date.localeCompare(a.date));
  const spent = id => ex.filter(e=>e.cat===id).reduce((t,e)=>t+Number(e.amount||0),0);
  const totalLimit = cats.reduce((t,c)=>t+Number(c.limit||0),0), totalSpent = ex.reduce((t,e)=>t+Number(e.amount||0),0);
  const [y, m] = budMonth.split("-").map(Number);
  const bar = (s, l) => { const pct = l ? Math.min(100, Math.round(s/l*100)) : 0; const col = !l ? "var(--line)" : s>l ? "var(--bad)" : pct>=80 ? "var(--warn)" : "var(--accent)"; return `<div class="bar"><i style="width:${l?pct:0}%;background:${col}"></i></div>`; };
  return `<section class="view">
    <div class="row" style="justify-content:space-between"><div class="row"><button class="btn sm" data-act="bud-m" data-d="-1" aria-label="Previous month">‹</button><b>${MONTHS[m-1]} ${y}</b><button class="btn sm" data-act="bud-m" data-d="1" aria-label="Next month">›</button></div><button class="btn primary" data-act="exp-add">+ Expense</button></div>
    <div class="card"><div class="row" style="justify-content:space-between"><h3>This month</h3><b>${money(totalSpent)}${totalLimit?` of ${money(totalLimit)}`:""}</b></div>${totalLimit?bar(totalSpent,totalLimit):""}</div>
    <div class="card"><div class="row" style="justify-content:space-between"><h3>Categories</h3><button class="btn sm" data-act="bud-add">+ Category</button></div>
      ${cats.length ? `<ul class="list">${cats.map(c => `<li style="flex-direction:column;align-items:stretch;gap:6px;cursor:pointer" data-act="bud-edit" data-id="${esc(c.id)}"><div class="row" style="justify-content:space-between"><span class="name">${esc(c.name)}</span><span class="meta">${money(spent(c.id))}${c.limit!=null?` / ${money(c.limit)}`:""}</span></div>${c.limit!=null?bar(spent(c.id), Number(c.limit)):""}</li>`).join("")}</ul>` : `<p class="empty">Add categories like Groceries, Rent or Kids, with a monthly limit.</p>`}</div>
    <div class="card"><h3>Expenses</h3>${ex.length ? `<ul class="list">${ex.map(e => `<li data-act="exp-edit" data-id="${esc(e.id)}" style="cursor:pointer"><div class="grow"><div class="name">${esc(e.note || Store.get("budget", e.cat)?.name || "Expense")}</div><div class="meta">${[shortDate(e.date), Store.get("budget", e.cat)?.name, e.who?whoName(e.who):""].filter(Boolean).map(esc).join(" · ")}</div></div><b>${money(e.amount)}</b></li>`).join("")}</ul>` : `<p class="empty">No expenses this month.</p>`}</div>
  </section>`;
}
const expFields = () => [
  { k:"amount", label:"Amount", type:"number", req:true, half:true }, { k:"date", label:"Date", type:"date", def:today(), half:true },
  { k:"cat", label:"Category", type:"select", opts:[["","None"], ...L("budget").map(c=>[c.id,c.name])], half:true }, { k:"who", label:"Paid by", type:"select", opts:memberOpts("—"), half:true },
  { k:"note", label:"What for", ph:"Supermarket, electricity…" }
];

/* ---------- Settings ---------- */
function vSettings(){
  const s = settings(), sy = Store.db.sync;
  const st = { local:"Only on this device", syncing:"Syncing…", ok:"Synced", offline:"Offline. Changes will sync when you're back online.", signedout:"Signed out. Sign in again to sync.", error:"Sync problem: "+Store.lastError }[Store.status] || Store.status;
  return `<section class="view">
    <div class="card" style="display:flex;flex-direction:column;gap:10px"><div class="row" style="justify-content:space-between"><h3>Household</h3><button class="btn sm" data-act="set-home">Edit</button></div>
      <div><div class="name" style="font-size:17px">${esc(s.name||"")}</div><div class="meta">${esc(s.currency||"")} · ${esc(s.tz||deviceTZ())} · plans ${(s.slots||["b","l","d"]).map(slotName).join(", ").toLowerCase()}</div></div></div>
    <div class="card"><div class="row" style="justify-content:space-between"><h3>Members</h3><button class="btn sm" data-act="mem-add">+ Member</button></div>
      <ul class="list">${members().map(m => `<li data-act="mem-edit" data-id="${esc(m.id)}" style="cursor:pointer"><span class="avatar">${esc(m.emoji||"🙂")}</span><div class="grow"><div class="name">${esc(m.name)} ${m.id===meId()?`<span class="pill ok">you</span>`:""}</div><div class="meta">${dietPills(m.diets) || "No diet style"}${m.allergies?` · allergies: ${esc(m.allergies)}`:""}</div></div></li>`).join("") || `<li class="empty">No members yet.</li>`}</ul></div>
    <div class="card row" style="justify-content:space-between"><div><h3>Diet styles</h3><div class="meta">${plural(diets().length,"style")}</div></div><button class="btn sm" data-act="to-diets">Manage</button></div>
    <div class="card" style="display:flex;flex-direction:column;gap:10px"><h3>Sync and privacy</h3>
      <div><b>${esc(st)}</b>${sy.session?`<div class="meta">Signed in as ${esc(sy.session.user?.email||"")}${sy.hhName?` · household “${esc(sy.hhName)}”`:""}</div>`:""}</div>
      ${Store.cloudOn() ? `<div class="row"><span class="sub">Invite code:</span><b style="font-size:18px;letter-spacing:.1em">${esc(sy.code||"")}</b><button class="btn sm" data-act="sync-copy">Copy invite</button></div>
        <p class="sub" style="margin:0">Each person signs in with their own account. Shared lists sync to everyone in the household. Your Me page, body stats and private events stay visible only to you, enforced by the server.</p>
        <div class="row"><button class="btn sm" data-act="sync-now">Sync now</button><button class="btn sm danger" data-act="sync-out">Sign out</button></div>`
      : `<p class="sub" style="margin:0">Right now everything is saved only on this device. Turn on sync to share the household with family on their own phones. Each person gets their own private sign-in.</p>
        <button class="btn sm primary" data-act="sync-setup" style="align-self:flex-start">Turn on sync</button>`}
    </div>
    <div class="card" style="display:flex;flex-direction:column;gap:10px"><h3>Backup</h3>
      <div class="row"><button class="btn sm" data-act="exp-json">Download backup</button><label class="btn sm" style="cursor:pointer">Restore backup<input type="file" accept="application/json,.json" id="impFile" hidden></label></div>
      <button class="btn sm danger" data-act="wipe" style="align-self:flex-start">Erase everything on this device</button>
    </div>
    <p class="sub" style="text-align:center">Nestwise 1.0</p>
  </section>`;
}
const memFields = () => [
  { k:"name", label:"Name", req:true, half:true },
  { k:"emoji", label:"Icon", type:"select", opts:EMOJIS.map(e=>[e,e]), half:true },
  { k:"diets", label:"Diet styles", type:"checks", opts:diets().map(d=>[d.id, `${d.emoji||""} ${d.name}`]), none:"Create diet styles in Meals > Diet styles." },
  { k:"allergies", label:"Allergies or dislikes", ph:"shellfish, cilantro", help:"Comma separated. Recipes that mention them get flagged." }
];
function syncSetupForm(){
  const sy = Store.db.sync;
  if (!Store.configured()) return openForm({ title:"Connect a sync server", intro:"Nestwise syncs through a free Supabase project that you own. Paste its Project URL and publishable key (Supabase > Project settings > API Keys).",
    fields:[{ k:"url", label:"Project URL", req:true, ph:"https://xxxx.supabase.co" }, { k:"key", label:"Publishable key", req:true }],
    onSave: v => { Store.setServer(v.url, v.key); syncSetupForm(); }, saveLabel:"Next" });
  if (!sy.session) return openForm({ title:"Sign in", intro:"Use your own email. Every person in the household has their own account.",
    fields:[{ k:"email", label:"Email", type:"email", req:true }, { k:"password", label:"Password (at least 6 characters)", type:"password", req:true }, { k:"mode", label:"", type:"select", opts:[["in","I have an account"],["up","Create my account"]] }],
    onSave: async v => { try { if (v.mode==="up") { const r = await Store.signUp(v.email, v.password); if (r==="confirm") { toast("Check your email to confirm, then sign in."); return; } } else await Store.signIn(v.email, v.password); render(); syncSetupForm(); } catch(e){ toast(e.message); } }, saveLabel:"Continue" });
  return chooseHousehold();
}
async function chooseHousehold(){
  let hhs = [];
  try { hhs = await Store.myHouseholds(); } catch(e) { toast(e.message); return; }
  const has = members().length > 0;
  openForm({ title:"Your household", intro: has ? "Upload this device's household so others can join, or join one that exists." : "Join your family's household with their invite code, or start a new one.",
    fields:[{ k:"pick", label:"Choose", type:"select", opts:[...hhs.map(h=>["use:"+h.id, `Use “${h.name}”`]), ...(has?[["new","Upload this household to the cloud"]]:[["new","Start a new household"]]), ["join","Join with an invite code"]] },
      { k:"code", label:"Invite code (only for joining)", ph:"8 letters" }],
    onSave: async v => {
      try {
        if (v.pick==="join") { const h = await Store.joinHousehold(v.code); await Store.useHousehold(h, false); toast(`Joined ${h.name}.`); }
        else if (v.pick==="new") { const h = await Store.createHousehold(settings().name || "Our home"); await Store.useHousehold(h, true); toast("Household uploaded. Share the invite code with your family."); }
        else { const h = hhs.find(x => "use:"+x.id===v.pick); await Store.useHousehold(h, false); }
        if (!meId()) { tab = "me"; }
        render();
      } catch(e) { toast(e.message); }
    }, saveLabel:"Continue" });
}

/* ---------- render ---------- */
function render(){
  const app = $("#app"), ready = !!Store.get("settings","home");
  $("#tabs").hidden = $("#top").hidden = !ready;
  if (!ready) { app.innerHTML = vSetup(); return; }
  const s = settings();
  $("#hhName").textContent = s.name || "Nestwise";
  document.title = (s.name ? s.name + " · " : "") + "Nestwise";
  $("#todayTxt").textContent = fmtDate(today());
  $("#tabs").innerHTML = TABS.map(([k,n]) => `<button data-go="${k}" ${k===tab?'aria-current="page"':""}>${svg(k)}<span>${n}</span></button>`).join("");
  const note = $("#note");
  if (Store.status==="signedout" || Store.status==="error") { note.textContent = Store.status==="signedout" ? "You're signed out. Open Settings to sign in again and sync." : "Sync problem: " + Store.lastError; note.hidden = false; } else note.hidden = true;
  const keepFocus = document.activeElement?.id;
  const sel = keepFocus && document.activeElement.selectionStart;
  app.innerHTML = ({ today:vToday, shopping:vShopping, pantry:vPantry, meals:vMeals, chores:vChores, me:vMe, budget:vBudget, settings:vSettings }[tab] || vToday)();
  if (keepFocus && $("#"+keepFocus) && ["pantryQ","recQ"].includes(keepFocus)) { const el = $("#"+keepFocus); el.focus(); try { el.setSelectionRange(sel, sel); } catch {} }
}

/* ---------- events ---------- */
const ACT = {
  "s-add": () => { readSetup(); setup.people.push({ name:"", emoji:EMOJIS[setup.people.length % EMOJIS.length] }); render(); setTimeout(()=>[...document.querySelectorAll("[data-s-person]")].pop()?.focus(), 20); },
  "s-rm": el => { readSetup(); setup.people.splice(+el.dataset.i, 1); render(); },
  "s-next": () => { readSetup(); if (!setup.people.some(p=>p.name.trim())) { setup.err = "Add at least one person."; render(); return; } setup.err=""; setup.step = 2; render(); },
  "s-back": () => { readSetup(); setup.step = 1; render(); },
  "s-finish": () => { readSetup(); finishSetup(); },
  "s-join": () => syncSetupForm(),
  "del": el => { const b = el; if (b.classList.contains("sure")) Store.remove(el.dataset.c, el.dataset.id); else { b.classList.add("sure"); b.dataset.icon = b.innerHTML; b.textContent = "Delete?"; setTimeout(()=>{ if (b.isConnected && b.classList.contains("sure")) { b.classList.remove("sure"); b.innerHTML = b.dataset.icon; } }, 3000); } },
  "ev-add": () => editEvent(null),
  "ev-edit": el => editEvent(el.dataset.id, !!el.dataset.priv),
  "shop-f": el => { shopFilter = el.dataset.v; render(); },
  "shop-tick": el => { const i = Store.get("shopping", el.dataset.id); Store.update("shopping", i.id, { done: !i.done });
    if (!i.done) { const p = L("pantry").find(x => sameName(x.name, i.name)); if (p) Store.update("pantry", p.id, { qty: fmtNum(Number(p.qty||0) + (i.unit===p.unit && i.qty!=null ? Number(i.qty) : 1)) }); } },
  "shop-edit": el => { const i = Store.get("shopping", el.dataset.id); openForm({ title:"Edit item", fields:shopFields, values:i, onSave:v=>Store.update("shopping", i.id, v), onDelete:()=>Store.remove("shopping", i.id) }); },
  "shop-clear": () => L("shopping").filter(i=>i.done).forEach(i => Store.remove("shopping", i.id)),
  "shop-share": () => shareText(shoppingText(), "List copied. Paste it in a message."),
  "chip": el => { const n = el.dataset.n; const cur = L("shopping").find(s=>!s.done && sameName(s.name,n)); if (cur) Store.remove("shopping", cur.id); else Store.add("shopping", { name:n, cat:guessCat(n), done:false }); },
  "pan-add": () => openForm({ title:"Add to pantry", fields:panFields, onSave:v=>Store.add("pantry", { ...v, cat: v.cat || guessCat(v.name) }) }),
  "pan-edit": el => { const p = Store.get("pantry", el.dataset.id); openForm({ title:"Edit pantry item", fields:panFields, values:p, onSave:v=>Store.update("pantry", p.id, v), onDelete:()=>Store.remove("pantry", p.id) }); },
  "pan-step": el => { const p = Store.get("pantry", el.dataset.id); const step = ["g","ml"].includes(p.unit) ? 100 : 1; Store.update("pantry", p.id, { qty: Math.max(0, fmtNum(Number(p.qty||0) + step*Number(el.dataset.d))) }); },
  "pan-low": () => { const items = L("pantry").filter(isLow).map(p => ({ name:p.name, qty: p.min!=null ? Math.max(1, Number(p.min) - Number(p.qty||0) + 1) : null, unit:p.unit })); let n = 0;
    items.forEach(i => { if (!L("shopping").some(s=>!s.done && sameName(s.name,i.name))) { Store.add("shopping", { ...i, cat:guessCat(i.name), done:false }); n++; } }); toast(n ? `Added ${plural(n,"item")} to Shopping.` : "They're already on the list."); },
  "meal-v": el => { mealView = el.dataset.v; render(); },
  "wk": el => { const d = +el.dataset.d; weekStart = d ? addDays(weekStart, d) : mondayOf(today()); render(); },
  "wk-shop": () => weekToShopping(),
  "plan": el => planSlot(el.dataset.date, el.dataset.slot),
  "rec-add": () => editRecipe(null),
  "rec-edit": el => editRecipe(el.dataset.id),
  "rec-shop": el => { const r = Store.get("recipes", el.dataset.id); const n = addToShopping(ingList(r)); toast(n ? `Added ${plural(n,"item")} to Shopping.` : "You have everything already."); },
  "diet-add": () => editDiet(null),
  "diet-edit": el => editDiet(el.dataset.id),
  "diet-tpl": el => { const { key, ...d } = DIET_TEMPLATES.find(t=>t.key===el.dataset.k); Store.add("diets", { ...d, prefer: (d.prefer||[]).join(", ") }); toast(`Added ${d.name}.`); },
  "to-diets": () => { mealView = "diets"; go("meals"); },
  "chore-f": el => { choreFilter = el.dataset.v; render(); },
  "chore-add": () => openForm({ title:"New chore", fields:choreFields(), onSave:v=>Store.add("chores", { ...v, done:false }) }),
  "chore-edit": el => { const c = Store.get("chores", el.dataset.id); openForm({ title:"Edit chore", fields:choreFields(), values:c, onSave:v=>Store.update("chores", c.id, v), onDelete:()=>Store.remove("chores", c.id) }); },
  "chore-done": el => choreDone(el.dataset.id),
  "me-edit": () => { const p = myProfile(); openForm({ title:"My details", intro:"🔒 Only you can see these.", values:p, fields:[
      { k:"memberId", label:"I am", type:"select", opts:[["","Choose…"], ...members().map(m=>[m.id, `${m.emoji||""} ${m.name}`])] },
      { k:"sex", label:"Sex (for calorie math)", type:"select", opts:[["","Prefer not to say"],["f","Female"],["m","Male"]], half:true }, { k:"age", label:"Age", type:"number", half:true },
      { k:"height", label:"Height (cm)", type:"number", half:true }, { k:"weight", label:"Weight (kg)", type:"number", half:true },
      { k:"activity", label:"Activity", type:"select", opts:ACT_LEVELS, def:"1.375" },
      { k:"goalAdj", label:"Goal", type:"select", opts:[["0","Keep my weight"],["-300","Lose slowly (−300 kcal)"],["-500","Lose (−500 kcal)"],["300","Gain (+300 kcal)"]] }
    ], onSave:v => Store.put("profile", Store.pid("profile"), { ...p, ...v }) }); },
  "me-day": el => { const d = +el.dataset.d; meDate = d ? addDays(meDate, d) : today(); render(); },
  "me-ate": el => updLog(l => { l.ate[el.dataset.s] = !l.ate[el.dataset.s]; return l; }),
  "me-extra": () => openForm({ title:"Add food", fields:[{ k:"name", label:"What", req:true }, { k:"kcal", label:"kcal", type:"number", req:true }], onSave:v => updLog(l => { l.extras.push(v); return l; }) }),
  "me-ex": () => openForm({ title:"Add exercise", fields:[{ k:"name", label:"Activity", type:"select", opts:ACTIVITIES.map(a=>[a[0],a[0]]) }, { k:"min", label:"Minutes", type:"number", req:true, def:30 }],
    onSave:v => { const met = (ACTIVITIES.find(a=>a[0]===v.name)||[0,4])[1]; const w = Number(myProfile().weight) || 70; updLog(l => { l.exercise.push({ ...v, kcal: met * w * (Number(v.min)||0) / 60 }); return l; }); } }),
  "me-rm": el => updLog(l => { l[el.dataset.k].splice(+el.dataset.i, 1); return l; }),
  "me-weight": () => openForm({ title:"Log weight", fields:[{ k:"weight", label:"Weight (kg)", type:"number", req:true, def:myProfile().weight }], onSave:v => { updLog(l => ({ ...l, weight:v.weight })); Store.put("profile", Store.pid("profile"), { ...myProfile(), weight:v.weight }); } }),
  "bud-m": el => { const [y,m] = budMonth.split("-").map(Number); const d = new Date(y, m-1+Number(el.dataset.d), 1); budMonth = `${d.getFullYear()}-${pad(d.getMonth()+1)}`; render(); },
  "bud-add": () => openForm({ title:"New category", fields:[{ k:"name", label:"Name", req:true }, { k:"limit", label:"Monthly limit", type:"number" }], onSave:v=>Store.add("budget", v) }),
  "bud-edit": el => { const c = Store.get("budget", el.dataset.id); openForm({ title:"Edit category", fields:[{ k:"name", label:"Name", req:true }, { k:"limit", label:"Monthly limit", type:"number" }], values:c, onSave:v=>Store.update("budget", c.id, v), onDelete:()=>Store.remove("budget", c.id) }); },
  "exp-add": () => openForm({ title:"New expense", fields:expFields(), values:{ who: meId()||"", date: budMonth===today().slice(0,7) ? today() : budMonth+"-01" }, onSave:v=>Store.add("expenses", v) }),
  "exp-edit": el => { const e = Store.get("expenses", el.dataset.id); openForm({ title:"Edit expense", fields:expFields(), values:e, onSave:v=>Store.update("expenses", e.id, v), onDelete:()=>Store.remove("expenses", e.id) }); },
  "set-home": () => { const s = settings(); openForm({ title:"Household", values:{ ...s, slots: s.slots || ["b","l","d"] }, fields:[
      { k:"name", label:"Name", req:true }, { k:"currency", label:"Currency", type:"select", opts:CURRENCIES.map(c=>[c,c]), half:true }, { k:"tz", label:"Time zone", half:true, def:deviceTZ() },
      { k:"slots", label:"Meals you plan", type:"checks", opts:SLOTS } ],
    onSave:v => Store.put("settings","home", { ...s, ...v, slots: v.slots.length ? SLOTS.map(x=>x[0]).filter(k=>v.slots.includes(k)) : ["d"] }) }); },
  "mem-add": () => openForm({ title:"New member", fields:memFields(), values:{ emoji:EMOJIS[members().length % EMOJIS.length] }, onSave:v=>Store.add("members", { ...v, order: members().length }) }),
  "mem-edit": el => { const m = member(el.dataset.id); openForm({ title:`Edit ${m.name}`, fields:memFields(), values:m, onSave:v=>Store.update("members", m.id, v), onDelete:()=>Store.remove("members", m.id) }); },
  "sync-setup": () => syncSetupForm(),
  "sync-now": async () => { await Store.push(); await Store.pull(); toast(Store.status==="ok" ? "Up to date." : Store.lastError || "Couldn't sync."); },
  "sync-copy": async () => { shareText(`Join our household “${Store.db.sync.hhName}” on Nestwise. Invite code: ${Store.db.sync.code}`, "Invite copied."); },
  "sync-out": el => confirmTap(el, () => { Store.signOut(); toast("Signed out. This device's copy was cleared."); }),
  "exp-json": () => { if (window.NestwiseAndroid) { shareText(JSON.stringify(Store.exportAll())); toast("Save the backup to Drive or Files from the share sheet."); return; } const blob = new Blob([JSON.stringify(Store.exportAll(), null, 1)], { type:"application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `nestwise-backup-${today()}.json`; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 2000); },
  "wipe": el => confirmTap(el, () => { Store.wipeLocal(); setup.step = 1; tab = "today"; render(); })
};
document.addEventListener("click", ev => {
  const g = ev.target.closest("[data-go]"); if (g) { go(g.dataset.go); return; }
  const a = ev.target.closest("[data-act]"); if (!a || !ACT[a.dataset.act]) return;
  if (a.tagName === "LI" && ev.target.closest("button")) return;
  ev.preventDefault(); ACT[a.dataset.act](a);
});
document.addEventListener("submit", ev => {
  if (ev.target.id !== "quickShop") return;
  ev.preventDefault(); const q = ev.target.q.value.trim(); if (!q) return;
  const p = parseIng(q); Store.add("shopping", { name:p.name, qty:p.qty, unit:p.qty!=null?p.unit:"", cat:guessCat(p.name), done:false });
  render(); setTimeout(()=>$("#quickShop input")?.focus(), 10);
});
document.addEventListener("input", ev => {
  if (ev.target.id === "pantryQ") { pantryQ = ev.target.value; render(); }
  if (ev.target.id === "recQ") { recQ = ev.target.value; render(); }
});
document.addEventListener("change", async ev => {
  if (ev.target.id === "recFor") { recFor = ev.target.value; render(); }
  if (ev.target.id === "recSlot") { recSlot = ev.target.value; render(); }
  if (ev.target.id === "impFile") { const f = ev.target.files[0]; if (!f) return; try { Store.importAll(JSON.parse(await f.text())); toast("Backup restored."); } catch(e) { toast(e.message || "That file couldn't be read."); } }
});

/* ---------- start ---------- */
Store.load();
Store.onChange(render);
render();
if (Store.cloudOn()) { Store.push(); Store.pull(); Store.startLoop(); }
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(()=>{});
