(function () {
  const U = window.U;

  async function getAccs() {
    return (await DB.getSetting('accounts', null)) || [];
  }

  async function saveAccs(list) {
    await DB.setSetting('accounts', list);
  }

  function totalOf(list) {
    return list.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  }

  function render(root) {
    getAccs().then((accs) => draw(root, accs));
  }

  function draw(root, accs) {
    const total = totalOf(accs);
    const rows = accs.map((a) =>
      '<button type="button" class="set-row" data-acc="' + U.esc(a.id) + '">' +
      '<span class="set-icon">' + Icons.wallet + '</span>' +
      '<span class="set-main"><b>' + U.esc(a.name) + '</b><span class="set-sub">Saldo bijwerken of hernoemen</span></span>' +
      '<span class="row-money' + ((Number(a.balance) || 0) < 0 ? ' neg' : '') + '">' + U.esc(U.fmtMoney(a.balance)) + '</span>' +
      Icons.chevronRight +
      '</button>'
    ).join('');

    root.innerHTML =
      '<section class="dash fade-in">' +
      '<header class="view-head"><div>' +
      '<h2 class="greeting">Totaal vermogen</h2>' +
      '<p class="date-sub">' + U.esc(U.fmtDateLong(new Date())) + '</p>' +
      '</div></header>' +
      '<div class="card hero-card static">' +
      '<div class="card-label">Totaal vermogen</div>' +
      '<div class="big-number' + (total < 0 ? ' neg' : '') + '">' + U.esc(U.fmtMoney(total)) + '</div>' +
      '<div class="hero-meta">' + accs.length + ' rekening' + (accs.length === 1 ? '' : 'en') + '</div>' +
      '</div>' +
      '<div class="section-row"><h3 class="section-title">Rekeningen</h3>' +
      '<button type="button" class="link-btn" data-acc-new>' + Icons.plus + 'Nieuwe rekening</button></div>' +
      (rows
        ? '<div class="card set-group">' + rows + '</div>'
        : '<div class="empty slim"><h3>Nog geen rekeningen</h3><p>Maak je eerste rekening aan om je vermogen te volgen.</p>' +
          '<button type="button" class="btn btn-gold btn-sm" data-acc-new>Rekening aanmaken</button></div>') +
      '</section>';

    bind(root, accs);
  }

  function accSheet(existing, onDone) {
    const sh = Sheet.open({ title: existing ? 'Rekening bewerken' : 'Nieuwe rekening', small: true });
    sh.body.innerHTML =
      '<form class="form" novalidate>' +
      Forms.fieldRow({ name: 'name', label: 'Naam', type: 'text', value: existing ? existing.name : '', placeholder: 'bv. Zichtrekening' }) +
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
        { name: 'balance', label: 'Saldo', type: 'number', required: true }
      ]);
      if (!res.ok) return;
      const accs = await getAccs();
      if (existing) {
        const rec = accs.find((a) => a.id === existing.id);
        if (rec) { rec.name = res.values.name; rec.balance = res.values.balance; }
      } else {
        accs.push({
          id: 'acc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          name: res.values.name,
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
  }

  function bind(root, accs) {
    U.qsa('[data-acc-new]', root).forEach((b) =>
      b.addEventListener('click', () => accSheet(null, () => render(root)))
    );
    U.qsa('[data-acc]', root).forEach((b) =>
      b.addEventListener('click', () => {
        const acc = accs.find((a) => a.id === b.getAttribute('data-acc'));
        if (acc) accSheet(acc, () => render(root));
      })
    );
  }

  window.Views = window.Views || {};
  window.Views.assets = render;
})();
