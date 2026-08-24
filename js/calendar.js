(function () {
  const U = window.U;

  function cursor() {
    const c = App.state.calCursor;
    if (!c) {
      const n = new Date();
      return { y: n.getFullYear(), m: n.getMonth() };
    }
    return c;
  }

  function selected() {
    return App.state.calSelected || U.todayISO();
  }

  function eventsByDate() {
    const map = {};
    App.state.data.events.forEach((ev) => {
      if (!ev.date) return;
      (map[ev.date] = map[ev.date] || []).push({ kind: 'event', obj: ev });
    });
    App.state.data.projects.forEach((p) => {
      if (!p.date) return;
      (map[p.date] = map[p.date] || []).push({ kind: 'project', obj: p });
    });
    Object.keys(map).forEach((k) =>
      map[k].sort((a, b) => ((a.obj.startTime || '') < (b.obj.startTime || '') ? -1 : 1))
    );
    return map;
  }

  function render(root) {
    const cur = cursor();
    const sel = selected();
    const byDate = eventsByDate();

    const first = new Date(cur.y, cur.m, 1);
    const offset = (first.getDay() + 6) % 7;
    const dim = new Date(cur.y, cur.m + 1, 0).getDate();
    const totalCells = Math.ceil((offset + dim) / 7) * 7;

    let cells = '';
    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - offset + 1;
      const d = new Date(cur.y, cur.m, dayNum);
      const iso = U.dateToISO(d);
      const inMonth = dayNum >= 1 && dayNum <= dim;
      const marks = byDate[iso] || [];
      const hasEvent = marks.some((x) => x.kind === 'event');
      const hasProj = marks.some((x) => x.kind === 'project');
      cells +=
        '<button type="button" class="cal-cell' + (inMonth ? '' : ' out') +
        (iso === U.todayISO() ? ' today' : '') +
        (iso === sel ? ' selected' : '') + '" data-date="' + iso + '" aria-label="' + U.esc(U.fmtDate(iso)) + '">' +
        '<span class="cal-num">' + d.getDate() + '</span>' +
        '<span class="cal-dots" aria-hidden="true">' +
        (hasEvent ? '<i class="dot gold"></i>' : '') +
        (hasProj ? '<i class="dot sage"></i>' : '') +
        '</span></button>';
    }

    const dayItems = byDate[sel] || [];
    let panelHTML;
    if (!dayItems.length) {
      panelHTML =
        '<div class="empty slim"><h3>Geen afspraken</h3><p>Op deze dag staan geen afspraken of opdrachten gepland.</p></div>';
    } else {
      panelHTML = dayItems.map((it) => itemRow(it)).join('');
    }

    root.innerHTML =
      '<section class="calendar fade-in">' +
      '<header class="view-head row-between"><div><h2 class="page-title">Kalender</h2></div>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-today>Vandaag</button></header>' +

      '<div class="card cal-card">' +
      '<div class="cal-head">' +
      '<button type="button" class="icon-btn" data-prev aria-label="Vorige maand">' + Icons.chevronLeft + '</button>' +
      '<h3 class="cal-title">' + U.esc(U.monthTitle(cur.y, cur.m)) + '</h3>' +
      '<button type="button" class="icon-btn" data-next aria-label="Volgende maand">' + Icons.chevronRight + '</button>' +
      '</div>' +
      '<div class="cal-weekdays">' + U.DAYS_SHORT.map((d) => '<span>' + d + '</span>').join('') + '</div>' +
      '<div class="cal-grid">' + cells + '</div>' +
      '<div class="cal-legend"><span><i class="dot gold"></i>Afspraak</span><span><i class="dot sage"></i>Opdracht</span></div>' +
      '</div>' +

      '<div class="section-row"><h3 class="section-title">' + U.esc(U.fmtDateLong(sel)) + '</h3></div>' +
      '<div class="stack-list">' + panelHTML + '</div>' +
      '<div class="cal-actions">' +
      '<button type="button" class="btn btn-gold" data-add-event>' + Icons.plus + 'Afspraak</button>' +
      '<button type="button" class="btn btn-ghost" data-add-proj>' + Icons.film + 'Opdracht op deze dag</button>' +
      '</div>' +
      '</section>';

    bind(root);
  }

  function timeLabel(ev) {
    if (ev.startTime && ev.endTime) return ev.startTime + ' \u2013 ' + ev.endTime;
    if (ev.startTime) return 'vanaf ' + ev.startTime;
    return 'Hele dag';
  }

  function itemRow(it) {
    if (it.kind === 'project') {
      return projRowSafe(it.obj);
    }
    const ev = it.obj;
    return (
      '<div class="row-item card event-row">' +
      '<span class="status-dot gold" aria-hidden="true"></span>' +
      '<span class="row-main">' +
      '<span class="row-title">' + U.esc(ev.title) + '</span>' +
      '<span class="row-sub">' + U.esc(timeLabel(ev)) + (ev.linkedProjectId ? ' \u00B7 gekoppeld aan opdracht' : '') + '</span>' +
      (ev.description ? '<span class="row-desc">' + U.esc(ev.description) + '</span>' : '') +
      '</span>' +
      '<span class="row-actions">' +
      '<button type="button" class="icon-btn sm" data-edit-ev="' + U.esc(ev.id) + '" aria-label="Bewerken">' + Icons.edit + '</button>' +
      '<button type="button" class="icon-btn sm danger" data-del-ev="' + U.esc(ev.id) + '" aria-label="Verwijderen">' + Icons.trash + '</button>' +
      '</span>' +
      '</div>'
    );
  }

  function projRowSafe(p) {
    if (window.projRow) return projRow(p);
    const st = U.statusInfo(U.PROJECT_STATUS, p.status);
    return '<button type="button" class="row-item card" data-proj="' + U.esc(p.id) + '"><span class="status-dot" style="background:' + st.color + '"></span><span class="row-main"><span class="row-title">' + U.esc(p.name) + '</span><span class="row-sub">Opdracht \u00B7 ' + U.esc(U.fmtDate(p.date)) + '</span></span><span class="row-side"><span class="row-money">' + U.esc(U.fmtMoney(p.income)) + '</span></span></button>';
  }

  function eventFields() {
    return [
      { name: 'title', label: 'Titel', type: 'text', required: true },
      { name: 'date', label: 'Datum', type: 'date', required: true },
      { name: 'startTime', label: 'Starttijd', type: 'time' },
      { name: 'endTime', label: 'Eindtijd', type: 'time' },
      { name: 'description', label: 'Beschrijving', type: 'textarea', rows: 2 },
      {
        name: 'linkedProjectId',
        label: 'Gekoppelde opdracht',
        type: 'select',
        options: [{ value: '', label: 'Geen' }].concat(
          App.state.data.projects.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((p) => ({ value: p.id, label: p.name }))
        )
      }
    ];
  }

  function openEventForm(existing, defaults) {
    const sh = Sheet.open({ title: existing ? 'Afspraak bewerken' : 'Nieuwe afspraak', fullscreen: true });
    const cfg = eventFields();
    const vals = existing
      ? {
          title: existing.title,
          date: existing.date,
          startTime: existing.startTime || '',
          endTime: existing.endTime || '',
          description: existing.description || '',
          linkedProjectId: existing.linkedProjectId || ''
        }
      : Object.assign({ title: '', date: selected(), startTime: '', endTime: '', description: '', linkedProjectId: '' }, defaults || {});

    sh.body.innerHTML =
      '<form class="form" novalidate>' +
      cfg.map((f) => Forms.fieldRow(Object.assign({}, f, { value: vals[f.name] }))).join('') +
      '<div class="form-actions">' +
      '<button type="button" class="btn btn-ghost" data-cancel>Annuleren</button>' +
      '<button type="submit" class="btn btn-gold">' + (existing ? 'Wijzigingen opslaan' : 'Afspraak toevoegen') + '</button>' +
      '</div></form>';

    const form = U.qs('form', sh.body);
    U.qs('[data-cancel]', sh.body).addEventListener('click', () => sh.close());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      Forms.clearErrors(form);
      const res = Forms.readForm(form, cfg);
      if (res.ok && res.values.startTime && res.values.endTime && res.values.endTime <= res.values.startTime) {
        res.ok = false;
        Forms.showFieldError(form, 'endTime', 'Eindtijd moet na de starttijd liggen');
      }
      if (!res.ok) { toast('Controleer de gemarkeerde velden', 'error'); return; }
      const nowIso = new Date().toISOString();
      const rec = existing ? Object.assign({}, existing) : { id: U.uid(), createdAt: nowIso };
      rec.title = res.values.title.trim();
      rec.date = res.values.date;
      rec.startTime = res.values.startTime || null;
      rec.endTime = res.values.endTime || null;
      rec.description = (res.values.description || '').trim();
      rec.linkedProjectId = res.values.linkedProjectId || null;
      rec.updatedAt = nowIso;
      try {
        await App.upsertRecord('events', rec);
      } catch (err) {
        toast('Opslaan mislukt', 'error');
        return;
      }
      App.state.calCursor = { y: Number(rec.date.slice(0, 4)), m: Number(rec.date.slice(5, 7)) - 1 };
      App.state.calSelected = rec.date;
      sh.close();
      toast(existing ? 'Afspraak bijgewerkt' : 'Afspraak toegevoegd');
    });
  }

  function bind(root) {
    const cur = cursor();
    U.qs('[data-prev]', root).addEventListener('click', () => {
      const d = new Date(cur.y, cur.m - 1, 1);
      App.state.calCursor = { y: d.getFullYear(), m: d.getMonth() };
      render(root);
    });
    U.qs('[data-next]', root).addEventListener('click', () => {
      const d = new Date(cur.y, cur.m + 1, 1);
      App.state.calCursor = { y: d.getFullYear(), m: d.getMonth() };
      render(root);
    });
    U.qs('[data-today]', root).addEventListener('click', () => {
      const n = new Date();
      App.state.calCursor = { y: n.getFullYear(), m: n.getMonth() };
      App.state.calSelected = U.todayISO();
      render(root);
    });
    U.qsa('.cal-cell', root).forEach((c) =>
      c.addEventListener('click', () => {
        App.state.calSelected = c.getAttribute('data-date');
        render(root);
      })
    );
    U.qs('[data-add-event]', root).addEventListener('click', () => openEventForm(null));
    U.qs('[data-add-proj]', root).addEventListener('click', () =>
      Projects.openForm(null, { date: selected() })
    );
    U.qsa('[data-edit-ev]', root).forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const ev = App.state.data.events.find((x) => x.id === b.getAttribute('data-edit-ev'));
        if (ev) openEventForm(ev);
      })
    );
    U.qsa('[data-del-ev]', root).forEach((b) =>
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ev = App.state.data.events.find((x) => x.id === b.getAttribute('data-del-ev'));
        if (!ev) return;
        const ok = await confirmAction({
          title: 'Afspraak verwijderen',
          message: '"' + ev.title + '" wordt verwijderd uit je kalender.'
        });
        if (!ok) return;
        try {
          await App.removeRecord('events', ev.id);
          toast('Afspraak verwijderd');
        } catch (err) {
          toast('Verwijderen mislukt', 'error');
        }
      })
    );
    U.qsa('[data-proj]', root).forEach((b) =>
      b.addEventListener('click', () => Projects.openDetail(b.getAttribute('data-proj')))
    );
  }

  window.CalendarMod = { openEventForm };
  window.Views = window.Views || {};
  window.Views.calendar = render;
})();
