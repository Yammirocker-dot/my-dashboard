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
  function investedOf(s) {
    return (s.lots || []).reduce((t, l) => t + (Number(l.cost) || 0), 0);
  }
  function stockValue(s, quotes) {
    const inv = investedOf(s);
    let native = inv;
    let live = false;
    if (s.tracked) {
      const q = quotes[String(s.ticker || '').toUpperCase()];
      if (q && q.price) {
        native = sharesOf(s) * q.price;
        live = true;
      }
    }
    const usd = s.currency === 'USD';
    const rate = quotes['USDEUR'] && quotes['USDEUR'].price ? quotes['USDEUR'].price : 0.92;
    return { native: native, value: usd ? native * rate : native, live: live };
  }

  function totalOf(list) {
    return list.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  }

  function render(root) {
    Promise.all([getAccs(), getBanks(), getStocks(), getQuotes()]).then(([accs, banks, stocks, quotes]) => {
      draw(root, accs, banks, stocks, quotes);
      const tickers = Array.from(new Set((stocks || []).filter((s) => s.tracked).map((s) => String(s.ticker).toUpperCase())));
      if (tickers.length && !autoFetched) {
        autoFetched = true;
        refreshQuotes(false);
      }
    });
  }

  let autoFetched = false;

  async function fetchQuote(ticker) {
    const target = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ticker) + '?interval=1d&range=1d';
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
        const meta = r && r.meta;
        const price = meta && meta.regularMarketPrice != null ? Number(meta.regularMarketPrice) : null;
        if (price == null || !isFinite(price)) continue;
        let prev = null;
        if (meta) {
          if (meta.chartPreviousClose != null) prev = Number(meta.chartPreviousClose);
          else if (meta.previousClose != null) prev = Number(meta.previousClose);
        }
        return { price: price, prevClose: prev, ts: new Date().toISOString() };
      } catch (e) {}
    }
    return null;
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
      }
      await saveQuotes(quotes);
      if (verbose) toast(ok === total ? 'Koersen bijgewerkt' : ok ? ok + '/' + total + ' koersen opgehaald' : 'Kon koersen niet ophalen (offline?)', ok ? undefined : 'error');
      if (ok && lastRoot) render(lastRoot);
    } catch (e) {
      if (verbose) toast('Kon koersen niet ophalen', 'error');
    }
  }

  function accTile(a) {
    return (
      '<button type="button" class="acc-tile" data-acc="' + U.esc(a.id) + '">' +
      '<span class="acc-name">' + U.esc(a.name) + '</span>' +
      '<span class="row-money' + ((Number(a.balance) || 0) < 0 ? ' neg' : '') + '">' + U.esc(U.fmtMoney(a.balance)) + '</span>' +
      '</button>'
    );
  }

  function stockTile(s, quotes) {
    const v = stockValue(s, quotes);
    const inv = investedOf(s);
    const sh = sharesOf(s);
    const cur = s.currency === 'USD' ? 'USD' : 'EUR';
    let sub;
    if (!s.tracked) {
      sub = '<span class="stock-sub">Niet getrackt \u00B7 ' + sh + ' st.</span>';
    } else if (v.live && inv > 0) {
      const diff = v.native - inv;
      const pct = Math.round((diff / inv) * 1000) / 10;
      sub = '<span class="stock-sub">' + (diff >= 0 ? '<b class="up">+' : '<b class="down">') + U.esc(fmtCur(diff, cur)) + ' (' + (pct >= 0 ? '+' : '') + pct + '%)</b></span>';
    } else {
      sub = '<span class="stock-sub">' + sh + ' stuks</span>';
    }
    return (
      '<button type="button" class="acc-tile stock" data-stock="' + U.esc(s.id) + '">' +
      '<span class="acc-name">' + U.esc(s.name) + ' <span class="ticker-chip">' + U.esc(String(s.ticker).toUpperCase()) + '</span></span>' +
      '<span class="row-money' + (v.value < 0 ? ' neg' : '') + '">' + U.esc(fmtCur(v.native, cur)) + '</span>' +
      sub +
      '</button>'
    );
  }

  let lastRoot = null;

  function draw(root, accs, banks, stocks, quotes) {
    lastRoot = root;
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
            list.map(accTile).join('') +
            bStocks.map((s) => stockTile(s, quotes)).join('') +
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
        loose.map(accTile).join('') +
        looseStocks.map((s) => stockTile(s, quotes)).join('') +
        '</div></div>';
    }

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
      '</div>';
    U.qs('[data-add-bank]', sh.body).addEventListener('click', () => { sh.close(); bankSheet(null, () => render(lastRoot)); });
    U.qs('[data-add-acc]', sh.body).addEventListener('click', () => { sh.close(); accSheet(null, () => render(lastRoot)); });
    U.qs('[data-add-stock]', sh.body).addEventListener('click', () => { sh.close(); stockSheet(null, () => render(lastRoot)); });
  }

  function lotRow(lot, cur) {
    const l = lot || { date: U.todayISO(), shares: '', cost: '' };
    const c = cur === 'USD' ? 'USD' : 'EUR';
    return (
      '<div class="lot-row">' +
      '<input type="date" class="input lot-date" value="' + U.esc(l.date || '') + '" aria-label="Aankoopdatum">' +
      '<input type="number" step="any" min="0" class="input lot-shares" placeholder="Stuks" value="' + (l.shares != null && l.shares !== '' ? l.shares : '') + '" aria-label="Aantal stuks">' +
      '<input type="number" step="0.01" min="0" class="input lot-cost" placeholder="' + (c === 'USD' ? '$' : '\u20AC') + '" value="' + (l.cost != null && l.cost !== '' ? l.cost : '') + '" aria-label="Betaald bedrag (' + (c === 'USD' ? '$' : '\u20AC') + ')">' +
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
        '<p class="sheet-hint"><b>Aankopen</b> \u2014 datum, aantal stuks en betaald bedrag:</p>' +
      '<div id="lots-list">' + lots.map((l) => lotRow(l, cur0)).join('') + '</div>' +
      '<button type="button" class="btn btn-ghost btn-block" id="add-lot" style="margin-top:6px">' + Icons.plus + 'Aankoop toevoegen</button>' +
      '<div class="form-actions"><button type="submit" class="btn btn-gold btn-block">' + (existing ? 'Opslaan' : 'Aanmaken') + '</button></div>' +
      (existing
        ? '<button type="button" class="btn btn-danger btn-block" data-del style="margin-top:10px">' + Icons.trash + 'Verwijderen</button>'
        : '') +
      '</form>';

      const list = U.qs('#lots-list', sh.body);
      U.qs('#add-lot', sh.body).addEventListener('click', () => {
        const curSel = U.qs('[name="currency"]', form || sh.body);
        list.insertAdjacentHTML('beforeend', lotRow(null, curSel ? curSel.value : cur0));
        bindLotRows(list);
      });
      bindLotRows(list);

      const form = U.qs('form', sh.body);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        Forms.clearErrors(form);
        const res = Forms.readForm(form, [
          { name: 'name', label: 'Naam', type: 'text', required: true },
          { name: 'ticker', label: 'Ticker', type: 'text', required: true },
          { name: 'currency', label: 'Valuta', type: 'text' },
          { name: 'bankId', label: 'Bank', type: 'text', required: true }
        ]);
        if (!res.ok) {
          toast('Kies een bank voor dit aandeel', 'error');
          return;
        }
        const rows = U.qsa('.lot-row', list);
        const newLots = [];
        for (const r of rows) {
          const shares = Number(U.qs('.lot-shares', r).value);
          const cost = Number(U.qs('.lot-cost', r).value);
          if (!U.qs('.lot-shares', r).value && !U.qs('.lot-cost', r).value) continue;
          newLots.push({
            date: U.qs('.lot-date', r).value || '',
            shares: isFinite(shares) ? shares : 0,
            cost: isFinite(cost) ? cost : 0
          });
        }
        if (!newLots.length) {
          toast('Voeg minstens \u00E9\u00E9n aankoop toe', 'error');
          return;
        }
        const tracked = U.qs('#stock-tracked', form).checked;
        const stocks = await getStocks();
        const rec = {
          id: existing ? existing.id : 'stk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          name: res.values.name,
          ticker: String(res.values.ticker).toUpperCase(),
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
  }

  window.Views = window.Views || {};
  window.Views.assets = render;
  window.AssetsAdd = { open: chooseSheet };
})();
