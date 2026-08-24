(function () {
  const U = window.U;
  const VERSION = '1.0.0';

  const state = {
    route: 'dashboard',
    data: { projects: [], clients: [], otherIncome: [], expenses: [], events: [] },
    settings: { goal: 0, userName: 'Liam', autoLock: 5, onboarded: false },
    dashPeriod: 'month',
    financePeriod: { kind: 'month' },
    projFilter: { q: '', status: 'all', sort: 'new' },
    calCursor: null,
    calSelected: null,
    started: false
  };

  const NAV = [
    { id: 'dashboard', label: 'Start', icon: Icons.home },
    { id: 'finance', label: 'Financi\u00EBn', icon: Icons.chart },
    { id: 'projects', label: 'Opdrachten', icon: Icons.film },
    { id: 'calendar', label: 'Kalender', icon: Icons.calendar },
    { id: 'more', label: 'Meer', icon: Icons.dots }
  ];

  const TITLES = {
    dashboard: '',
    finance: 'Financi\u00EBn',
    projects: 'Opdrachten',
    calendar: 'Kalender',
    more: 'Meer',
    clients: 'Klanten',
    income: 'Overige inkomsten',
    expenses: 'Uitgaven',
    settings: 'Instellingen'
  };

  function parentRoute(id) {
    return ['clients', 'income', 'expenses', 'settings'].indexOf(id) !== -1 ? 'more' : id;
  }

  async function reloadStore(store) {
    state.data[store] = await DB.getAll(store);
  }

  async function reloadAll() {
    await Promise.all(['projects', 'clients', 'otherIncome', 'expenses', 'events'].map(reloadStore));
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

  function clientName(id) {
    if (!id) return 'Geen klant';
    const c = state.data.clients.find((x) => x.id === id);
    return c ? c.name : 'Geen klant';
  }

  function renderCurrent() {
    const view = document.getElementById('view');
    const fn = Views[state.route] || Views.dashboard;
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
    const pr = parentRoute(route);
    document.querySelectorAll('#bottomnav .bn-item').forEach((el) => {
      const active = el.getAttribute('data-route') === pr;
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
    const brand = document.querySelector('.topbar-brand');
    const t = TITLES[route] || '';
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
    const secItems = [
      ['clients', Icons.users, 'Klanten'],
      ['income', Icons.euro, 'Overige inkomsten'],
      ['expenses', Icons.wallet, 'Uitgaven'],
      ['settings', Icons.gear, 'Instellingen']
    ];
    side.innerHTML =
      NAV.map((n) =>
        '<button type="button" class="bn-item side" data-route="' + n.id + '">' +
        '<span class="bn-icon">' + n.icon + '</span><span class="bn-label">' + n.label + '</span></button>'
      ).join('') +
      '<div class="side-sep">Beheer</div>' +
      secItems.map(([id, icon, lb]) =>
        '<button type="button" class="bn-item side sub" data-route="' + id + '">' +
        '<span class="bn-icon">' + icon + '</span><span class="bn-label">' + lb + '</span></button>'
      ).join('');
    side.addEventListener('click', (e) => {
      const b = e.target.closest('[data-route]');
      if (b) go(b.getAttribute('data-route'));
    });
  }

  function openQuickAdd() {
    const sh = Sheet.open({ title: 'Snel toevoegen' });
    sh.body.innerHTML =
      '<div class="qa-grid">' +
      qaItem('project', Icons.film, 'Nieuwe opdracht') +
      qaItem('event', Icons.calendar, 'Nieuwe afspraak') +
      qaItem('income', Icons.euro, 'Andere inkomst') +
      qaItem('expense', Icons.wallet, 'Nieuwe uitgave') +
      qaItem('client', Icons.users, 'Nieuwe klant') +
      '</div>';
    function qaItem(kind, icon, label) {
      return '<button type="button" class="qa-item" data-qa="' + kind + '">' +
        '<span class="qa-icon">' + icon + '</span><span>' + label + '</span></button>';
    }
    sh.body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-qa]');
      if (!b) return;
      const kind = b.getAttribute('data-qa');
      sh.close();
      setTimeout(() => {
        if (kind === 'project') Projects.openForm(null);
        else if (kind === 'event') CalendarMod.openEventForm(null);
        else if (kind === 'income') Entries.openForm('otherIncome', null);
        else if (kind === 'expense') Entries.openForm('expenses', null);
        else if (kind === 'client') Clients.openForm(null);
      }, 120);
    });
  }

  function openSearch() {
    const rootEl = document.getElementById('search-root');
    rootEl.innerHTML = '';
    const ov = U.el('div', 'search-overlay');
    ov.innerHTML =
      '<div class="search-panel">' +
      '<div class="search-box big">' + Icons.search +
      '<input type="search" id="global-q" placeholder="Zoek opdrachten, klanten, bedragen\u2026" aria-label="Zoeken">' +
      '<button type="button" class="icon-btn" id="search-close" aria-label="Sluiten">' + Icons.x + '</button>' +
      '</div>' +
      '<div class="search-results" id="search-results"></div>' +
      '</div>';
    rootEl.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('show'));

    const input = U.qs('#global-q', ov);
    const results = U.qs('#search-results', ov);

    function closeSearch() {
      ov.classList.remove('show');
      setTimeout(() => { rootEl.innerHTML = ''; }, 220);
      document.removeEventListener('keydown', escH, true);
    }
    function escH(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSearch(); }
    }
    document.addEventListener('keydown', escH, true);
    ov.addEventListener('pointerdown', (e) => { if (e.target === ov) closeSearch(); });
    U.qs('#search-close', ov).addEventListener('click', closeSearch);

    function group(title, rows) {
      if (!rows.length) return '';
      return '<div class="sr-group"><h4>' + title + '</h4>' + rows.join('') + '</div>';
    }

    function run(qRaw) {
      const q = qRaw.trim().toLowerCase();
      if (!q) {
        results.innerHTML = '<p class="sr-hint">Zoek in al je opdrachten, klanten, inkomsten, uitgaven en afspraken.</p>';
        return;
      }
      const S = state.data;
      const has = (s) => (s || '').toLowerCase().indexOf(q) !== -1;

      const projs = S.projects.filter((p) => has(p.name) || has(p.description) || has(p.notes)).slice(0, 4);
      const cls = S.clients.filter((c) => has(c.name) || has(c.company) || has(c.email)).slice(0, 4);
      const inc = S.otherIncome.filter((e) => has(e.description) || has(e.notes)).slice(0, 4);
      const exp = S.expenses.filter((e) => has(e.description) || has(e.notes)).slice(0, 4);
      const evs = S.events.filter((e) => has(e.title) || has(e.description)).slice(0, 4);

      let html = '';
      html += group('Opdrachten', projs.map((p) =>
        srRow('proj', p.id, Icons.film, p.name, App.clientName(p.clientId) + ' \u00B7 ' + U.fmtDate(p.date), U.fmtMoney(p.income))));
      html += group('Klanten', cls.map((c) =>
        srRow('client', c.id, Icons.users, c.name, c.company || '', '')));
      html += group('Overige inkomsten', inc.map((e) =>
        srRow('income', e.id, Icons.euro, e.description, U.fmtDate(e.date), '+' + U.fmtMoney(e.amount))));
      html += group('Uitgaven', exp.map((e) =>
        srRow('expense', e.id, Icons.wallet, e.description, U.fmtDate(e.date), '-' + U.fmtMoney(e.amount))));
      html += group('Agenda', evs.map((ev) =>
        srRow('event', ev.id, Icons.calendar, ev.title, U.fmtDate(ev.date) + (ev.startTime ? ' \u00B7 ' + ev.startTime : ''), '')));

      results.innerHTML = html ||
        '<div class="empty slim"><h3>Geen resultaten</h3><p>Er is niets gevonden voor \u201C' + U.esc(qRaw.trim()) + '\u201D.</p></div>';

      U.qsa('[data-sr]', results).forEach((b) =>
        b.addEventListener('click', () => {
          const [, kind, id] = b.getAttribute('data-sr').split(':');
          closeSearch();
          setTimeout(() => {
            if (kind === 'proj') Projects.openDetail(id);
            else if (kind === 'client') Clients.openDetail(id);
            else if (kind === 'event') {
              const ev = S.events.find((x) => x.id === id);
              if (ev) {
                state.calCursor = { y: Number(ev.date.slice(0, 4)), m: Number(ev.date.slice(5, 7)) - 1 };
                state.calSelected = ev.date;
                go('calendar');
                CalendarMod.openEventForm(ev);
              }
            } else if (kind === 'income') {
              const e2 = S.otherIncome.find((x) => x.id === id);
              go('income');
              if (e2) Entries.openForm('otherIncome', e2);
            } else if (kind === 'expense') {
              const e2 = S.expenses.find((x) => x.id === id);
              go('expenses');
              if (e2) Entries.openForm('expenses', e2);
            }
          }, 160);
        })
      );
    }

    function srRow(kind, id, icon, title, sub, amount) {
      return (
        '<button type="button" class="sr-row" data-sr="x:' + kind + ':' + U.esc(id) + '">' +
        '<span class="sr-icon">' + icon + '</span>' +
        '<span class="row-main"><span class="row-title">' + U.esc(title) + '</span>' +
        (sub ? '<span class="row-sub">' + U.esc(sub) + '</span>' : '') + '</span>' +
        (amount ? '<span class="row-money">' + U.esc(amount) + '</span>' : '') +
        '</button>'
      );
    }

    input.addEventListener('input', U.debounce(() => run(input.value), 140));
    run('');
    setTimeout(() => input.focus(), 80);
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
    document.getElementById('fab').addEventListener('click', openQuickAdd);
    document.getElementById('sidebar-add').addEventListener('click', openQuickAdd);
    document.getElementById('btn-search').addEventListener('click', openSearch);
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
    go('dashboard');

    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      try {
        navigator.serviceWorker.register('./service-worker.js').catch(() => {});
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
    clientName,
    lockNow() { Auth.showLock(); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
