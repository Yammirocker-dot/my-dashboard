(function () {
  const U = window.U;

  function fields() {
    return [
      { name: 'name', label: 'Naam', type: 'text', required: true, placeholder: 'bijv. Bedrijfsfilm Sheraton' },
      { name: 'date', label: 'Datum (optioneel)', type: 'date' },
      { name: 'client', label: 'Klant (optioneel)', type: 'text', placeholder: 'bijv. Sheraton' },
      { name: 'income', label: 'Inkomen (\u20AC)', type: 'number', step: '0.01', min: 0, placeholder: '0,00' },
      { name: 'budgetMin', label: 'Budget van (\u20AC)', type: 'number', step: '0.01', min: 0, placeholder: '0,00' },
      { name: 'budgetMax', label: 'Budget tot (\u20AC, optioneel)', type: 'number', step: '0.01', min: 0, placeholder: '0,00' },
      {
        name: 'status', label: 'Status', type: 'select',
        options: U.PROJECT_STATUS.map((s) => ({ value: s.id, label: s.label }))
      },
      { name: 'notes', label: 'Notities', type: 'textarea', rows: 2 }
    ];
  }

  function valuesOf(p) {
    return {
      name: p ? p.name : '',
      date: p && p.date ? p.date : '',
      time: p ? p.time || '' : '',
      client: p ? p.client || '' : '',
      income: p ? String(p.income != null ? p.income : '') : '',
      budgetMin: p && p.budgetMin != null ? String(p.budgetMin) : '',
      budgetMax: p && p.budgetMax != null ? String(p.budgetMax) : '',
      concept: p ? !!p.concept : false,
      status: p && p.status ? p.status : 'planned',
      notes: p ? p.notes || '' : ''
    };
  }

  function ivMinutes(iv) {
    if (!iv || !iv.from || !iv.to) return 0;
    const [fh, fm] = iv.from.split(':').map(Number);
    const [th, tm] = iv.to.split(':').map(Number);
    const diff = (th * 60 + tm) - (fh * 60 + fm);
    return diff > 0 ? diff : 0;
  }

  function intervalsTotal(intervals) {
    return (intervals || []).reduce((s, iv) => s + ivMinutes(iv), 0) / 60;
  }

  function ivRowHTML(iv) {
    return (
      '<div class="iv-row-edit" data-iv>' +
      '<input type="time" class="input iv-from" value="' + U.esc(iv.from || '') + '" aria-label="Begintijd">' +
      '<span class="iv-sep">\u2013</span>' +
      '<input type="time" class="input iv-to" value="' + U.esc(iv.to || '') + '" aria-label="Eindtijd">' +
      '<button type="button" class="icon-btn iv-del" aria-label="Interval verwijderen">' + Icons.x + '</button>' +
      '</div>'
    );
  }

  function openForm(existing, defaults, onSaved) {
    const sh = Sheet.open({ title: existing ? 'Opdracht bewerken' : 'Nieuwe opdracht', fullscreen: true });
    const vals = Object.assign(valuesOf(existing), defaults || {});
    const cfg = fields();

    const existingIvs = (existing && Array.isArray(existing.intervals) && existing.intervals.length)
      ? existing.intervals
      : [{}];
    const hasIvRows = existing && Array.isArray(existing.intervals) &&
      existing.intervals.some((iv) => iv.from && iv.to);
    const directHoursRaw = (() => {
      if (!existing) return '';
      if (existing.hours != null && existing.hours !== '') return String(existing.hours);
      const f = Number(existing.filmingHours) || 0;
      const e = Number(existing.editingHours) || 0;
      return (f + e) > 0 ? String(f + e) : '';
    })();
    let hoursMode = 'interval';
    if (existing) {
      if (existing.hoursMode === 'direct') hoursMode = 'direct';
      else if (!hasIvRows && directHoursRaw !== '') hoursMode = 'direct';
    }

    const hoursBlock =
      '<div class="field">' +
      '<label class="field-label">Uren</label>' +
      '<div class="chip-row seg" role="tablist" aria-label="Manier van uren invoeren">' +
      '<button type="button" class="chip sm' + (hoursMode === 'interval' ? ' active' : '') + '" data-hours-mode="interval">Van \u2013 tot</button>' +
      '<button type="button" class="chip sm' + (hoursMode === 'direct' ? ' active' : '') + '" data-hours-mode="direct">Rechtstreeks</button>' +
      '</div>' +
      '<div data-mode-interval' + (hoursMode === 'interval' ? '' : ' style="display:none"') + '>' +
      '<div id="iv-list">' + existingIvs.map(ivRowHTML).join('') + '</div>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-add-interval>' + Icons.plus + 'Interval toevoegen</button>' +
      '</div>' +
      '<input type="number" step="0.25" min="0" inputmode="decimal" class="input" data-hours-direct' +
      ' placeholder="bv. 3,5" value="' + U.esc(hoursMode === 'direct' ? directHoursRaw : '') + '"' +
      (hoursMode === 'direct' ? '' : ' style="display:none"') + '>' +
      '<p class="iv-total"' + (hoursMode === 'interval' ? '' : ' style="display:none"') + '>Totaal: <strong data-iv-total>\u2013</strong></p>' +
      '</div>';

    const conceptBlock =
      '<div class="field check-field">' +
      '<label class="check-row">' +
      '<input type="checkbox" data-concept-toggle' + (vals.concept ? ' checked' : '') + '>' +
      '<span>Concept</span>' +
      '</label>' +
      '</div>';

    const timeBlock =
      '<div class="field" data-time-row>' +
      '<label class="check-row">' +
      '<input type="checkbox" data-time-toggle' + (vals.time ? ' checked' : '') + '>' +
      '<span>Tijdstip opgeven</span>' +
      '</label>' +
      '<input type="time" class="input" name="time" data-time-input value="' + U.esc(vals.time || '') + '"' +
      (vals.time ? '' : ' style="display:none"') + '>' +
      '</div>';

    let fieldsHTML = '';
    cfg.forEach((f) => {
      fieldsHTML += Forms.fieldRow(Object.assign({}, f, { value: vals[f.name] }));
      if (f.name === 'name') fieldsHTML += conceptBlock;
      if (f.name === 'date') fieldsHTML += timeBlock;
      if (f.name === 'income') fieldsHTML += hoursBlock;
    });

    sh.body.innerHTML =
      '<form class="form' + (vals.concept ? ' is-concept' : '') + '" novalidate>' +
      fieldsHTML +
      '<div class="form-actions">' +
      '<button type="button" class="btn btn-ghost" data-cancel>Annuleren</button>' +
      '<button type="submit" class="btn btn-gold">' + (existing ? 'Opslaan' : 'Toevoegen') + '</button>' +
      '</div></form>';

    const form = U.qs('form', sh.body);

    function collectIvs() {
      return U.qsa('[data-iv]', form).map((r) => ({
        from: U.qs('.iv-from', r).value,
        to: U.qs('.iv-to', r).value
      }));
    }

    function updTotal() {
      const filled = collectIvs().filter((iv) => iv.from && iv.to);
      const bad = filled.some((iv) => iv.to <= iv.from);
      const el = U.qs('[data-iv-total]', sh.body);
      if (bad) { el.textContent = '? \u2013 eindtijd moet na begintijd'; return; }
      const tot = filled.reduce((s, iv) => s + ivMinutes(iv), 0) / 60;
      el.textContent = filled.length ? U.fmtNum(tot, 1) + ' uur' : '\u2013';
    }

    form.addEventListener('input', (e) => {
      if (e.target.classList.contains('iv-from') || e.target.classList.contains('iv-to')) updTotal();
    });
    U.qs('[data-add-interval]', sh.body).addEventListener('click', () => {
      U.qs('#iv-list', sh.body).insertAdjacentHTML('beforeend', ivRowHTML({}));
    });
    sh.body.addEventListener('click', (e) => {
      const del = e.target.closest('.iv-del');
      if (!del) return;
      del.closest('[data-iv]').remove();
      updTotal();
    });
    updTotal();

    const modeChips = U.qsa('[data-hours-mode]', sh.body);
    const ivWrap = U.qs('[data-mode-interval]', sh.body);
    const directInput = U.qs('[data-hours-direct]', sh.body);
    const totalWrap = U.qs('.iv-total', sh.body);

    function setHoursMode(mode) {
      hoursMode = mode;
      modeChips.forEach((c) => c.classList.toggle('active', c.getAttribute('data-hours-mode') === mode));
      ivWrap.style.display = mode === 'interval' ? '' : 'none';
      directInput.style.display = mode === 'direct' ? '' : 'none';
      totalWrap.style.display = mode === 'interval' ? '' : 'none';
      if (mode === 'direct') {
        const filled = collectIvs().filter((iv) => iv.from && iv.to && iv.to > iv.from);
        const tot = filled.reduce((s, iv) => s + ivMinutes(iv), 0) / 60;
        if (tot > 0 && directInput.value.trim() === '') {
          directInput.value = String(Math.round(tot * 100) / 100).replace('.', ',');
        }
      }
    }
    modeChips.forEach((c) =>
      c.addEventListener('click', () => setHoursMode(c.getAttribute('data-hours-mode')))
    );

    const conceptToggle = U.qs('[data-concept-toggle]', sh.body);
    conceptToggle.addEventListener('change', () => {
      const on = conceptToggle.checked;
      form.classList.toggle('is-concept', on);
      if (on) {
        const sel = form.elements['status'];
        if (sel && sel.value === 'planned') sel.value = 'idea';
      }
    });

    const timeToggle = U.qs('[data-time-toggle]', sh.body);
    const timeInput = U.qs('[data-time-input]', sh.body);
    timeToggle.addEventListener('change', () => {
      timeInput.style.display = timeToggle.checked ? '' : 'none';
      if (!timeToggle.checked) timeInput.value = '';
    });
    U.qs('[data-field="date"] input', sh.body).addEventListener('change', () => {
      if (!form.elements['date'].value) {
        timeToggle.checked = false;
        timeInput.value = '';
        timeInput.style.display = 'none';
      }
    });

    U.qs('[data-cancel]', sh.body).addEventListener('click', () => sh.close());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      Forms.clearErrors(form);
      const res = Forms.readForm(form, cfg);
      if (!res.ok) { toast('Controleer de gemarkeerde velden', 'error'); return; }
      const v = res.values;
      const nowIso = new Date().toISOString();
      const rec = existing ? Object.assign({}, existing) : { id: U.uid(), createdAt: nowIso };
      rec.name = v.name.trim();
      const isConcept = conceptToggle.checked;
      rec.concept = isConcept;
      if (isConcept) {
        const bmin = v.budgetMin != null ? v.budgetMin : null;
        const bmax = v.budgetMax != null ? v.budgetMax : null;
        if (bmin != null && bmax != null && bmax < bmin) {
          toast('Budget-tot moet gelijk aan of hoger dan budget-van zijn', 'error');
          return;
        }
        rec.date = '';
        rec.income = 0;
        rec.budgetMin = bmin;
        rec.budgetMax = bmax;
      } else {
        rec.date = v.date || '';
        rec.budgetMin = null;
        rec.budgetMax = null;
      }
      rec.client = (v.client || '').trim();
      rec.time = '';
      const tOn = timeToggle.checked;
      if (tOn && timeInput.value) {
        if (!rec.date) {
          toast('Kies eerst een datum voordat je een tijdstip opgeeft', 'error');
          return;
        }
        rec.time = timeInput.value;
      }
      rec.income = v.income != null ? v.income : 0;
      if (hoursMode === 'direct') {
        rec.hoursMode = 'direct';
        rec.intervals = [];
        const rawD = directInput.value.trim();
        if (rawD !== '') {
          const dh = U.parseNum(rawD);
          if (isNaN(dh) || dh < 0) {
            toast('Vul een geldig aantal uur in', 'error');
            return;
          }
          rec.hours = Math.round(dh * 100) / 100;
        } else {
          rec.hours = 0;
        }
      } else {
        rec.hoursMode = 'interval';
        const filledIvs = collectIvs().filter((iv) => iv.from && iv.to);
        if (filledIvs.some((iv) => iv.to <= iv.from)) {
          toast('Elke eindtijd moet na de begintijd liggen', 'error');
          return;
        }
        rec.intervals = filledIvs;
        rec.hours = filledIvs.length
          ? Math.round(intervalsTotal(filledIvs) * 100) / 100
          : (existing ? Number(existing.hours) || 0 : 0);
      }
      rec.status = v.status || 'planned';
      rec.notes = (v.notes || '').trim();
      rec.updatedAt = nowIso;
      try {
        await App.upsertRecord('projects', rec);
      } catch (err) {
        toast('Opslaan mislukt', 'error');
        return;
      }
      sh.close();
      toast(existing ? 'Opdracht bijgewerkt' : 'Opdracht toegevoegd');
      if (onSaved) onSaved();
    });
  }

  function openDetail(id) {
    const build = () => App.state.data.projects.find((p) => p.id === id);
    const sh = Sheet.open({ title: 'Opdracht', fullscreen: true });
    sh.card.classList.add('detail-sheet');

    function draw() {
      const p = build();
      if (!p) { sh.close(); return; }
      U.qs('.sheet-title', sh.card).textContent = p.name;
      const st = U.statusInfo(U.PROJECT_STATUS, p.status);
      const income = Number(p.income) || 0;
      const h = U.projectHours(p);
      const iph = h > 0 ? income / h : null;

      sh.body.innerHTML =
        '<div class="detail">' +
        '<div class="pill-row"><span class="pill" style="--pc:' + st.color + '">' + U.esc(st.label) + '</span></div>' +
        '<div class="detail-money">' + U.esc(p.concept ? U.fmtBudget(p) : U.fmtMoney(income)) + '</div>' +
        '<p class="iph-line">' + (p.concept
          ? 'Concept \u2013 nog geen definitieve opdracht.'
          : iph != null
            ? '\u20AC ' + U.esc(U.fmtNum(iph, 2)) + ' per uur \u00B7 ' + U.esc(U.fmtNum(h, 1)) + ' uur'
            : 'Voer je uren in om je uurtarief te zien.') + '</p>' +

        (!p.concept
          ? '<button type="button" class="btn ' + (p.status === 'paid' ? 'btn-ghost' : 'btn-gold') + ' btn-block paid-toggle" data-toggle-paid>' +
            Icons.check + (p.status === 'paid' ? 'Terug naar niet-betaald' : 'Markeer als betaald') +
            '</button>'
          : '') +

        '<div class="card detail-card"><div class="chip-row seg scroll">' +
        U.PROJECT_STATUS.map((s) =>
          '<button type="button" class="chip sm' + (p.status === s.id ? ' active' : '') + '" data-set-status="' + s.id + '">' + U.esc(s.label) + '</button>'
        ).join('') +
        '</div></div>' +

        '<div class="card detail-card meta-list">' +
        (p.date ? mrow(Icons.calendar, 'Datum', U.esc(U.fmtDate(p.date) + (p.time ? ' \u00B7 ' + p.time : ''))) : '') +
        (p.concept && (p.budgetMin != null || p.budgetMax != null)
          ? mrow(Icons.trendingUp, 'Budget', U.esc(U.fmtBudget(p)))
          : '') +
        (p.client ? mrow(Icons.user, 'Klant', U.esc(p.client)) : '') +
        mrow(Icons.clock, 'Uren', U.esc(U.fmtNum(h, 1))) +
        ((Array.isArray(p.intervals) && p.intervals.length)
          ? p.intervals.map((iv) =>
            '<div class="meta-row sub"><span class="meta-icon"></span>' +
            '<span class="meta-label iv-time">' + U.esc(iv.from) + ' \u2013 ' + U.esc(iv.to) + '</span>' +
            '<span class="meta-value">' + U.esc(U.fmtNum(ivMinutes(iv) / 60, 1)) + ' u</span></div>'
          ).join('')
          : '') +
        mrow(Icons.trendingUp, 'Per uur', iph != null ? U.esc(U.fmtMoney(iph)) : '\u2013') +
        '</div>' +

        (p.notes ? '<h3 class="section-title">Notities</h3><div class="card detail-card text-block"><p>' + U.esc(p.notes) + '</p></div>' : '') +

        '<div class="detail-actions">' +
        '<button class="btn btn-gold" data-edit>' + Icons.edit + 'Bewerken</button>' +
        '<button class="btn btn-danger-ghost" data-del>' + Icons.trash + 'Verwijderen</button>' +
        '</div></div>';

      U.qsa('[data-set-status]', sh.body).forEach((b) =>
        b.addEventListener('click', async () => {
          await App.patchRecord('projects', id, { status: b.getAttribute('data-set-status') });
          draw();
        })
      );
      const paidBtn = U.qs('[data-toggle-paid]', sh.body);
      if (paidBtn) paidBtn.addEventListener('click', async () => {
        const cur = build();
        const next = cur && cur.status === 'paid' ? 'delivered' : 'paid';
        await App.patchRecord('projects', id, { status: next });
        draw();
      });
      U.qs('[data-edit]', sh.body).addEventListener('click', () => openForm(build(), null, draw));
      U.qs('[data-del]', sh.body).addEventListener('click', async () => {
        const ok = await confirmAction({
          title: 'Opdracht verwijderen',
          message: '"' + p.name + '" wordt definitief verwijderd.'
        });
        if (!ok) return;
        await removeProject(id);
        sh.close();
      });
    }

    draw();
  }

  function mrow(icon, label, value) {
    return '<div class="meta-row"><span class="meta-icon">' + icon + '</span><span class="meta-label">' + label + '</span><span class="meta-value">' + value + '</span></div>';
  }

  async function removeProject(id) {
    try {
      await App.removeRecord('projects', id);
      toast('Opdracht verwijderd');
    } catch (e) {
      toast('Verwijderen mislukt', 'error');
    }
  }

  window.Projects = { openForm, openDetail, removeProject };
})();
