(function () {
  const U = window.U;
  const VERSION = '1.9.6';

  const THEME_COLORS = {
    '': { main: '#d4903b', bright: '#e6a54e' },
    gold: { main: '#d4903b', bright: '#e6a54e' },
    blue: { main: '#4f8fd4', bright: '#6aa7e8' },
    purple: { main: '#9b6fd4', bright: '#b388e8' },
    red: { main: '#d4695f', bright: '#e8837f' }
  };

  function applyTheme(id) {
    const t = THEME_COLORS[id] || null;
    const rs = document.documentElement.style;
    if (!t) { rs.removeProperty('--gold'); rs.removeProperty('--gold-bright'); return; }
    rs.setProperty('--gold', t.main);
    rs.setProperty('--gold-bright', t.bright);
  }

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
    { id: 'assets', label: 'Vermogen', icon: Icons.wallet },
    { id: 'more', label: 'Instellingen', icon: Icons.gear }
  ];

  const TITLES = {
    start: '',
    calendar: 'Kalender',
    assets: 'Totaal vermogen',
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
    const tc = await DB.getSetting('themeColor', '');
    state.settings.themeColor = tc || '';
    applyTheme(state.settings.themeColor);
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
    let fn = Views[state.route] || Views.start || Views.dashboard;
    if (typeof fn !== 'function') {
      repairIfNeeded();
      return;
    }
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
    const fab = document.getElementById('fab');
    if (fab) fab.classList.toggle('hidden', route === 'more');
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
    document.getElementById('fab').addEventListener('click', () => {
      if (state.route === 'assets') {
        if (window.AssetsAdd) window.AssetsAdd.open();
        return;
      }
      Projects.openForm(null);
    });
    document.getElementById('sidebar-add').addEventListener('click', () => {
      if (state.route === 'assets') {
        if (window.AssetsAdd) window.AssetsAdd.open();
        return;
      }
      Projects.openForm(null);
    });
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

  function repairIfNeeded() {
    const need = ['start', 'calendar', 'assets', 'more'];
    const missing = need.filter((k) => !(window.Views && typeof window.Views[k] === 'function'));
    if (missing.length === 0) {
      try { localStorage.removeItem('vhx_repairs'); } catch (e) {}
      return false;
    }
    let attempts = 0;
    try { attempts = Number(localStorage.getItem('vhx_repairs') || 0); } catch (e) {}
    const auto = attempts < 2;

    const ov = document.createElement('div');
    ov.className = 'upd-overlay';
    ov.innerHTML =
      '<div class="upd-card">' +
      '<h3 class="upd-title">Herstellen</h3>' +
      '<p class="upd-sub" id="rep-sub"></p>' +
      '<div class="upd-bar"><div class="upd-fill" id="rep-fill" style="width:' + (auto ? '4%' : '100%') + '"></div></div>' +
      '<div class="form-actions column" style="margin-top:16px">' +
      (auto ? '' : '<button type="button" class="btn btn-gold btn-block" id="rep-retry">Opnieuw proberen</button>') +
      '<button type="button" class="btn btn-ghost btn-block" id="rep-cancel">Annuleren \u2014 versie behouden</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(ov);

    const fill = U.qs('#rep-fill', ov);
    const sub = U.qs('#rep-sub', ov);
    let timer = null;

    async function doWipe() {
      if (fill) fill.style.width = '100%';
      if (sub) sub.textContent = 'Herladen\u2026';
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((k) => k.indexOf('vhxmedia') === 0)
            .map((k) => caches.delete(k))
        );
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      } catch (e) {}
      try { localStorage.setItem('vhx_repairs', String(attempts + 1)); } catch (e) {}
      setTimeout(() => location.replace('./?repair=' + Date.now()), 400);
    }

    function cancel() {
      if (timer) clearInterval(timer);
      ov.remove();
      toast(auto ? 'Herstel geannuleerd \u2014 versie behouden' : 'Doorgaan met huidige versie', 'info');
    }

    U.qs('#rep-cancel', ov).addEventListener('click', cancel);
    const retryBtn = U.qs('#rep-retry', ov);
    if (retryBtn) retryBtn.addEventListener('click', () => { ov.remove(); doWipe(); });

    if (auto) {
      let p = 4;
      sub.textContent = 'Een onderdeel kon niet laden \u2014 herstel loopt\u2026';
      timer = setInterval(() => {
        p += 3;
        fill.style.width = Math.min(96, p) + '%';
        sub.textContent = p < 40 ? 'Caches controleren\u2026' : p < 78 ? 'Caches wissen\u2026' : 'Bijna klaar \u2014 herladen\u2026';
        if (p >= 96) {
          clearInterval(timer);
          doWipe();
        }
      }, 90);
    } else {
      sub.textContent = 'Automatisch herstellen lukte niet. Probeer opnieuw of ga verder met deze versie.';
    }

    return false;
  }

  async function boot() {
    repairIfNeeded();
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
    scheduleDayPrompt();
  }

  function scheduleDayPrompt(attempt) {
    const n = attempt || 0;
    setTimeout(async () => {
      if (!Auth.isLocked()) dayPrompt();
      else if (n < 3) scheduleDayPrompt(n + 1);
    }, n === 0 ? 1600 : 8000);
  }

  async function dayPrompt() {
    const today = U.todayISO();
    const done = (await DB.getSetting('dayPrompt', null)) || { ymd: '', ids: [] };
    const doneIds = done.ymd === today ? done.ids : [];
    const list = state.data.projects
      .filter((p) => p.date === today && !p.concept && p.status !== 'idea' && p.status !== 'paid' && doneIds.indexOf(p.id) === -1)
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    if (!list.length) return;

    const sh = Sheet.open({ title: 'Vandaag aan de beurt', persistent: true });
    function rowHTML(p) {
      const st = U.statusInfo(U.PROJECT_STATUS, p.status);
      return (
        '<button type="button" class="up-row card" data-dayproj="' + U.esc(p.id) + '">' +
        '<span class="row-main"><span class="row-title">' + U.esc(p.name) + '</span>' +
        '<span class="row-sub">' +
        U.esc(
          [
            p.time || '',
            p.client || '',
            Number(p.income) > 0 ? U.fmtMoney(p.income) : ''
          ].filter(Boolean).join(' \u00B7 ') || 'Nog geen details'
        ) +
        '</span></span>' +
        '<span class="row-side"><span class="pill" style="--pc:' + st.color + '">' + U.esc(st.label) + '</span>' +
        Icons.chevronRight +
        '</span></button>'
      );
    }

    async function markAll(ids) {
      await DB.setSetting('dayPrompt', { ymd: today, ids: ids });
    }

    if (list.length === 1) {
      const p0 = list[0];
      sh.body.innerHTML =
        '<div class="stack-list">' + rowHTML(p0) + '</div>' +
        '<div class="form-actions"><button type="button" class="btn btn-gold btn-block" data-dayedit>Info vervolledigen</button>' +
        '<button type="button" class="btn btn-ghost btn-block" data-daylater style="margin-top:10px">Later</button></div>';
    } else {
      sh.body.innerHTML =
        '<p class="sheet-sub">Er staan vandaag meerdere opdrachten gepland. Tik erop om de info aan te vullen.</p>' +
        '<div class="stack-list">' + list.map(rowHTML).join('') + '</div>' +
        '<div class="form-actions"><button type="button" class="btn btn-ghost btn-block" data-daylater>Later</button></div>';
    }

    async function openEdit(id) {
      const rec = list.find((p) => p.id === id);
      await markAll(doneIds.concat([id]));
      sh.close();
      Projects.openForm(rec || null);
    }

    U.qsa('[data-dayproj]', sh.body).forEach((b) =>
      b.addEventListener('click', () => openEdit(b.getAttribute('data-dayproj')))
    );
    const dEd = U.qs('[data-dayedit]', sh.body);
    if (dEd) dEd.addEventListener('click', () => openEdit(list[0].id));

    U.qs('[data-daylater]', sh.body).addEventListener('click', async () => {
      await markAll(doneIds.concat(list.map((p) => p.id)));
      sh.close();
    });
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
