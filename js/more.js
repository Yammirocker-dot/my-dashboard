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

      if (sub) sub.textContent = 'Force-update\u2026';
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
      location.replace('./?force=' + Date.now());
    } catch (e) {
      btn.disabled = false;
      if (sub) sub.textContent = oldSub;
      toast(navigator.onLine ? 'Kon niet controleren' : 'Offline \u2014 geen verbinding', 'error');
    }
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

  function backupPayload() {
    const S = App.state;
    return {
      app: 'vhxmedia-dashboard',
      formatVersion: 2,
      exportedAt: new Date().toISOString(),
      projects: S.data.projects,
      settings: {
        goal: S.settings.goal || 0,
        userName: S.settings.userName || 'Liam',
        autoLock: S.settings.autoLock != null ? S.settings.autoLock : 5
      }
    };
  }

  function exportData() {
    try {
      const json = JSON.stringify(backupPayload(), null, 2);
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

    const ok = await confirmAction({
      title: 'Gegevens importeren',
      message: projects.length === 0
        ? 'Dit back-upbestand bevat geen opdrachten. Bestaande gegevens blijven ongewijzigd.'
        : 'Er worden ' + projects.length + ' opdrachten toegevoegd of bijgewerkt. Bestaande opdrachten blijven behouden.',
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
      await App.reloadAll();
      App.refresh();
      toast(count + ' opdrachten ge\u00EFmporteerd');
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

  window.More = { openGoalEditor, openNameEditor };
  window.Views = window.Views || {};
  window.Views.more = renderSettings;
})();
