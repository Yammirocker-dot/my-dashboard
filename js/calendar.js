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

  function filterQuery() {
    return (App.state.calFilter || '').trim();
  }

  function projectsByDate() {
    const map = {};
    App.state.data.projects.forEach((p) => {
      if (!p.date) return;
      (map[p.date] = map[p.date] || []).push(p);
    });
    return map;
  }

  function meetingsByDate(meetings) {
    const map = {};
    (meetings || []).forEach((m) => {
      if (!m || !m.date) return;
      (map[m.date] = map[m.date] || []).push(m);
    });
    Object.keys(map).forEach((k) =>
      map[k].sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')))
    );
    return map;
  }

  function searchMatches(q) {
    const needle = q.toLowerCase();
    return App.state.data.projects
      .filter((p) =>
        ((p.name || '') + ' ' + (p.client || '')).toLowerCase().indexOf(needle) !== -1)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  function render(root) {
    DB.getAll('meetings').then((mts) => drawCal(root, Array.isArray(mts) ? mts : []));
  }

  function drawCal(root, meetings) {
    const cur = cursor();
    const sel = selected();
    const byDate = projectsByDate();
    const mebyDate = meetingsByDate(meetings);
    const qRaw = filterQuery();
    const q = qRaw.toLowerCase();
    const filtering = q.length > 0;
    const matches = filtering ? searchMatches(qRaw) : [];

    let cells = '';
    if (!filtering) {
      const first = new Date(cur.y, cur.m, 1);
      const offset = (first.getDay() + 6) % 7;
      const dim = new Date(cur.y, cur.m + 1, 0).getDate();
      const totalCells = Math.ceil((offset + dim) / 7) * 7;

      for (let i = 0; i < totalCells; i++) {
        const dayNum = i - offset + 1;
        const d = new Date(cur.y, cur.m, dayNum);
        const iso = U.dateToISO(d);
        const inMonth = dayNum >= 1 && dayNum <= dim;
        const marks = byDate[iso] || [];
        const meets = mebyDate[iso] || [];
        cells +=
          '<button type="button" class="cal-cell' + (inMonth ? '' : ' out') +
          (iso === U.todayISO() ? ' today' : '') +
          (iso === sel ? ' selected' : '') + '" data-date="' + iso + '" aria-label="' + U.esc(U.fmtDate(iso)) + '">' +
          '<span class="cal-num">' + d.getDate() + '</span>' +
          '<span class="cal-dots" aria-hidden="true">' +
          (marks.length ? '<i class="dot gold"></i>' : '') +
          (meets.length ? '<i class="dot meet"></i>' : '') +
          '</span></button>';
      }
    }

    let panelHTML;
    let panelTitle;
    if (filtering) {
      panelTitle = 'Resultaten <span class="muted">(' + matches.length + ')</span>';
      panelHTML = matches.length
        ? matches.map((p) => projRowSafe(p)).join('')
        : '<div class="empty slim"><h3>Niets gevonden</h3><p>Geen opdrachten voor \u201C' + U.esc(qRaw) + '\u201D.</p></div>';
    } else {
      panelTitle = U.esc(U.fmtDateLong(sel));
      const dayItems = byDate[sel] || [];
      const dayMeets = mebyDate[sel] || [];
      const rows =
        dayMeets.map(meetingRow).join('') +
        dayItems.map((p) => projRowSafe(p)).join('');
      panelHTML = rows ||
        '<div class="empty slim"><h3>Geen afspraken</h3><p>Op deze dag staan geen meetings of opdrachten gepland.</p></div>';
    }

    root.innerHTML =
      '<section class="calendar fade-in">' +
      '<header class="view-head row-between"><div><h2 class="page-title">Kalender</h2></div>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-today>Vandaag</button></header>' +

      '<div class="search-box">' +
      Icons.search +
      '<input type="search" id="cal-q" placeholder="Zoek op naam of klant\u2026"' +
      ' value="' + U.esc(App.state.calFilter || '') + '" autocomplete="off" aria-label="Zoek opdrachten">' +
      (filtering ? '<button type="button" class="clear-btn" aria-label="Zoekopdracht wissen">' + Icons.x + '</button>' : '') +
      '</div>' +

      (filtering ? '' :
      '<div class="card cal-card">' +
      '<div class="cal-head">' +
      '<button type="button" class="icon-btn" data-prev aria-label="Vorige maand">' + Icons.chevronLeft + '</button>' +
      '<h3 class="cal-title">' + U.esc(U.monthTitle(cur.y, cur.m)) + '</h3>' +
      '<button type="button" class="icon-btn" data-next aria-label="Volgende maand">' + Icons.chevronRight + '</button>' +
      '</div>' +
      '<div class="cal-weekdays">' + U.DAYS_SHORT.map((d) => '<span>' + d + '</span>').join('') + '</div>' +
      '<div class="cal-grid">' + cells + '</div>' +
      '<div class="cal-legend">' +
      '<span><i class="dot gold"></i>Opdracht</span>' +
      '<span><i class="dot meet"></i>Meeting</span>' +
      '</div>' +
      '</div>') +

      '<div class="section-row"><h3 class="section-title">' + panelTitle + '</h3></div>' +
      '<div class="stack-list">' + panelHTML + '</div>' +

      (filtering ? '' :
      '<div class="cal-actions">' +
      '<button type="button" class="btn btn-gold btn-block" data-add-proj>' + Icons.plus + 'Opdracht</button>' +
      '<button type="button" class="btn btn-ghost btn-block" data-add-meet>' + Icons.clock + 'Meeting</button>' +
      '</div>') +
      '</section>';

    bind(root);
  }

  function projRowSafe(p) {
    if (window.projRow) {
      const d = U.parseISO(p.date);
      return window.projRow(p, d ? d.getDate() : '?', d ? U.MONTHS_SHORT[d.getMonth()].toUpperCase() : '');
    }
    const st = U.statusInfo(U.PROJECT_STATUS, p.status);
    return (
      '<button type="button" class="up-row card" data-proj="' + U.esc(p.id) + '">' +
      '<span class="row-main"><span class="row-title">' + U.esc(p.name) + '</span>' +
      '<span class="row-sub">' + U.esc(p.date ? U.fmtDate(p.date) : 'Geen datum') + '</span></span>' +
      '<span class="row-side"><span class="row-money">' + U.esc(U.fmtMoney(p.income)) + '</span>' +
      '<span class="pill" style="--pc:' + st.color + '">' + U.esc(st.label) + '</span></span>' +
      '</button>'
    );
  }

  function meetingRow(m) {
    return (
      '<button type="button" class="up-row card meet-row" data-meeting="' + U.esc(m.id) + '">' +
      '<span class="row-main"><span class="row-title">' + U.esc(m.subject || 'Meeting') + '</span>' +
      '<span class="row-sub">' + U.esc(m.client || 'Zonder klant') + (m.notes ? ' \u00B7 ' + U.esc(m.notes) : '') + '</span></span>' +
      '<span class="row-side"><span class="meet-chip">' + Icons.clock + U.esc(m.time || '--:--') + '</span></span>' +
      '</button>'
    );
  }

  function meetingForm(existing, presetDate) {
    const sh = Sheet.open({ title: existing ? 'Meeting bewerken' : 'Nieuwe meeting', fullscreen: true });
    sh.body.innerHTML =
      '<form id="meet-form" autocomplete="off">' +
      Forms.fieldRow({ name: 'subject', label: 'Onderwerp', type: 'text', required: true, value: existing ? existing.subject || '' : '', placeholder: 'bv. Briefing commercial' }) +
      Forms.fieldRow({ name: 'client', label: 'Klant', type: 'text', required: true, value: existing ? existing.client || '' : '', placeholder: 'bv. Sheraton' }) +
      Forms.fieldRow({ name: 'date', label: 'Datum', type: 'date', required: true, value: existing && existing.date ? existing.date : presetDate || '' }) +
      Forms.fieldRow({ name: 'time', label: 'Uur', type: 'time', required: true, value: existing && existing.time ? existing.time : '10:00' }) +
      Forms.fieldRow({ name: 'notes', label: 'Notitie (optioneel)', type: 'textarea', rows: 2, value: existing ? existing.notes || '' : '', placeholder: 'bv. Locatie, voor te bereiden punten\u2026' }) +
      '<div class="form-actions column">' +
      '<button type="submit" class="btn btn-gold btn-block">' + Icons.check + (existing ? 'Opslaan' : 'Meeting plannen') + '</button>' +
      (existing ? '<button type="button" class="btn btn-ghost btn-block danger-text" data-meet-del>' + Icons.trash + 'Verwijderen</button>' : '') +
      '<button type="button" class="btn btn-ghost btn-block" data-cancel>Annuleren</button>' +
      '</div>' +
      '</form>';

    const form = U.qs('#meet-form', sh.body);
    if (window.App && App.attachClientAutocomplete) {
      const cliInput = form.elements['client'];
      if (cliInput) App.attachClientAutocomplete(cliInput);
    }
    U.qs('[data-cancel]', sh.body).addEventListener('click', () => sh.close());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      Forms.clearErrors(form);
      const res = Forms.readForm(form, [
        { name: 'subject', label: 'Onderwerp', type: 'text', required: true },
        { name: 'client', label: 'Klant', type: 'text', required: true },
        { name: 'date', label: 'Datum', type: 'date', required: true },
        { name: 'time', label: 'Uur', type: 'time', required: true },
        { name: 'notes', label: 'Notitie', type: 'text' }
      ]);
      if (!res.ok) { toast('Controleer de gemarkeerde velden', 'error'); return; }
      const v = res.values;
      try {
        const rec = existing
          ? Object.assign({}, existing)
          : { id: 'mt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: new Date().toISOString() };
        rec.subject = v.subject.trim();
        rec.client = v.client.trim();
        rec.date = v.date;
        rec.time = v.time;
        rec.notes = (v.notes || '').trim();
        await DB.put('meetings', rec);
        sh.close();
        toast(existing ? 'Meeting bijgewerkt' : 'Meeting gepland');
        const view = document.getElementById('view');
        if (view && window.Views[App.state.route]) Views[App.state.route](view);
      } catch (err) {
        toast('Opslaan mislukt', 'error');
      }
    });
    const del = U.qs('[data-meet-del]', sh.body);
    if (del) {
      del.addEventListener('click', async () => {
        try {
          await DB.delete('meetings', existing.id);
          sh.close();
          toast('Meeting verwijderd');
          const view = document.getElementById('view');
          if (view && window.Views[App.state.route]) Views[App.state.route](view);
        } catch (e) {
          toast('Verwijderen mislukt', 'error');
        }
      });
    }
  }

  function bind(root) {
    const cur = cursor();

    const prevBtn = U.qs('[data-prev]', root);
    if (prevBtn) prevBtn.addEventListener('click', () => {
      const d = new Date(cur.y, cur.m - 1, 1);
      App.state.calCursor = { y: d.getFullYear(), m: d.getMonth() };
      render(root);
    });
    const nextBtn = U.qs('[data-next]', root);
    if (nextBtn) nextBtn.addEventListener('click', () => {
      const d = new Date(cur.y, cur.m + 1, 1);
      App.state.calCursor = { y: d.getFullYear(), m: d.getMonth() };
      render(root);
    });
    U.qs('[data-today]', root).addEventListener('click', () => {
      const n = new Date();
      App.state.calCursor = { y: n.getFullYear(), m: n.getMonth() };
      App.state.calSelected = U.todayISO();
      App.state.calFilter = '';
      render(root);
    });
    U.qsa('.cal-cell', root).forEach((c) =>
      c.addEventListener('click', () => {
        App.state.calSelected = c.getAttribute('data-date');
        render(root);
      })
    );
    const addBtn = U.qs('[data-add-proj]', root);
    if (addBtn) addBtn.addEventListener('click', () =>
      Projects.openForm(null, { date: selected() })
    );
    const addMeetBtn = U.qs('[data-add-meet]', root);
    if (addMeetBtn) addMeetBtn.addEventListener('click', () =>
      meetingForm(null, selected())
    );
    U.qsa('[data-proj]', root).forEach((b) =>
      b.addEventListener('click', () => Projects.openDetail(b.getAttribute('data-proj')))
    );
    U.qsa('[data-meeting]', root).forEach((b) =>
      b.addEventListener('click', () => {
        DB.get('meetings', b.getAttribute('data-meeting')).then((m) => {
          if (m) meetingForm(m);
        });
      })
    );

    const qInput = U.qs('#cal-q', root);
    if (qInput) {
      let t = null;
      qInput.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          const pos = qInput.selectionStart;
          App.state.calFilter = qInput.value;
          render(root);
          const ni = U.qs('#cal-q', root);
          if (ni && ni.value.length) {
            ni.focus();
            try { ni.setSelectionRange(pos, pos); } catch (e) { /* noop */ }
          }
        }, 200);
      });
    }
    const clearBtn = U.qs('.clear-btn', root);
    if (clearBtn) clearBtn.addEventListener('click', () => {
      App.state.calFilter = '';
      render(root);
      const ni = U.qs('#cal-q', root);
      if (ni) ni.focus();
    });
  }

  window.Views = window.Views || {};
  window.Views.calendar = render;
  window.Meetings = { openForm: meetingForm };
})();
