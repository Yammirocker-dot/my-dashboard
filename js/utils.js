(function () {
  const MONTHS_LONG = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  const MONTHS_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const DAYS_SHORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

  const PROJECT_STATUS = [
    { id: 'idea', label: 'Idee', color: '#96a3b5' },
    { id: 'planned', label: 'Gepland', color: '#7fa3c9' },
    { id: 'filming', label: 'Opname', color: '#d4903b' },
    { id: 'editing', label: 'Montage', color: '#ab93cf' },
    { id: 'delivered', label: 'Afgeleverd', color: '#85bd90' },
    { id: 'paid', label: 'Betaald', color: '#d9b36a' }
  ];

  const PAYMENT_STATUS = [
    { id: 'to_invoice', label: 'Te factureren', color: '#96a3b5' },
    { id: 'sent', label: 'Factuur verstuurd', color: '#7fa3c9' },
    { id: 'waiting', label: 'Wacht op betaling', color: '#d4903b' },
    { id: 'paid', label: 'Betaald', color: '#85bd90' }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function dateToISO(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function todayISO() { return dateToISO(new Date()); }

  function parseISO(iso) {
    if (!iso || typeof iso !== 'string') return null;
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  function isValidISO(iso) { return !!parseISO(iso); }

  function monthKey(iso) { return typeof iso === 'string' ? iso.slice(0, 7) : ''; }
  function yearKey(iso) { return typeof iso === 'string' ? iso.slice(0, 4) : ''; }

  function fmtMoney(v, opts) {
    const o = opts || {};
    let n = Number(v);
    if (!isFinite(n)) n = 0;
    const neg = n < -0.0001;
    const abs = Math.abs(n);
    const frac = o.decimals != null ? o.decimals : Math.round(abs * 100) % 100 === 0 ? 0 : 2;
    let s = new Intl.NumberFormat('nl-BE', { minimumFractionDigits: frac, maximumFractionDigits: frac }).format(abs);
    s = '\u20AC' + s;
    if (neg) s = '-' + s;
    else if (o.sign && n > 0.0001) s = '+' + s;
    return s;
  }

  function fmtCompact(v) {
    const n = Number(v) || 0;
    const abs = Math.abs(n);
    if (abs >= 1000) {
      const k = abs / 1000;
      const s = new Intl.NumberFormat('nl-BE', { maximumFractionDigits: k >= 10 ? 0 : 1 }).format(k);
      return (n < 0 ? '-' : '') + s + 'k';
    }
    return new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 0 }).format(n);
  }

  function fmtPct(v, decimals) {
    if (!isFinite(v)) v = 0;
    return new Intl.NumberFormat('nl-BE', { minimumFractionDigits: decimals != null ? decimals : 1, maximumFractionDigits: decimals != null ? decimals : 1 }).format(v) + '%';
  }

  function fmtNum(v, maxDec) {
    const n = Number(v) || 0;
    return new Intl.NumberFormat('nl-BE', { maximumFractionDigits: maxDec != null ? maxDec : 2 }).format(n);
  }

  function fmtHours(v) {
    if (v == null || v === '' || !isFinite(Number(v))) return '\u2013';
    return fmtNum(v, 1) + ' u';
  }

  function fmtBudget(p) {
    const lo = p && p.budgetMin != null && p.budgetMin !== '' ? Number(p.budgetMin) : null;
    const hi = p && p.budgetMax != null && p.budgetMax !== '' ? Number(p.budgetMax) : null;
    const f = (n) => '\u20AC ' + new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 0 }).format(n);
    if (lo != null && hi != null && hi > lo) return f(lo) + ' \u2013 ' + f(hi);
    if (lo != null) return f(lo);
    if (hi != null) return f(hi);
    return '\u2013';
  }

  function parseNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    if (typeof v !== 'string') return NaN;
    let s = v.trim().replace(/\s/g, '');
    if (!s) return NaN;
    if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return isFinite(n) ? n : NaN;
  }

  function fmtDate(iso) {
    const d = parseISO(iso);
    if (!d) return '\u2013';
    return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] + ' ' + d.getFullYear();
  }

  function fmtDateShort(iso) {
    const d = parseISO(iso);
    if (!d) return '\u2013';
    return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()];
  }

  function fmtDateLong(d) {
    const dd = d instanceof Date ? d : parseISO(d);
    if (!dd) return '\u2013';
    const days = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
    return days[dd.getDay()] + ' ' + dd.getDate() + ' ' + MONTHS_LONG[dd.getMonth()] + ' ' + dd.getFullYear();
  }

  function monthTitle(y, m) { return MONTHS_LONG[m] + ' ' + y; }

  function greeting() {
    const h = new Date().getHours();
    if (h < 6) return 'Goedenacht';
    if (h < 12) return 'Goedemorgen';
    if (h < 18) return 'Goedemiddag';
    return 'Goedenavond';
  }

  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  }

  window.U = {
    MONTHS_LONG, MONTHS_SHORT, DAYS_SHORT,
    PROJECT_STATUS, PAYMENT_STATUS,
    esc, uid, pad2,
    dateToISO, todayISO, parseISO, isValidISO, monthKey, yearKey,
    fmtMoney, fmtCompact, fmtPct, fmtNum, fmtHours, parseNum,
    fmtBudget,
    fmtDate, fmtDateShort, fmtDateLong, monthTitle, greeting,
    debounce,
    qs(sel, root) { return (root || document).querySelector(sel); },
    qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); },
    statusInfo(map, id) { return map.find((s) => s.id === id) || map[0]; },
    projectHours(p) {
      if (!p) return 0;
      if (p.hours != null && p.hours !== '') {
        const h = Number(p.hours);
        return isFinite(h) && h > 0 ? h : 0;
      }
      return (Number(p.filmingHours) || 0) + (Number(p.editingHours) || 0);
    },
    alpha(color, a) {
      const hex = color.replace('#', '');
      const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    },
    vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} },
    el(tag, cls, html) {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (html != null) e.innerHTML = html;
      return e;
    }
  };

  const Sheet = {
    stack: [],
    open(opts) {
      const o = opts || {};
      const overlay = U.el('div', 'sheet-overlay' + (o.fullscreen ? ' fullscreen' : '') + (o.small ? ' small' : ''));
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      if (o.title) overlay.setAttribute('aria-label', o.title);
      const card = U.el('div', 'sheet-card');
      card.innerHTML =
        '<div class="sheet-grabber" aria-hidden="true"></div>' +
        '<header class="sheet-head">' +
        '<h2 class="sheet-title">' + U.esc(o.title || '') + '</h2>' +
        '<button class="icon-btn sheet-close" aria-label="Sluiten">' + Icons.x + '</button>' +
        '</header>';
      const body = U.el('div', 'sheet-body');
      card.appendChild(body);
      overlay.appendChild(card);

      const handle = {
        el: overlay,
        body,
        card,
        close(result) {
          if (handle.closed) return;
          handle.closed = true;
          document.removeEventListener('keydown', onKey, true);
          overlay.classList.remove('open');
          setTimeout(() => {
            overlay.remove();
            const i = Sheet.stack.indexOf(handle);
            if (i !== -1) Sheet.stack.splice(i, 1);
            if (!Sheet.stack.length && handle._prevFocus && handle._prevFocus.focus) {
              try { handle._prevFocus.focus(); } catch (e) {}
            }
          }, 220);
          if (o.onClose) o.onClose(result);
        }
      };

      function onKey(e) {
        if (Sheet.stack[Sheet.stack.length - 1] !== handle) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          handle.close();
        } else if (e.key === 'Tab') {
          const focusables = card.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
          if (!focusables.length) return;
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          } else if (!card.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }

      U.qs('.sheet-close', card).addEventListener('click', () => handle.close());
      overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay && !o.persistent) handle.close(); });
      document.addEventListener('keydown', onKey, true);
      handle._prevFocus = document.activeElement;

      const root = document.getElementById('sheet-root');
      root.appendChild(overlay);
      Sheet.stack.push(handle);
      requestAnimationFrame(() => {
        overlay.classList.add('open');
        const f = body.querySelector('input:not([type=hidden]):not([readonly]), select, textarea') ||
                  body.querySelector('.btn-gold') || body.querySelector('button');
        if (f && window.matchMedia('(min-width: 901px)').matches) setTimeout(() => f.focus(), 60);
      });
      return handle;
    },
    closeTop() {
      const top = Sheet.stack[Sheet.stack.length - 1];
      if (top) top.close();
    },
    closeAll() {
      while (Sheet.stack.length) Sheet.stack[Sheet.stack.length - 1].close();
    }
  };
  window.Sheet = Sheet;

  function toast(msg, type) {
    const root = document.getElementById('toast-root');
    const t = U.el('div', 'toast toast-' + (type || 'ok'));
    const icon = type === 'error' ? Icons.alert : type === 'info' ? Icons.inbox : Icons.check;
    t.innerHTML = '<span class="toast-icon">' + icon + '</span><span>' + U.esc(msg) + '</span>';
    root.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 320);
    }, 2400);
  }
  window.toast = toast;

  function confirmAction(opts) {
    const o = opts || {};
    return new Promise((resolve) => {
      let settled = false;
      let resolveFn = resolve;
      const sh = Sheet.open({
        title: o.title || 'Bevestigen',
        small: true,
        persistent: true,
        onClose() {
          if (!settled && resolveFn) {
            settled = true;
            resolve(false);
          }
        }
      });
      sh.card.classList.add('confirm-card');
      sh.body.innerHTML =
        '<p class="confirm-msg">' + U.esc(o.message || 'Ben je zeker?') + '</p>' +
        '<div class="confirm-actions">' +
        '<button class="btn btn-ghost" data-act="cancel">' + U.esc(o.cancelText || 'Annuleren') + '</button>' +
        '<button class="btn ' + (o.danger === false ? 'btn-gold' : 'btn-danger') + '" data-act="ok">' + U.esc(o.confirmText || 'Verwijderen') + '</button>' +
        '</div>';
      let done = false;
      const finish = (val) => {
        if (done) return;
        done = true;
        settled = true;
        sh.close();
        resolve(val);
      };
      U.qs('[data-act=cancel]', sh.body).addEventListener('click', () => finish(false));
      U.qs('[data-act=ok]', sh.body).addEventListener('click', () => finish(true));
    });
  }
  window.confirmAction = confirmAction;

  function fieldRow(f) {
    const id = 'f-' + f.name + '-' + Math.random().toString(36).slice(2, 7);
    let input;
    if (f.type === 'select') {
      input = '<select id="' + id + '" name="' + f.name + '"' + (f.required ? ' required aria-required="true"' : '') + '>' +
        f.options.map((op) =>
          '<option value="' + U.esc(op.value) + '"' + (String(op.value) === String(f.value) ? ' selected' : '') + '>' + U.esc(op.label) + '</option>'
        ).join('') +
        '</select>';
    } else if (f.type === 'textarea') {
      input = '<textarea id="' + id + '" name="' + f.name + '" rows="' + (f.rows || 3) + '" placeholder="' + U.esc(f.placeholder || '') + '">' + U.esc(f.value || '') + '</textarea>';
    } else {
      const type = f.type || 'text';
      const attrs = [
        'id="' + id + '"',
        'name="' + f.name + '"',
        'type="' + type + '"',
        'placeholder="' + U.esc(f.placeholder || '') + '"'
      ];
      if (f.value != null && f.value !== '') attrs.push('value="' + U.esc(f.value) + '"');
      if (f.required) attrs.push('required aria-required="true"');
      if (f.step) attrs.push('step="' + f.step + '"');
      if (f.min != null) attrs.push('min="' + f.min + '"');
      if (f.autocomplete) attrs.push('autocomplete="' + f.autocomplete + '"');
      if (type === 'number' && !f.inputmode) attrs.push('inputmode="decimal"');
      input = '<input ' + attrs.join(' ') + '>';
    }
    return '' +
      '<div class="field" data-field="' + f.name + '">' +
      '<label for="' + id + '">' + U.esc(f.label) + (f.required ? ' <span class="req">*</span>' : '') + '</label>' +
      input +
      '<div class="field-error" data-err="' + f.name + '" role="alert"></div>' +
      '</div>';
  }

  function readForm(form, fields) {
    const values = {};
    const errors = {};
    fields.forEach((f) => {
      const el = form.elements[f.name];
      if (!el) return;
      const raw = (el.value || '').trim();
      let val = raw;
      if (f.type === 'number') {
        if (raw === '') {
          val = null;
        } else {
          const n = U.parseNum(raw);
          if (isNaN(n)) { errors[f.name] = 'Vul een geldig getal in'; val = null; }
          else if (n < 0) { errors[f.name] = 'Mag niet negatief zijn'; val = null; }
          else val = n;
        }
      }
      if (!errors[f.name] && f.required && (val == null || val === '')) {
        errors[f.name] = (f.label || 'Dit veld') + ' is verplicht';
      }
      if (!errors[f.name] && f.type === 'date' && val && !U.isValidISO(val)) {
        errors[f.name] = 'Ongeldige datum';
      }
      values[f.name] = val;
    });
    Object.keys(errors).forEach((k) => showFieldError(form, k, errors[k]));
    return { values, errors, ok: Object.keys(errors).length === 0 };
  }

  function showFieldError(form, name, msg) {
    const slot = form.querySelector('[data-err="' + name + '"]');
    const wrapEl = form.querySelector('[data-field="' + name + '"]');
    if (slot) slot.textContent = msg || '';
    if (wrapEl) wrapEl.classList.toggle('has-error', !!msg);
  }

  function clearErrors(form) {
    U.qsa('[data-err]', form).forEach((e) => { e.textContent = ''; });
    U.qsa('.has-error', form).forEach((e) => e.classList.remove('has-error'));
  }

  function emptyState(o) {
    const d = U.el('div', 'empty');
    d.innerHTML =
      '<div class="empty-icon">' + (Icons[o.icon] || Icons.inbox) + '</div>' +
      '<h3>' + U.esc(o.title) + '</h3>' +
      '<p>' + U.esc(o.text || '') + '</p>' +
      (o.actionLabel ? '<button class="btn btn-gold empty-action">' + U.esc(o.actionLabel) + '</button>' : '');
    if (o.actionLabel && o.onAction) {
      U.qs('.empty-action', d).addEventListener('click', o.onAction);
    }
    return d;
  }

  window.Forms = { fieldRow, readForm, showFieldError, clearErrors, emptyState };
})();
