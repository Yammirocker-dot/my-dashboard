(function () {
  const U = window.U;

  const SORTS = [
    ['new', 'Nieuwste eerst'],
    ['old', 'Oudste eerst'],
    ['incDesc', 'Hoogste inkomen'],
    ['incAsc', 'Laagste inkomen'],
    ['upcoming', 'Aankomende datum']
  ];

  function fields() {
    return [
      { name: 'name', label: 'Projectnaam', type: 'text', required: true, placeholder: 'bijv. Bedrijfsfilm Sheraton' },
      { name: 'description', label: 'Beschrijving', type: 'textarea', rows: 2 },
      {
        name: 'clientId',
        label: 'Klant',
        type: 'select',
        options: [{ value: '', label: 'Geen klant' }].concat(
          App.state.data.clients.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((c) => ({ value: c.id, label: c.name }))
        )
      },
      { name: 'date', label: 'Datum', type: 'date', required: true },
      { name: 'income', label: 'Inkomen (\u20AC)', type: 'number', step: '0.01', min: 0, placeholder: '0,00' },
      {
        name: 'status', label: 'Status', type: 'select',
        options: U.PROJECT_STATUS.map((s) => ({ value: s.id, label: s.label }))
      },
      {
        name: 'paymentStatus', label: 'Betalingsstatus', type: 'select',
        options: U.PAYMENT_STATUS.map((s) => ({ value: s.id, label: s.label }))
      },
      { name: 'filmingHours', label: 'Opname-uren', type: 'number', step: '0.25', min: 0, placeholder: '0' },
      { name: 'editingHours', label: 'Montage-uren', type: 'number', step: '0.25', min: 0, placeholder: '0' },
      { name: 'notes', label: 'Notities', type: 'textarea', rows: 3 }
    ];
  }

  function valuesOf(p) {
    return {
      name: p ? p.name : '',
      description: p ? p.description : '',
      clientId: p && p.clientId ? p.clientId : '',
      date: p && p.date ? p.date : U.todayISO(),
      income: p ? String(p.income != null ? p.income : '') : '',
      status: p ? p.status : 'idea',
      paymentStatus: p ? p.paymentStatus : 'to_invoice',
      filmingHours: p ? String(p.filmingHours != null ? p.filmingHours : '') : '',
      editingHours: p ? String(p.editingHours != null ? p.editingHours : '') : '',
      notes: p ? p.notes : ''
    };
  }

  function openForm(existing, defaults, onSaved) {
    const sh = Sheet.open({ title: existing ? 'Opdracht bewerken' : 'Nieuwe opdracht', fullscreen: true });
    const vals = Object.assign(valuesOf(existing), defaults || {});
    const cfg = fields();
    sh.body.innerHTML =
      '<form class="form" novalidate>' +
      cfg.map((f) => Forms.fieldRow(Object.assign({}, f, { value: vals[f.name] }))).join('') +
      '<div class="form-actions">' +
      '<button type="button" class="btn btn-ghost" data-cancel>Annuleren</button>' +
      '<button type="submit" class="btn btn-gold">' + (existing ? 'Wijzigingen opslaan' : 'Opdracht aanmaken') + '</button>' +
      '</div></form>';

    const form = U.qs('form', sh.body);
    U.qs('[data-cancel]', sh.body).addEventListener('click', () => sh.close());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      Forms.clearErrors(form);
      const res = Forms.readForm(form, cfg);
      if (!res.ok) {
        toast('Controleer de gemarkeerde velden', 'error');
        return;
      }
      const v = res.values;
      const nowIso = new Date().toISOString();
      let rec;
      if (existing) {
        rec = Object.assign({}, existing);
      } else {
        rec = { id: U.uid(), createdAt: nowIso };
      }
      rec.name = v.name.trim();
      rec.description = (v.description || '').trim();
      rec.clientId = v.clientId || null;
      rec.date = v.date;
      rec.income = v.income != null ? v.income : 0;
      rec.status = v.status;
      rec.paymentStatus = v.paymentStatus;
      rec.filmingHours = v.filmingHours != null ? v.filmingHours : 0;
      rec.editingHours = v.editingHours != null ? v.editingHours : 0;
      rec.notes = (v.notes || '').trim();
      rec.updatedAt = nowIso;
      try {
        await App.upsertRecord('projects', rec);
      } catch (err) {
        toast('Opslaan mislukt', 'error');
        return;
      }
      sh.close();
      toast(existing ? 'Opdracht bijgewerkt' : 'Opdracht aangemaakt');
      if (onSaved) onSaved();
    });
  }

  function openDetail(id) {
    const build = () => App.state.data.projects.find((p) => p.id === id);

    const sh = Sheet.open({ title: 'Opdracht', fullscreen: true });
    sh.card.classList.add('detail-sheet');

    function draw() {
      const p = build();
      if (!p) { sh.close(); return; }
      U.qs('.sheet-title', sh.card).textContent = p.name;
      const st = U.statusInfo(U.PROJECT_STATUS, p.status);
      const pay = U.statusInfo(U.PAYMENT_STATUS, p.paymentStatus);
      const client = p.clientId ? App.state.data.clients.find((c) => c.id === p.clientId) : null;
      const fh = Number(p.filmingHours) || 0;
      const eh = Number(p.editingHours) || 0;
      const totalH = fh + eh;
      const income = Number(p.income) || 0;
      const iph = totalH > 0 ? income / totalH : null;

      sh.body.innerHTML =
        '<div class="detail">' +
        '<div class="pill-row">' +
        '<span class="pill" style="--pc:' + st.color + '">' + U.esc(st.label) + '</span>' +
        '<span class="pill" style="--pc:' + pay.color + '">' + Icons.euro + U.esc(pay.label) + '</span>' +
        '</div>' +
        '<div class="detail-money">' + U.esc(U.fmtMoney(income)) + '</div>' +

        '<div class="card detail-card"><div class="chip-row seg scroll">' +
        U.PROJECT_STATUS.map((s) =>
          '<button type="button" class="chip sm' + (p.status === s.id ? ' active' : '') + '" data-set-status="' + s.id + '">' + U.esc(s.label) + '</button>'
        ).join('') +
        '</div></div>' +

        '<div class="card detail-card meta-list">' +
        mrow(Icons.user, 'Klant', client ? U.esc(client.name) : 'Geen klant') +
        mrow(Icons.calendar, 'Datum', U.esc(U.fmtDate(p.date))) +
        mrow(Icons.folder, 'Uurloon', iph != null ? U.esc(U.fmtMoney(iph)) + ' / uur' : 'Voer uren in') +
        '</div>' +

        '<h3 class="section-title">Overzicht</h3>' +
        '<div class="card detail-card text-block">' +
        (p.description ? '<p>' + U.esc(p.description) + '</p>' : '<p class="muted">Geen beschrijving.</p>') +
        (p.notes ? '<p class="notes">' + U.esc(p.notes) + '</p>' : '') +
        '</div>' +

        '<h3 class="section-title">Tijd</h3>' +
        '<div class="card detail-card time-grid">' +
        trow('Opname', fh) +
        trow('Montage', eh) +
        '<div class="time-row total"><span>Totaal</span><b>' + U.esc(U.fmtHours(totalH)) + '</b></div>' +
        '</div>' +

        '<h3 class="section-title">Betalingsstatus</h3>' +
        '<div class="card detail-card"><div class="chip-row seg wrap">' +
        U.PAYMENT_STATUS.map((s) =>
          '<button type="button" class="chip sm' + (p.paymentStatus === s.id ? ' active' : '') + '" data-set-pay="' + s.id + '">' + U.esc(s.label) + '</button>'
        ).join('') +
        '</div></div>' +

        '<div class="detail-actions">' +
        '<button class="btn btn-gold" data-edit>' + Icons.edit + 'Bewerken</button>' +
        '<button class="btn btn-danger-ghost" data-del>' + Icons.trash + 'Verwijderen</button>' +
        '</div>' +
        '</div>';

      U.qsa('[data-set-status]', sh.body).forEach((b) =>
        b.addEventListener('click', async () => {
          await App.patchRecord('projects', id, { status: b.getAttribute('data-set-status') });
          draw();
        })
      );
      U.qsa('[data-set-pay]', sh.body).forEach((b) =>
        b.addEventListener('click', async () => {
          await App.patchRecord('projects', id, { paymentStatus: b.getAttribute('data-set-pay') });
          draw();
        })
      );
      U.qs('[data-edit]', sh.body).addEventListener('click', () => openForm(build(), null, draw));
      U.qs('[data-del]', sh.body).addEventListener('click', async () => {
        const ok = await confirmAction({
          title: 'Opdracht verwijderen',
          message: '"' + p.name + '" wordt definitief verwijderd. Alle bijbehorende cijfers worden aangepast.'
        });
        if (!ok) return;
        await removeProject(id);
        sh.close();
      });
    }

    draw();
  }

  function mrow(icon, label, value) {
    return '<div class="meta-row"><span class="meta-icon">' + icon + '</span><span class="meta-label">' + label + '</span><span class="meta-value">' + value + '</span></div>';
  }

  function trow(label, val) {
    return '<div class="time-row"><span>' + U.esc(label) + '</span><b>' + U.esc(U.fmtHours(val)) + '</b></div>';
  }

  async function removeProject(id) {
    const linked = App.state.data.events.filter((e) => e.linkedProjectId === id);
    try {
      for (const ev of linked) {
        await App.patchRecord('events', ev.id, { linkedProjectId: null }, true);
      }
      await App.removeRecord('projects', id);
      toast('Opdracht verwijderd');
    } catch (e) {
      toast('Verwijderen mislukt', 'error');
    }
  }

  function filteredProjects() {
    const S = App.state;
    const f = S.projFilter;
    const q = f.q.trim().toLowerCase();
    let list = S.data.projects.slice();
    if (f.status !== 'all') list = list.filter((p) => p.status === f.status);
    if (q) {
      list = list.filter((p) => {
        const hay = [p.name, p.description, p.notes, App.clientName(p.clientId)]
          .join(' ')
          .toLowerCase();
        return hay.indexOf(q) !== -1;
      });
    }
    const today = U.parseISO(U.todayISO());
    const cmp = {
      new: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''),
      old: (a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''),
      incDesc: (a, b) => (Number(b.income) || 0) - (Number(a.income) || 0),
      incAsc: (a, b) => (Number(a.income) || 0) - (Number(b.income) || 0),
      upcoming: (a, b) => Math.abs(U.parseISO(a.date) - today) - Math.abs(U.parseISO(b.date) - today)
    };
    list.sort(cmp[f.sort] || cmp.new);
    return list;
  }

  function render(root) {
    const S = App.state;
    const f = S.projFilter;
    const counts = Stats.statusCounts(S.data.projects);
    const list = filteredProjects();

    const search =
      '<div class="search-box">' + Icons.search +
      '<input type="search" id="proj-q" placeholder="Zoek opdrachten\u2026" value="' + U.esc(f.q) + '" aria-label="Zoek opdrachten">' +
      (f.q ? '<button type="button" class="clear-btn" aria-label="Wis zoekopdracht">' + Icons.x + '</button>' : '') +
      '</div>';

    const sortSel =
      '<label class="year-select" aria-label="Sorteren">' +
      '<select id="proj-sort">' +
      SORTS.map(([id, lb]) => '<option value="' + id + '"' + (f.sort === id ? ' selected' : '') + '>' + lb + '</option>').join('') +
      '</select>' + Icons.dots + '</label>';

    const chips =
      '<div class="chip-row seg scroll">' +
      ['all'].concat(U.PROJECT_STATUS.map((s) => s.id)).map((id) => {
        const lb = id === 'all' ? 'Alle' : U.statusInfo(U.PROJECT_STATUS, id).label;
        const n = counts[id] || 0;
        return '<button type="button" class="chip' + (f.status === id ? ' active' : '') + '" data-status="' + id + '">' + U.esc(lb) + (n ? ' <em>' + n + '</em>' : '') + '</button>';
      }).join('') +
      '</div>';

    let listHTML;
    if (!S.data.projects.length) {
      listHTML =
        '<div class="empty tall"><div class="empty-icon">' + Icons.film + '</div>' +
        '<h3>Nog geen opdrachten</h3><p>Voeg je eerste VHXmedia-opdracht toe om je inkomsten en uren bij te houden.</p>' +
        '<button class="btn btn-gold" data-add>+ Opdracht toevoegen</button></div>';
    } else if (!list.length) {
      listHTML =
        '<div class="empty tall"><div class="empty-icon">' + Icons.search + '</div>' +
        '<h3>Geen resultaten</h3><p>Pas je zoekopdracht of filters aan.</p></div>';
    } else {
      listHTML = list.map(projectCard).join('');
    }

    root.innerHTML =
      '<section class="projects fade-in">' +
      '<header class="view-head row-between"><div><h2 class="page-title">Opdrachten</h2>' +
      '<p class="page-sub">' + list.length + ' van ' + S.data.projects.length + ' opdrachten</p></div>' +
      '<button class="btn btn-gold btn-sm head-add" data-add>' + Icons.plus + 'Nieuw</button></header>' +
      search +
      '<div class="toolbar-row">' + chips + sortSel + '</div>' +
      '<div class="stack-list proj-list">' + listHTML + '</div>' +
      '</section>';

    bind(root);
  }

  function projectCard(p) {
    const st = U.statusInfo(U.PROJECT_STATUS, p.status);
    const pay = U.statusInfo(U.PAYMENT_STATUS, p.paymentStatus);
    const client = App.clientName(p.clientId);
    const fh = Number(p.filmingHours) || 0;
    const eh = Number(p.editingHours) || 0;
    const h = fh + eh;
    const income = Number(p.income) || 0;
    const iph = h > 0 ? income / h : null;
    return (
      '<button type="button" class="proj-card card" data-proj="' + U.esc(p.id) + '">' +
      '<div class="proj-top">' +
      '<span class="row-title">' + U.esc(p.name) + '</span>' +
      '<span class="proj-income">' + U.esc(U.fmtMoney(income)) + '</span>' +
      '</div>' +
      '<div class="proj-mid">' + U.esc(client) + ' \u00B7 ' + U.esc(U.fmtDate(p.date)) + '</div>' +
      '<div class="proj-bot">' +
      '<span class="pill" style="--pc:' + st.color + '">' + U.esc(st.label) + '</span>' +
      '<span class="pill subtle" style="--pc:' + pay.color + '">' + U.esc(pay.label) + '</span>' +
      '<span class="proj-iph">' + (iph != null ? U.esc(U.fmtMoney(iph)) + '/u \u00B7 ' + U.esc(U.fmtNum(h, 1)) + ' u' : U.esc(U.fmtNum(h, 1)) + ' u') + '</span>' +
      '</div>' +
      '</button>'
    );
  }

  function bind(root) {
    const qInput = U.qs('#proj-q', root);
    if (qInput) {
      const handler = U.debounce(() => {
        App.state.projFilter.q = qInput.value;
        const pos = qInput.selectionStart;
        render(root);
        const ni = U.qs('#proj-q', root);
        if (ni) {
          ni.focus();
          try { ni.setSelectionRange(pos, pos); } catch (e) {}
        }
      }, 180);
      qInput.addEventListener('input', handler);
    }
    const clearBtn = U.qs('.clear-btn', root);
    if (clearBtn) clearBtn.addEventListener('click', () => {
      App.state.projFilter.q = '';
      render(root);
      U.qs('#proj-q', root).focus();
    });
    const sortSel = U.qs('#proj-sort', root);
    if (sortSel) sortSel.addEventListener('change', () => {
      App.state.projFilter.sort = sortSel.value;
      render(root);
    });
    U.qsa('[data-status]', root).forEach((b) =>
      b.addEventListener('click', () => {
        App.state.projFilter.status = b.getAttribute('data-status');
        render(root);
      })
    );
    U.qsa('[data-add]', root).forEach((b) => b.addEventListener('click', () => openForm(null)));
    U.qsa('[data-proj]', root).forEach((b) =>
      b.addEventListener('click', () => openDetail(b.getAttribute('data-proj')))
    );
  }

  window.Projects = { openForm, openDetail, removeProject };
  window.Views = window.Views || {};
  window.Views.projects = render;
})();
