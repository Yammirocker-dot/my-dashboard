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

  function searchMatches(q) {
    const needle = q.toLowerCase();
    return App.state.data.projects
      .filter((p) =>
        ((p.name || '') + ' ' + (p.client || '')).toLowerCase().indexOf(needle) !== -1)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  function render(root) {
    const cur = cursor();
    const sel = selected();
    const byDate = projectsByDate();
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
        cells +=
          '<button type="button" class="cal-cell' + (inMonth ? '' : ' out') +
          (iso === U.todayISO() ? ' today' : '') +
          (iso === sel ? ' selected' : '') + '" data-date="' + iso + '" aria-label="' + U.esc(U.fmtDate(iso)) + '">' +
          '<span class="cal-num">' + d.getDate() + '</span>' +
          '<span class="cal-dots" aria-hidden="true">' +
          (marks.length ? '<i class="dot gold"></i>' : '') +
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
      panelHTML = dayItems.length
        ? dayItems.map((p) => projRowSafe(p)).join('')
        : '<div class="empty slim"><h3>Geen opdrachten</h3><p>Op deze dag staan geen opdrachten gepland.</p></div>';
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
      '<div class="cal-legend"><span><i class="dot gold"></i>Opdracht</span></div>' +
      '</div>') +

      '<div class="section-row"><h3 class="section-title">' + panelTitle + '</h3></div>' +
      '<div class="stack-list">' + panelHTML + '</div>' +

      (filtering ? '' :
      '<div class="cal-actions">' +
      '<button type="button" class="btn btn-gold btn-block" data-add-proj>' + Icons.plus + 'Opdracht op deze dag</button>' +
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
    U.qsa('[data-proj]', root).forEach((b) =>
      b.addEventListener('click', () => Projects.openDetail(b.getAttribute('data-proj')))
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
})();
