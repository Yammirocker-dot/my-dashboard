(function () {
  const NAME = 'vhxmedia';
  const VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB niet beschikbaar'));
        return;
      }
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('projects')) {
          const s = db.createObjectStore('projects', { keyPath: 'id' });
          s.createIndex('clientId', 'clientId');
          s.createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('clients')) {
          db.createObjectStore('clients', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('otherIncome')) {
          const s = db.createObjectStore('otherIncome', { keyPath: 'id' });
          s.createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('expenses')) {
          const s = db.createObjectStore('expenses', { keyPath: 'id' });
          s.createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('events')) {
          const s = db.createObjectStore('events', { keyPath: 'id' });
          s.createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Database kon niet worden geopend'));
      req.onblocked = () => reject(new Error('Database is geblokkeerd door een ander venster'));
    });
    return dbPromise;
  }

  function run(store, mode, action) {
    return open().then(
      (db) =>
        new Promise((resolve, reject) => {
          let result;
          let failed = false;
          let err;
          const t = db.transaction(store, mode);
          try {
            result = action(t.objectStore(store));
          } catch (e) {
            failed = true;
            err = e;
            try { t.abort(); } catch (_) {}
          }
          t.oncomplete = () => (failed ? reject(err) : resolve(result));
          t.onerror = () => { failed = true; err = t.error || new Error('Opslagfout'); };
          t.onabort = () => { failed = true; err = t.error || new Error('Opslagfout'); };
        })
    );
  }

  function readReq(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  window.DB = {
    open,
    getAll(store) {
      return run(store, 'readonly', (st) => readReq(st.getAll()));
    },
    get(store, key) {
      return run(store, 'readonly', (st) => readReq(st.get(key)));
    },
    put(store, value) {
      return run(store, 'readwrite', (st) => { st.put(value); });
    },
    delete(store, key) {
      return run(store, 'readwrite', (st) => { st.delete(key); });
    },
    clear(store) {
      return run(store, 'readwrite', (st) => { st.clear(); });
    },
    async getSetting(key, fallback) {
      try {
        const row = await this.get('settings', key);
        return row === undefined || row === null ? fallback : row.value;
      } catch (e) {
        return fallback;
      }
    },
    setSetting(key, value) {
      return this.put('settings', { key, value });
    }
  };
})();
