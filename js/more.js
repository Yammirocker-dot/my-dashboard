(function () {
  const U = window.U;

  const ENTRY_FIELDS = [
    { name: 'description', label: 'Omschrijving', type: 'text', required: true },
    { name: 'amount', label: 'Bedrag (\u20AC)', type: 'number', step: '0.01', min: 0, required: true },
    { name: 'date', label: 'Datum', type: 'date', required: true },
    { name: 'notes', label: 'Notities', type: 'textarea', rows: 2 }
  ];

  function entryValues(existing) {
    return {
      description: existing ? existing.description : '',
      amount: existing ? String(existing.amount != null ? existing.amount : '') : '',
      date: existing && existing.date ? existing.date : U.todayISO(),
      notes: existing ? existing.notes || '' : ''
    };
  }

  function openEntryForm(kind, existing) {
    const isIncome = kind === 'otherIncome';
    const sh = Sheet.open({
      title: existing
        ? (isIncome ? 'Inkomst bewerken' : 'Uitgave bewerken')
        : (isIncome ? 'Nieuwe inkomst' : 'Nieuwe uitgave'),
      fullscreen: true
    });
    const vals = entryValues(existing);
    sh.body.innerHTML =
      '<form class="form" novalidate>' +
      ENTRY_FIELDS.map((f) => Forms.fieldRow(Object.assign({}, f, { value: vals[f.name] }))).join('') +
      '<div class="form-actions">' +
      (existing ? '<button type="button" class="btn btn-danger-ghost" data-del>' + Icons.trash + 'Verwijderen</button>' : '<button type="button" class="btn btn-ghost" data-cancel>Annuleren</button>') +
      '<button type="submit" class="btn btn-gold">' + (existing ? 'Opslaan' : 'Toevoegen') + '</button>' +
      '</div></form>';

    const form = U.qs('form', sh.body);
    U.qs('[data-cancel], [data-del]', sh.body).addEventListener('click', async () => {
      if (!existing) { sh.close(); return; }
      const ok = await confirmAction({
        title: isIncome ? 'Inkomst verwijderen' : 'Uitgave verwijderen',
        message: '"' + existing.description + '" wordt definitief verwijderd.'
      });
      if (!ok) return;
      await App.removeRecord(kind, existing.id);
      sh.close();
      toast(isIncome ? 'Inkomst verwijderd' : 'Uitgave verwijderd');
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      Forms.clearErrors(form);
      const res = Forms.readForm(form, ENTRY_FIELDS);
      if (!res.ok) { toast('Controleer de gemarkeerde velden', 'error'); return; }
      const nowIso = new Date().toISOString();
      const rec = existing ? Object.assign({}, existing) : { id: U.uid(), createdAt: nowIso };
      rec.description = res.values.description.trim();
      rec.amount = res.values.amount;
      rec.date = res.values.date;
      rec.notes = (res.values.notes || '').trim();
      rec.updatedAt = nowIso;
      try {
        await App.upsertRecord(kind, rec);
      } catch (err) {
        toast('Opslaan mislukt', 'error');
        return;
      }
      sh.close();
      toast(existing ? 'Bijgewerkt' : (isIncome ? 'Inkomst toegevoegd' : 'Uitgave toegevoegd'));
    });
  }

  function sumMonth(list) {
    const key = U.monthKey(U.todayISO());
    return list.reduce((s, e) => (U.monthKey(e.date) === key ? s + (Number(e.amount) || 0) : s), 0);
  }

  function renderEntries(root, kind) {
    const isIncome = kind === 'otherIncome';
    const list = App.state.data[kind].slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const totalAll = list.reduce((s, e) => s + (Number(e.amount) || 0), 0);

    let listHTML;
    if (!list.length) {
      listHTML =
        '<div class="empty tall"><div class="empty-icon">' + (isIncome ? Icons.euro : Icons.wallet) + '</div>' +
        '<h3>' + (isIncome ? 'Nog geen overige inkomsten' : 'Nog geen uitgaven') + '</h3>' +
        '<p>' + (isIncome ? 'Registreer hier inkomsten die niet via VHXmedia-opdrachten lopen.' : 'Houd je zakelijke kosten bij om je nettoresultaat te zien.') + '</p>' +
        '<button class="btn btn-gold" data-add>+ Toevoegen</button></div>';
    } else {
      let lastMonth = '';
      listHTML = list.map((e) => {
        const mk = U.monthKey(e.date);
        let head = '';
        if (mk !== lastMonth) {
          lastMonth = mk;
          head = '<div class="month-sep">' + U.esc(U.MONTHS_LONG[Number(mk.slice(5, 7)) - 1] + ' ' + mk.slice(0, 4)) + '</div>';
        }
        return head +
          '<button type="button" class="entry-row card" data-entry="' + U.esc(e.id) + '">' +
          '<span class="entry-main"><span class="row-title">' + U.esc(e.description) + '</span>' +
          '<span class="row-sub">' + U.esc(U.fmtDate(e.date)) + (e.notes ? ' \u00B7 ' + U.esc(e.notes) : '') + '</span></span>' +
          '<span class="row-money ' + (isIncome ? 'pos' : 'neg') + '">' + U.esc(U.fmtMoney(e.amount)) + '</span>' +
          '</button>';
      }).join('');
    }

    root.innerHTML =
      '<section class="entries fade-in">' +
      '<header class="view-head row-between"><div><h2 class="page-title">' + (isIncome ? 'Overige inkomsten' : 'Uitgaven') + '</h2>' +
      '<p class="page-sub">Totaal aller tijden: ' + U.esc(U.fmtMoney(totalAll)) + '</p></div>' +
      '<button class="btn btn-gold btn-sm head-add" data-add>' + Icons.plus + 'Nieuw</button></header>' +
      '<div class="stack-list">' + listHTML + '</div>' +
      '</section>';

    U.qsa('[data-add]', root).forEach((b) => b.addEventListener('click', () => openEntryForm(kind, null)));
    U.qsa('[data-entry]', root).forEach((b) =>
      b.addEventListener('click', () => {
        const item = App.state.data[kind].find((x) => x.id === b.getAttribute('data-entry'));
        if (item) openEntryForm(kind, item);
      })
    );
  }

  function renderMore(root) {
    const S = App.state;
    const nClients = S.data.clients.length;
    const mOther = sumMonth(S.data.otherIncome);
    const mExp = sumMonth(S.data.expenses);

    root.innerHTML =
      '<section class="more fade-in">' +
      '<header class="view-head"><div><h2 class="page-title">Meer</h2>' +
      '<p class="page-sub">Klanten, registraties en instellingen</p></div></header>' +

      '<h3 class="section-title">Registraties</h3>' +
      '<div class="menu-list card">' +
      menuItem('clients', Icons.users, 'Klanten', nClients === 1 ? '1 klant' : nClients + ' klanten') +
      menuItem('income', Icons.euro, 'Overige inkomsten', U.fmtMoney(mOther) + ' deze maand') +
      menuItem('expenses', Icons.wallet, 'Uitgaven', U.fmtMoney(mExp) + ' deze maand') +
      '</div>' +

      '<h3 class="section-title">Instellingen &amp; gegevens</h3>' +
      '<div class="menu-list card">' +
      menuItem('settings', Icons.gear, 'Instellingen', 'PIN, doel, gegevens') +
      '</div>' +
      '</section>';

    U.qsa('[data-menu]', root).forEach((b) =>
      b.addEventListener('click', () => App.go(b.getAttribute('data-menu')))
    );
  }

  function menuItem(route, icon, title, sub) {
    return (
      '<button type="button" class="menu-item" data-menu="' + route + '">' +
      '<span class="menu-icon">' + icon + '</span>' +
      '<span class="menu-main"><span class="menu-title">' + title + '</span><span class="menu-sub">' + U.esc(sub) + '</span></span>' +
      Icons.chevronRight +
      '</button>'
    );
  }

  function renderSettings(root) {
    const S = App.state;
    const autoLock = Number(S.settings.autoLock != null ? S.settings.autoLock : 5);
    const online = navigator.onLine;

    root.innerHTML =
      '<section class="settings fade-in">' +
      '<header class="view-head row-between"><div><h2 class="page-title">Instellingen</h2></div>' +
      '<button class="btn btn-ghost btn-sm" data-back>' + Icons.chevronLeft + 'Meer</button></header>' +

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
      '<div class="set-row static"><span class="set-icon">' + Icons.folder + '</span><span class="set-main">Versie</span><span class="set-value">1.0.0</span></div>' +
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

  function bindSettings(root) {
    U.qs('[data-back]', root).addEventListener('click', () => App.go('more'));

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
      '<p class="sheet-hint">Wordt vergeleken met je VHXmedia-inkomsten van ' + new Date().getFullYear() + '.</p>' +
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
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      projects: S.data.projects,
      clients: S.data.clients,
      otherIncome: S.data.otherIncome,
      expenses: S.data.expenses,
      events: S.data.events,
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

  function arr(x) { return Array.isArray(x) ? x : null; }

  async function importData(file) {
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch (e) {
      toast('Ongeldig bestand: geen geldige JSON', 'error');
      return;
    }
    const projects = arr(parsed.projects);
    const clients = arr(parsed.clients);
    const otherIncome = arr(parsed.otherIncome);
    const expenses = arr(parsed.expenses);
    const events = arr(parsed.events);
    if (!projects || !clients || !otherIncome || !expenses || !events) {
      toast('Dit lijkt geen VHXmedia-back-up te zijn', 'error');
      return;
    }
    const total = projects.length + clients.length + otherIncome.length + expenses.length + events.length;

    const ok = await confirmAction({
      title: 'Gegevens importeren',
      message: total === 0
        ? 'Dit back-upbestand bevat geen items. Bestaande gegevens blijven ongewijzigd.'
        : 'Er worden ' + total + ' items toegevoegd of bijgewerkt. Items met een bestaande ID worden overschreven; de rest blijft behouden.',
      confirmText: 'Importeren',
      danger: false
    });
    if (!ok) return;

    try {
      const stores = [
        ['projects', projects],
        ['clients', clients],
        ['otherIncome', otherIncome],
        ['expenses', expenses],
        ['events', events]
      ];
      let count = 0;
      for (const [store, list] of stores) {
        for (const raw of list) {
          if (!raw || typeof raw !== 'object') continue;
          const rec = Object.assign({}, raw);
          if (!rec.id || typeof rec.id !== 'string') rec.id = U.uid();
          await DB.put(store, rec);
          count++;
        }
      }
      if (parsed.settings && typeof parsed.settings === 'object') {
        const s = parsed.settings;
        if (s.goal != null) { await DB.setSetting('goal', Math.max(0, Number(s.goal) || 0)); }
        if (s.userName) { await DB.setSetting('userName', String(s.userName)); }
        if (s.autoLock != null) { await DB.setSetting('autoLock', Number(s.autoLock) || 0); }
      }
      await App.reloadAll();
      App.refresh();
      toast(count + ' items ge\u00EFmporteerd');
    } catch (e) {
      toast('Importeren mislukt \u2014 beschadigd bestand?', 'error');
    }
  }

  function resetFlow() {
    const sh = Sheet.open({ title: 'Alle gegevens wissen', small: true, persistent: true });
    sh.body.innerHTML =
      '<p class="confirm-msg strong">Dit verwijdert <b>alle lokale VHXmedia-gegevens</b> van dit toestel: opdrachten, klanten, inkomsten, uitgaven, agenda en instellingen.</p>' +
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
  window.Entries = { openForm: openEntryForm };
  window.Views = window.Views || {};
  window.Views.more = renderMore;
  window.Views.income = (root) => renderEntries(root, 'otherIncome');
  window.Views.expenses = (root) => renderEntries(root, 'expenses');
  window.Views.settings = renderSettings;
})();
