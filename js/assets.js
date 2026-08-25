(function () {
  const U = window.U;

  async function getAccs() {
    return (await DB.getSetting('accounts', null)) || [];
  }
  async function saveAccs(list) {
    await DB.setSetting('accounts', list);
  }
  async function getBanks() {
    return (await DB.getSetting('banks', null)) || [];
  }
  async function saveBanks(list) {
    await DB.setSetting('banks', list);
  }

  function totalOf(list) {
    return list.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  }

  function render(root) {
    Promise.all([getAccs(), getBanks()]).then(([accs, banks]) => draw(root, accs, banks));
  }

  function accTile(a) {
    return (
      '<button type="button" class="acc-tile" data-acc="' + U.esc(a.id) + '">' +
      '<span class="acc-name">' + U.esc(a.name) + '</span>' +
      '<span class="row-money' + ((Number(a.balance) || 0) < 0 ? ' neg' : '') + '">' + U.esc(U.fmtMoney(a.balance)) + '</span>' +
      '</button>'
    );
  }

  let lastRoot = null;

  function draw(root, accs, banks) {
    lastRoot = root;
    const total = totalOf(accs);

    let groupsHTML = '';
    banks.forEach((b) => {
      const list = accs.filter((a) => a.bankId === b.id);
      groupsHTML +=
        '<div class="bank-group">' +
        '<div class="section-row"><h3 class="section-title"><span class="bank-dot"></span>' + U.esc(b.name) +
        ' <span class="muted">(' + list.length + ')</span></h3>' +
        '<span class="bank-sum">' + U.esc(U.fmtMoney(totalOf(list))) + '</span>' +
        '<button type="button" class="icon-btn" data-bank="' + U.esc(b.id) + '" aria-label="Bank aanpassen">' + Icons.edit + '</button>' +
        '</div>' +
        (list.length
          ? '<div class="acc-grid">' + list.map(accTile).join('') + '</div>'
          : '<p class="muted-sm">Nog geen rekeningen bij deze bank.</p>') +
        '</div>';
    });
    const loose = accs.filter((a) => !a.bankId || !banks.some((x) => x.id === a.bankId));
    if (loose.length) {
      groupsHTML +=
        '<div class="bank-group">' +
        (banks.length
          ? '<div class="section-row"><h3 class="section-title">Zonder bank <span class="muted">(' + loose.length + ')</span></h3><span class="bank-sum">' + U.esc(U.fmtMoney(totalOf(loose))) + '</span></div>'
          : '') +
        '<div class="acc-grid">' +
        loose.map(accTile).join('') +
        '</div></div>';
    }

    root.innerHTML =
      '<section class="dash fade-in">' +
      '<header class="view-head"><div>' +
      '<h2 class="greeting">Totaal vermogen</h2>' +
      '<p class="date-sub">' + U.esc(U.fmtDateLong(new Date())) + '</p>' +
      '</div></header>' +
      '<div class="card acc-total static">' +
      '<span class="acc-badge">' + Icons.wallet + '</span>' +
      '<div class="big-number' + (total < 0 ? ' neg' : '') + '">' + U.esc(U.fmtMoney(total)) + '</div>' +
      '<div class="hero-meta">' + banks.length + ' bank' + (banks.length === 1 ? '' : 'en') + ' \u00B7 ' + accs.length + ' rekening' + (accs.length === 1 ? '' : 'en') + '</div>' +
      '</div>' +
      (groupsHTML ||
        '<p class="muted-sm" style="margin-top:14px;text-align:center">Gebruik de + knop om een bank en rekening toe te voegen.</p>') +
      '</section>';

    bind(root);
  }

  function chooseSheet() {
    const sh = Sheet.open({ title: 'Wat wil je toevoegen?', small: true });
    sh.body.innerHTML =
      '<div class="stack-list">' +
      '<button type="button" class="set-row" data-add-bank><span class="set-icon">' + Icons.database + '</span><span class="set-main"><b>Bank</b><span class="set-sub">bv. KBC, Belfius, Revolut</span></span>' + Icons.chevronRight + '</button>' +
      '<button type="button" class="set-row" data-add-acc><span class="set-icon">' + Icons.wallet + '</span><span class="set-main"><b>Rekening</b><span class="set-sub">bv. Zichtrekening, Spaarrekening</span></span>' + Icons.chevronRight + '</button>' +
      '</div>';
    U.qs('[data-add-bank]', sh.body).addEventListener('click', () => { sh.close(); bankSheet(null, () => render(lastRoot)); });
    U.qs('[data-add-acc]', sh.body).addEventListener('click', () => { sh.close(); accSheet(null, () => render(lastRoot)); });
  }

  function accSheet(existing, onDone) {
    Promise.all([getBanks()]).then(([banks]) => {
      const sh = Sheet.open({ title: existing ? 'Rekening bewerken' : 'Nieuwe rekening', small: true });
      const bankOpts = [{ value: '', label: 'Zonder bank' }].concat(
        banks.map((b) => ({ value: b.id, label: b.name }))
      );
      sh.body.innerHTML =
        '<form class="form" novalidate>' +
        Forms.fieldRow({ name: 'name', label: 'Naam', type: 'text', value: existing ? existing.name : '', placeholder: 'bv. Zichtrekening' }) +
        Forms.fieldRow({ name: 'bankId', label: 'Bank', type: 'select', value: existing ? existing.bankId || '' : '', options: bankOpts }) +
        Forms.fieldRow({ name: 'balance', label: 'Saldo (\u20AC)', type: 'number', value: existing && existing.balance != null ? String(existing.balance) : '' }) +
        '<div class="form-actions"><button type="submit" class="btn btn-gold btn-block">' + (existing ? 'Opslaan' : 'Aanmaken') + '</button></div>' +
        (existing
          ? '<button type="button" class="btn btn-danger btn-block" data-del style="margin-top:10px">' + Icons.trash + 'Verwijderen</button>'
          : '') +
        '</form>';

      const form = U.qs('form', sh.body);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        Forms.clearErrors(form);
        const res = Forms.readForm(form, [
          { name: 'name', label: 'Naam', type: 'text', required: true },
          { name: 'bankId', label: 'Bank', type: 'text' },
          { name: 'balance', label: 'Saldo', type: 'number', required: true }
        ]);
        if (!res.ok) return;
        const accs = await getAccs();
        if (existing) {
          const rec = accs.find((a) => a.id === existing.id);
          if (rec) {
            rec.name = res.values.name;
            rec.bankId = res.values.bankId || '';
            rec.balance = res.values.balance;
          }
        } else {
          accs.push({
            id: 'acc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name: res.values.name,
            bankId: res.values.bankId || '',
            balance: Number(res.values.balance) || 0,
            createdAt: new Date().toISOString()
          });
        }
        await saveAccs(accs);
        sh.close();
        toast(existing ? 'Rekening bijgewerkt' : 'Rekening aangemaakt');
        if (onDone) onDone();
      });

      const del = U.qs('[data-del]', sh.body);
      if (del) {
        del.addEventListener('click', async () => {
          const ok = await confirmAction({
            title: 'Rekening verwijderen?',
            message: '"' + existing.name + '" verdwijnt uit je totaal. Dit kan niet ongedaan gemaakt worden.',
            confirmText: 'Verwijderen'
          });
          if (!ok) return;
          const accs = await getAccs();
          await saveAccs(accs.filter((a) => a.id !== existing.id));
          sh.close();
          toast('Rekening verwijderd');
          if (onDone) onDone();
        });
      }
    });
  }

  function bankSheet(existing, onDone) {
    const sh = Sheet.open({ title: existing ? 'Bank bewerken' : 'Nieuwe bank', small: true });
    sh.body.innerHTML =
      '<form class="form" novalidate>' +
      Forms.fieldRow({ name: 'name', label: 'Naam van de bank', type: 'text', value: existing ? existing.name : '', placeholder: 'bv. KBC' }) +
      '<div class="form-actions"><button type="submit" class="btn btn-gold btn-block">' + (existing ? 'Opslaan' : 'Toevoegen') + '</button></div>' +
      (existing
        ? '<button type="button" class="btn btn-danger btn-block" data-del style="margin-top:10px">' + Icons.trash + 'Bank verwijderen</button>'
        : '') +
      '</form>';

    const form = U.qs('form', sh.body);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      Forms.clearErrors(form);
      const res = Forms.readForm(form, [{ name: 'name', label: 'Naam', type: 'text', required: true }]);
      if (!res.ok) return;
      const banks = await getBanks();
      if (existing) {
        const rec = banks.find((b) => b.id === existing.id);
        if (rec) rec.name = res.values.name;
      } else {
        banks.push({
          id: 'bank_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          name: res.values.name,
          createdAt: new Date().toISOString()
        });
      }
      await saveBanks(banks);
      sh.close();
      toast(existing ? 'Bank bijgewerkt' : 'Bank toegevoegd');
      if (onDone) onDone();
    });

    const del = U.qs('[data-del]', sh.body);
    if (del) {
      del.addEventListener('click', async () => {
        const ok = await confirmAction({
          title: 'Bank verwijderen?',
          message: 'Rekeningen die bij "' + existing.name + '" horen blijven bestaan en komen onder "Zonder bank" terecht.',
          confirmText: 'Verwijderen'
        });
        if (!ok) return;
        const banks = await getBanks();
        const keep = banks.filter((b) => b.id !== existing.id);
        await saveBanks(keep);
        const accs = await getAccs();
        let changed = false;
        accs.forEach((a) => {
          if (a.bankId === existing.id) { a.bankId = ''; changed = true; }
        });
        if (changed) await saveAccs(accs);
        sh.close();
        toast('Bank verwijderd');
        if (onDone) onDone();
      });
    }
  }

  function bind(root) {
    U.qsa('[data-acc]', root).forEach((b) =>
      b.addEventListener('click', async () => {
        const accs = await getAccs();
        const acc = accs.find((a) => a.id === b.getAttribute('data-acc'));
        if (acc) accSheet(acc, () => render(lastRoot));
      })
    );
    U.qsa('[data-bank]', root).forEach((b) =>
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        const banks = await getBanks();
        const bank = banks.find((x) => x.id === b.getAttribute('data-bank'));
        if (bank) bankSheet(bank, () => render(lastRoot));
      })
    );
  }

  window.Views = window.Views || {};
  window.Views.assets = render;
  window.AssetsAdd = { open: chooseSheet };
})();
