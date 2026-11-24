const numberFormat = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 4,
});

function positionStyle(position) {
  return {
    left: position === 'bottom-left' ? '14px' : 'auto',
    right: position === 'bottom-right' ? '14px' : 'auto',
    bottom: '78px',
  };
}

function field(labelText, type = 'number') {
  const label = document.createElement('label');
  label.className = 'tvmod-size-field';
  const text = document.createElement('span');
  text.textContent = labelText;
  const input = document.createElement('input');
  input.type = type;
  if (type === 'number') {
    input.step = 'any';
    input.min = '0';
  }
  label.append(text, input);
  return { label, input };
}

let currentSettings = null;
let calculateSize = null;
let placeInterface = null;
let accountInput = null;
let riskInput = null;

module.exports = {
  start(ctx) {
    currentSettings = ctx.settings;
    const saved = ctx.storage.get('inputs', null) ?? {};

    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'tvmod-size-button';
    button.textContent = 'Size';
    document.body.appendChild(button);

    const panel = document.createElement('div');
    panel.id = 'tvmod-size-panel';
    panel.hidden = true;

    const head = document.createElement('div');
    head.className = 'tvmod-size-head';
    const title = document.createElement('span');
    title.textContent = 'Position size';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close position size calculator');
    head.append(title, close);

    const account = field('Account size');
    const risk = field('Risk %');
    const entry = field('Entry price');
    const stop = field('Stop price');

    account.input.value = String(saved.account ?? currentSettings.accountSize);
    risk.input.value = String(saved.risk ?? currentSettings.riskPercent);
    entry.input.value = saved.entry === undefined ? '' : String(saved.entry);
    stop.input.value = saved.stop === undefined ? '' : String(saved.stop);

    const result = document.createElement('div');
    result.className = 'tvmod-size-result';

    const note = document.createElement('div');
    note.className = 'tvmod-size-note';
    note.textContent = 'Calculation only. Not financial advice.';

    panel.append(head, account.label, risk.label, entry.label, stop.label, result, note);
    document.body.appendChild(panel);

    const removeStyle = ctx.style.add(`
      #tvmod-size-button {
        position: fixed; z-index: 2147483000; padding: 6px 10px;
        border: 1px solid #3a3f46; border-radius: 7px; background: #14171b;
        color: #d6dde5; font: 11px/1.2 ui-sans-serif, system-ui, sans-serif;
        cursor: pointer;
      }
      #tvmod-size-button:hover { background: #1d2229; }
      #tvmod-size-panel {
        position: fixed; z-index: 2147483001; width: min(300px, calc(100vw - 28px));
        padding: 10px; border: 1px solid #3a3f46; border-radius: 10px;
        background: #14171b; color: #d6dde5;
        font: 11px/1.4 ui-sans-serif, system-ui, sans-serif;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
      }
      .tvmod-size-head {
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px; margin-bottom: 8px; font-weight: 650;
      }
      .tvmod-size-head button {
        width: 20px; height: 20px; padding: 0; border: 1px solid #3a3f46;
        border-radius: 5px; background: #1d2229; color: #cfd5dc;
        font: 14px/1 ui-sans-serif, system-ui, sans-serif; cursor: pointer;
      }
      .tvmod-size-field {
        display: grid; grid-template-columns: 1fr 120px; align-items: center;
        gap: 8px; padding: 3px 0;
      }
      .tvmod-size-field span { color: #b7c0c9; font-size: 10.5px; }
      .tvmod-size-field input {
        width: 100%; padding: 4px 6px; border: 1px solid #3a3f46;
        border-radius: 6px; background: #0f1216; color: #e9ecef;
        font: inherit; font-size: 10.5px; outline: none;
      }
      .tvmod-size-field input:focus { border-color: #4c8dff; }
      .tvmod-size-result {
        margin-top: 8px; padding-top: 8px; border-top: 1px solid #262b32;
        color: #cfd5dc; font-size: 10.5px;
      }
      .tvmod-size-result strong { color: #f4f6f8; }
      .tvmod-size-note { margin-top: 6px; color: #77808b; font-size: 9.5px; }
    `);

    const place = () => {
      const style = positionStyle(currentSettings?.position ?? 'bottom-right');
      Object.assign(button.style, style);
      Object.assign(panel.style, style);
      panel.style.bottom = '120px';
    };
    placeInterface = place;
    accountInput = account.input;
    riskInput = risk.input;

    const calculate = () => {
      const accountSize = Number(account.input.value);
      const riskPercent = Number(risk.input.value);
      const entryPrice = Number(entry.input.value);
      const stopPrice = Number(stop.input.value);
      const riskAmount = accountSize * (riskPercent / 100);
      const distance = Math.abs(entryPrice - stopPrice);
      const units =
        Number.isFinite(riskAmount) &&
        Number.isFinite(distance) &&
        distance > 0
          ? riskAmount / distance
          : 0;

      ctx.storage.set('inputs', {
        account: accountSize,
        risk: riskPercent,
        entry: entryPrice,
        stop: stopPrice,
      });

      if (!(riskAmount > 0) || !(units > 0)) {
        result.textContent = 'Enter valid account, risk, entry, and stop values.';
        return;
      }

      result.innerHTML = '';
      for (const [label, value] of [
        ['Risk amount', riskAmount],
        ['Price distance', distance],
        ['Units', units],
        ['Notional', units * entryPrice],
      ]) {
        const line = document.createElement('div');
        line.textContent = `${label}: `;
        const strong = document.createElement('strong');
        strong.textContent = numberFormat.format(value);
        line.append(strong);
        result.append(line);
      }
    };

    calculateSize = calculate;

    const toggle = () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        place();
        calculate();
        account.input.focus();
      }
    };

    button.addEventListener('click', toggle);
    close.addEventListener('click', () => {
      panel.hidden = true;
    });
    for (const input of [account.input, risk.input, entry.input, stop.input]) {
      input.addEventListener('input', calculate);
    }

    place();
    ctx.onCleanup(() => {
      button.remove();
      panel.remove();
      removeStyle();
      currentSettings = null;
      calculateSize = null;
      placeInterface = null;
      accountInput = null;
      riskInput = null;
    });
  },

  onSettingsChange({ settings: next }) {
    const previous = currentSettings;
    currentSettings = next;
    if (
      accountInput &&
      previous &&
      accountInput.value === String(previous.accountSize)
    ) {
      accountInput.value = String(next.accountSize);
    }
    if (
      riskInput &&
      previous &&
      riskInput.value === String(previous.riskPercent)
    ) {
      riskInput.value = String(next.riskPercent);
    }
    placeInterface?.();
    calculateSize?.();
  },
};
