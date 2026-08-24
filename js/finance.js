(function () {
  const U = window.U;

  function resolvePeriod(fp) {
    const now = new Date();
    const k = fp.kind;
    if (k === 'month') return Stats.periodRange({ type: 'month' });
    if (k === 'prevMonth') {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return Stats.periodRange({ type: 'month', y: d.getFullYear(), m: d.getMonth() });
    }
    if (k === 'year') return Stats.periodRange({ type: 'year', y: now.getFullYear() });
    if (k === 'prevYear') return Stats.periodRange({ type: 'year', y: now.getFullYear() - 1 });
    if (k === 'custom') return Stats.periodRange({ type: 'year', y: Number(fp.y) });
    return Stats.periodRange({ type: 'all' });
  }

  function availableYears() {
    const years = new Set();
    App.state.data.projects.forEach((p) => { if (p.date) years.add(U.yearKey(p.date)); });
    App.state.data.otherIncome.forEach((e) => { if (e.date) years.add(U.yearKey(e.date)); });
    App.state.data.expenses.forEach((e) => { if (e.date) years.add(U.yearKey(e.date)); });
    const cy = String(new Date().getFullYear());
    years.add(cy);
    const arr = Array.from(years).map(Number).sort((a, b) => a - b);
    const out = [];
    for (let y = Math.min(arr[0], Number(cy)); y <= Math.max(arr[arr.length - 1], Number(cy)) + 1; y++) out.push(y);
    return out;
  }

  function render(root) {
    const S = App.state;
    const fp = S.financePeriod;
    const r = resolvePeriod(fp);
    const sum = Stats.summarize(S.data, r);
    const chartYear = r.year != null ? r.year : new Date().getFullYear();
    const years = availableYears();

    const chips = [
      ['month', 'Deze maand'],
      ['prevMonth', 'Vorige maand'],
      ['year', 'Dit jaar'],
      ['prevYear', 'Vorig jaar'],
      ['all', 'Alles']
    ].map(([id, lb]) =>
      '<button type="button" class="chip' + (fp.kind === id ? ' active' : '') + '" data-fp="' + id + '">' + lb + '</button>'
    ).join('');

    const selYear = fp.kind === 'custom' ? Number(fp.y) : chartYear;
    const yearSel =
      '<label class="year-select" aria-label="Kies een jaar">' +
      '<select id="fin-year">' +
      years.map((y) => '<option value="' + y + '"' + (selYear === y ? ' selected' : '') + '>' + y + '</option>').join('') +
      '</select>' + Icons.calendar + '</label>';

    let body;
    if (!sum.hasData && fp.kind !== 'all') {
      body =
        '<div class="card empty tall"><div class="empty-icon">' + Icons.chart + '</div>' +
        '<h3>Geen gegevens voor ' + U.esc(r.label) + '</h3>' +
        '<p>Er zijn geen inkomsten of uitgaven geregistreerd in deze periode.</p></div>';
    } else if (!sum.hasData) {
      body =
        '<div class="card empty tall"><div class="empty-icon">' + Icons.chart + '</div>' +
        '<h3>Nog geen financi\u00EBn</h3>' +
        '<p>Voeg opdrachten, andere inkomsten of uitgaven toe om je cijfers te zien.</p></div>';
    } else {
      const bestM = sum.bestMonth;
      const bestV = sum.bestVhxMonth;

      const stats =
        '<div class="hero-card card static">' +
        '<div class="card-label">Totale inkomsten</div>' +
        '<div class="big-number">' + U.esc(U.fmtMoney(sum.total)) + '</div>' +
        '<div class="hero-meta">' + U.esc(r.label) + '</div>' +
        '</div>' +
        '<div class="mini-grid">' +
        mini('VHXmedia', U.fmtMoney(sum.vhx), 'gold') +
        mini('Overige inkomsten', U.fmtMoney(sum.other), '') +
        mini('Uitgaven', U.fmtMoney(sum.expenses), 'neg') +
        mini('Netto', U.fmtMoney(sum.net), 'pos') +
        '</div>';

      const iphTile =
        sum.incomePerHour != null
          ? tile('Inkomen per uur', U.esc(U.fmtMoney(sum.incomePerHour)), U.esc(U.fmtHours(sum.hoursTotal)) + ' geregistreerd')
          : tile('Inkomen per uur', '\u2013', 'Geen uren geregistreerd');

      const perf =
        '<div class="perf-grid wide">' +
        tile('Gemiddeld per maand', sum.avgMonth != null ? U.esc(U.fmtMoney(sum.avgMonth)) : '\u2013', r.label) +
        tile('Beste maand', bestM ? U.esc(bestM.label) : '\u2013', bestM ? U.esc(U.fmtMoney(bestM.value)) : '\u2013') +
        tile('Beste VHX-maand', bestV ? U.esc(bestV.label) : '\u2013', bestV ? U.esc(U.fmtMoney(bestV.vhx)) : '\u2013') +
        iphTile +
        tile('Openstaande betalingen', U.esc(U.fmtMoney(sum.outstanding)), 'nog te ontvangen') +
        '</div>';

      const buckets = Stats.monthBuckets(S.data, chartYear);
      const hasMonthly = buckets.some((b) => b.total > 0 || b.expenses > 0);

      const chartCards =
        '<div class="card chart-card">' +
        '<div class="chart-head"><h3 class="section-title">Inkomsten per maand <span class="muted">' + chartYear + '</span></h3>' +
        '<div class="legend"><span class="legend-item"><i style="background:#d4903b"></i>VHXmedia</span><span class="legend-item"><i style="background:#5f8763"></i>Overig</span></div></div>' +
        (hasMonthly
          ? Charts.stackedBars({
              labels: buckets.map((b) => b.label),
              series: [
                { name: 'VHXmedia', color: '#d4903b', values: buckets.map((b) => b.vhx) },
                { name: 'Overig', color: '#5f8763', values: buckets.map((b) => b.other) }
              ],
              height: 210,
              label: 'Maandelijkse inkomsten'
            })
          : '<div class="chart-empty">Geen maandgegevens voor ' + chartYear + '</div>') +
        '</div>' +

        '<div class="card chart-card">' +
        '<div class="chart-head"><h3 class="section-title">Inkomsten vs uitgaven <span class="muted">' + chartYear + '</span></h3>' +
        '<div class="legend"><span class="legend-item"><i style="background:#85bd90"></i>Inkomsten</span><span class="legend-item"><i style="background:#c96f5a"></i>Uitgaven</span></div></div>' +
        (hasMonthly
          ? Charts.groupedBars({
              labels: buckets.map((b) => b.label),
              series: [
                { name: 'Inkomsten', color: '#85bd90', values: buckets.map((b) => b.total) },
                { name: 'Uitgaven', color: '#c96f5a', values: buckets.map((b) => b.expenses) }
              ],
              height: 210,
              label: 'Inkomsten versus uitgaven'
            })
          : '<div class="chart-empty">Geen gegevens voor ' + chartYear + '</div>') +
        '</div>' +

        '<div class="chart-duo">' +
        '<div class="card chart-card donut-card">' +
        '<h3 class="section-title">Verdeling</h3>' +
        Charts.donut({
          items: [
            { label: 'VHXmedia', value: sum.vhx, color: '#d4903b' },
            { label: 'Overig', value: sum.other, color: '#5f8763' }
          ],
          centerSub: 'totaal',
          label: 'Verdeling VHXmedia versus overig'
        }) +
        '<div class="donut-legend">' +
        leg('#d4903b', 'VHXmedia', sum.vhx) +
        leg('#5f8763', 'Overig', sum.other) +
        '</div></div>' +

        '<div class="card chart-card">' +
        '<h3 class="section-title">Jaarvergelijking</h3>' +
        yearlyChart() +
        '</div>' +
        '</div>';

      const monthsActive = buckets.filter((b) => b.total > 0 || b.expenses > 0);
      const monthlyTable =
        '<div class="card table-card"><h3 class="section-title">Maandelijks overzicht <span class="muted">' + chartYear + '</span></h3>' +
        (monthsActive.length
          ? '<div class="fin-table" role="table">' +
            '<div class="fin-tr fin-th" role="row"><span>Maand</span><span>VHXmedia</span><span>Overig</span><span>Totaal</span><span>Uitgaven</span><span class="num">Netto</span></div>' +
            monthsActive.map((b) =>
              '<div class="fin-tr" role="row">' +
              '<span role="cell" class="fin-month">' + U.esc(U.MONTHS_LONG[Number(b.key.slice(5, 7)) - 1]) + '</span>' +
              '<span role="cell">' + U.esc(U.fmtMoney(b.vhx)) + '</span>' +
              '<span role="cell">' + U.esc(U.fmtMoney(b.other)) + '</span>' +
              '<span role="cell" class="strong">' + U.esc(U.fmtMoney(b.total)) + '</span>' +
              '<span role="cell" class="neg">' + U.esc(U.fmtMoney(b.expenses)) + '</span>' +
              '<span role="cell" class="num strong ' + (b.net >= 0 ? 'pos' : 'neg') + '">' + U.esc(U.fmtMoney(b.net)) + '</span>' +
              '</div>'
            ).join('') +
            '</div>'
          : '<div class="chart-empty">Geen maanden met gegevens.</div>') +
        '</div>';

      body = stats + perf + chartCards + monthlyTable;
    }

    root.innerHTML =
      '<section class="finance fade-in">' +
      '<header class="view-head"><div><h2 class="page-title">Financi\u00EBn</h2></div></header>' +
      '<div class="chip-row seg wrap">' + chips + '</div>' +
      '<div class="year-row">' + yearSel + '</div>' +
      '<div class="fin-body">' + body + '</div>' +
      '</section>';

    bind(root);
  }

  function mini(lb, val, cls) {
    return '<div class="stat-card ' + cls + '"><span class="stat-label">' + lb + '</span><span class="stat-value">' + val + '</span></div>';
  }

  function tile(lb, v, sub) {
    return '<div class="perf-tile card"><span class="stat-label">' + lb + '</span><span class="perf-value">' + v + '</span><span class="perf-sub">' + sub + '</span></div>';
  }

  function leg(color, name, val) {
    return '<div class="donut-leg"><i style="background:' + color + '"></i><span>' + name + '</span><b>' + U.esc(U.fmtMoney(val)) + '</b></div>';
  }

  function yearlyChart() {
    const yrs = Stats.yearlyBreakdown(App.state.data);
    if (!yrs.length || !yrs.some((y) => y.total > 0)) {
      return '<div class="chart-empty">Nog geen jaartotalen.</div>';
    }
    return Charts.yearlyBars({
      items: yrs.map((y) => ({ label: y.year, value: y.total }))
    });
  }

  function bind(root) {
    U.qsa('[data-fp]', root).forEach((b) =>
      b.addEventListener('click', () => {
        App.state.financePeriod = { kind: b.getAttribute('data-fp') };
        render(root);
      })
    );
    const sel = U.qs('#fin-year', root);
    if (sel) {
      sel.addEventListener('change', () => {
        App.state.financePeriod = { kind: 'custom', y: Number(sel.value) };
        render(root);
      });
    }
    U.qsa('[data-nav]', root).forEach((b) => b.addEventListener('click', () => App.go(b.getAttribute('data-nav'))));
  }

  window.Views = window.Views || {};
  window.Views.finance = render;
})();
