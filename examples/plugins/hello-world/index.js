/**
 * Example TVMod plugin.
 *
 * Plugins are plain CommonJS files. `start(ctx)` runs when the plugin is
 * enabled (or when a setting changes), and the returned function runs on
 * disable/reload.
 */
module.exports = {
  start(ctx) {
    ctx.log('started', ctx.settings);

    const runs = (ctx.storage.get('runs', 0) ?? 0) + 1;
    ctx.storage.set('runs', runs);
    ctx.log('start count', runs);

    if (!ctx.settings.showBadge) {
      return () => {};
    }

    const mount = ctx.dom.query('body') ?? document.documentElement;
    const badge = document.createElement('div');
    badge.id = 'tvmod-example-badge';
    badge.textContent = 'TVMod example plugin';
    mount.appendChild(badge);

    const removeStyle = ctx.style.add(`
      #tvmod-example-badge {
        position: fixed;
        left: 12px;
        bottom: 72px;
        z-index: 2147483640;
        padding: 4px 8px;
        border: 1px solid #3a3f46;
        border-radius: 6px;
        background: #14171b;
        color: #d6dde5;
        font: 11px/1.4 ui-sans-serif, system-ui, sans-serif;
        pointer-events: none;
      }
    `);

    return () => {
      badge.remove();
      removeStyle();
    };
  },
};
