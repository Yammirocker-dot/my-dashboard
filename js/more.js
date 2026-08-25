(function () {
  const U = window.U;

  function renderSettings(root) {
    const S = App.state;
    const autoLock = Number(S.settings.autoLock != null ? S.settings.autoLock : 5);
    const online = navigator.onLine;

    root.innerHTML =
      '<section class="settings fade-in">' +
      '<header class="view-head"><div><h2 class="page-title">Instellingen</h2>' +
      '<p class="page-sub">Doel, beveiliging en gegevens</p></div></header>' +

      '<h3 class="section-title">Financieel</h3>' +
      '<div class="card set-group">' +
      setRowBtn(Icons.target, 'Jaardoel VHXmedia', S.settings.goal ? U.fmtMoney(S.settings.goal) : 'Niet ingesteld', 'edit-goal') +
      setRowBtn(Icons.user, 'Weergavenaam', U.esc(S.settings.userName || 'Liam'), 'edit-name') +
      '</div>' +

      '<h3 class="section-title">Beveiliging</h3>' +
      '<div class="card set-group">' +
      setRowBtn(Icons.lock, 'Wijzig PIN', '', 'change-pin') +
            setRowBtn(Icons.shieldCheck, 'Vergrendel app nu', '', 'lock-now') +
      '<div class="set-row static"><span class="set-icon">' + Icons.clock + '</span>' +
      '<span class="set-main">Automatische vergrendeling</span>' +
      '<select id="autolock-sel" aria-label="Automatische vergrendeling">' +
      [[0, 'Nooit'], [1, 'Na 1 min'], [5, 'Na 5 min'], [10, 'Na 10 min'], [30, 'Na 30 min']].map(([v, lb]) =>
        '<option value="' + v + '"' + (autoLock === v ? ' selected' : '') + '>' + lb + '</option>').join('') +
      '</select></div>' +
      '</div>' +

      '<h3 class="section-title">Herinneringen</h3>' +
      '<div class="card set-group">' +
      '<div class="set-row static"><span class="set-icon">' + Icons.clock + '</span>' +
      '<span class="set-main">Opkomende opdrachten<span class="set-sub">' + (App.state.settings.notify ? 'Aan \u2014 tot 2 dagen vooraf' : 'Uit') + '</span></span>' +
      '<button type="button" class="switch' + (App.state.settings.notify ? ' on' : '') + '" data-action="notify" role="switch" aria-checked="' + (App.state.settings.notify ? 'true' : 'false') + '" aria-label="Herinneringen aan of uit"><span class="knob"></span></button>' +
      '</div>' +
      '</div>' +

      '<h3 class="section-title">Gegevens</h3>' +
      '<div class="card set-group">' +
      setRowBtn(Icons.download, 'Exporteren', '.json back-up', 'export') +
      setRowBtn(Icons.upload, 'Importeren', 'back-up samenvoegen', 'import') +
      setRowBtn(Icons.alert, 'Alle gegevens wissen', 'definitief', 'reset') +
      '</div>' +

      '<h3 class="section-title">App</h3>' +
      '<div class="card set-group">' +
      '<div class="set-row static"><span class="set-icon">' + Icons.folder + '</span><span class="set-main">Versie</span><span class="set-value">' + App.VERSION + '</span></div>' +
      '<button type="button" class="set-row" data-action="check-updates"><span class="set-icon">' + Icons.download + '</span><span class="set-main">Check voor updates<span class="set-sub">Haalt de nieuwste versie op</span></span></button>' +
      '<div class="set-row static"><span class="set-icon">' + Icons.wifiOff + '</span><span class="set-main">Verbinding</span><span class="set-value" id="conn-state">' + (online ? 'Online' : 'Offline \u2014 werkt lokaal') + '</span></div>' +
      '</div>' +
      '<p class="privacy-note">' + Icons.shieldCheck + ' Al jouw gegevens blijven op dit toestel. Er wordt niets verzonden.</p>' +
      '</section>';

    bindSettings(root);
  }

  function setRowBtn(icon, label, value, action) {
    return (
      '<button type="button" class="set-row' + (action === 'reset' ? ' danger' : '') + '" data-action="' + action + '">' +
      '<span class="set-icon">' + icon + '</span>' +
      '<span class="set-main">' + label + (value ? '<span class="set-sub">' + value + '</span>' : '') + '</span>' +
      (action !== 'lock-now' ? Icons.chevronRight : '') +
      '</button>'
    );
  }

  let connBound = false;
  function ensureConnListener() {
    if (connBound) return;
    connBound = true;
    const upd = () => {
      const el = document.getElementById('conn-state');
      if (el) el.textContent = navigator.onLine ? 'Online' : 'Offline \u2014 werkt lokaal';
    };
    window.addEventListener('online', upd);
    window.addEventListener('offline', upd);
  }

  async function checkForUpdates(btn) {
    if (!('serviceWorker' in navigator)) { toast('Updates worden niet ondersteund', 'error'); return; }
    const sub = btn.querySelector('.set-sub');
    const oldSub = sub ? sub.textContent : '';
    btn.disabled = true;
    if (sub) sub.textContent = 'Controleren\u2026';
    let found = null;
    try {
      const reg = window.__swReg || await navigator.serviceWorker.getRegistration();
      if (!reg) {
        toast('Je hebt de nieuwste versie');
        btn.disabled = false;
        if (sub) sub.textContent = oldSub;
        return;
      }
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing || reg.waiting;
        if (nw) found = nw;
      });
      await reg.update();
      await new Promise((resolve) => {
        let waited = 0;
        const timer = setInterval(() => {
          waited += 300;
          if (found || reg.waiting || waited >= 6000) {
            clearInterval(timer);
            resolve();
          }
        }, 300);
      });

      btn.disabled = false;
      if (sub) sub.textContent = oldSub;

      if (!found && !reg.waiting) {
        toast('Geen nieuwe versie gevonden \u2014 probeer over enkele minuten opnieuw', 'info');
        return;
      }

      const ok = await Auth.verifyPinFlow();
      if (!ok) {
        toast('Geannuleerd \u2014 update niet uitgevoerd');
        return;
      }
      await runUpdater(oldSub);
    } catch (e) {
      btn.disabled = false;
      if (sub) sub.textContent = oldSub;
      toast(navigator.onLine ? 'Kon niet controleren' : 'Offline \u2014 geen verbinding', 'error');
    }
  }

  async function fetchLiveAppVersion() {
    try {
      const res = await fetch('./js/app.js?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return null;
      const txt = await res.text();
      const m = txt.match(/const\s+VERSION\s*=\s*'([^']+)'/);
      return m ? m[1] : null;
    } catch (e) {
      return null;
    }
  }

  async function runUpdater(oldSub) {
    const from = App.VERSION;
    let cancelled = false;
    let target = null;

    const ov = document.createElement('div');
    ov.className = 'upd-overlay';
    ov.innerHTML =
      '<div class="upd-card">' +
      '<h3 class="upd-title">Ophalen van update</h3>' +
      '<p class="upd-sub" id="upd-sub">Verbinden\u2026</p>' +
      '<div class="upd-bar"><div class="upd-fill" id="upd-fill"></div></div>' +
      '<button type="button" class="btn btn-ghost btn-block" id="upd-cancel" style="margin-top:16px">Annuleren</button>' +
      '</div>';
    document.body.appendChild(ov);
    const subEl = U.qs('#upd-sub', ov);
    const fillEl = U.qs('#upd-fill', ov);
    U.qs('#upd-cancel', ov).addEventListener('click', () => { cancelled = true; });

    const MAX = 60;
    let attempt = 0;
    let done = false;

    while (!cancelled && !done && attempt < MAX) {
      attempt++;
      const ver = await fetchLiveAppVersion();
      if (ver && ver !== from) {
        target = ver;
        done = true;
        break;
      }
      subEl.textContent = 'Poging ' + attempt + ' van ' + MAX + (target ? ' \u00B7 versie ' + target : '');
      fillEl.style.width = Math.min(96, Math.round((attempt / MAX) * 100)) + '%';
      await new Promise((r) => setTimeout(r, 2500));
    }

    if (cancelled) {
      ov.remove();
      toast('Update geannuleerd', 'info');
      return;
    }

    if (!done) {
      ov.remove();
      toast('Server nog niet bijgewerkt \u2014 probeer over enkele minuten opnieuw', 'info');
      return;
    }

    subEl.textContent = 'Versie ' + target + ' binnengehaald \u2014 installeren\u2026';
    fillEl.style.width = '100%';
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.indexOf('vhxmedia') === 0)
          .map((k) => caches.delete(k))
      );
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    } catch (e3) {}
    subEl.textContent = 'Nieuwe bestanden ophalen\u2026';
    const FILES = [
      './index.html',
      './style.css',
      './manifest.json',
      './icons/icon-192.png',
      './icons/icon-512.png',
      './icons/icon-maskable-512.png',
      './icons/apple-touch-icon.png',
      './js/icons.js',
      './js/db.js',
      './js/utils.js',
      './js/stats.js',
      './js/charts.js',
      './js/auth.js',
      './js/projects.js',
      './js/dashboard.js',
      './js/calendar.js',
      './js/assets.js',
      './js/more.js',
      './js/app.js'
    ];
    await Promise.all(
      FILES.map((f) =>
        fetch(f, { cache: 'reload' }).catch(() => null)
      )
    );
    setTimeout(() => location.replace('./?force=' + Date.now()), 600);
  }

  function bindSettings(root) {
    const alSel = U.qs('#autolock-sel', root);
    alSel.addEventListener('change', async () => {
      const v = Number(alSel.value);
      App.state.settings.autoLock = v;
      try { await DB.setSetting('autoLock', v); } catch (e) {}
      toast('Automatische vergrendeling aangepast');
    });


    U.qsa('[data-action]', root).forEach((b) =>
      b.addEventListener('click', () => {
        const a = b.getAttribute('data-action');
        if (a === 'edit-goal') openGoalEditor(null);
        else if (a === 'edit-name') openNameEditor();
        else if (a === 'change-pin') Auth.changePinFlow();
        else if (a === 'lock-now') App.lockNow();
        else if (a === 'export') exportData();
        else if (a === 'import') pickImportFile();
        else if (a === 'notify') toggleNotify();
        else if (a === 'reset') resetFlow();
        else if (a === 'check-updates') checkForUpdates(b);
      })
    );

    ensureConnListener();
  }


  function openGoalEditor(after) {
    const sh = Sheet.open({ title: 'Jaardoel VHXmedia', small: true });
    sh.body.innerHTML =
      '<form class="form" novalidate>' +
      Forms.fieldRow({
        name: 'goal', label: 'Jaarlijks doel (\u20AC)', type: 'number', step: '0.01', min: 0,
        placeholder: 'bijv. 30000',
        value: App.state.settings.goal ? String(App.state.settings.goal) : ''
      }) +
      '<p class="sheet-hint">Wordt vergeleken met je inkomsten van ' + new Date().getFullYear() + '.</p>' +
      '<div class="form-actions"><button type="submit" class="btn btn-gold btn-block">Doel opslaan</button></div>' +
      '</form>';
    const form = U.qs('form', sh.body);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      Forms.clearErrors(form);
      const res = Forms.readForm(form, [{ name: 'goal', label: 'Doel', type: 'number', min: 0 }]);
      if (!res.ok) return;
      App.state.settings.goal = res.values.goal || 0;
      try { await DB.setSetting('goal', App.state.settings.goal); } catch (err) {}
      sh.close();
      toast('Jaardoel opgeslagen');
      if (after) after(); else App.refresh();
    });
  }

  function openNameEditor() {
    const sh = Sheet.open({ title: 'Weergavenaam', small: true });
    sh.body.innerHTML =
      '<form class="form" novalidate>' +
      Forms.fieldRow({ name: 'userName', label: 'Jouw naam', type: 'text', value: App.state.settings.userName || 'Liam' }) +
      '<div class="form-actions"><button type="submit" class="btn btn-gold btn-block">Opslaan</button></div>' +
      '</form>';
    U.qs('form', sh.body).addEventListener('submit', async (e) => {
      e.preventDefault();
      const inp = e.target.elements.userName;
      const v = (inp.value || '').trim() || 'Liam';
      App.state.settings.userName = v;
      try { await DB.setSetting('userName', v); } catch (err) {}
      sh.close();
      toast('Naam opgeslagen');
      App.refresh();
    });
  }

  function notifySupported() {
    return typeof window.Notification !== 'undefined' && navigator.serviceWorker;
  }

  async function toggleNotify() {
    if (!notifySupported()) {
      toast('Meldingen werken alleen als de app op je beginscherm staat', 'error');
      return;
    }
    if ((await DB.getSetting('notify', null)) === 'on') {
      await DB.setSetting('notify', 'off');
      App.state.settings.notify = false;
      toast('Herinneringen uitgeschakeld');
      App.refresh();
      return;
    }
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      toast('Sta meldingen eerst toe in je toestelinstellingen', 'error');
      return;
    }
    await DB.setSetting('notify', 'on');
    App.state.settings.notify = true;
    toast('Aan \u2014 je krijgt tot 2 dagen voor elke opdracht een seintje');
    App.refresh();
  }

  async function checkUpcoming() {
    try {
      if (!notifySupported()) return;
      if (Notification.permission !== 'granted') return;
      if ((await DB.getSetting('notify', null)) !== 'on') return;
      const projects = (App.state.data && App.state.data.projects) || [];
      const today = U.parseISO(U.todayISO());
      const ymd = U.todayISO();
      let store = {};
      try { store = JSON.parse(localStorage.getItem('vhx_notified') || '{}'); } catch (e) {}
      const done = Array.isArray(store[ymd]) ? store[ymd] : [];
      let changed = false;

      let reg = null;
      try { reg = await navigator.serviceWorker.getRegistration(); } catch (e) {}
      function fire(title, body, tag) {
        if (reg && reg.showNotification) reg.showNotification(title, { body, tag, icon: './icons/icon-192.png' });
        else new Notification(title, { body, tag });
      }

      for (const p of projects) {
        if (!p || !p.date) continue;
        if (p.status !== 'planned' && p.status !== 'filming') continue;
        const d = U.parseISO(p.date);
        if (!d) continue;
        const diff = Math.round((d - today) / 86400000);
        if (diff < 0 || diff > 2) continue;
        const key = p.id + '@' + p.date;
        if (done.indexOf(key) >= 0) continue;
        const wanneer = diff === 0 ? 'Vandaag' : diff === 1 ? 'Morgen' : 'Overmorgen';
        fire(
          wanneer + ' om 10u00: ' + p.name,
          (p.client ? 'Opdracht bij ' + p.client + '. ' : '') + 'Bereid alles voor: materiaal, batterijen, verplaatsing\u2026',
          key
        );
        done.push(key);
        changed = true;
      }
      if (changed) {
        store = {};
        store[ymd] = done;
        localStorage.setItem('vhx_notified', JSON.stringify(store));
      }
    } catch (e) {}
  }

  async function backupPayload() {
    const S = App.state;
    return {
      app: 'vhxmedia-dashboard',
      formatVersion: 3,
      exportedAt: new Date().toISOString(),
      projects: S.data.projects,
      banks: (await DB.getSetting('banks', [])) || [],
      accounts: (await DB.getSetting('accounts', [])) || [],
      stocks: (await DB.getSetting('stocks', [])) || [],
      settings: {
        goal: S.settings.goal || 0,
        userName: S.settings.userName || 'Liam',
        autoLock: S.settings.autoLock != null ? S.settings.autoLock : 5
      }
    };
  }

  async function exportData() {
    try {
      const json = JSON.stringify(await backupPayload(), null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vhxmedia-backup-' + U.todayISO() + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('Back-up gedownload');
    } catch (e) {
      toast('Exporteren mislukt', 'error');
    }
  }

  function pickImportFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      input.remove();
      if (f) importData(f);
    });
    document.body.appendChild(input);
    input.click();
  }

  function sanitizeBanks(list) {
    const out = [];
    for (const b of list) {
      if (!b || typeof b !== 'object' || !b.name) continue;
      out.push({
        id: typeof b.id === 'string' && b.id ? b.id : 'bank_' + U.uid(),
        name: String(b.name),
        createdAt: typeof b.createdAt === 'string' ? b.createdAt : new Date().toISOString()
      });
    }
    return out;
  }

  function sanitizeAccounts(list) {
    const out = [];
    for (const a of list) {
      if (!a || typeof a !== 'object') continue;
      const bal = Number(a.balance);
      if (!a.name || isNaN(bal)) continue;
      out.push({
        id: typeof a.id === 'string' && a.id ? a.id : 'acc_' + U.uid(),
        bankId: typeof a.bankId === 'string' ? a.bankId : '',
        name: String(a.name),
        balance: bal,
        createdAt: typeof a.createdAt === 'string' ? a.createdAt : new Date().toISOString()
      });
    }
    return out;
  }

  function sanitizeStocks(list) {
    const out = [];
    for (const s of list) {
      if (!s || typeof s !== 'object' || !s.name) continue;
      const lots = Array.isArray(s.lots) ? s.lots : [];
      const cleanLots = [];
      for (const l of lots) {
        if (!l || typeof l !== 'object') continue;
        const sh = Number(l.shares);
        let pr = Number(l.price);
        if (isNaN(pr) && sh > 0) pr = Number(l.cost) / sh;
        if (!(sh > 0) || !(pr >= 0)) continue;
        cleanLots.push({
          date: typeof l.date === 'string' ? l.date : '',
          shares: sh,
          price: pr,
          cost: Math.round(sh * pr * 100) / 100
        });
      }
      out.push({
        id: typeof s.id === 'string' && s.id ? s.id : 'stk_' + U.uid(),
        name: String(s.name),
        ticker: String(s.ticker || '').toUpperCase(),
        bankId: typeof s.bankId === 'string' ? s.bankId : '',
        currency: s.currency === 'USD' ? 'USD' : 'EUR',
        tracked: !!s.tracked,
        lots: cleanLots,
        createdAt: typeof s.createdAt === 'string' ? s.createdAt : new Date().toISOString()
      });
    }
    return out;
  }

  async function importData(file) {
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch (e) {
      toast('Ongeldig bestand: geen geldige JSON', 'error');
      return;
    }
    const projects = Array.isArray(parsed.projects) ? parsed.projects : null;
    if (!projects) {
      toast('Dit lijkt geen VHXmedia-back-up te zijn', 'error');
      return;
    }
    const banks = Array.isArray(parsed.banks) ? sanitizeBanks(parsed.banks) : [];
    const accounts = Array.isArray(parsed.accounts) ? sanitizeAccounts(parsed.accounts) : [];
    const stocks = Array.isArray(parsed.stocks) ? sanitizeStocks(parsed.stocks) : [];

    const delen = [projects.length + ' opdrachten'];
    if (banks.length) delen.push(banks.length + ' banken');
    if (accounts.length) delen.push(accounts.length + ' rekeningen');
    if (stocks.length) delen.push(stocks.length + ' aandelen');

    const ok = await confirmAction({
      title: 'Gegevens importeren',
      message: projects.length === 0 && !banks.length && !accounts.length && !stocks.length
        ? 'Dit back-upbestand bevat geen gegevens. Bestaande gegevens blijven ongewijzigd.'
        : 'Er worden toegevoegd of bijgewerkt: ' + delen.join(', ') + '. Bestaande gegevens blijven behouden.',
      confirmText: 'Importeren',
      danger: false
    });
    if (!ok) return;

    try {
      let count = 0;
      for (const raw of projects) {
        if (!raw || typeof raw !== 'object') continue;
        const rec = Object.assign({}, raw);
        if (!rec.id || typeof rec.id !== 'string') rec.id = U.uid();
        await DB.put('projects', rec);
        count++;
      }
      if (parsed.settings && typeof parsed.settings === 'object') {
        const s = parsed.settings;
        if (s.goal != null) { await DB.setSetting('goal', Math.max(0, Number(s.goal) || 0)); }
        if (s.userName) { await DB.setSetting('userName', String(s.userName)); }
        if (s.autoLock != null) { await DB.setSetting('autoLock', Number(s.autoLock) || 0); }
      }
      if (banks.length) await DB.setSetting('banks', banks);
      if (accounts.length) await DB.setSetting('accounts', accounts);
      if (stocks.length) await DB.setSetting('stocks', stocks);
      await App.reloadAll();
      App.refresh();
      toast(delen.join(', ') + ' ge\u00EFmporteerd');
    } catch (e) {
      toast('Importeren mislukt \u2014 beschadigd bestand?', 'error');
    }
  }

  function resetFlow() {
    const sh = Sheet.open({ title: 'Alle gegevens wissen', small: true, persistent: true });
    sh.body.innerHTML =
      '<p class="confirm-msg strong">Dit verwijdert <b>alle lokale VHXmedia-gegevens</b> van dit toestel.</p>' +
      '<p class="confirm-msg">Typ <b>VERWIJDEREN</b> om te bevestigen.</p>' +
      '<input type="text" id="reset-confirm-input" class="input" autocomplete="off" spellcheck="false" aria-label="Typ VERWIJDEREN">' +
      '<div class="form-actions column">' +
      '<button class="btn btn-danger btn-block" id="reset-go" disabled>Definitief alles wissen</button>' +
      '<button class="btn btn-ghost btn-block" id="reset-cancel">Annuleren</button>' +
      '</div>';

    const inp = U.qs('#reset-confirm-input', sh.body);
    const go = U.qs('#reset-go', sh.body);
    inp.addEventListener('input', () => { go.disabled = inp.value.trim() !== 'VERWIJDEREN'; });
    U.qs('#reset-cancel', sh.body).addEventListener('click', () => sh.close());
    go.addEventListener('click', async () => {
      go.disabled = true;
      try {
        for (const s of ['projects', 'clients', 'otherIncome', 'expenses', 'events', 'settings']) {
          await DB.clear(s);
        }
        await Auth.refreshConfigured();
        sh.close();
        location.reload();
      } catch (e) {
        toast('Wissen mislukt', 'error');
        go.disabled = false;
      }
    });
  }

  window.More = { openGoalEditor, openNameEditor, checkUpcoming };
  window.Views = window.Views || {};
  window.Views.more = renderSettings;
})();
