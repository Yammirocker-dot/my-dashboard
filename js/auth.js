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

  const BIO_KEY = 'bioCred';

  function b64uEnc(buf) {
    let s = btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
    return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64uDec(str) {
    let s = str.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr.buffer;
  }

  function bioSupported() {
    return 'PublicKeyCredential' in window && !!(navigator.credentials && navigator.credentials.create && navigator.credentials.get) && window.isSecureContext;
  }

  async function bioStatus() {
    if (!bioSupported()) return { supported: false, on: false };
    const rec = await DB.getSetting(BIO_KEY, null);
    return { supported: true, on: !!rec };
  }

  function randBytes(n) {
    const arr = new Uint8Array(n);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(arr);
    else for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    return arr.buffer;
  }

  async function bioSetupFlow() {
    if (!bioSupported()) throw new Error('unsupported');
    const cred = await navigator.credentials.create({
      publicKey: {
        rp: { name: 'VHXmedia', id: location.hostname },
        user: { id: randBytes(16), name: 'liam@vhxmedia', displayName: 'Liam \u2013 VHXmedia' },
        challenge: randBytes(32),
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'discouraged'
        },
        timeout: 60000,
        attestation: 'none'
      }
    });
    let pubRaw = null;
    if (cred.response.getPublicKey) pubRaw = cred.response.getPublicKey();
    if (!pubRaw) throw new Error('no-public-key');
    await DB.setSetting(BIO_KEY, { id: b64uEnc(cred.rawId), pub: b64uEnc(pubRaw) });
  }

  async function bioForget() {
    await DB.setSetting(BIO_KEY, null);
  }

  async function bioAttempt() {
    try {
      if (!bioSupported()) return false;
      const rec = await DB.getSetting(BIO_KEY, null);
      if (!rec || !rec.id || !rec.pub) return false;
      const key = await crypto.subtle.importKey(
        'spki',
        b64uDec(rec.pub),
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );
      const chal = randBytes(32);
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: chal,
          allowCredentials: [{ type: 'public-key', id: b64uDec(rec.id) }],
          userVerification: 'required',
          timeout: 60000
        }
      });
      const cdj = JSON.parse(new TextDecoder().decode(assertion.response.clientDataJSON));
      if (cdj.type !== 'webauthn.get' || cdj.challenge !== b64uEnc(chal)) return false;
      const authData = new Uint8Array(assertion.response.authenticatorData);
      const cdHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(assertion.response.clientDataJSON)));
      const signed = new Uint8Array(authData.length + cdHash.length);
      signed.set(authData, 0);
      signed.set(cdHash, authData.length);
      return await crypto.subtle.verify(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        key,
        assertion.response.signature,
        signed.buffer
      );
    } catch (e) {
      return false;
    }
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
    return '<div class="lock-brand"><img class="brand-img" src="./icons/icon-192.png" alt=""></div>' +
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

    bioStatus().then((st) => {
      if (!st.on || !document.contains(holder)) return;
      const bioBtn = document.createElement('button');
      bioBtn.type = 'button';
      bioBtn.className = 'btn btn-gold btn-block lock-bio';
      bioBtn.innerHTML = Icons.shieldCheck + '<span>Ontgrendel met Face ID</span>';
      bioBtn.style.marginBottom = '14px';
      bioBtn.addEventListener('click', async () => {
        bioBtn.disabled = true;
        const ok = await bioAttempt();
        if (ok) {
          hide();
          if (onUnlock) onUnlock();
        } else {
          bioBtn.disabled = false;
          U.vibrate([30, 40, 30]);
        }
      });
      holder.parentNode.insertBefore(bioBtn, holder);
    });

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
        '<div class="ob-brand"><img class="brand-img" src="./icons/icon-192.png" alt=""></div>' +
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

  function verifyPinFlow() {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      const sh = Sheet.open({ title: 'Bevestig met PIN' });
      const pad = pinPad({
        minLen: 4,
        submitLabel: 'Bevestigen',
        onSubmit: async (pin) => {
          if (await verify(pin)) {
            finish(true);
            sh.close();
          } else {
            const errEl = U.qs('.pin-error', pad.el);
            if (errEl) errEl.textContent = 'Verkeerde code';
          }
        }
      });
      sh.body.appendChild(pad.el);
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn btn-ghost btn-block';
      cancel.textContent = 'Annuleren';
      cancel.style.marginTop = '12px';
      cancel.addEventListener('click', () => { finish(false); sh.close(); });
      sh.body.appendChild(cancel);
    });
  }

  window.Auth = {
    configure,
    verify,
    isConfigured,
    showLock,
    runOnboarding,
    changePinFlow,
    verifyPinFlow,
    bioSupported,
    bioStatus,
    bioSetupFlow,
    bioForget,
    initAutoLock,
    isLocked: () => locked,
    refreshConfigured() { return isConfigured().then((v) => { isConfiguredSync = v; }); }
  };
})();
