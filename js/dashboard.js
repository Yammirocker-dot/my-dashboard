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
      [['year', 'Dit jaar'], ['all', 'Alles']].map(([id, lb]) =>
        '<button type="button" class="chip' + (S.dashPeriod === id ? ' active' : '') + '" data-period="' + id + '" role="tab" aria-selected="' + (S.dashPeriod === id) + '">' + lb + '</button>'
      ).join('') +
      '</div>';

    const hero =
      '<div class="card hero-card static tappable" data-action="open-income" role="button" tabindex="0">' +
      '<div class="card-label">Totale inkomsten</div>' +
      '<div class="big-number">' + U.esc(U.fmtMoney(sum.income)) + '</div>' +
      '<div class="hero-meta">' + U.esc(r.label) + '</div>' +
      '</div>';

    const miniDefs = [
      { lb: 'Uren', val: U.fmtNum(sum.hoursTotal, 1) },
      { lb: 'Per uur', val: sum.incomePerHour != null ? U.fmtMoney(sum.incomePerHour) : '\u2013' },
      { lb: 'Deze maand', val: sum.monthIncome > 0 ? U.fmtMoney(sum.monthIncome) : '\u2013' },
      {
        lb: 'Te ontvangen',
        val: sum.outstanding > 0 ? U.fmtMoney(sum.outstanding) : '\u2013',
        tap: sum.outstanding > 0 ? 'open-outstanding' : null
      }
    ];
    const minis = miniDefs.map((m) =>
      '<div class="stat-card' + (m.tap ? ' tappable' : '') + '"' + (m.tap ? ' data-action="' + m.tap + '" role="button" tabindex="0"' : '') + '>' +
      '<span class="stat-label">' + m.lb + '</span><span class="stat-value">' + U.esc(String(m.val)) + '</span></div>'
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

    const concepts = S.data.projects
      .filter((p) => p.concept)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const conceptsHTML = concepts.length
      ? '<div class="section-row"><h3 class="section-title">Op te volgen <span class="muted">(' + concepts.length + ')</span></h3></div>' +
        '<div class="stack-list">' + concepts.map(conceptRow).join('') + '</div>'
      : '';

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
      conceptsHTML +
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
      '<span class="row-sub">' +
      U.esc(
        [
          p.date ? U.fmtDate(p.date) : 'Geen datum',
          p.date && p.time ? p.time : '',
          p.client || '',
          U.projectHours(p) > 0 ? U.fmtNum(U.projectHours(p), 1) + ' u' : ''
        ].filter(Boolean).join(' \u00B7 ')
      ) +
      '</span></span>' +
      '<span class="row-side"><span class="row-money">' + U.esc(p.concept ? U.fmtBudget(p) : U.fmtMoney(p.income)) + '</span>' +
      '<span class="pill" style="--pc:' + st.color + '">' + U.esc(st.label) + '</span></span>' +
      '</button>'
    );
  }
  window.projRow = projRow;

  function openOutstandingSheet(refresh) {
    const sh = Sheet.open({ title: 'Te ontvangen' });

    function row(p) {
      return (
        '<div class="up-row card">' +
        '<span class="row-main"><span class="row-title">' + U.esc(p.name) + '</span>' +
        '<span class="row-sub">' +
        U.esc(
          [
            p.date ? U.fmtDate(p.date) : 'Geen datum',
            p.date && p.time ? p.time : '',
            p.client || ''
          ].filter(Boolean).join(' \u00B7 ') || '\u2013'
        ) +
        '</span></span>' +
        '<span class="row-side"><span class="row-money">' + U.esc(U.fmtMoney(p.income)) + '</span>' +
        '<span class="out-actions">' +
        '<button type="button" class="icon-btn" data-detail="' + U.esc(p.id) + '" aria-label="Details">' + Icons.chevronRight + '</button>' +
        '<button type="button" class="btn btn-gold btn-sm" data-pay="' + U.esc(p.id) + '">' + Icons.check + 'Betaald</button>' +
        '</span></span>' +
        '</div>'
      );
    }

    function draw() {
      const list = App.state.data.projects
        .filter((p) => !p.concept && p.status !== 'paid')
        .sort((a, b) => (a.date || '9999-12-31').localeCompare(b.date || '9999-12-31'));
      sh.body.innerHTML = list.length
        ? '<p class="sheet-sub">Oudste eerst \u2014 tik op Betaald zodra het geld binnen is.</p>' +
          '<div class="stack-list">' + list.map(row).join('') + '</div>'
        : '<div class="empty slim"><h3>Alles betaald</h3><p>Er staan geen openstaande betalingen meer open.</p></div>';

      U.qsa('[data-pay]', sh.body).forEach((b) =>
        b.addEventListener('click', async () => {
          await App.patchRecord('projects', b.getAttribute('data-pay'), { status: 'paid' });
          toast('Betaald gemarkeerd');
          draw();
          if (refresh) refresh();
        })
      );
      U.qsa('[data-detail]', sh.body).forEach((b) =>
        b.addEventListener('click', () => Projects.openDetail(b.getAttribute('data-detail')))
      );
    }

    draw();
  }

  function openIncomeSheet(range) {
    const sh = Sheet.open({ title: 'Inkomsten \u00B7 ' + range.label });
    const items = App.state.data.projects
      .filter((p) => !p.concept && Number(p.income) > 0 && Stats.inRange(p.date, range))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const total = items.reduce((s, p) => s + (Number(p.income) || 0), 0);

    sh.body.innerHTML = items.length
      ? '<p class="sheet-sub">Periode: ' + U.esc(range.label) + ' \u2014 ' + items.length + ' opdracht' + (items.length === 1 ? '' : 'en') + '.</p>' +
        '<div class="stack-list">' +
        items.map((p) =>
          '<div class="up-row card" data-proj="' + U.esc(p.id) + '" role="button" tabindex="0">' +
          '<span class="row-main"><span class="row-title">' + U.esc(p.name) + '</span>' +
          '<span class="row-sub">' +
          U.esc(
            [
              p.date ? U.fmtDate(p.date) : 'Geen datum',
              p.client || ''
            ].filter(Boolean).join(' \u00B7 ') || '\u2013'
          ) +
          '</span></span>' +
          '<span class="row-side"><span class="row-money">' + U.esc(U.fmtMoney(p.income)) + '</span></span>' +
          '</div>'
        ).join('') +
        '</div>' +
        '<div class="sheet-total"><span>Totaal</span><span>' + U.esc(U.fmtMoney(total)) + '</span></div>'
      : '<div class="empty slim"><h3>Geen inkomsten</h3><p>Er zijn in deze periode nog geen inkomsten geregistreerd.</p></div>';

    U.qsa('[data-proj]', sh.body).forEach((b) =>
      b.addEventListener('click', () => Projects.openDetail(b.getAttribute('data-proj')))
    );
  }

  function conceptRow(p) {
    const st = U.statusInfo(U.PROJECT_STATUS, p.status);
    return (
      '<button type="button" class="up-row card no-date" data-proj="' + U.esc(p.id) + '">' +
      '<span class="row-main"><span class="row-title">' + U.esc(p.name) + '</span>' +
      '<span class="row-sub">' +
      U.esc(
        [
          p.client || '',
          U.projectHours(p) > 0 ? U.fmtNum(U.projectHours(p), 1) + ' u' : ''
        ].filter(Boolean).join(' \u00B7 ') || 'Nog zonder details'
      ) +
      '</span></span>' +
      '<span class="row-side"><span class="row-money">' + U.esc(U.fmtBudget(p)) + '</span>' +
      '<span class="pill" style="--pc:' + st.color + '">' + U.esc(st.label) + '</span></span>' +
      '</button>'
    );
  }

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
    const ot = U.qs('[data-action=open-outstanding]', root);
    if (ot) ot.addEventListener('click', () => openOutstandingSheet(() => render(root)));
    const hi = U.qs('[data-action=open-income]', root);
    if (hi) hi.addEventListener('click', () => openIncomeSheet(dashRange()));
  }

  window.Views = window.Views || {};
  window.Views.start = render;
})();
