(function () {
  const U = window.U;

  function dashRange() {
    const t = App.state.dashPeriod;
    const y = new Date().getFullYear();
    if (t === 'year') return Stats.periodRange({ type: 'year', y });
    if (t === 'all') return Stats.periodRange({ type: 'all' });
    return Stats.periodRange({ type: 'month' });
  }

  function render(root) {
    const S = App.state;
    const r = dashRange();
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
      '<div class="card hero-card static">' +
      '<div class="card-label">Totale inkomsten</div>' +
      '<div class="big-number">' + U.esc(U.fmtMoney(sum.income)) + '</div>' +
      '<div class="hero-meta">' + U.esc(r.label) + '</div>' +
      '</div>';

    const minis = [
      ['Uren', U.fmtNum(sum.hoursTotal, 1)],
      ['Per uur', sum.incomePerHour != null ? U.fmtMoney(sum.incomePerHour) : '\u2013'],
      ['Opdrachten', String(sum.projectCount)],
      ['Gem. per maand', sum.avgMonth != null ? U.fmtMoney(sum.avgMonth) : '\u2013']
    ].map(([lb, val]) =>
      '<div class="stat-card"><span class="stat-label">' + lb + '</span><span class="stat-value">' + U.esc(String(val)) + '</span></div>'
    ).join('');

    let goalInner;
    if (!goal.target) {
      goalInner =
        '<div class="goal-head"><span class="card-label">Jaardoel</span></div>' +
        '<p class="goal-empty-text">Er is nog geen jaardoel ingesteld.</p>' +
        '<button class="btn btn-gold btn-sm" data-action="set-goal">Doel instellen</button>';
    } else {
      goalInner =
        '<div class="goal-head">' +
        '<span class="card-label">Jaardoel ' + goal.year + '</span>' +
        '<span class="goal-pct">' + U.esc(U.fmtPct(goal.rawPct)) + '</span>' +
        '</div>' +
        '<div class="goal-nums">' + U.esc(U.fmtMoney(goal.current)) + ' <span class="goal-of">/ ' + U.esc(U.fmtMoney(goal.target)) + '</span></div>' +
        '<div class="progress" role="progressbar" aria-valuenow="' + Math.round(goal.pct) + '" aria-valuemin="0" aria-valuemax="100">' +
        '<div class="progress-fill' + (goal.exceeded ? ' full' : '') + '" data-w="' + Math.min(100, goal.pct) + '" style="width:0%"></div>' +
        '</div>' +
        '<p class="goal-rem">' + (goal.exceeded ? 'Doel behaald \uD83C\uDF89' : U.esc(U.fmtMoney(goal.remaining)) + ' resterend') + '</p>';
    }

    const buckets = Stats.monthBuckets(S.data, curYear);
    const hasChartData = buckets.some((b) => b.income > 0);
    let chartHTML;
    if (!hasChartData) {
      chartHTML = '<div class="chart-empty">' + U.esc('Nog geen inkomsten in ' + curYear + '.') + '</div>';
    } else {
      chartHTML = Charts.stackedBars({
        labels: buckets.map((b) => b.label),
        series: [
          { name: 'Inkomsten', color: '#d4903b', values: buckets.map((b) => b.income) }
        ],
        height: 200,
        label: 'Maandelijkse inkomsten ' + curYear
      });
    }

    const todayISOStr = U.todayISO();
    const upcoming = S.data.projects
      .filter((p) => p.date && p.date >= todayISOStr)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4);

    let upHTML;
    if (!upcoming.length) {
      upHTML =
        '<div class="empty slim"><h3>Niets gepland</h3><p>Er staan geen komende opdrachten in je kalender.</p>' +
        '<button class="btn btn-ghost btn-sm" data-action="go-calendar">Kalender openen</button></div>';
    } else {
      upHTML = upcoming.map((p) => {
        const d = U.parseISO(p.date);
        return projRow(p, d.getDate(), U.MONTHS_SHORT[d.getMonth()].toUpperCase());
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
      '<div class="card chart-card">' +
      '<div class="chart-head"><h3 class="section-title">Inkomsten per maand <span class="muted">' + curYear + '</span></h3></div>' +
      chartHTML +
      '</div>' +
      '<div class="section-row"><h3 class="section-title">Komende opdrachten</h3><button type="button" class="link-btn" data-nav="calendar">Kalender</button></div>' +
      '<div class="stack-list">' + upHTML + '</div>' +
      '</section>';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        U.qsa('.progress-fill[data-w]', root).forEach((el) => {
          el.style.width = el.getAttribute('data-w') + '%';
        });
      });
    });

    bind(root);
  }

  function projRow(p, day, mon) {
    const st = U.statusInfo(U.PROJECT_STATUS, p.status);
    return (
      '<button type="button" class="up-row card" data-proj="' + U.esc(p.id) + '">' +
      '<span class="up-date proj"><b>' + day + '</b>' + mon + '</span>' +
      '<span class="row-main"><span class="row-title">' + U.esc(p.name) + '</span>' +
      '<span class="row-sub">' + U.esc(U.fmtDate(p.date)) + (U.projectHours(p) > 0 ? ' \u00B7 ' + U.esc(U.fmtNum(U.projectHours(p), 1)) + ' u' : '') + '</span></span>' +
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
    const gp = U.qs('[data-action=set-goal]', root);
    if (gp) gp.addEventListener('click', () => More.openGoalEditor(() => render(root)));
    const ap = U.qs('[data-action=add-project]', root);
    if (ap) ap.addEventListener('click', () => Projects.openForm(null));
    const gc = U.qs('[data-action=go-calendar]', root);
    if (gc) gc.addEventListener('click', () => App.go('calendar'));
  }

  window.Views = window.Views || {};
  window.Views.start = render;
})();
