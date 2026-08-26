(function () {
  const U = window.U;

  async function getAccs() {
    return (await DB.getSetting('accounts', null)) || [];
  }
  async function saveAccs(list) {
    await DB.setSetting('accounts', list);
  }
  async function getBanks() {
    return (await DB.getSetting('banks', null)) || [];
  }
  async function saveBanks(list) {
    await DB.setSetting('banks', list);
  }
  async function getStocks() {
    return (await DB.getSetting('stocks', null)) || [];
  }
  async function saveStocks(list) {
    await DB.setSetting('stocks', list);
  }
  async function getQuotes() {
    return (await DB.getSetting('stockQuotes', null)) || {};
  }
  async function saveQuotes(q) {
    await DB.setSetting('stockQuotes', q);
  }
  async function getGoals() {
    return (await DB.getSetting('goals', null)) || [];
  }
  async function saveGoals(list) {
    await DB.setSetting('goals', list);
  }
  async function getAllocs() {
    return (await DB.getSetting('goalAllocs', null)) || [];
  }
  async function saveAllocs(list) {
    await DB.setSetting('goalAllocs', list);
  }

  function allocForGoal(allocs, gid) {
    return allocs.filter((a) => a.goalId === gid).reduce((t, a) => t + (Number(a.amount) || 0), 0);
  }

  function allocForSrc(allocs, type, id) {
    return allocs.filter((a) => a.srcType === type && a.srcId === id).reduce((t, a) => t + (Number(a.amount) || 0), 0);
  }

  function fmtCur(v, cur) {
    const n = Number(v);
    if (cur !== 'USD') return U.fmtMoney(n);
    if (!isFinite(n)) n = 0;
    const neg = n < -0.0001;
    const abs = Math.abs(n);
    const frac = Math.round(abs * 100) % 100 === 0 ? 0 : 2;
    let s = new Intl.NumberFormat('nl-BE', { minimumFractionDigits: frac, maximumFractionDigits: frac }).format(abs);
    s = '$' + s;
    return neg ? '-' + s : s;
  }

  function sharesOf(s) {
    return (s.lots || []).reduce((t, l) => t + (Number(l.shares) || 0), 0);
  }
  function lotPrice(l) {
    if (l.price != null && l.price !== '') return Number(l.price) || 0;
    const c = Number(l.cost);
    if (!isFinite(c)) return 0;
    const sh = Number(l.shares);
    return sh > 0 ? c / sh : c;
  }
  function investedOf(s) {
    return (s.lots || []).reduce((t, l) => t + (Number(l.shares) || 0) * lotPrice(l), 0);
  }
  function usdRate(quotes) {
    return quotes['USDEUR'] && quotes['USDEUR'].price ? quotes['USDEUR'].price : 0.92;
  }
  function stockValue(s, quotes) {
    const inv = investedOf(s);
    let native = inv;
    let live = false;
    let price = null;
    if (s.tracked) {
      const q = quotes[String(s.ticker || '').toUpperCase()];
      if (q && q.price) {
        price = q.price;
        native = sharesOf(s) * q.price;
        live = true;
      }
    }
    const usd = s.currency === 'USD';
    const rate = usd ? usdRate(quotes) : 1;
    return { native: native, value: native * rate, live: live, price: price };
  }

  function totalOf(list) {
    return list.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  }

  function render(root) {
    Promise.all([getAccs(), getBanks(), getStocks(), getQuotes(), getGoals(), getAllocs()]).then(([accs, banks, stocks, quotes, goals, allocs]) => {
      draw(root, accs, banks, stocks, quotes, goals, allocs);
      const tickers = Array.from(new Set((stocks || []).filter((s) => s.tracked).map((s) => String(s.ticker).toUpperCase())));
      if (tickers.length && !autoFetched) {
        autoFetched = true;
        refreshQuotes(false);
      }
    });
  }

  let autoFetched = false;

  async function fetchChart(ticker, range) {
    const target = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ticker) + '?interval=1d&range=' + (range || '1d');
    const urls = [
      'https://corsproxy.io/?url=' + encodeURIComponent(target),
      'https://api.allorigins.win/raw?url=' + encodeURIComponent(target)
    ];
    for (let i = 0; i < urls.length; i++) {
      try {
        const res = await fetch(urls[i], { cache: 'no-store' });
        if (!res.ok) continue;
        const j = await res.json();
        const r = j && j.chart && j.chart.result && j.chart.result[0];
        if (r) return r;
      } catch (e) {}
    }
    return null;
  }

  async function fetchQuote(ticker) {
    const r = await fetchChart(ticker, '1d');
    if (!r) return null;
    const meta = r.meta;
    const price = meta && meta.regularMarketPrice != null ? Number(meta.regularMarketPrice) : null;
    if (price == null || !isFinite(price)) return null;
    let prev = null;
    if (meta) {
      if (meta.chartPreviousClose != null) prev = Number(meta.chartPreviousClose);
      else if (meta.previousClose != null) prev = Number(meta.previousClose);
    }
    return { price: price, prevClose: prev, ts: new Date().toISOString() };
  }

  async function fetchFxHistory() {
    const r = await fetchChart('EURUSD=X', '2y');
    if (!r || !r.timestamp || !r.indicators || !r.indicators.quote || !r.indicators.quote[0]) return null;
    const ts = r.timestamp;
    const closes = r.indicators.quote[0].close || [];
    const rates = {};
    let lastGood = null;
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (c == null || !isFinite(Number(c)) || Number(c) <= 0) continue;
      const d = new Date(ts[i] * 1000).toISOString().slice(0, 10);
      const eurPerUsd = 1 / Number(c);
      rates[d] = eurPerUsd;
      lastGood = eurPerUsd;
    }
    if (!lastGood) return null;
    return { rates: rates };
  }

  function fxOn(quotes, dateStr) {
    const fx = quotes['FX'];
    if (!fx || !fx.rates || !dateStr) return null;
    const rates = fx.rates;
    if (rates[dateStr]) return rates[dateStr];
    const keys = Object.keys(rates).sort();
    let best = null;
    const limit = new Date(dateStr);
    limit.setDate(limit.getDate() - 10);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k <= dateStr) best = rates[k];
      if (k > dateStr) break;
    }
    if (!best) {
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (new Date(k) >= limit) { best = rates[k]; break; }
      }
    }
    return best;
  }

  function usdEurCost(s, quotes) {
    if (s.currency !== 'USD') return investedOf(s);
    return (s.lots || []).reduce((t, l) => {
      const sh = Number(l.shares) || 0;
      let r = fxOn(quotes, l.date);
      if (r == null) r = usdRate(quotes);
      return t + sh * lotPrice(l) * r;
    }, 0);
  }

  async function refreshQuotes(verbose) {
    try {
      const stocks = await getStocks();
      const tickers = Array.from(new Set(stocks.filter((s) => s.tracked).map((s) => String(s.ticker).toUpperCase())));
      const hasUsd = stocks.some((s) => s.tracked && s.currency === 'USD');
      if (!tickers.length) {
        if (verbose) toast('Geen getrackte aandelen');
        return;
      }
      if (verbose) toast('Koersen ophalen\u2026', 'info');
      const quotes = await getQuotes();
      let ok = 0;
      const total = tickers.length + (hasUsd ? 1 : 0);
      for (const t of tickers) {
        const q = await fetchQuote(t);
        if (q) { quotes[t] = q; ok++; }
      }
      if (hasUsd) {
        const r = await fetchQuote('EURUSD=X');
        if (r && r.price) {
          quotes['USDEUR'] = { price: 1 / r.price, ts: r.ts };
          ok++;
        }
        const fxh = await fetchFxHistory();
        if (fxh) quotes['FX'] = fxh;
      }
      await saveQuotes(quotes);
      if (verbose) toast(ok === total ? 'Koersen bijgewerkt' : ok ? ok + '/' + total + ' koersen opgehaald' : 'Kon koersen niet ophalen (offline?)', ok ? undefined : 'error');
      if (ok && lastRoot) render(lastRoot);
    } catch (e) {
      if (verbose) toast('Kon koersen niet ophalen', 'error');
    }
  }

  function accTile(a, allocated) {
    const unalloc = (Number(a.balance) || 0) - (allocated || 0);
    return (
      '<button type="button" class="acc-tile" data-acc="' + U.esc(a.id) + '">' +
      '<span class="acc-name">' + U.esc(a.name) + '</span>' +
      '<span class="row-money' + ((Number(a.balance) || 0) < 0 ? ' neg' : '') + '">' + U.esc(U.fmtMoney(a.balance)) + '</span>' +
      ((allocated || 0) > 0 ? '<span class="unalloc">niet toegewezen: ' + U.esc(U.fmtMoney(unalloc < 0 ? 0 : unalloc)) + '</span>' : '') +
      '</button>'
    );
  }

  function stockTile(s, quotes, allocated) {
    const v = stockValue(s, quotes);
    const inv = investedOf(s);
    const sh = sharesOf(s);
    const cur = s.currency === 'USD' ? 'USD' : 'EUR';
    const lines = [];
    if (!s.tracked) {
      lines.push('<span>Niet getrackt \u00B7 ' + sh + ' st.</span>');
    } else {
      if (v.live && inv > 0) {
        const diff = v.native - inv;
        const pct = Math.round((diff / inv) * 1000) / 10;
        lines.push('<b class="' + (diff >= 0 ? 'up">\u2248 ' : 'down">\u2248 ') + U.esc(fmtCur(diff, cur)) + ' (' + (pct >= 0 ? '+' : '') + pct + '%)</b>');
        if (cur === 'USD') {
          const eurDiff = v.native * usdRate(quotes) - usdEurCost(s, quotes);
          lines.push('<span class="' + (eurDiff >= 0 ? 'up">' : 'down">') + U.esc('\u2248 ' + fmtCur(eurDiff, 'EUR')) + '</span>');
        }
      } else {
        lines.push('<span>' + sh + ' stuks</span>');
      }
    }
    if ((allocated || 0) > 0) {
      const rem = v.value - allocated;
      lines.push('<span class="unalloc">niet toegewezen: \u2248 ' + U.esc(U.fmtMoney(rem < 0 ? 0 : rem)) + '</span>');
    }
    const sub = '<span class="stock-sub stack">' + lines.join('') + '</span>';
    return (
      '<button type="button" class="acc-tile stock" data-stock="' + U.esc(s.id) + '">' +
      '<span class="name-wrap">' +
      '<span class="acc-name">' + U.esc(s.name) + (s.ticker ? ' <span class="ticker-chip">' + U.esc(String(s.ticker).toUpperCase()) + '</span>' : '') + '</span>' +
      (s.tracked && v.live && v.price != null ? '<span class="pp">1 st \u2248 ' + U.esc(fmtCur(v.price, cur)) + '</span>' : '') +
      '</span>' +
      '<span class="money-stack">' +
      '<span class="row-money' + (v.value < 0 ? ' neg' : '') + '">' + U.esc(fmtCur(v.native, cur)) + '</span>' +
      (cur === 'USD' ? '<span class="row-approx">\u2248 ' + U.esc(fmtCur(v.value, 'EUR')) + '</span>' : '') +
      '</span>' +
      sub +
      '</button>'
    );
  }

  let lastRoot = null;
  let lastCtx = null;

  function srcName(a, accs, stocks) {
    if (a.srcType === 'stk') {
      const s = (stocks || []).find((x) => x.id === a.srcId);
      return s ? s.name : 'Aandeel';
    }
    const acc = (accs || []).find((x) => x.id === a.srcId);
    return acc ? acc.name : 'Rekening';
  }

  function goalCard(g, allocs, accs, stocks) {
    const saved = allocForGoal(allocs, g.id);
    const target = Number(g.target) || 0;
    const pct = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
    const mine = allocs.filter((a) => a.goalId === g.id);
    const lines = mine
      .map((a) =>
        '<div class="alloc-line"><span class="alloc-src">' + U.esc(srcName(a, accs, stocks)) + '</span>' +
        '<span class="alloc-amt">' + U.esc(U.fmtMoney(a.amount)) +
        '<button type="button" class="iv-del" data-alloc-del="' + U.esc(a.id) + '" aria-label="Toewijzing verwijderen">' + Icons.trash + '</button></span></div>')
      .join('');
    return (
      '<div class="card goal-tile">' +
      '<div class="goal-top"><span class="goal-name">' + U.esc(g.name) + '</span>' +
      '<span class="goal-pct2">' + pct + '%</span></div>' +
      '<div class="progress slim"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
      '<p class="goal-saved"><b>' + U.esc(U.fmtMoney(saved)) + '</b> van ' + U.esc(U.fmtMoney(target)) + '</p>' +
      (lines ? '<div class="alloc-list">' + lines + '</div>' : '<p class="muted-sm">Nog geen geld toegewezen.</p>') +
      '<div class="goal-actions">' +
      '<button type="button" class="btn btn-gold btn-sm" data-alloc-add="' + U.esc(g.id) + '">' + Icons.euro + 'Toewijzen</button>' +
      '<button type="button" class="icon-btn" data-goal-edit="' + U.esc(g.id) + '" aria-label="Doel aanpassen">' + Icons.edit + '</button>' +
      '<button type="button" class="icon-btn" data-goal-del="' + U.esc(g.id) + '" aria-label="Doel verwijderen">' + Icons.trash + '</button>' +
      '</div></div>'
    );
  }

  function draw(root, accs, banks, stocks, quotes, goals, allocs) {
    lastRoot = root;
    lastCtx = { accs: accs || [], banks: banks || [], stocks: stocks || [], quotes: quotes || {}, goals: goals || [], allocs: allocs || [] };
    const cash = totalOf(accs);
    const stocksList = stocks || [];
    let stockTotal = 0;
    stocksList.forEach((s) => { stockTotal += stockValue(s, quotes).value; });
    const total = cash + stockTotal;

    let groupsHTML = '';
    const trackedCount = stocksList.filter((s) => s.tracked).length;
    banks.forEach((b) => {
      const list = accs.filter((a) => a.bankId === b.id);
      const bStocks = stocksList.filter((s) => s.bankId === b.id);
      let bStockTotal = 0;
      bStocks.forEach((s) => { bStockTotal += stockValue(s, quotes).value; });
      groupsHTML +=
        '<div class="bank-group">' +
        '<div class="section-row"><h3 class="section-title"><span class="bank-dot"></span>' + U.esc(b.name) +
        ' <span class="muted">(' + (list.length + bStocks.length) + ')</span></h3>' +
        '<span class="bank-sum">' + U.esc(U.fmtMoney(totalOf(list) + bStockTotal)) + '</span>' +
        '<button type="button" class="icon-btn" data-bank="' + U.esc(b.id) + '" aria-label="Bank aanpassen">' + Icons.edit + '</button>' +
        '</div>' +
        (list.length || bStocks.length
          ? '<div class="acc-grid">' +
            list.map((a) => accTile(a, allocForSrc(allocs, 'acc', a.id))).join('') +
            bStocks.map((s) => stockTile(s, quotes, allocForSrc(allocs, 'stk', s.id))).join('') +
            '</div>'
          : '<p class="muted-sm">Nog geen rekeningen bij deze bank.</p>') +
        '</div>';
    });
    const loose = accs.filter((a) => !a.bankId || !banks.some((x) => x.id === a.bankId));
    const looseStocks = stocksList.filter((s) => !s.bankId || !banks.some((x) => x.id === s.bankId));
    if (loose.length || looseStocks.length) {
      groupsHTML +=
        '<div class="bank-group">' +
        (banks.length
          ? '<div class="section-row"><h3 class="section-title">Zonder bank <span class="muted">(' + (loose.length + looseStocks.length) + ')</span></h3><span class="bank-sum">' + U.esc(U.fmtMoney(totalOf(loose))) + '</span></div>'
          : '') +
        '<div class="acc-grid">' +
        loose.map((a) => accTile(a, allocForSrc(allocs, 'acc', a.id))).join('') +
        looseStocks.map((s) => stockTile(s, quotes, allocForSrc(allocs, 'stk', s.id))).join('') +
        '</div></div>';
    }

    const goalsSection =
      '<div class="section-row"><h3 class="section-title">Doelen</h3></div>' +
      (goals.length
        ? goals.map((g) => goalCard(g, allocs, accs, stocksList)).join('')
        : '<p class="muted-sm" style="text-align:center">Nog geen doelen \u2014 voeg ze toe via de + knop.</p>');

    root.innerHTML =
      '<section class="dash fade-in">' +
      '<header class="view-head"><div>' +
      '<h2 class="greeting">Totaal vermogen</h2>' +
      '<p class="date-sub">' + U.esc(U.fmtDateLong(new Date())) + '</p>' +
      '</div></header>' +
      '<div class="card acc-total static">' +
      (trackedCount
        ? '<button type="button" class="icon-btn quote-refresh" data-refresh-stocks aria-label="Koersen verversen">' + Icons.trendingUp + '</button>'
        : '') +
      '<span class="acc-badge">' + Icons.wallet + '</span>' +
      '<div class="big-number' + (total < 0 ? ' neg' : '') + '">' + U.esc(U.fmtMoney(total)) + '</div>' +
      '<div class="hero-meta">' + banks.length + ' bank' + (banks.length === 1 ? '' : 'en') + ' \u00B7 ' + accs.length + ' rekening' + (accs.length === 1 ? '' : 'en') +
      (stocksList.length ? ' \u00B7 ' + stocksList.length + ' aandelen' : '') + '</div>' +
      '</div>' +
      groupsHTML +
      (!groupsHTML
        ? '<p class="muted-sm" style="margin-top:14px;text-align:center">Gebruik de + knop om een bank en rekening toe te voegen.</p>'
        : '') +
      goalsSection +
      (trackedCount
        ? '<p class="approx-note">* Winsten en rendementen van getrackte aandelen zijn bij benadering: berekend op basis van de laatst beschikbare koers- en wisselgegevens.</p>'
        : '') +
      '</section>';

    bind(root);
  }

  function chooseSheet() {
    const sh = Sheet.open({ title: 'Wat wil je toevoegen?', small: true });
    sh.body.innerHTML =
      '<div class="stack-list">' +
      '<button type="button" class="set-row" data-add-bank><span class="set-icon">' + Icons.database + '</span><span class="set-main"><b>Bank</b><span class="set-sub">bv. KBC, Belfius, Revolut</span></span>' + Icons.chevronRight + '</button>' +
      '<button type="button" class="set-row" data-add-acc><span class="set-icon">' + Icons.wallet + '</span><span class="set-main"><b>Rekening</b><span class="set-sub">bv. Zichtrekening, Spaarrekening</span></span>' + Icons.chevronRight + '</button>' +
      '<button type="button" class="set-row" data-add-stock><span class="set-icon">' + Icons.chart + '</span><span class="set-main"><b>Aandeel</b><span class="set-sub">bv. TTWO, HOWL \u2014 optioneel live koers</span></span>' + Icons.chevronRight + '</button>' +
      '<button type="button" class="set-row" data-add-goal><span class="set-icon">' + Icons.target + '</span><span class="set-main"><b>Doel</b><span class="set-sub">bv. Huis: \u20AC40.000</span></span>' + Icons.chevronRight + '</button>' +
      '</div>';
    U.qs('[data-add-bank]', sh.body).addEventListener('click', () => { sh.close(); bankSheet(null, () => render(lastRoot)); });
    U.qs('[data-add-acc]', sh.body).addEventListener('click', () => { sh.close(); accSheet(null, () => render(lastRoot)); });
    U.qs('[data-add-stock]', sh.body).addEventListener('click', () => { sh.close(); stockSheet(null, () => render(lastRoot)); });
    U.qs('[data-add-goal]', sh.body).addEventListener('click', () => { sh.close(); goalSheet(null, () => render(lastRoot)); });
  }

  function normLot(l) {
    if (!l) return { date: U.todayISO(), shares: '', price: '' };
    let p;
    if (l.price != null && l.price !== '') p = l.price;
    else {
      const c = Number(l.cost);
      const sh = Number(l.shares);
      p = isFinite(c) && c !== '' ? (sh > 0 ? c / sh : c) : '';
    }
    return { date: l.date || '', shares: l.shares != null ? l.shares : '', price: p };
  }

  function lotRow(lot, cur) {
    const l = normLot(lot);
    const c = cur === 'USD' ? 'USD' : 'EUR';
    return (
      '<div class="lot-row">' +
      '<input type="date" class="input lot-date" value="' + U.esc(l.date || '') + '" aria-label="Aankoopdatum">' +
      '<input type="number" step="any" min="0" class="input lot-shares" placeholder="Stuks" value="' + (l.shares !== '' ? l.shares : '') + '" aria-label="Aantal stuks">' +
      '<div class="cost-wrap"><span class="cur-sym">' + (c === 'USD' ? '$' : '\u20AC') + '</span><input type="number" step="any" min="0" class="input lot-cost" placeholder="Prijs/stk" value="' + (l.price !== '' ? l.price : '') + '" aria-label="Aankoopprijs per stuk (' + (c === 'USD' ? '$' : '\u20AC') + ')"></div>' +
      '<button type="button" class="icon-btn lot-del" aria-label="Aankoop verwijderen">' + Icons.trash + '</button>' +
      '</div>'
    );
  }

  function stockSheet(existing, onDone) {
    getBanks().then((banks) => {
      if (!banks.length) {
        toast('Maak eerst een bank aan', 'error');
        return;
      }
      const sh = Sheet.open({ title: existing ? 'Aandeel bewerken' : 'Nieuw aandeel' });
      const lots = existing && Array.isArray(existing.lots) ? existing.lots.slice() : [];
      const cur0 = existing && existing.currency ? existing.currency : 'EUR';
      const bankOpts = banks.map((b) => ({ value: b.id, label: b.name }));
      sh.body.innerHTML =
        '<form class="form" novalidate>' +
        Forms.fieldRow({ name: 'name', label: 'Naam', type: 'text', value: existing ? existing.name : '', placeholder: 'bv. Take-Two Interactive' }) +
        Forms.fieldRow({ name: 'ticker', label: 'Ticker (afkorting)', type: 'text', value: existing ? existing.ticker : '', placeholder: 'bv. TTWO' }) +
        Forms.fieldRow({ name: 'currency', label: 'Valuta', type: 'select', value: existing && existing.currency ? existing.currency : 'EUR', options: [{ value: 'EUR', label: 'Euro (\u20AC)' }, { value: 'USD', label: 'Dollar ($)' }] }) +
        Forms.fieldRow({ name: 'bankId', label: 'Bank', type: 'select', value: existing ? existing.bankId || '' : '', options: bankOpts }) +
        '<label class="check-row"><input type="checkbox" id="stock-tracked"' + (!existing || existing.tracked ? ' checked' : '') + '><span class="check-label">Live koers volgen</span></label>' +
        '<p class="sheet-hint"><b>Aankopen</b> \u2014 datum, aantal stuks en aankoopprijs per stuk:</p>' +
      '<div id="lots-list">' + lots.map((l) => lotRow(l, cur0)).join('') + '</div>' +
      '<button type="button" class="btn btn-ghost btn-block" id="add-lot" style="margin-top:6px">' + Icons.plus + 'Aankoop toevoegen</button>' +
      '<div class="form-actions"><button type="submit" class="btn btn-gold btn-block">' + (existing ? 'Opslaan' : 'Aanmaken') + '</button></div>' +
      (existing
        ? '<button type="button" class="btn btn-danger btn-block" data-del style="margin-top:10px">' + Icons.trash + 'Verwijderen</button>'
        : '') +
      '</form>';

      const list = U.qs('#lots-list', sh.body);
      function applyCur(cur) {
        U.qsa('.lot-row', list).forEach((r) => {
          const sym = U.qs('.cur-sym', r);
          if (sym) sym.textContent = cur === 'USD' ? '$' : '\u20AC';
          const inp = U.qs('.lot-cost', r);
          if (inp) inp.setAttribute('aria-label', 'Betaald bedrag (' + (cur === 'USD' ? '$' : '\u20AC') + ')');
        });
      }
      const curSel = U.qs('[name="currency"]', sh.body);
      curSel.addEventListener('change', () => applyCur(curSel.value));
      U.qs('#add-lot', sh.body).addEventListener('click', () => {
        list.insertAdjacentHTML('beforeend', lotRow(null, curSel.value));
        applyCur(curSel.value);
        bindLotRows(list);
      });
      bindLotRows(list);

      const form = U.qs('form', sh.body);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        Forms.clearErrors(form);
        const tracked = U.qs('#stock-tracked', form).checked;
        const res = Forms.readForm(form, [
          { name: 'name', label: 'Naam', type: 'text', required: true },
          { name: 'ticker', label: 'Ticker', type: 'text', required: tracked },
          { name: 'currency', label: 'Valuta', type: 'text' },
          { name: 'bankId', label: 'Bank', type: 'text', required: true }
        ]);
        if (!res.ok) {
          toast(tracked ? 'Kies een bank en vul de ticker in' : 'Kies een bank voor dit aandeel', 'error');
          return;
        }
        const rows = U.qsa('.lot-row', list);
        const newLots = [];
        for (const r of rows) {
          const shares = Number(U.qs('.lot-shares', r).value);
          const price = Number(U.qs('.lot-cost', r).value);
          if (!U.qs('.lot-shares', r).value && !U.qs('.lot-cost', r).value) continue;
          const sh2 = isFinite(shares) ? shares : 0;
          const p2 = isFinite(price) ? price : 0;
          newLots.push({
            date: U.qs('.lot-date', r).value || '',
            shares: sh2,
            price: p2,
            cost: sh2 * p2
          });
        }
        if (!newLots.length) {
          toast('Voeg minstens \u00E9\u00E9n aankoop toe', 'error');
          return;
        }
        const stocks = await getStocks();
        const rec = {
          id: existing ? existing.id : 'stk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          name: res.values.name,
          ticker: String(res.values.ticker || '').toUpperCase(),
          currency: res.values.currency === 'USD' ? 'USD' : 'EUR',
          bankId: res.values.bankId || '',
          tracked: tracked,
          lots: newLots,
          createdAt: existing ? existing.createdAt : new Date().toISOString()
        };
        if (existing) {
          const i = stocks.findIndex((x) => x.id === existing.id);
          if (i >= 0) stocks[i] = rec;
        } else {
          stocks.push(rec);
        }
        await saveStocks(stocks);
        if (tracked) refreshQuotes(false);
        sh.close();
        toast(existing ? 'Aandeel bijgewerkt' : 'Aandeel toegevoegd');
        if (onDone) onDone();
      });

      const del = U.qs('[data-del]', sh.body);
      if (del) {
        del.addEventListener('click', async () => {
          const ok = await confirmAction({
            title: 'Aandeel verwijderen?',
            message: '"' + existing.name + '" en alle aankopen verdwijnen uit je vermogen.',
            confirmText: 'Verwijderen'
          });
          if (!ok) return;
          const stocks = await getStocks();
          await saveStocks(stocks.filter((s) => s.id !== existing.id));
          sh.close();
          toast('Aandeel verwijderd');
          if (onDone) onDone();
        });
      }
    });
  }

  function bindLotRows(list) {
    U.qsa('.lot-row', list).forEach((r) => {
      const d = U.qs('.lot-del', r);
      if (d && !d.getAttribute('data-bound')) {
        d.setAttribute('data-bound', '1');
        d.addEventListener('click', () => r.remove());
      }
    });
  }

  function accSheet(existing, onDone) {
    Promise.all([getBanks()]).then(([banks]) => {
      const sh = Sheet.open({ title: existing ? 'Rekening bewerken' : 'Nieuwe rekening', small: true });
      const bankOpts = [{ value: '', label: 'Zonder bank' }].concat(
        banks.map((b) => ({ value: b.id, label: b.name }))
      );
      sh.body.innerHTML =
        '<form class="form" novalidate>' +
        Forms.fieldRow({ name: 'name', label: 'Naam', type: 'text', value: existing ? existing.name : '', placeholder: 'bv. Zichtrekening' }) +
        Forms.fieldRow({ name: 'bankId', label: 'Bank', type: 'select', value: existing ? existing.bankId || '' : '', options: bankOpts }) +
        Forms.fieldRow({ name: 'balance', label: 'Saldo (\u20AC)', type: 'number', value: existing && existing.balance != null ? String(existing.balance) : '' }) +
        '<div class="form-actions"><button type="submit" class="btn btn-gold btn-block">' + (existing ? 'Opslaan' : 'Aanmaken') + '</button></div>' +
        (existing
          ? '<button type="button" class="btn btn-danger btn-block" data-del style="margin-top:10px">' + Icons.trash + 'Verwijderen</button>'
          : '') +
        '</form>';

      const form = U.qs('form', sh.body);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        Forms.clearErrors(form);
        const res = Forms.readForm(form, [
          { name: 'name', label: 'Naam', type: 'text', required: true },
          { name: 'bankId', label: 'Bank', type: 'text' },
          { name: 'balance', label: 'Saldo', type: 'number', required: true }
        ]);
        if (!res.ok) return;
        const accs = await getAccs();
        if (existing) {
          const rec = accs.find((a) => a.id === existing.id);
          if (rec) {
            rec.name = res.values.name;
            rec.bankId = res.values.bankId || '';
            rec.balance = res.values.balance;
          }
        } else {
          accs.push({
            id: 'acc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name: res.values.name,
            bankId: res.values.bankId || '',
            balance: Number(res.values.balance) || 0,
            createdAt: new Date().toISOString()
          });
        }
        await saveAccs(accs);
        sh.close();
        toast(existing ? 'Rekening bijgewerkt' : 'Rekening aangemaakt');
        if (onDone) onDone();
      });

      const del = U.qs('[data-del]', sh.body);
      if (del) {
        del.addEventListener('click', async () => {
          const ok = await confirmAction({
            title: 'Rekening verwijderen?',
            message: '"' + existing.name + '" verdwijnt uit je totaal. Dit kan niet ongedaan gemaakt worden.',
            confirmText: 'Verwijderen'
          });
          if (!ok) return;
          const accs = await getAccs();
          await saveAccs(accs.filter((a) => a.id !== existing.id));
          sh.close();
          toast('Rekening verwijderd');
          if (onDone) onDone();
        });
      }
    });
  }

  function bankSheet(existing, onDone) {
    const sh = Sheet.open({ title: existing ? 'Bank bewerken' : 'Nieuwe bank', small: true });
    sh.body.innerHTML =
      '<form class="form" novalidate>' +
      Forms.fieldRow({ name: 'name', label: 'Naam van de bank', type: 'text', value: existing ? existing.name : '', placeholder: 'bv. KBC' }) +
      '<div class="form-actions"><button type="submit" class="btn btn-gold btn-block">' + (existing ? 'Opslaan' : 'Toevoegen') + '</button></div>' +
      (existing
        ? '<button type="button" class="btn btn-danger btn-block" data-del style="margin-top:10px">' + Icons.trash + 'Bank verwijderen</button>'
        : '') +
      '</form>';

    const form = U.qs('form', sh.body);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      Forms.clearErrors(form);
      const res = Forms.readForm(form, [{ name: 'name', label: 'Naam', type: 'text', required: true }]);
      if (!res.ok) return;
      const banks = await getBanks();
      if (existing) {
        const rec = banks.find((b) => b.id === existing.id);
        if (rec) rec.name = res.values.name;
      } else {
        banks.push({
          id: 'bank_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          name: res.values.name,
          createdAt: new Date().toISOString()
        });
      }
      await saveBanks(banks);
      sh.close();
      toast(existing ? 'Bank bijgewerkt' : 'Bank toegevoegd');
      if (onDone) onDone();
    });

    const del = U.qs('[data-del]', sh.body);
    if (del) {
      del.addEventListener('click', async () => {
        const ok = await confirmAction({
          title: 'Bank verwijderen?',
          message: 'Rekeningen die bij "' + existing.name + '" horen blijven bestaan en komen onder "Zonder bank" terecht.',
          confirmText: 'Verwijderen'
        });
        if (!ok) return;
        const banks = await getBanks();
        const keep = banks.filter((b) => b.id !== existing.id);
        await saveBanks(keep);
        const accs = await getAccs();
        let changed = false;
        accs.forEach((a) => {
          if (a.bankId === existing.id) { a.bankId = ''; changed = true; }
        });
        if (changed) await saveAccs(accs);
        sh.close();
        toast('Bank verwijderd');
        if (onDone) onDone();
      });
    }
  }

  function bind(root) {
    U.qsa('[data-acc]', root).forEach((b) =>
      b.addEventListener('click', async () => {
        const accs = await getAccs();
        const acc = accs.find((a) => a.id === b.getAttribute('data-acc'));
        if (acc) accSheet(acc, () => render(lastRoot));
      })
    );
    U.qsa('[data-bank]', root).forEach((b) =>
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        const banks = await getBanks();
        const bank = banks.find((x) => x.id === b.getAttribute('data-bank'));
        if (bank) bankSheet(bank, () => render(lastRoot));
      })
    );
    U.qsa('[data-stock]', root).forEach((b) =>
      b.addEventListener('click', async () => {
        const stocks = await getStocks();
        const stock = stocks.find((s) => s.id === b.getAttribute('data-stock'));
        if (stock) stockSheet(stock, () => render(lastRoot));
      })
    );
    const refreshBtn = U.qs('[data-refresh-stocks]', root);
    if (refreshBtn) refreshBtn.addEventListener('click', () => refreshQuotes(true));

    U.qsa('[data-goal-edit]', root).forEach((b) =>
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        const goals = await getGoals();
        const g = goals.find((x) => x.id === b.getAttribute('data-goal-edit'));
        if (g) goalSheet(g, () => render(lastRoot));
      })
    );

    U.qsa('[data-goal-del]', root).forEach((b) =>
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = b.getAttribute('data-goal-del');
        const goals = await getGoals();
        await saveGoals(goals.filter((g) => g.id !== id));
        const allocs = await getAllocs();
        await saveAllocs(allocs.filter((a) => a.goalId !== id));
        toast('Doel verwijderd');
        render(lastRoot);
      })
    );

    U.qsa('[data-alloc-add]', root).forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const ctx = lastCtx;
        if (!ctx) return;
        const g = ctx.goals.find((x) => x.id === b.getAttribute('data-alloc-add'));
        if (g) allocateSheet(g, () => render(lastRoot));
      })
    );

    U.qsa('[data-alloc-del]', root).forEach((b) =>
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = b.getAttribute('data-alloc-del');
        const allocs = await getAllocs();
        await saveAllocs(allocs.filter((a) => a.id !== id));
        toast('Toewijzing verwijderd');
        render(lastRoot);
      })
    );
  }

  function goalSheet(existing, onDone) {
    const sh = Sheet.open({ title: existing ? 'Doel bewerken' : 'Nieuw doel', small: true });
    sh.body.innerHTML =
      '<form autocomplete="off">' +
      Forms.fieldRow({ name: 'name', label: 'Naam', type: 'text', required: true, value: existing ? existing.name : '', placeholder: 'bv. Huis' }) +
      Forms.fieldRow({ name: 'target', label: 'Doelbedrag (\u20AC)', type: 'number', required: true, step: '0.01', min: 0, value: existing && existing.target != null ? String(existing.target) : '', placeholder: 'bv. 40000' }) +
      '<div class="form-actions column">' +
      '<button type="submit" class="btn btn-gold btn-block">' + Icons.check + 'Opslaan</button>' +
      '<button type="button" class="btn btn-ghost btn-block" data-cancel>Annuleren</button>' +
      '</div></form>';
    const form = U.qs('form', sh.body);
    U.qs('[data-cancel]', sh.body).addEventListener('click', () => sh.close());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      Forms.clearErrors(form);
      const res = Forms.readForm(form, [
        { name: 'name', label: 'Naam', type: 'text', required: true },
        { name: 'target', label: 'Doelbedrag', type: 'number', required: true }
      ]);
      if (!res.ok) return;
      try {
        const list = await getGoals();
        const rec = existing
          ? Object.assign({}, existing)
          : { id: 'goal_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: new Date().toISOString() };
        rec.name = res.values.name.trim();
        rec.target = Math.max(0, Number(res.values.target) || 0);
        if (existing) {
          const i = list.findIndex((x) => x.id === existing.id);
          if (i >= 0) list[i] = rec;
        } else {
          list.push(rec);
        }
        await saveGoals(list);
        sh.close();
        toast(existing ? 'Doel bijgewerkt' : 'Doel toegevoegd');
        if (onDone) onDone();
      } catch (err) {
        toast('Opslaan mislukt', 'error');
      }
    });
  }

  function allocateSheet(goal, onDone) {
    const ctx = lastCtx;
    if (!ctx) return;
    const opts = ctx.accs
      .map((a) => {
        const free = (Number(a.balance) || 0) - allocForSrc(ctx.allocs, 'acc', a.id);
        return { v: 'acc:' + a.id, l: a.name + ' (' + U.fmtMoney(free < 0 ? 0 : free) + ' vrij)' };
      })
      .concat(
        ctx.stocks.map((s) => {
          const val = stockValue(s, ctx.quotes).value;
          const free = val - allocForSrc(ctx.allocs, 'stk', s.id);
          return { v: 'stk:' + s.id, l: s.name + ' (\u2248 ' + U.fmtMoney(free < 0 ? 0 : free) + ' vrij)' };
        })
      );
    if (!opts.length) {
      toast('Maak eerst een rekening of aandeel aan', 'error');
      return;
    }
    const sh = Sheet.open({ title: 'Geld toewijzen \u2014 ' + goal.name, small: true });
    sh.body.innerHTML =
      '<form autocomplete="off">' +
      Forms.fieldRow({ name: 'src', label: 'Bron', type: 'select', options: opts }) +
      Forms.fieldRow({ name: 'amount', label: 'Bedrag (\u20AC)', type: 'number', required: true, step: '0.01', min: 0, placeholder: 'bv. 2500' }) +
      '<div class="form-actions column">' +
      '<button type="submit" class="btn btn-gold btn-block">' + Icons.check + 'Toewijzen</button>' +
      '<button type="button" class="btn btn-ghost btn-block" data-cancel>Annuleren</button>' +
      '</div></form>';
    const form = U.qs('form', sh.body);
    U.qs('[data-cancel]', sh.body).addEventListener('click', () => sh.close());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      Forms.clearErrors(form);
      const res = Forms.readForm(form, [
        { name: 'src', label: 'Bron', type: 'text' },
        { name: 'amount', label: 'Bedrag', type: 'number', required: true }
      ]);
      if (!res.ok) return;
      const amount = Number(res.values.amount);
      if (!(amount > 0)) {
        toast('Vul een geldig bedrag in', 'error');
        return;
      }
      const parts = String(res.values.src).split(':');
      try {
        const allocs = await getAllocs();
        allocs.push({
          id: 'al_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          goalId: goal.id,
          srcType: parts[0],
          srcId: parts[1],
          amount: amount
        });
        await saveAllocs(allocs);
        sh.close();
        toast(U.fmtMoney(amount) + ' toegewezen aan ' + goal.name);
        if (onDone) onDone();
      } catch (err) {
        toast('Toewijzen mislukt', 'error');
      }
    });
  }

  window.Views = window.Views || {};
  window.Views.assets = render;
  window.AssetsAdd = { open: chooseSheet };
})();
