(function () {
  const U = window.U;

  function fields() {
    return [
      { name: 'name', label: 'Naam', type: 'text', required: true, placeholder: 'bijv. Bedrijfsfilm Sheraton' },
      { name: 'date', label: 'Datum', type: 'date', required: true },
      { name: 'income', label: 'Inkomen (\u20AC)', type: 'number', step: '0.01', min: 0, placeholder: '0,00' },
      { name: 'hours', label: 'Uren', type: 'number', step: '0.25', min: 0, placeholder: '0' },
      { name: 'notes', label: 'Notities', type: 'textarea', rows: 2 }
    ];
  }

  function hoursRaw(p) {
    if (!p) return '';
    if (p.hours != null && p.hours !== '') return String(p.hours);
    const f = Number(p.filmingHours) || 0;
    const e = Number(p.editingHours) || 0;
    return (f + e) > 0 ? String(f + e) : '';
  }

  function valuesOf(p) {
    return {
      name: p ? p.name : '',
      date: p && p.date ? p.date : U.todayISO(),
      income: p ? String(p.income != null ? p.income : '') : '',
      hours: hoursRaw(p),
      notes: p ? p.notes || '' : ''
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
      '<button type="submit" class="btn btn-gold">' + (existing ? 'Opslaan' : 'Toevoegen') + '</button>' +
      '</div></form>';

    const form = U.qs('form', sh.body);
    U.qs('[data-cancel]', sh.body).addEventListener('click', () => sh.close());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      Forms.clearErrors(form);
      const res = Forms.readForm(form, cfg);
      if (!res.ok) { toast('Controleer de gemarkeerde velden', 'error'); return; }
      const v = res.values;
      const nowIso = new Date().toISOString();
      const rec = existing ? Object.assign({}, existing) : { id: U.uid(), createdAt: nowIso };
      rec.name = v.name.trim();
      rec.date = v.date;
      rec.income = v.income != null ? v.income : 0;
      rec.hours = v.hours != null ? v.hours : 0;
      rec.notes = (v.notes || '').trim();
      rec.updatedAt = nowIso;
      try {
        await App.upsertRecord('projects', rec);
      } catch (err) {
        toast('Opslaan mislukt', 'error');
        return;
      }
      sh.close();
      toast(existing ? 'Opdracht bijgewerkt' : 'Opdracht toegevoegd');
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
      const income = Number(p.income) || 0;
      const h = U.projectHours(p);
      const iph = h > 0 ? income / h : null;

      sh.body.innerHTML =
        '<div class="detail">' +
        '<div class="pill-row"><span class="pill" style="--pc:' + st.color + '">' + U.esc(st.label) + '</span></div>' +
        '<div class="detail-money">' + U.esc(U.fmtMoney(income)) + '</div>' +
        '<p class="iph-line">' + (iph != null
          ? '\u20AC ' + U.esc(U.fmtNum(iph, 2)) + ' per uur \u00B7 ' + U.esc(U.fmtNum(h, 1)) + ' uur'
          : 'Voer je uren in om je uurtarief te zien.') + '</p>' +

        '<div class="card detail-card"><div class="chip-row seg scroll">' +
        U.PROJECT_STATUS.map((s) =>
          '<button type="button" class="chip sm' + (p.status === s.id ? ' active' : '') + '" data-set-status="' + s.id + '">' + U.esc(s.label) + '</button>'
        ).join('') +
        '</div></div>' +

        '<div class="card detail-card meta-list">' +
        mrow(Icons.calendar, 'Datum', U.esc(U.fmtDate(p.date))) +
        mrow(Icons.clock, 'Uren', U.esc(U.fmtNum(h, 1))) +
        mrow(Icons.trendingUp, 'Per uur', iph != null ? U.esc(U.fmtMoney(iph)) : '\u2013') +
        '</div>' +

        (p.notes ? '<h3 class="section-title">Notities</h3><div class="card detail-card text-block"><p>' + U.esc(p.notes) + '</p></div>' : '') +

        '<div class="detail-actions">' +
        '<button class="btn btn-gold" data-edit>' + Icons.edit + 'Bewerken</button>' +
        '<button class="btn btn-danger-ghost" data-del>' + Icons.trash + 'Verwijderen</button>' +
        '</div></div>';

      U.qsa('[data-set-status]', sh.body).forEach((b) =>
        b.addEventListener('click', async () => {
          await App.patchRecord('projects', id, { status: b.getAttribute('data-set-status') });
          draw();
        })
      );
      U.qs('[data-edit]', sh.body).addEventListener('click', () => openForm(build(), null, draw));
      U.qs('[data-del]', sh.body).addEventListener('click', async () => {
        const ok = await confirmAction({
          title: 'Opdracht verwijderen',
          message: '"' + p.name + '" wordt definitief verwijderd.'
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

  async function removeProject(id) {
    try {
      await App.removeRecord('projects', id);
      toast('Opdracht verwijderd');
    } catch (e) {
      toast('Verwijderen mislukt', 'error');
    }
  }

  window.Projects = { openForm, openDetail, removeProject };
})();
