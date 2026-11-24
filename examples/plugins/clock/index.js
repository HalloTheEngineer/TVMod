function positionStyle(position) {
  const offset = '14px';
  const top = '54px';
  const bottom = '78px';
  return {
    left: position.endsWith('left') ? offset : 'auto',
    right: position.endsWith('right') ? offset : 'auto',
    top: position.startsWith('top') ? top : 'auto',
    bottom: position.startsWith('bottom') ? bottom : 'auto',
  };
}

function formatClock(settings) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    ...(settings.showSeconds ? { second: '2-digit' } : {}),
    hour12: settings.hour12,
    ...(settings.showDate
      ? { weekday: 'short', month: 'short', day: '2-digit' }
      : {}),
  }).format(new Date());
}

let element = null;
let settings = null;

function apply() {
  if (!element || !settings) return;
  element.textContent = formatClock(settings);
  Object.assign(element.style, positionStyle(settings.position));
}

module.exports = {
  start(ctx) {
    settings = ctx.settings;
    element = document.createElement('div');
    element.id = 'tvmod-clock';
    document.body.appendChild(element);

    const removeStyle = ctx.style.add(`
      #tvmod-clock {
        position: fixed;
        z-index: 2147483000;
        padding: 5px 9px;
        border: 1px solid #3a3f46;
        border-radius: 7px;
        background: #14171b;
        color: #d6dde5;
        font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
        pointer-events: none;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
      }
    `);

    apply();
    const timer = setInterval(apply, 1000);

    ctx.onCleanup(() => {
      clearInterval(timer);
      element?.remove();
      element = null;
      settings = null;
      removeStyle();
    });
  },

  onSettingsChange({ settings: next }) {
    settings = next;
    apply();
  },
};
