/* IndexedDB : kv (réglages, listes en cache) + queue (saisies en attente) */
const DB = (() => {
  const open = () => new Promise((ok, ko) => {
    const r = indexedDB.open('pepiniere', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('queue', { keyPath: 'id' }); };
    r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
  });
  const tx = async (st, mode, fn) => {
    const d = await open();
    return new Promise((ok, ko) => {
      const t = d.transaction(st, mode), rq = fn(t.objectStore(st));
      t.oncomplete = () => ok(rq && rq.result); t.onerror = () => ko(t.error);
    });
  };
  return {
    get: k => tx('kv', 'readonly', s => s.get(k)),
    set: (k, v) => tx('kv', 'readwrite', s => s.put(v, k)),
    all: () => tx('queue', 'readonly', s => s.getAll()),
    put: o => tx('queue', 'readwrite', s => s.put(o)),
    del: id => tx('queue', 'readwrite', s => s.delete(id))
  };
})();
