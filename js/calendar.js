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

  function projectsByDate() {
    const map = {};
    App.state.data.projects.forEach((p) => {
      if (!p.date) return;
      (map[p.date] = map[p.date] || []).push(p);
    });
    return map;
  }

  function render(root) {
    const cur = cursor();
    const sel = selected();
    const byDate = projectsByDate();

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
      cells +=
        '<button type="button" class="cal-cell' + (inMonth ? '' : ' out') +
        (iso === U.todayISO() ? ' today' : '') +
        (iso === sel ? ' selected' : '') + '" data-date="' + iso + '" aria-label="' + U.esc(U.fmtDate(iso)) + '">' +
        '<span class="cal-num">' + d.getDate() + '</span>' +
        '<span class="cal-dots" aria-hidden="true">' +
        (marks.length ? '<i class="dot gold"></i>' : '') +
        '</span></button>';
    }

    const dayItems = byDate[sel] || [];
    let panelHTML;
    if (!dayItems.length) {
      panelHTML =
        '<div class="empty slim"><h3>Geen opdrachten</h3><p>Op deze dag staan geen opdrachten gepland.</p></div>';
    } else {
      panelHTML = dayItems.map((p) => projRowSafe(p)).join('');
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
      '<div class="cal-legend"><span><i class="dot gold"></i>Opdracht</span></div>' +
      '</div>' +

      '<div class="section-row"><h3 class="section-title">' + U.esc(U.fmtDateLong(sel)) + '</h3></div>' +
      '<div class="stack-list">' + panelHTML + '</div>' +
      '<div class="cal-actions">' +
      '<button type="button" class="btn btn-gold btn-block" data-add-proj>' + Icons.plus + 'Opdracht op deze dag</button>' +
      '</div>' +
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
      '<span class="row-sub">' + U.esc(U.fmtDate(p.date)) + '</span></span>' +
      '<span class="row-side"><span class="row-money">' + U.esc(U.fmtMoney(p.income)) + '</span>' +
      '<span class="pill" style="--pc:' + st.color + '">' + U.esc(st.label) + '</span></span>' +
      '</button>'
    );
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
    U.qs('[data-add-proj]', root).addEventListener('click', () =>
      Projects.openForm(null, { date: selected() })
    );
    U.qsa('[data-proj]', root).forEach((b) =>
      b.addEventListener('click', () => Projects.openDetail(b.getAttribute('data-proj')))
    );
  }

  window.Views = window.Views || {};
  window.Views.calendar = render;
})();
