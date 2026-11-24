/**
 * Example TVMod plugin.
 *
 * Plugins are plain CommonJS files. `start(ctx)` runs when the plugin is
 * enabled. `onSettingsChange(change)` updates the badge without restarting the
 * plugin. Registered cleanups run when the plugin is disabled or reloaded.
 */
function applyBadge(badge, settings) {
  badge.hidden = !settings.showBadge;
  badge.textContent = settings.badgeText;
  badge.style.left = settings.position === 'right' ? 'auto' : '12px';
  badge.style.right = settings.position === 'right' ? '12px' : 'auto';
  badge.style.fontSize = `${settings.fontSize}px`;
}

module.exports = {
  start(ctx) {
    ctx.log('started', ctx.settings);

    const runs = (ctx.storage.get('runs', 0) ?? 0) + 1;
    ctx.storage.set('runs', runs);
    ctx.log('start count', runs);

    const mount = ctx.dom.query('body') ?? document.documentElement;
    const badge = document.createElement('div');
    badge.id = 'tvmod-example-badge';
    mount.appendChild(badge);

    const removeStyle = ctx.style.add(`
      #tvmod-example-badge {
        position: fixed;
        bottom: 72px;
        z-index: 2147483640;
        padding: 4px 8px;
        border: 1px solid #3a3f46;
        border-radius: 6px;
        background: #14171b;
        color: #d6dde5;
        font-family: ui-sans-serif, system-ui, sans-serif;
        line-height: 1.4;
        pointer-events: none;
      }
    `);

    applyBadge(badge, ctx.settings);

    ctx.onCleanup(() => {
      badge.remove();
      removeStyle();
    });
  },

  onSettingsChange({ settings, changed }) {
    const badge = document.getElementById('tvmod-example-badge');
    if (badge) applyBadge(badge, settings);
    console.log(
      '[tvmod:hello-world] settings changed',
      changed.join(', ') || '(none)'
    );
  },
};
