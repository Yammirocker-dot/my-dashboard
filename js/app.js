(function () {
  const U = window.U;
  const VERSION = '1.4.5';

  const state = {
    route: 'start',
    data: { projects: [] },
    settings: { goal: 0, userName: 'Liam', autoLock: 5, onboarded: false },
    dashPeriod: 'year',
    calCursor: null,
    calSelected: null,
    calFilter: '',
    started: false
  };

  const NAV = [
    { id: 'start', label: 'Start', icon: Icons.home },
    { id: 'calendar', label: 'Kalender', icon: Icons.calendar },
    { id: 'more', label: 'Instellingen', icon: Icons.gear }
  ];

  const TITLES = {
    start: '',
    calendar: 'Kalender',
    more: 'Instellingen'
  };

  async function reloadStore(store) {
    state.data[store] = await DB.getAll(store);
  }

  async function reloadAll() {
    await reloadStore('projects');
  }

  async function loadSettings() {
    state.settings.goal = Number(await DB.getSetting('goal', 0)) || 0;
    state.settings.userName = (await DB.getSetting('userName', 'Liam')) || 'Liam';
    state.settings.autoLock = Number(await DB.getSetting('autoLock', 5));
    if (isNaN(state.settings.autoLock)) state.settings.autoLock = 5;
    state.settings.onboarded = !!(await DB.getSetting('onboarded', false));
  }

  async function upsertRecord(store, rec) {
    if (!rec.updatedAt) rec.updatedAt = new Date().toISOString();
    await DB.put(store, rec);
    await reloadStore(store);
    refresh();
  }

  async function patchRecord(store, id, patch, skipRefresh) {
    const list = state.data[store];
    const rec = list.find((r) => r.id === id);
    if (!rec) throw new Error('Record niet gevonden');
    Object.assign(rec, patch, { updatedAt: new Date().toISOString() });
    await DB.put(store, rec);
    await reloadStore(store);
    if (!skipRefresh) refresh();
  }

  async function removeRecord(store, id) {
    await DB.delete(store, id);
    await reloadStore(store);
    refresh();
  }

  function renderCurrent() {
    const view = document.getElementById('view');
    const fn = Views[state.route] || Views.start || Views.dashboard;
    fn(view);
    applyIcons(view);
  }

  function refresh() {
    const view = document.getElementById('view');
    const keep = view.scrollTop;
    renderCurrent();
    view.scrollTop = keep;
  }

  function go(route) {
    state.route = route;
    document.querySelectorAll('#bottomnav .bn-item').forEach((el) => {
      const active = el.getAttribute('data-route') === route;
      el.classList.toggle('active', active);
      if (active) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
    document.querySelectorAll('#side-nav .bn-item').forEach((el) => {
      const active = el.getAttribute('data-route') === route;
      el.classList.toggle('active', active);
      if (active) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
    const tb = document.getElementById('topbar-title');
    const brand = document.querySelector('.topbar-logo');
    const t = TITLES[route] != null ? TITLES[route] : '';
    if (t) {
      tb.textContent = t;
      tb.classList.remove('hidden');
      brand.classList.add('hidden');
    } else {
      tb.textContent = '';
      tb.classList.add('hidden');
      brand.classList.remove('hidden');
    }
    const view = document.getElementById('view');
    renderCurrent();
    view.scrollTop = 0;
  }

  function buildNav() {
    const bottom = document.getElementById('bottomnav');
    bottom.innerHTML = NAV.map((n) =>
      '<button type="button" class="bn-item" data-route="' + n.id + '" aria-label="' + n.label + '">' +
      '<span class="bn-icon">' + n.icon + '</span><span class="bn-label">' + n.label + '</span></button>'
    ).join('');
    bottom.addEventListener('click', (e) => {
      const b = e.target.closest('[data-route]');
      if (b) go(b.getAttribute('data-route'));
    });

    const side = document.getElementById('side-nav');
    side.innerHTML = NAV.map((n) =>
      '<button type="button" class="bn-item side" data-route="' + n.id + '">' +
      '<span class="bn-icon">' + n.icon + '</span><span class="bn-label">' + n.label + '</span></button>'
    ).join('');
    side.addEventListener('click', (e) => {
      const b = e.target.closest('[data-route]');
      if (b) go(b.getAttribute('data-route'));
    });
  }

  function updateOnlinePills() {
    const off = !navigator.onLine;
    ['offline-pill', 'offline-pill-desktop'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', !off);
    });
  }

  function showFatal(msg) {
    const s = document.getElementById('splash');
    if (s) s.classList.add('hidden');
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div class="fatal"><div class="fatal-card"><h2>Oeps</h2><p>' + U.esc(msg) + '</p><button class="btn btn-gold" onclick="location.reload()">Opnieuw proberen</button></div></div>'
    );
  }

  function hideSplash() {
    const s = document.getElementById('splash');
    if (!s) return;
    s.classList.add('done');
    setTimeout(() => s.classList.add('hidden'), 450);
  }

  function startApp() {
    if (state.started) return;
    state.started = true;
    document.getElementById('version-side').textContent = VERSION;
    buildNav();
    document.getElementById('fab').addEventListener('click', () => Projects.openForm(null));
    document.getElementById('sidebar-add').addEventListener('click', () => Projects.openForm(null));
    document.getElementById('btn-lock').addEventListener('click', () => Auth.showLock());
    window.addEventListener('online', updateOnlinePills);
    window.addEventListener('offline', updateOnlinePills);
    updateOnlinePills();

    Auth.initAutoLock(
      () => !Auth.isLocked(),
      () => Number(state.settings.autoLock)
    );

    const appEl = document.getElementById('app');
    appEl.classList.remove('hidden');
    appEl.setAttribute('aria-hidden', 'false');
    hideSplash();
    go(state.route);

    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      try {
        navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' })
          .then((reg) => { window.__swReg = reg; })
          .catch(() => {});
      } catch (e) {}
    }
  }

  async function boot() {
    applyIcons(document);
    try {
      await DB.open();
      await Promise.all([reloadAll(), loadSettings()]);
    } catch (err) {
      showFatal('De lokale database kon niet worden geopend. Herstart de app of probeer een andere browser.');
      return;
    }

    if (!state.settings.onboarded) {
      hideSplash();
      Auth.runOnboarding(async () => {
        await loadSettings();
        await Auth.refreshConfigured();
        startApp();
      });
      return;
    }

    startApp();
    if (await Auth.isConfigured()) {
      Auth.showLock();
    }
  }

  window.App = {
    state,
    VERSION,
    go,
    refresh,
    reloadAll,
    upsertRecord,
    patchRecord,
    removeRecord,
    lockNow() { Auth.showLock(); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
