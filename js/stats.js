(function () {
  const U = window.U;

  function pad2(n) { return U.pad2(n); }

  function periodRange(period) {
    const now = new Date();
    const t = (period && period.type) || 'month';
    if (t === 'all') {
      return { start: null, end: null, label: 'Alle periodes' };
    }
    if (t === 'year') {
      const y = period.y != null ? period.y : now.getFullYear();
      return { start: y + '-01-01', end: y + '-12-31', label: String(y) };
    }
    const y = now.getFullYear();
    const m = now.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    return {
      start: y + '-' + pad2(m + 1) + '-01',
      end: y + '-' + pad2(m + 1) + '-' + pad2(last),
      label: U.MONTHS_LONG[m] + ' ' + y
    };
  }

  function inRange(iso, r) {
    if (!iso) return false;
    if (r.start && iso < r.start) return false;
    if (r.end && iso > r.end) return false;
    return true;
  }

  function summarize(data, r) {
    const projects = (data.projects || []).filter((p) => inRange(p.date, r));
    let income = 0, hours = 0;
    projects.forEach((p) => {
      income += Number(p.income) || 0;
      hours += U.projectHours(p);
    });
    const monthsElapsed = calcMonthsElapsed(data, r);

    let outstanding = 0;
    (data.projects || []).forEach((p) => {
      if (p.status !== 'paid') outstanding += Number(p.income) || 0;
    });

    return {
      income,
      hoursTotal: hours,
      projectCount: projects.length,
      incomePerHour: hours > 0 ? income / hours : null,
      avgMonth: monthsElapsed > 0 ? income / monthsElapsed : null,
      monthsElapsed,
      bestMonth: findBestMonth(data, r),
      outstanding,
      hasData: projects.length > 0
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
    let endY = curY, endM = curM;
    if (r.end) {
      const rp = r.end.slice(0, 7).split('-').map(Number);
      if (rp[0] < curY || (rp[0] === curY && rp[1] < curM)) {
        endY = rp[0];
        endM = rp[1];
      }
    }
    return Math.max(1, (endY - parts[0]) * 12 + (endM - parts[1]) + 1);
  }

  function dataBounds(data) {
    let min = null, max = null;
    (data.projects || []).forEach((p) => {
      if (!p.date) return;
      if (!min || p.date < min) min = p.date;
      if (!max || p.date > max) max = p.date;
    });
    return { min, max };
  }

  function monthBuckets(data, year) {
    const buckets = [];
    for (let m = 0; m < 12; m++) {
      buckets.push({ key: year + '-' + pad2(m + 1), label: U.MONTHS_SHORT[m], income: 0, count: 0 });
    }
    const byKey = {};
    buckets.forEach((b) => { byKey[b.key] = b; });
    (data.projects || []).forEach((p) => {
      const b = byKey[U.monthKey(p.date)];
      if (b) {
        b.income += Number(p.income) || 0;
        b.count++;
      }
    });
    return buckets;
  }

  function flatMonths(data, minISO, maxISO) {
    const keys = [];
    const [sy, sm] = minISO.slice(0, 7).split('-').map(Number);
    const [ey, em] = maxISO.slice(0, 7).split('-').map(Number);
    for (let y = sy; y <= ey; y++) {
      for (let m = (y === sy ? sm : 1); m <= (y === ey ? em : 12); m++) keys.push(y + '-' + pad2(m));
    }
    const byKey = {};
    const list = keys.map((k) => {
      const [y, m] = k.split('-').map(Number);
      const b = { key: k, label: U.MONTHS_SHORT[m - 1], income: 0, count: 0 };
      byKey[k] = b;
      return b;
    });
    (data.projects || []).forEach((p) => {
      const b = byKey[U.monthKey(p.date)];
      if (b) {
        b.income += Number(p.income) || 0;
        b.count++;
      }
    });
    return list;
  }

  function findBestMonth(data, r) {
    let months;
    if (r.start) {
      months = monthBuckets(data, Number(r.year != null ? r.year : r.start.slice(0, 4))).filter((b) => inRange(b.key + '-01', r));
    } else {
      const bounds = dataBounds(data);
      if (!bounds.min) return null;
      const today = U.todayISO();
      months = flatMonths(data, bounds.min, today > bounds.max ? today : bounds.max);
    }
    let best = null;
    months.forEach((b) => {
      if (b.income > 0 && (!best || b.income > best.value)) {
        best = { key: b.key, value: b.income };
      }
    });
    if (!best) return null;
    const [y, m] = best.key.split('-').map(Number);
    best.label = U.MONTHS_SHORT[m - 1] + ' ' + y;
    return best;
  }

  function yearlyBreakdown(data) {
    const years = new Map();
    (data.projects || []).forEach((p) => {
      const y = U.yearKey(p.date);
      if (!y) return;
      if (!years.has(y)) years.set(y, { year: y, income: 0 });
      years.get(y).income += Number(p.income) || 0;
    });
    const list = Array.from(years.values());
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
    return {
      target,
      current,
      pct,
      rawPct: target > 0 ? (current / target) * 100 : 0,
      remaining: Math.max(0, target - current),
      exceeded: target > 0 && current >= target,
      year
    };
  }

  window.Stats = {
    periodRange,
    inRange,
    summarize,
    monthBuckets,
    flatMonths,
    yearlyBreakdown,
    goalInfo,
    dataBounds
  };
})();
