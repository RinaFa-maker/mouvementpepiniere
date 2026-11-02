const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const COL = { 'Entrée': 'var(--e)', 'Sortie': 'var(--s)', 'Transfert': 'var(--t)', 'Mortalité': 'var(--m)' };
const S = { cfg: { url: '', token: '' }, data: { especes: [], sites: [], responsables: [], stock: [], mouvements: [], semis: [] },
  q: [], lib: 'Entrée', id: crypto.randomUUID(), sid: crypto.randomUUID(), busy: false };

const localDate = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const age = d => Math.floor((Date.now() - new Date(d + 'T00:00:00')) / 864e5);
const planches = () => S.data.sites.filter(s => s.Type === 'Planche').map(s => s.Nom);
const externes = () => S.data.sites.filter(s => s.Type === 'Externe' && s.Nom !== 'Extérieur').map(s => s.Nom);
const fill = (el, list, keep) => { const v = keep ?? el.value;
  el.innerHTML = list.map(x => `<option>${esc(x)}</option>`).join(''); if (list.includes(v)) el.value = v; };
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3200); }

/* ---------- Saisie ---------- */
function renderForm() {
  document.querySelectorAll('#lib button').forEach(b => b.classList.toggle('on', b.dataset.l === S.lib));
  const L = S.lib;
  $('#r-orig').hidden = L === 'Entrée';
  $('#r-dest').hidden = L === 'Mortalité';
  $('#l-dest').textContent = L === 'Sortie' ? 'Destination' : 'Planche de destination';
  fill($('#espece'), S.data.especes.map(e => e.Nom_commun));
  fill($('#orig'), planches());
  fill($('#dest'), L === 'Sortie' ? externes() : planches());
  fill($('#resp'), S.data.responsables.map(r => r.Nom));
  hint();
}
function lotsOf(esp) { return S.data.stock.filter(l => l.Espece === esp).sort((a, b) => a.Date_Entree.localeCompare(b.Date_Entree)); }
function hint(auto) {
  const h = $('#hint'), esp = $('#espece').value;
  if (S.lib === 'Entrée') { h.hidden = false; h.textContent = 'Entrée hors semis (achat, don…). Les semis se saisissent dans l\'onglet Semis.'; return; }
  if (!esp) { h.hidden = true; return; }
  const lots = lotsOf(esp);
  h.hidden = false;
  if (!lots.length) { h.textContent = 'Aucun stock connu pour cette espèce.'; return; }
  const o = lots[0];
  if (auto) $('#orig').value = o.Site;                 // propose la planche la plus ancienne
  const here = lots.filter(l => l.Site === $('#orig').value).reduce((s, l) => s + l.Quantite, 0);
  h.innerHTML = `Stock sur cette planche : <b>${here}</b><br>À sortir en premier : <b>${esc(o.Site)}</b> (${o.Quantite} plants, entrés le ${o.Date_Entree}, ${age(o.Date_Entree)} j)`;
}
async function submit(ev) {
  ev.preventDefault();
  const btn = $('#ok'); if (btn.disabled) return; btn.disabled = true;
  try {
    const L = S.lib, q = parseInt($('#qte').value, 10);
    if (!(q > 0)) return toast('Quantité invalide');
    if (L === 'Transfert' && $('#orig').value === $('#dest').value) return toast('Origine et destination identiques');
    const item = { id: S.id, Date: $('#date').value, Libelle: L, Espece: $('#espece').value, Quantite: q,
      Site_Origine: L === 'Entrée' ? 'Extérieur' : $('#orig').value,
      Site_Destination: L === 'Mortalité' ? '' : $('#dest').value,
      Responsable: $('#resp').value, Observation: $('#obs').value.trim(),
      Source: navigator.onLine ? 'en ligne' : 'hors ligne', Horodatage_Saisie: new Date().toISOString(), status: 'pending' };
    await DB.put(item);                                   // même ID => impossible de créer 2 fois la même saisie
    S.id = crypto.randomUUID();
    $('#qte').value = ''; $('#obs').value = '';
    await loadQ(); toast(navigator.onLine ? 'Enregistré' : 'Enregistré hors ligne');
    sync();
  } finally { btn.disabled = false; }
}

/* ---------- Synchronisation ---------- */
async function loadQ() { S.q = await DB.all(); const n = S.q.filter(x => x.status !== 'error').length, e = S.q.length - n;
  const b = $('#sync'); b.textContent = n + ' en attente' + (e ? ` · ${e} erreur` : ''); b.classList.toggle('pend', n > 0 || e > 0); renderHisto(); renderSemis(); }
async function sync() {
  if (S.busy || !navigator.onLine || !S.cfg.url) return;
  const items = S.q.filter(x => x.status !== 'error'); if (!items.length) return;
  S.busy = true;
  try {
    const r = await fetch(S.cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: S.cfg.token, action: 'add', items: items.map(({ status, msg, ...o }) => o) }) });
    const j = await r.json(); if (j.error) throw new Error(j.error);
    let bad = 0;
    for (const res of j.results) {
      if (res.status === 'ok' || res.status === 'duplicate') await DB.del(res.id);
      else { bad++; const it = S.q.find(x => x.id === res.id); it.status = 'error'; it.msg = res.msg; await DB.put(it); }
    }
    toast(bad ? bad + ' saisie(s) refusée(s) : voir Historique' : 'Synchronisé'); await refresh(true);
  } catch (e) { toast('Synchronisation impossible : ' + e.message); }
  finally { S.busy = false; await loadQ(); }
}
async function refresh(quiet) {
  if (!S.cfg.url || !navigator.onLine) return;
  try {
    const r = await fetch(`${S.cfg.url}?action=bootstrap&token=${encodeURIComponent(S.cfg.token)}`);
    const j = await r.json(); if (j.error) throw new Error(j.error);
    S.data = j; await DB.set('data', j); await DB.set('last', new Date().toLocaleString('fr-FR'));
    render(); if (!quiet) toast('Listes actualisées');
  } catch (e) { toast('Actualisation impossible : ' + e.message); }
}

/* ---------- Affichages ---------- */
function renderStock() {
  fill($('#fs'), [''].concat(S.data.especes.map(e => e.Nom_commun)));
  const f = $('#fs').value, lots = S.data.stock.filter(l => !f || l.Espece === f)
    .sort((a, b) => a.Date_Entree.localeCompare(b.Date_Entree));
  const tot = {}; S.data.stock.forEach(l => tot[l.Espece] = (tot[l.Espece] || 0) + l.Quantite);
  $('#totaux').innerHTML = S.data.especes.filter(e => !f || e.Nom_commun === f).map(e => {
    const n = tot[e.Nom_commun] || 0, low = e.Seuil_Alerte && n <= e.Seuil_Alerte;
    return `<div class="card row"><span>${esc(e.Nom_commun)}</span><span class="${low ? 'low' : ''}">${n}${low ? ' · stock bas' : ''}</span></div>`;
  }).join('');
  const seen = new Set();
  $('#lots').innerHTML = '<tr><th>Espèce</th><th>Planche</th><th>Plants</th><th>Entrée</th><th>Âge</th></tr>' +
    (lots.map(l => { const first = !seen.has(l.Espece); seen.add(l.Espece);
      return `<tr class="${first ? 'first' : ''}"><td>${esc(l.Espece)}</td><td>${esc(l.Site)}</td><td>${l.Quantite}</td><td>${l.Date_Entree}</td><td>${age(l.Date_Entree)} j</td></tr>`; }).join('')
      || '<tr><td colspan="5">Aucun stock. Enregistrez une entrée.</td></tr>');
}
function renderHisto() {
  const q = ($('#q')?.value || '').toLowerCase();
  const pend = S.q.map(x => ({ ...x, _p: x.status === 'error' ? 'refusée : ' + x.msg : 'en attente' }));
  const view = m => {
    if (m.kind === 'semis') return { t: 'Semis', c: 'var(--e)', n: m.Quantite, a: m.Espece, b: `${m.Planche} · ${m.Responsable}` };
    if (m.kind === 'levee') { const s = [...S.q, ...S.data.semis.map(x => ({ id: x.ID_Semis, Espece: x.Espece }))].find(x => x.id === m.semis_id);
      return { t: 'Levée', c: 'var(--e)', n: m.Quantite, a: s ? s.Espece : 'Semis', b: 'levée de semis' }; }
    return { t: m.Libelle, c: COL[m.Libelle], n: m.Quantite, a: m.Espece,
      b: `${m.Site_Origine}${m.Site_Destination ? ' → ' + m.Site_Destination : ''} · ${m.Responsable}${m.Observation ? ' · ' + m.Observation : ''}` };
  };
  const all = pend.concat(S.data.mouvements).filter(m => !q || JSON.stringify(m).toLowerCase().includes(q)).slice(0, 150);
  $('#histo').innerHTML = all.map(m => { const v = view(m);
    return `<div class="card"><div class="row"><b>${esc(m.Date)} · ${esc(v.a)}</b><span class="tag" style="--c:${v.c}">${esc(v.t)} ${esc(v.n)}</span></div>
    <div class="muted">${esc(v.b)}</div>
    ${m._p ? `<div class="low">${esc(m._p)}${m.status === 'error' ? ' <button type="button" data-del="' + esc(m.id) + '">Supprimer</button>' : ''}</div>` : ''}</div>`; }).join('')
    || '<p class="muted">Aucun mouvement.</p>';
}

/* ---------- Semis ---------- */
function renderSemis() {
  fill($('#sx-espece'), S.data.especes.map(e => e.Nom_commun));
  fill($('#sx-planche'), planches());
  fill($('#sx-resp'), S.data.responsables.map(r => r.Nom));
  const leveeFaite = new Set(S.q.filter(x => x.kind === 'levee' && x.status !== 'error').map(x => x.semis_id));
  const open = S.q.filter(x => x.kind === 'semis' && x.status !== 'error')
    .map(x => ({ id: x.id, Date_Semis: x.Date, Espece: x.Espece, Quantite_Semee: x.Quantite, Planche: x.Planche, _p: 1 }))
    .concat(S.data.semis.filter(s => s.Quantite_Levee === '').map(s => ({ ...s, id: s.ID_Semis })))
    .filter(s => !leveeFaite.has(s.id));
  $('#levees').innerHTML = open.map(s => `<div class="card"><div class="row"><b>${esc(s.Espece)} · ${esc(s.Quantite_Semee)} semés</b>
    <span class="muted">${esc(s.Date_Semis)} · ${age(s.Date_Semis)} j</span></div>
    <div class="muted">${esc(s.Planche)}${s._p ? ' · en attente d\'envoi' : ''}</div>
    <div class="row" style="margin-top:8px"><input type="number" min="0" inputmode="numeric" placeholder="Plants levés" data-q="${esc(s.id)}" style="margin:0">
    <button type="button" class="primary" style="width:auto;margin:0;padding:8px 16px" data-levee="${esc(s.id)}">Valider</button></div></div>`).join('')
    || '<p class="muted">Aucun semis en attente de levée.</p>';
  $('#semis-list').innerHTML = S.data.semis.slice(0, 30).map(s => `<div class="card"><div class="row"><b>${esc(s.Espece)}</b>
    <span class="tag" style="--c:var(--e)">${esc(s.Quantite_Semee)} semés · ${s.Quantite_Levee === '' ? 'levée en attente' : esc(s.Quantite_Levee) + ' levés'}</span></div>
    <div class="muted">${esc(s.Date_Semis)} · ${esc(s.Planche)}${s.Provenance_Semences ? ' · ' + esc(s.Provenance_Semences) : ''}</div></div>`).join('')
    || '<p class="muted">Aucun semis.</p>';
}
async function submitSemis(ev) {
  ev.preventDefault();
  const btn = $('#sx-ok'); if (btn.disabled) return; btn.disabled = true;
  try {
    const q = parseInt($('#sx-qte').value, 10);
    if (!(q > 0)) return toast('Quantité invalide');
    await DB.put({ id: S.sid, kind: 'semis', Date: $('#sx-date').value, Espece: $('#sx-espece').value,
      Provenance: $('#sx-prov').value.trim(), Quantite: q, Planche: $('#sx-planche').value, Responsable: $('#sx-resp').value,
      Observation: $('#sx-obs').value.trim(), Source: navigator.onLine ? 'en ligne' : 'hors ligne',
      Horodatage_Saisie: new Date().toISOString(), status: 'pending' });
    S.sid = crypto.randomUUID();
    $('#sx-qte').value = ''; $('#sx-obs').value = ''; $('#sx-prov').value = '';
    await loadQ(); toast(navigator.onLine ? 'Semis enregistré' : 'Semis enregistré hors ligne'); sync();
  } finally { btn.disabled = false; }
}
async function levee(e) {
  const id = e.target.dataset.levee; if (!id) return;
  const q = parseInt(document.querySelector(`[data-q="${CSS.escape(id)}"]`).value, 10);
  if (!(q >= 0)) return toast('Saisissez le nombre de plants levés');
  e.target.disabled = true;
  await DB.put({ id: crypto.randomUUID(), kind: 'levee', semis_id: id, Date: localDate(), Quantite: q,
    Source: navigator.onLine ? 'en ligne' : 'hors ligne', Horodatage_Saisie: new Date().toISOString(), status: 'pending' });
  await loadQ(); toast('Levée enregistrée'); sync();
}

function render() { renderForm(); renderSemis(); renderStock(); renderHisto(); }
function net() { const o = navigator.onLine; const n = $('#net'); n.textContent = o ? 'En ligne' : 'Hors ligne'; n.classList.toggle('off', !o); }
function tab(t) { document.querySelectorAll('main > section').forEach(s => s.hidden = s.id !== 't-' + t);
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); }

/* ---------- Démarrage ---------- */
(async function init() {
  $('#date').value = localDate(); $('#sx-date').value = localDate();
  S.cfg = (await DB.get('cfg')) || S.cfg; S.data = (await DB.get('data')) || S.data; S.data.semis = S.data.semis || [];
  $('#url').value = S.cfg.url; $('#token').value = S.cfg.token; $('#last').textContent = 'Dernière actualisation : ' + ((await DB.get('last')) || 'jamais');
  net(); await loadQ(); render();
  if (!S.cfg.url) tab('reglages');
  document.querySelectorAll('nav button').forEach(b => b.onclick = () => tab(b.dataset.t));
  document.querySelectorAll('#lib button').forEach(b => b.onclick = () => { S.lib = b.dataset.l; renderForm(); });
  $('#f').onsubmit = submit; $('#fx').onsubmit = submitSemis; $('#levees').onclick = levee;
  $('#espece').onchange = () => hint(true); $('#orig').onchange = () => hint(false);
  $('#fs').onchange = renderStock; $('#q').oninput = renderHisto;
  $('#sync').onclick = () => { S.q.filter(x => x.status === 'error').length && toast('Voir les erreurs dans Historique'); sync(); };
  $('#histo').onclick = async e => { const id = e.target.dataset.del; if (id) { await DB.del(id); loadQ(); } };
  $('#save').onclick = async () => { S.cfg = { url: $('#url').value.trim(), token: $('#token').value.trim() };
    await DB.set('cfg', S.cfg); await refresh(); tab('saisie'); sync(); };
  addEventListener('online', () => { net(); sync(); refresh(true); }); addEventListener('offline', net);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(r => { if ('sync' in r) addEventListener('online', () => r.sync.register('sync-mvts').catch(() => {})); });
    navigator.serviceWorker.addEventListener('message', e => e.data === 'sync' && sync());
  }
  refresh(true); sync();
})();
