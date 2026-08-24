(function () {
  const U = window.U;

  function dashPeriod() {
    const t = App.state.dashPeriod;
    const y = new Date().getFullYear();
    if (t === 'year') return Stats.periodRange({ type: 'year', y });
    if (t === 'all') return Stats.periodRange({ type: 'all' });
    return Stats.periodRange({ type: 'month' });
  }

  function periodLabel(r) {
    const t = App.state.dashPeriod;
    if (t === 'year') return r.label;
    if (t === 'all') return 'aller tijden';
    return r.label;
  }

  function render(root) {
    const S = App.state;
    const r = dashPeriod();
    const sum = Stats.summarize(S.data, r);
    const goal = Stats.goalInfo(S.settings, S.data.projects);
    const name = S.settings.userName || 'Liam';
    const curYear = new Date().getFullYear();

    const chips =
      '<div class="chip-row seg" role="tablist" aria-label="Periode">' +
      [['month', 'Deze maand'], ['year', 'Dit jaar'], ['all', 'Alles']].map(([id, lb]) =>
        '<button type="button" class="chip' + (S.dashPeriod === id ? ' active' : '') + '" data-period="' + id + '" role="tab" aria-selected="' + (S.dashPeriod === id) + '">' + lb + '</button>'
      ).join('') +
      '</div>';

    const hero =
      '<div class="card hero-card" data-nav="finance">' +
      '<div class="card-label">' + U.esc('Totale inkomsten') + '</div>' +
      '<div class="big-number">' + U.esc(U.fmtMoney(sum.total)) + '</div>' +
      '<div class="hero-meta">' + U.esc(periodLabel(r)) + '</div>' +
      '</div>';

    const minis = [
      ['VHXmedia', U.fmtMoney(sum.vhx), 'gold'],
      ['Overig', U.fmtMoney(sum.other), ''],
      ['Uitgaven', U.fmtMoney(sum.expenses), 'neg'],
      ['Netto', U.fmtMoney(sum.net), 'pos']
    ].map(([lb, val, cls]) =>
      '<button type="button" class="stat-card ' + cls + '" data-nav="finance">' +
      '<span class="stat-label">' + lb + '</span>' +
      '<span class="stat-value">' + U.esc(val) + '</span>' +
      '</button>'
    ).join('');

    let goalInner;
    if (!goal.target) {
      goalInner =
        '<div class="goal-head"><span class="card-label">VHXmedia doel</span></div>' +
        '<p class="goal-empty-text">Er is nog geen jaardoel ingesteld.</p>' +
        '<button class="btn btn-gold btn-sm" data-action="set-goal">Doel instellen</button>';
    } else {
      goalInner =
        '<div class="goal-head">' +
        '<span class="card-label">VHXmedia doel ' + goal.year + '</span>' +
        '<span class="goal-pct">' + U.esc(U.fmtPct(goal.rawPct)) + '</span>' +
        '</div>' +
        '<div class="goal-nums">' + U.esc(U.fmtMoney(goal.current)) + ' <span class="goal-of">/ ' + U.esc(U.fmtMoney(goal.target)) + '</span></div>' +
        '<div class="progress" role="progressbar" aria-valuenow="' + Math.round(goal.pct) + '" aria-valuemin="0" aria-valuemax="100">' +
        '<div class="progress-fill' + (goal.exceeded ? ' full' : '') + '" data-w="' + Math.min(100, goal.pct) + '" style="width:0%"></div>' +
        '</div>' +
        '<p class="goal-rem">' + (goal.exceeded ? 'Doel behaald \uD83C\uDF89' : U.esc(U.fmtMoney(goal.remaining)) + ' resterend') + '</p>';
    }

    const bestM = sum.bestMonth;
    const perf = [
      ['Gemiddeld per maand', sum.avgMonth != null ? U.fmtMoney(sum.avgMonth) : '\u2013', U.esc(periodLabel(r))],
      ['Beste maand', bestM ? U.esc(bestM.label) : '\u2013', bestM ? U.esc(U.fmtMoney(bestM.value)) : 'nog geen gegevens'],
      ['Inkomen per uur', sum.incomePerHour != null ? U.esc(U.fmtMoney(sum.incomePerHour)) : 'Geen uren', 'VHXmedia'],
      ['Openstaand', U.esc(U.fmtMoney(sum.outstanding)), 'nog te ontvangen']
    ].map(([lb, v, sub]) =>
      '<div class="perf-tile card"><span class="stat-label">' + lb + '</span><span class="perf-value">' + v + '</span><span class="perf-sub">' + sub + '</span></div>'
    ).join('');

    const buckets = Stats.monthBuckets(S.data, curYear);
    const hasChartData = buckets.some((b) => b.total > 0 || b.expenses > 0);
    let chartHTML;
    if (!hasChartData) {
      chartHTML = '<div class="chart-empty">' + U.esc('Nog geen inkomsten in ' + curYear + '.') + '</div>';
    } else {
      chartHTML = Charts.stackedBars({
        labels: buckets.map((b) => b.label),
        series: [
          { name: 'VHXmedia', color: '#d4903b', values: buckets.map((b) => b.vhx) },
          { name: 'Overig', color: '#5f8763', values: buckets.map((b) => b.other) }
        ],
        height: 200,
        label: 'Maandelijkse inkomsten ' + curYear
      });
    }

    const recent = S.data.projects.slice()
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 4);

    let recentHTML;
    if (!recent.length) {
      recentHTML = '<div class="empty slim"><h3>Nog geen opdrachten</h3><p>Voeg je eerste VHXmedia-opdracht toe om je inkomsten bij te houden.</p><button class="btn btn-gold btn-sm" data-action="add-project">+ Opdracht toevoegen</button></div>';
    } else {
      recentHTML = recent.map((p) => projRow(p)).join('');
    }

    const todayISOStr = U.todayISO();
    const upcoming = [];
    S.data.events.forEach((ev) => {
      if (ev.date && ev.date >= todayISOStr) upcoming.push({ kind: 'event', date: ev.date, time: ev.startTime || '', obj: ev });
    });
    S.data.projects.forEach((p) => {
      if (p.date && p.date >= todayISOStr) upcoming.push({ kind: 'project', date: p.date, time: '', obj: p });
    });
    upcoming.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
    const next4 = upcoming.slice(0, 4);

    let upHTML;
    if (!next4.length) {
      upHTML = '<div class="empty slim"><h3>Niets gepland</h3><p>Er staan geen komende afspraken of opdrachten in je kalender.</p><button class="btn btn-ghost btn-sm" data-action="go-calendar">Kalender openen</button></div>';
    } else {
      upHTML = next4.map((it) => {
        const d = U.parseISO(it.date);
        const day = d.getDate();
        const mon = U.MONTHS_SHORT[d.getMonth()].toUpperCase();
        if (it.kind === 'event') {
          return '<button type="button" class="up-row card" data-event="' + U.esc(it.obj.id) + '">' +
            '<span class="up-date"><b>' + day + '</b>' + mon + '</span>' +
            '<span class="up-main"><span class="up-title">' + U.esc(it.obj.title) + '</span>' +
            '<span class="up-sub">' + (it.obj.startTime ? U.esc(it.obj.startTime) + (it.obj.endTime ? ' \u2013 ' + U.esc(it.obj.endTime) : '') : 'Afspraak') + '</span></span>' +
            Icons.chevronRight + '</button>';
        }
        return '<button type="button" class="up-row card" data-proj="' + U.esc(it.obj.id) + '">' +
          '<span class="up-date proj"><b>' + day + '</b>' + mon + '</span>' +
          '<span class="up-main"><span class="up-title">' + U.esc(it.obj.name) + '</span>' +
          '<span class="up-sub">Opdracht</span></span>' +
          Icons.chevronRight + '</button>';
      }).join('');
    }

    root.innerHTML =
      '<section class="dash fade-in">' +
      '<header class="view-head"><div>' +
      '<h2 class="greeting">' + U.esc(U.greeting()) + ', ' + U.esc(name) + '</h2>' +
      '<p class="date-sub">' + U.esc(U.fmtDateLong(new Date())) + '</p>' +
      '</div></header>' +
      chips +
      hero +
      '<div class="mini-grid">' + minis + '</div>' +
      '<div class="card goal-card">' + goalInner + '</div>' +
      '<div class="perf-grid">' + perf + '</div>' +
      '<div class="card chart-card">' +
      '<div class="chart-head"><h3 class="section-title">Inkomsten per maand <span class="muted">' + curYear + '</span></h3>' +
      '<div class="legend"><span class="legend-item"><i style="background:#d4903b"></i>VHXmedia</span><span class="legend-item"><i style="background:#5f8763"></i>Overig</span></div></div>' +
      chartHTML +
      '</div>' +
      '<div class="section-row"><h3 class="section-title">Recente opdrachten</h3><button type="button" class="link-btn" data-nav="projects">Alles bekijken</button></div>' +
      '<div class="stack-list">' + recentHTML + '</div>' +
      '<div class="section-row"><h3 class="section-title">Komende afspraken</h3><button type="button" class="link-btn" data-nav="calendar">Kalender</button></div>' +
      '<div class="stack-list">' + upHTML + '</div>' +
      '</section>';

    animateProgress(root);
    bind(root);
  }

  function animateProgress(scope) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        U.qsa('.progress-fill[data-w]', scope).forEach((el) => {
          el.style.width = el.getAttribute('data-w') + '%';
        });
      });
    });
  }

  function projRow(p) {
    const st = U.statusInfo(U.PROJECT_STATUS, p.status);
    const client = App.clientName(p.clientId);
    return (
      '<button type="button" class="row-item card" data-proj="' + U.esc(p.id) + '">' +
      '<span class="status-dot" style="background:' + st.color + '" aria-hidden="true"></span>' +
      '<span class="row-main">' +
      '<span class="row-title">' + U.esc(p.name) + '</span>' +
      '<span class="row-sub">' + U.esc(client) + ' \u00B7 ' + U.esc(U.fmtDate(p.date)) + '</span>' +
      '</span>' +
      '<span class="row-side"><span class="row-money">' + U.esc(U.fmtMoney(p.income)) + '</span>' +
      '<span class="pill" style="--pc:' + st.color + '">' + U.esc(st.label) + '</span></span>' +
      '</button>'
    );
  }
  window.projRow = projRow;

  function bind(root) {
    U.qsa('[data-period]', root).forEach((b) =>
      b.addEventListener('click', () => {
        App.state.dashPeriod = b.getAttribute('data-period');
        render(root);
      })
    );
    U.qsa('[data-nav]', root).forEach((b) =>
      b.addEventListener('click', () => App.go(b.getAttribute('data-nav')))
    );
    U.qsa('[data-proj]', root).forEach((b) =>
      b.addEventListener('click', () => Projects.openDetail(b.getAttribute('data-proj')))
    );
    U.qsa('[data-event]', root).forEach((b) =>
      b.addEventListener('click', () => {
        const ev = App.state.data.events.find((e) => e.id === b.getAttribute('data-event'));
        if (ev) CalendarMod.openEventForm(ev);
      })
    );
    const gp = U.qs('[data-action=set-goal]', root);
    if (gp) gp.addEventListener('click', () => More.openGoalEditor(() => render(root)));
    const ap = U.qs('[data-action=add-project]', root);
    if (ap) ap.addEventListener('click', () => Projects.openForm(null));
    const gc = U.qs('[data-action=go-calendar]', root);
    if (gc) gc.addEventListener('click', () => App.go('calendar'));
  }

  window.Views = window.Views || {};
  window.Views.dashboard = render;
})();
