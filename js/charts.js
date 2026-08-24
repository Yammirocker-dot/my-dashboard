(function () {
  const U = window.U;
  const NS = 'http://www.w3.org/2000/svg';

  function niceMax(v) {
    if (!isFinite(v) || v <= 0) return 1;
    const exp = Math.floor(Math.log10(v));
    const base = Math.pow(10, exp);
    const f = v / base;
    let nf;
    if (f <= 1) nf = 1;
    else if (f <= 2) nf = 2;
    else if (f <= 2.5) nf = 2.5;
    else if (f <= 5) nf = 5;
    else nf = 10;
    return nf * base;
  }

  function svgOpen(w, h, label) {
    return '<svg class="chart-svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet" role="img"' + (label ? ' aria-label="' + U.esc(label) + '"' : '') + '>';
  }

  function gridLines(padL, innerW, padT, innerH, max, fmt) {
    let out = '';
    [1, 0.5, 0].forEach((f, i) => {
      const y = padT + innerH * (1 - f);
      const val = max * f;
      out += '<line x1="' + padL + '" y1="' + y + '" x2="' + (padL + innerW) + '" y2="' + y + '" class="ch-grid' + (i === 2 ? ' ch-grid-zero' : '') + '"/>';
      out += '<text x="' + (padL - 8) + '" y="' + (y + 3.5) + '" text-anchor="end" class="ch-axis">' + U.esc(fmt(val)) + '</text>';
    });
    return out;
  }

  function xLabels(labels, padL, innerW, padT, innerH) {
    const n = labels.length;
    const slot = innerW / n;
    let out = '';
    labels.forEach((lb, i) => {
      out += '<text x="' + (padL + i * slot + slot / 2) + '" y="' + (padT + innerH + 16) + '" text-anchor="middle" class="ch-axis">' + U.esc(lb) + '</text>';
    });
    return out;
  }

  function stackedBars(opts) {
    const o = opts || {};
    const labels = o.labels || [];
    const series = o.series || [];
    const fmt = o.fmt || ((v) => U.fmtMoney(v));
    const W = 640;
    const H = o.height || 210;
    const padL = 52, padR = 12, padT = 14, padB = 26;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const n = labels.length;
    if (!n) return '';

    const totals = labels.map((_, i) => series.reduce((s, sr) => s + Math.max(0, Number(sr.values[i]) || 0), 0));
    const max = niceMax(Math.max.apply(null, totals.concat([1])));

    let out = svgOpen(W, H, o.label || '');
    out += '<g>' + gridLines(padL, innerW, padT, innerH, max, fmt) + '</g>';

    const slot = innerW / n;
    const bw = Math.min(slot * 0.56, 40);
    labels.forEach((_, i) => {
      const x = padL + i * slot + (slot - bw) / 2;
      let acc = 0;
      series.forEach((sr) => {
        const v = Math.max(0, Number(sr.values[i]) || 0);
        if (v <= 0) return;
        const h = (v / max) * innerH;
        acc += h;
        const y = padT + innerH - acc;
        out += '<rect x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(bw) + '" height="' + r2(h) + '" rx="3" fill="' + sr.color + '"><title>' +
          U.esc(labels[i] + ' \u00B7 ' + sr.name + ': ' + fmt(v)) + '</title></rect>';
      });
      if (totals[i] > 0) {
        out += '<rect x="' + r2(x) + '" y="' + r2(padT + innerH - acc - 1) + '" width="' + r2(bw) + '" height="1" fill="' + (series.length ? series[series.length - 1].color : '#fff') + '"/>';
      }
    });

    out += xLabels(labels, padL, innerW, padT, innerH);
    out += '</svg>';
    return out;
  }

  function groupedBars(opts) {
    const o = opts || {};
    const labels = o.labels || [];
    const series = o.series || [];
    const fmt = o.fmt || ((v) => U.fmtMoney(v));
    const W = 640;
    const H = o.height || 210;
    const padL = 52, padR = 12, padT = 14, padB = 26;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const n = labels.length;
    if (!n) return '';

    const allVals = [];
    series.forEach((sr) => sr.values.forEach((v) => allVals.push(Math.max(0, Number(v) || 0))));
    const max = niceMax(Math.max.apply(null, allVals.concat([1])));

    let out = svgOpen(W, H, o.label || '');
    out += '<g>' + gridLines(padL, innerW, padT, innerH, max, fmt) + '</g>';

    const slot = innerW / n;
    const gap = 3;
    const bw = Math.max(4, Math.min((slot - 6 - gap * (series.length - 1)) / series.length, 18));
    const groupW = bw * series.length + gap * (series.length - 1);
    labels.forEach((_, i) => {
      const gx = padL + i * slot + (slot - groupW) / 2;
      series.forEach((sr, si) => {
        const v = Math.max(0, Number(sr.values[i]) || 0);
        const h = Math.max(v > 0 ? 2 : 0, (v / max) * innerH);
        const x = gx + si * (bw + gap);
        const y = padT + innerH - h;
        out += '<rect x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(bw) + '" height="' + r2(Math.max(h, v > 0 ? 2 : 0)) + '" rx="2.5" fill="' + sr.color + '"><title>' +
          U.esc(labels[i] + ' \u00B7 ' + sr.name + ': ' + fmt(v)) + '</title></rect>';
      });
    });

    out += xLabels(labels, padL, innerW, padT, innerH);
    out += '</svg>';
    return out;
  }

  function donut(opts) {
    const o = opts || {};
    const items = (o.items || []).filter((it) => it.value > 0);
    const size = 220;
    const c = size / 2;
    const rad = 78;
    const sw = 20;
    const C = 2 * Math.PI * rad;
    const total = items.reduce((s, it) => s + it.value, 0);
    const fmt = o.fmt || ((v) => U.fmtMoney(v));

    let out = svgOpen(size, size, o.label || '');
    out += '<circle cx="' + c + '" cy="' + c + '" r="' + rad + '" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="' + sw + '"/>';
    if (total > 0) {
      let offset = 0;
      items.forEach((it) => {
        const frac = it.value / total;
        const len = frac * C;
        out += '<circle cx="' + c + '" cy="' + c + '" r="' + rad + '" fill="none" stroke="' + it.color + '" stroke-width="' + sw + '" ' +
          'stroke-dasharray="' + r2(len) + ' ' + r2(C - len) + '" stroke-dashoffset="' + r2(-offset) + '" transform="rotate(-90 ' + c + ' ' + c + ')">' +
          '<title>' + U.esc(it.label + ': ' + fmt(it.value) + ' (' + U.fmtPct(frac * 100) + ')') + '</title></circle>';
        offset += len;
      });
    }
    out += '<text x="' + c + '" y="' + (c - 4) + '" text-anchor="middle" class="ch-center-big">' + U.esc(fmt(total)) + '</text>';
    out += '<text x="' + c + '" y="' + (c + 18) + '" text-anchor="middle" class="ch-center-sub">' + U.esc(o.centerSub || 'totaal') + '</text>';
    out += '</svg>';
    return out;
  }

  function yearlyBars(opts) {
    const o = opts || {};
    const items = o.items || [];
    const fmt = o.fmt || ((v) => U.fmtMoney(v));
    const W = 640;
    const H = 230;
    const padL = 52, padR = 12, padT = 26, padB = 26;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    if (!items.length) return '';
    const vals = items.map((it) => Math.max(0, Number(it.value) || 0));
    const max = niceMax(Math.max.apply(null, vals.concat([1])));
    const slot = innerW / items.length;
    const bw = Math.min(slot * 0.5, 64);

    let out = svgOpen(W, H, o.label || '');
    out += '<g>' + gridLines(padL, innerW, padT, innerH, max, fmt) + '</g>';
    items.forEach((it, i) => {
      const v = Math.max(0, Number(it.value) || 0);
      const h = Math.max(v > 0 ? 3 : 0, (v / max) * innerH);
      const x = padL + i * slot + (slot - bw) / 2;
      const y = padT + innerH - h;
      if (v > 0) {
        out += '<text x="' + r2(x + bw / 2) + '" y="' + r2(y - 7) + '" text-anchor="middle" class="ch-val">' + U.esc(fmt(v)) + '</text>';
      }
      out += '<rect x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(bw) + '" height="' + r2(h) + '" rx="5" fill="' + (it.color || '#d4903b') + '">' +
        '<title>' + U.esc(String(it.label) + ': ' + fmt(v)) + '</title></rect>';
      out += '<text x="' + r2(x + bw / 2) + '" y="' + (padT + innerH + 17) + '" text-anchor="middle" class="ch-axis">' + U.esc(String(it.label)) + '</text>';
    });
    out += '</svg>';
    return out;
  }

  function r2(n) { return Math.round(n * 100) / 100; }

  window.Charts = { stackedBars, groupedBars, donut, yearlyBars };
})();
