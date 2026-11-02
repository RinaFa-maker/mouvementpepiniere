const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const COL = { 'Entrée': 'var(--e)', 'Sortie': 'var(--s)', 'Transfert': 'var(--t)', 'Mortalité': 'var(--m)' };
const S = { cfg: { url: '', token: '' }, data: { especes: [], sites: [], responsables: [], stock: [], mouvements: [] },
  q: [], lib: 'Entrée', id: crypto.randomUUID(), busy: false };

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
  if (S.lib === 'Entrée' || !esp) { h.hidden = true; return; }
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
  const b = $('#sync'); b.textContent = n + ' en attente' + (e ? ` · ${e} erreur` : ''); b.classList.toggle('pend', n > 0 || e > 0); renderHisto(); }
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
  const pend = S.q.map(x => ({ ...x, ID_Mouvement: x.id, _p: x.status === 'error' ? 'refusée : ' + x.msg : 'en attente' }));
  const all = pend.concat(S.data.mouvements).filter(m => !q || JSON.stringify(m).toLowerCase().includes(q)).slice(0, 150);
  $('#histo').innerHTML = all.map(m => `<div class="card"><div class="row"><b>${esc(m.Date)} · ${esc(m.Espece)}</b>
    <span class="tag" style="--c:${COL[m.Libelle]}">${esc(m.Libelle)} ${esc(m.Quantite)}</span></div>
    <div class="muted">${esc(m.Site_Origine)}${m.Site_Destination ? ' → ' + esc(m.Site_Destination) : ''} · ${esc(m.Responsable)}${m.Observation ? ' · ' + esc(m.Observation) : ''}</div>
    ${m._p ? `<div class="low">${esc(m._p)}${m.status === 'error' ? ' <button type="button" data-del="' + esc(m.id) + '">Supprimer</button>' : ''}</div>` : ''}</div>`).join('')
    || '<p class="muted">Aucun mouvement.</p>';
}
function render() { renderForm(); renderStock(); renderHisto(); }
function net() { const o = navigator.onLine; const n = $('#net'); n.textContent = o ? 'En ligne' : 'Hors ligne'; n.classList.toggle('off', !o); }
function tab(t) { document.querySelectorAll('main > section').forEach(s => s.hidden = s.id !== 't-' + t);
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); }

/* ---------- Démarrage ---------- */
(async function init() {
  $('#date').value = localDate();
  S.cfg = (await DB.get('cfg')) || S.cfg; S.data = (await DB.get('data')) || S.data;
  $('#url').value = S.cfg.url; $('#token').value = S.cfg.token; $('#last').textContent = 'Dernière actualisation : ' + ((await DB.get('last')) || 'jamais');
  net(); await loadQ(); render();
  if (!S.cfg.url) tab('reglages');
  document.querySelectorAll('nav button').forEach(b => b.onclick = () => tab(b.dataset.t));
  document.querySelectorAll('#lib button').forEach(b => b.onclick = () => { S.lib = b.dataset.l; renderForm(); });
  $('#f').onsubmit = submit;
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
