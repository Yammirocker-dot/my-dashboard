(function () {
  const U = window.U;

  const FIELDS = [
    { name: 'name', label: 'Naam', type: 'text', required: true },
    { name: 'company', label: 'Bedrijf', type: 'text' },
    { name: 'email', label: 'E-mail', type: 'text', placeholder: 'naam@bedrijf.be' },
    { name: 'phone', label: 'Telefoon', type: 'tel' },
    { name: 'notes', label: 'Notities', type: 'textarea', rows: 3 }
  ];

  function openForm(existing, onSaved) {
    const sh = Sheet.open({ title: existing ? 'Klant bewerken' : 'Nieuwe klant', fullscreen: true });
    sh.body.innerHTML =
      '<form class="form" novalidate>' +
      FIELDS.map((f) => Forms.fieldRow(Object.assign({}, f, { value: existing ? existing[f.name] || '' : '' }))).join('') +
      '<div class="form-actions">' +
      '<button type="button" class="btn btn-ghost" data-cancel>Annuleren</button>' +
      '<button type="submit" class="btn btn-gold">' + (existing ? 'Wijzigingen opslaan' : 'Klant toevoegen') + '</button>' +
      '</div></form>';

    const form = U.qs('form', sh.body);
    U.qs('[data-cancel]', sh.body).addEventListener('click', () => sh.close());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      Forms.clearErrors(form);
      const res = Forms.readForm(form, FIELDS);
      if (!res.ok) { toast('Controleer de gemarkeerde velden', 'error'); return; }
      const nowIso = new Date().toISOString();
      const rec = existing ? Object.assign({}, existing) : { id: U.uid(), createdAt: nowIso };
      rec.name = res.values.name.trim();
      rec.company = (res.values.company || '').trim();
      rec.email = (res.values.email || '').trim();
      rec.phone = (res.values.phone || '').trim();
      rec.notes = (res.values.notes || '').trim();
      rec.updatedAt = nowIso;
      try {
        await App.upsertRecord('clients', rec);
      } catch (err) {
        toast('Opslaan mislukt', 'error');
        return;
      }
      sh.close();
      toast(existing ? 'Klant bijgewerkt' : 'Klant toegevoegd');
      if (onSaved) onSaved();
    });
  }

  function openDetail(id) {
    const build = () => App.state.data.clients.find((c) => c.id === id);
    const sh = Sheet.open({ title: 'Klant', fullscreen: true });

    function draw() {
      const c = build();
      if (!c) { sh.close(); return; }
      const st = Stats.clientStats(App.state.data.projects, id);

      sh.body.innerHTML =
        '<div class="detail">' +
        '<div class="client-hero">' +
        '<span class="avatar">' + U.esc((c.name || '?').charAt(0).toUpperCase()) + '</span>' +
        '<div><div class="detail-name">' + U.esc(c.name) + '</div>' +
        (c.company ? '<div class="muted">' + U.esc(c.company) + '</div>' : '') +
        '</div></div>' +

        '<h3 class="section-title">Contact</h3>' +
        '<div class="card detail-card meta-list">' +
        mrow(Icons.user, 'Naam', U.esc(c.name)) +
        (c.email ? mrow(Icons.mail, 'E-mail', U.esc(c.email)) : '') +
        (c.phone ? mrow(Icons.phone, 'Telefoon', U.esc(c.phone)) : '') +
        (!c.email && !c.phone ? '<p class="muted pad">Geen contactgegevens ingevuld.</p>' : '') +
        '</div>' +

        '<h3 class="section-title">Cijfers</h3>' +
        '<div class="mini-grid tight">' +
        cstat('Opdrachten', String(st.count)) +
        cstat('Totale omzet', U.fmtMoney(st.total), 'gold') +
        cstat('Gem. per opdracht', st.avg != null ? U.fmtMoney(st.avg) : '\u2013') +
        cstat('Uren', st.hours > 0 ? U.fmtNum(st.hours, 1) + ' u' : '\u2013') +
        '</div>' +
        '<p class="iph-line">' + (st.incomePerHour != null ? 'Inkomen per uur bij deze klant: <b>' + U.esc(U.fmtMoney(st.incomePerHour)) + '</b>' : 'Nog geen uren geregistreerd voor deze klant.') + '</p>' +

        '<h3 class="section-title">Opdrachten</h3>' +
        (st.projects.length
          ? '<div class="stack-list">' + st.projects.map(projRowSafe).join('') + '</div>'
          : '<div class="empty slim"><h3>Nog geen opdrachten</h3><p>Koppel opdrachten aan deze klant via het klantveld in een opdracht.</p></div>') +

        (c.notes ? '<h3 class="section-title">Notities</h3><div class="card detail-card text-block"><p>' + U.esc(c.notes) + '</p></div>' : '') +

        '<div class="detail-actions">' +
        '<button class="btn btn-gold" data-edit>' + Icons.edit + 'Bewerken</button>' +
        '<button class="btn btn-danger-ghost" data-del>' + Icons.trash + 'Verwijderen</button>' +
        '</div></div>';

      U.qsa('[data-proj]', sh.body).forEach((b) =>
        b.addEventListener('click', () => Projects.openDetail(b.getAttribute('data-proj')))
      );
      U.qs('[data-edit]', sh.body).addEventListener('click', () => openForm(build(), draw));
      U.qs('[data-del]', sh.body).addEventListener('click', async () => {
        const ok = await confirmAction({
          title: 'Klant verwijderen',
          message: '"' + c.name + '" wordt verwijderd. Bijbehorende opdrachten blijven behouden maar worden losgekoppeld.'
        });
        if (!ok) return;
        try {
          const linked = App.state.data.projects.filter((p) => p.clientId === id);
          for (const p of linked) {
            await App.patchRecord('projects', p.id, { clientId: null }, true);
          }
          await App.removeRecord('clients', id);
          toast('Klant verwijderd');
          sh.close();
        } catch (e) {
          toast('Verwijderen mislukt', 'error');
        }
      });
    }

    draw();
  }

  function projRowSafe(p) {
    if (window.projRow) return projRow(p);
    const st = U.statusInfo(U.PROJECT_STATUS, p.status);
    return '<button type="button" class="row-item card" data-proj="' + U.esc(p.id) + '"><span class="status-dot" style="background:' + st.color + '"></span><span class="row-main"><span class="row-title">' + U.esc(p.name) + '</span><span class="row-sub">' + U.esc(U.fmtDate(p.date)) + '</span></span><span class="row-side"><span class="row-money">' + U.esc(U.fmtMoney(p.income)) + '</span></span></button>';
  }

  function mrow(icon, label, value) {
    return '<div class="meta-row"><span class="meta-icon">' + icon + '</span><span class="meta-label">' + label + '</span><span class="meta-value">' + value + '</span></div>';
  }

  function cstat(lb, val, cls) {
    return '<div class="stat-card static ' + (cls || '') + '"><span class="stat-label">' + lb + '</span><span class="stat-value">' + val + '</span></div>';
  }

  function render(root) {
    const S = App.state;
    const clients = S.data.clients.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    let listHTML;
    if (!clients.length) {
      listHTML =
        '<div class="empty tall"><div class="empty-icon">' + Icons.users + '</div>' +
        '<h3>Nog geen klanten</h3><p>Voeg klanten toe en koppel ze aan je opdrachten voor heldere cijfers.</p>' +
        '<button class="btn btn-gold" data-add>+ Klant toevoegen</button></div>';
    } else {
      listHTML = clients.map((c) => {
        const st = Stats.clientStats(S.data.projects, c.id);
        return (
          '<button type="button" class="client-card card" data-client="' + U.esc(c.id) + '">' +
          '<span class="avatar sm">' + U.esc((c.name || '?').charAt(0).toUpperCase()) + '</span>' +
          '<span class="row-main">' +
          '<span class="row-title">' + U.esc(c.name) + '</span>' +
          '<span class="row-sub">' + U.esc(c.company || (st.count === 1 ? '1 opdracht' : st.count + ' opdrachten')) + '</span>' +
          '</span>' +
          '<span class="row-side"><span class="row-money">' + U.esc(U.fmtMoney(st.total)) + '</span>' +
          '<span class="row-sub right">' + st.count + (st.count === 1 ? ' opdracht' : ' opdrachten') + '</span></span>' +
          Icons.chevronRight +
          '</button>'
        );
      }).join('');
    }

    root.innerHTML =
      '<section class="clients fade-in">' +
      '<header class="view-head row-between"><div><h2 class="page-title">Klanten</h2>' +
      '<p class="page-sub">' + clients.length + (clients.length === 1 ? ' klant' : ' klanten') + '</p></div>' +
      '<button class="btn btn-gold btn-sm head-add" data-add>' + Icons.plus + 'Nieuw</button></header>' +
      '<div class="stack-list">' + listHTML + '</div>' +
      '</section>';

    bind(root);
  }

  function bind(root) {
    U.qsa('[data-add]', root).forEach((b) => b.addEventListener('click', () => openForm(null)));
    U.qsa('[data-client]', root).forEach((b) =>
      b.addEventListener('click', () => openDetail(b.getAttribute('data-client')))
    );
  }

  window.Clients = { openForm, openDetail };
  window.Views = window.Views || {};
  window.Views.clients = render;
})();
