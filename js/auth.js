(function () {
  const U = window.U;

  let locked = false;

  function toHex(buf) {
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function fallbackHash(str) {
    let h1 = 0x811c9dc5, h2 = 0x1000193;
    for (let round = 0; round < 512; round++) {
      for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        h1 = ((h1 ^ c) * 0x01000193) >>> 0;
        h2 = ((h2 + c * (round + 7)) * 0x85ebca6b) >>> 0;
      }
      h1 = (h1 ^ (h2 >>> 3)) >>> 0;
      h2 = (h2 ^ (h1 << 5)) >>> 0;
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') + str.length.toString(16);
  }

  async function hashPin(pin, salt) {
    const msg = salt + ':' + pin;
    if (window.crypto && crypto.subtle && crypto.subtle.digest && window.isSecureContext) {
      try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
        return toHex(buf);
      } catch (e) {}
    }
    return 'f.' + fallbackHash(msg);
  }

  function makeSalt() {
    const arr = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(arr);
    else for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    return toHex(arr.buffer);
  }

  async function getStoredPin() {
    return DB.getSetting('pin', null);
  }

  async function configure(pin) {
    const salt = makeSalt();
    const hash = await hashPin(pin, salt);
    await DB.setSetting('pin', { salt, hash });
  }

  async function verify(pin) {
    const stored = await getStoredPin();
    if (!stored || !stored.hash || !stored.salt) return false;
    const hash = await hashPin(pin, stored.salt);
    return hash === stored.hash;
  }

  async function isConfigured() {
    return !!(await getStoredPin());
  }

  function pinPad(opts) {
    const o = opts || {};
    const el = U.el('div', 'pinpad');
    el.innerHTML =
      '<div class="pin-dots" aria-hidden="true">' +
      Array.from({ length: o.maxLen || 8 }, (_, i) => '<span class="pin-dot" data-i="' + i + '"></span>').join('') +
      '</div>' +
      '<div class="pin-error" role="alert" aria-live="polite"></div>' +
      '<div class="keypad" role="group" aria-label="Cijfertoetsen">' +
      ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) =>
        '<button type="button" class="key" data-digit="' + d + '" aria-label="' + d + '">' + d + '</button>'
      ).join('') +
      '<span class="key key-blank" aria-hidden="true"></span>' +
      '<button type="button" class="key" data-digit="0" aria-label="0">0</button>' +
      '<button type="button" class="key key-del" aria-label="Verwijderen">' + Icons.backspace + '</button>' +
      '</div>' +
      '<button type="button" class="btn btn-gold pin-submit" disabled>' + U.esc(o.submitLabel || 'Bevestigen') + '</button>';

    let buf = '';
    const maxLen = o.maxLen || 8;
    const dots = U.qsa('.pin-dot', el);
    const errEl = U.qs('.pin-error', el);
    const submit = U.qs('.pin-submit', el);

    function paint() {
      dots.forEach((d, i) => d.classList.toggle('filled', i < buf.length));
      submit.disabled = buf.length < (o.minLen || 4);
    }
    function press(digit) {
      if (buf.length >= maxLen) return;
      buf += digit;
      U.vibrate(8);
      paint();
    }
    function del() {
      buf = buf.slice(0, -1);
      paint();
    }

    U.qsa('.key[data-digit]', el).forEach((k) =>
      k.addEventListener('click', () => press(k.getAttribute('data-digit')))
    );
    U.qs('.key-del', el).addEventListener('click', del);
    submit.addEventListener('click', () => {
      if (buf.length >= (o.minLen || 4)) o.onSubmit(buf);
    });

    paint();
    return {
      el,
      value: () => buf,
      clear() { buf = ''; errEl.textContent = ''; el.classList.remove('shake'); paint(); },
      setError(msg) {
        errEl.textContent = msg || '';
        el.classList.remove('shake');
        void el.offsetWidth;
        el.classList.add('shake');
        setTimeout(() => { buf = ''; paint(); }, 350);
      }
    };
  }

  function brandHTML(sub) {
    return '<div class="wordmark lock-brand"><span class="logo-vhx">VHX</span><span class="logo-media">media</span></div>' +
      '<p class="lock-sub">' + U.esc(sub || '') + '</p>';
  }

  function showLock(onUnlock) {
    locked = true;
    const root = document.getElementById('lock-root');
    root.innerHTML = '';
    const wrap = U.el('div', 'lockscreen');
    wrap.innerHTML =
      '<div class="lock-inner">' +
      '<div class="lock-badge">' + Icons.lock + '</div>' +
      brandHTML('Voer je PIN in') +
      '<div class="pin-holder"></div>' +
      '</div>';
    root.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('show'));

    const holder = U.qs('.pin-holder', wrap);
    const pad = pinPad({
      submitLabel: 'Ontgrendelen',
      onSubmit: async (pin) => {
        const submitBtn = pad.el.querySelector('.pin-submit');
        if (submitBtn) submitBtn.disabled = true;
        const ok = await verify(pin);
        if (ok) {
          hide();
          if (onUnlock) onUnlock();
        } else {
          pad.setError('Verkeerde PIN, probeer opnieuw');
          if (submitBtn) submitBtn.disabled = false;
          U.vibrate([30, 40, 30]);
        }
      }
    });
    holder.appendChild(pad.el);

    function hide() {
      wrap.classList.remove('show');
      setTimeout(() => { root.innerHTML = ''; }, 300);
      locked = false;
    }
  }

  function runOnboarding(done) {
    const root = document.getElementById('onboarding-root');
    root.innerHTML = '';
    const ob = U.el('div', 'onboarding');
    root.appendChild(ob);

    function stepWelcome() {
      ob.innerHTML =
        '<div class="ob-card">' +
        '<div class="wordmark ob-brand"><span class="logo-vhx">VHX</span><span class="logo-media">media</span></div>' +
        '<h1>Welkom bij VHXmedia</h1>' +
        '<p class="ob-text">Jouw persoonlijke dashboard voor opdrachten, klanten en financi\u00EBn.</p>' +
        '<div class="ob-note">' + Icons.shieldCheck + '<span>Al jouw gegevens worden uitsluitend lokaal op dit toestel opgeslagen. Er wordt niets verzonden of gedeeld.</span></div>' +
        '<button class="btn btn-gold btn-block" id="ob-start">Beginnen</button>' +
        '</div>';
      U.qs('#ob-start', ob).addEventListener('click', stepPin);
    }

    function stepPin() {
      ob.innerHTML =
        '<div class="ob-card ob-wide">' +
        '<h1>Maak je PIN aan</h1>' +
        '<p class="ob-text">Kies een PIN van minstens 4 cijfers om je dashboard te beveiligen.</p>' +
        '<div class="pin-holder"></div>' +
        '</div>';
      const holder = U.qs('.pin-holder', ob);
      let first = null;
      const pad = pinPad({
        submitLabel: 'Volgende',
        onSubmit: (pin) => {
          if (!first) {
            first = pin;
            pad.clear();
            U.qs('h1', ob).textContent = 'Bevestig je PIN';
            U.qs('.ob-text', ob).textContent = 'Voer dezelfde PIN nogmaals in ter bevestiging.';
            pad.el.querySelector('.pin-submit').disabled = true;
          } else if (pin === first) {
            configure(first).then(async () => {
              await DB.setSetting('goal', 0);
              await DB.setSetting('userName', 'Liam');
              await DB.setSetting('autoLock', 5);
              await DB.setSetting('onboarded', true);
              root.innerHTML = '';
              done();
            });
          } else {
            first = null;
            pad.clear();
            U.qs('h1', ob).textContent = 'Maak je PIN aan';
            U.qs('.ob-text', ob).textContent = 'De PIN kwam niet overeen. Kies een nieuwe PIN.';
            pad.setError('PIN\u2019s kwamen niet overeen');
          }
        }
      });
      holder.appendChild(pad.el);
    }

    stepWelcome();
  }

  async function changePinFlow() {
    const sh = Sheet.open({ title: 'Wijzig PIN', small: true });
    sh.body.innerHTML =
      '<p class="sheet-hint">Voer eerst je huidige PIN in.</p><div class="pin-holder"></div>';
    const holder = U.qs('.pin-holder', sh.body);
    let stage = 'current';
    let newPin = null;
    const pad = pinPad({
      submitLabel: 'Volgende',
      onSubmit: async (pin) => {
        if (stage === 'current') {
          if (await verify(pin)) {
            stage = 'new';
            pad.clear();
            U.qs('.sheet-hint', sh.body).textContent = 'Kies een nieuwe PIN van minstens 4 cijfers.';
          } else {
            pad.setError('Huidige PIN is verkeerd');
          }
        } else if (stage === 'new') {
          newPin = pin;
          stage = 'confirm';
          pad.clear();
          U.qs('.sheet-hint', sh.body).textContent = 'Bevestig je nieuwe PIN.';
        } else {
          if (pin === newPin) {
            await configure(newPin);
            sh.close();
            toast('PIN gewijzigd');
          } else {
            pad.setError('PIN\u2019s kwamen niet overeen');
          }
        }
      }
    });
    holder.appendChild(pad.el);
  }

  function initAutoLock(isUnlockedFn, getMinutesFn) {
    let lastActivity = Date.now();
    const bump = () => { lastActivity = Date.now(); };
    ['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
      document.addEventListener(ev, bump, { passive: true })
    );
    setInterval(() => {
      if (locked || !isConfiguredSync) return;
      if (!isUnlockedFn()) return;
      const mins = Number(getMinutesFn());
      if (!mins || mins <= 0) return;
      if (Date.now() - lastActivity > mins * 60000) {
        showLock();
      }
    }, 10000);
  }

  let isConfiguredSync = false;
  isConfigured().then((v) => { isConfiguredSync = v; });

  window.Auth = {
    configure,
    verify,
    isConfigured,
    showLock,
    runOnboarding,
    changePinFlow,
    initAutoLock,
    isLocked: () => locked,
    refreshConfigured() { return isConfigured().then((v) => { isConfiguredSync = v; }); }
  };
})();
