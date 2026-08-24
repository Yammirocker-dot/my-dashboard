(function () {
  const U = window.U;

  function pad2(n) { return U.pad2(n); }

  function periodRange(period) {
    const now = new Date();
    if (!period || period.type === 'all') {
      return { start: null, end: null, year: null, label: 'Alle periodes' };
    }
    if (period.type === 'month') {
      const y = period.y != null ? period.y : now.getFullYear();
      const m = period.m != null ? period.m : now.getMonth();
      const last = new Date(y, m + 1, 0).getDate();
      return {
        start: y + '-' + pad2(m + 1) + '-01',
        end: y + '-' + pad2(m + 1) + '-' + pad2(last),
        year: y,
        label: U.MONTHS_LONG[m] + ' ' + y
      };
    }
    const y = period.y != null ? period.y : now.getFullYear();
    return { start: y + '-01-01', end: y + '-12-31', year: y, label: String(y) };
  }

  function inRange(iso, r) {
    if (!iso) return false;
    if (r.start && iso < r.start) return false;
    if (r.end && iso > r.end) return false;
    return true;
  }

  function summarize(data, r) {
    const projects = (data.projects || []).filter((p) => inRange(p.date, r));
    const others = (data.otherIncome || []).filter((e) => inRange(e.date, r));
    const exps = (data.expenses || []).filter((e) => inRange(e.date, r));

    let vhx = 0, filmingH = 0, editingH = 0;
    projects.forEach((p) => {
      vhx += Number(p.income) || 0;
      filmingH += Number(p.filmingHours) || 0;
      editingH += Number(p.editingHours) || 0;
    });
    let other = 0;
    others.forEach((e) => { other += Number(e.amount) || 0; });
    let expenses = 0;
    exps.forEach((e) => { expenses += Number(e.amount) || 0; });

    const total = vhx + other;
    const hoursTotal = filmingH + editingH;

    let outstanding = 0;
    (data.projects || []).forEach((p) => {
      if (p.paymentStatus !== 'paid') outstanding += Number(p.income) || 0;
    });

    const monthsElapsed = calcMonthsElapsed(data, r);

    const bestMonth = findBestMonth(data, r, 'total');
    const bestVhxMonth = findBestMonth(data, r, 'vhx');

    return {
      vhx,
      other,
      total,
      expenses,
      net: total - expenses,
      projectCount: projects.length,
      hoursFilming: filmingH,
      hoursEditing: editingH,
      hoursTotal,
      incomePerHour: hoursTotal > 0 ? vhx / hoursTotal : null,
      avgMonth: monthsElapsed > 0 ? total / monthsElapsed : null,
      avgVhxMonth: monthsElapsed > 0 ? vhx / monthsElapsed : null,
      monthsElapsed,
      outstanding,
      bestMonth,
      bestVhxMonth,
      hasData: total !== 0 || expenses !== 0 || projects.length > 0 || others.length > 0 || exps.length > 0
    };
  }

  function calcMonthsElapsed(data, r) {
    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth() + 1;
    let startYM;
    if (r.start) {
      startYM = r.start.slice(0, 7);
    } else {
      const b = dataBounds(data);
      if (!b.min) return 0;
      startYM = b.min.slice(0, 7);
    }
    const parts = startYM.split('-').map(Number);
    const sy = parts[0], sm = parts[1];
    let endY = curY, endM = curM;
    if (r.end) {
      const rp = r.end.slice(0, 7).split('-').map(Number);
      if (rp[0] < curY || (rp[0] === curY && rp[1] < curM)) {
        endY = rp[0];
        endM = rp[1];
      }
    }
    return Math.max(1, (endY - sy) * 12 + (endM - sm) + 1);
  }

  function allMonthsBetween(startISO, endISO) {
    const keys = [];
    const [sy, sm] = startISO.slice(0, 7).split('-').map(Number);
    const [ey, em] = endISO.slice(0, 7).split('-').map(Number);
    for (let y = sy; y <= ey; y++) {
      const mStart = y === sy ? sm : 1;
      const mEnd = y === ey ? em : 12;
      for (let m = mStart; m <= mEnd; m++) keys.push(y + '-' + pad2(m));
    }
    return keys;
  }

  function dataBounds(data) {
    let min = null, max = null;
    const scan = (iso) => {
      if (!iso) return;
      if (!min || iso < min) min = iso;
      if (!max || iso > max) max = iso;
    };
    (data.projects || []).forEach((p) => scan(p.date));
    (data.otherIncome || []).forEach((e) => scan(e.date));
    (data.expenses || []).forEach((e) => scan(e.date));
    return { min, max };
  }

  function findBestMonth(data, r, kind) {
    let months;
    if (r.start) {
      months = monthBuckets(data, Number(r.year)).filter((b) => inRange(b.key + '-01', r));
    } else {
      const bounds = dataBounds(data);
      if (!bounds.min) return null;
      const todayISOStr = U.todayISO();
      months = flatMonths(data, bounds.min, todayISOStr > bounds.max ? todayISOStr : bounds.max);
    }
    let best = null;
    months.forEach((b) => {
      const val = kind === 'vhx' ? b.vhx : b.total;
      if (val > 0 && (!best || val > best.value)) {
        best = { key: b.key, value: val, vhx: b.vhx, other: b.other };
      }
    });
    if (!best) return null;
    const [y, m] = best.key.split('-').map(Number);
    best.label = U.MONTHS_SHORT[m - 1] + ' ' + y;
    best.vhxDominant = best.vhx >= best.other;
    return best;
  }

  function monthBuckets(data, year) {
    const buckets = [];
    for (let m = 0; m < 12; m++) {
      buckets.push({
        key: year + '-' + pad2(m + 1),
        label: U.MONTHS_SHORT[m],
        vhx: 0,
        other: 0,
        expenses: 0,
        total: 0,
        net: 0,
        count: 0
      });
    }
    const byKey = {};
    buckets.forEach((b) => { byKey[b.key] = b; });
    (data.projects || []).forEach((p) => {
      const b = byKey[U.monthKey(p.date)];
      if (b) {
        b.vhx += Number(p.income) || 0;
        b.count++;
      }
    });
    (data.otherIncome || []).forEach((e) => {
      const b = byKey[U.monthKey(e.date)];
      if (b) b.other += Number(e.amount) || 0;
    });
    (data.expenses || []).forEach((e) => {
      const b = byKey[U.monthKey(e.date)];
      if (b) b.expenses += Number(e.amount) || 0;
    });
    buckets.forEach((b) => {
      b.total = b.vhx + b.other;
      b.net = b.total - b.expenses;
    });
    return buckets;
  }

  function flatMonths(data, minISO, maxISO) {
    const keys = allMonthsBetween(minISO.slice(0, 7), maxISO.slice(0, 7));
    const byKey = {};
    const list = keys.map((k) => {
      const [y, m] = k.split('-').map(Number);
      const b = { key: k, label: U.MONTHS_SHORT[m - 1], vhx: 0, other: 0, expenses: 0, total: 0, net: 0, count: 0 };
      byKey[k] = b;
      return b;
    });
    (data.projects || []).forEach((p) => {
      const b = byKey[U.monthKey(p.date)];
      if (b) { b.vhx += Number(p.income) || 0; b.count++; }
    });
    (data.otherIncome || []).forEach((e) => {
      const b = byKey[U.monthKey(e.date)];
      if (b) b.other += Number(e.amount) || 0;
    });
    (data.expenses || []).forEach((e) => {
      const b = byKey[U.monthKey(e.date)];
      if (b) b.expenses += Number(e.amount) || 0;
    });
    list.forEach((b) => {
      b.total = b.vhx + b.other;
      b.net = b.total - b.expenses;
    });
    return list;
  }

  function yearlyBreakdown(data) {
    const years = new Map();
    const ensure = (y) => {
      if (!years.has(y)) years.set(y, { year: y, vhx: 0, other: 0, expenses: 0, total: 0, net: 0 });
      return years.get(y);
    };
    (data.projects || []).forEach((p) => {
      const y = U.yearKey(p.date);
      if (y) ensure(y).vhx += Number(p.income) || 0;
    });
    (data.otherIncome || []).forEach((e) => {
      const y = U.yearKey(e.date);
      if (y) ensure(y).other += Number(e.amount) || 0;
    });
    (data.expenses || []).forEach((e) => {
      const y = U.yearKey(e.date);
      if (y) ensure(y).expenses += Number(e.amount) || 0;
    });
    const list = Array.from(years.values());
    list.forEach((r) => {
      r.total = r.vhx + r.other;
      r.net = r.total - r.expenses;
    });
    list.sort((a, b) => a.year - b.year);
    return list;
  }

  function goalInfo(settings, projects) {
    const target = Number(settings.goal) || 0;
    const year = String(new Date().getFullYear());
    let current = 0;
    (projects || []).forEach((p) => {
      if (U.yearKey(p.date) === year) current += Number(p.income) || 0;
    });
    const pct = target > 0 ? Math.max(0, Math.min(100, (current / target) * 100)) : 0;
    const rawPct = target > 0 ? (current / target) * 100 : 0;
    return {
      target,
      current,
      pct,
      rawPct,
      remaining: Math.max(0, target - current),
      exceeded: target > 0 && current >= target,
      year
    };
  }

  function clientStats(projects, clientId) {
    const list = (projects || []).filter((p) => p.clientId === clientId);
    let total = 0, hours = 0;
    list.forEach((p) => {
      total += Number(p.income) || 0;
      hours += (Number(p.filmingHours) || 0) + (Number(p.editingHours) || 0);
    });
    return {
      count: list.length,
      total,
      avg: list.length ? total / list.length : null,
      hours,
      incomePerHour: hours > 0 ? total / hours : null,
      projects: list
    };
  }

  function statusCounts(projects) {
    const counts = {};
    U.PROJECT_STATUS.forEach((s) => { counts[s.id] = 0; });
    (projects || []).forEach((p) => {
      if (counts[p.status] != null) counts[p.status]++;
    });
    counts.all = (projects || []).length;
    return counts;
  }

  window.Stats = {
    periodRange,
    inRange,
    summarize,
    monthBuckets,
    flatMonths,
    yearlyBreakdown,
    goalInfo,
    clientStats,
    statusCounts,
    dataBounds
  };
})();
