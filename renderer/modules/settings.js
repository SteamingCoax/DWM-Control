// App-wide Settings dialog: General (theme, demo mode), Control (polling/board/cards), Accessibility, Updates.
// The dialog shell and tab strip live in index.html; the panel bodies are rendered here.
(function() {
  'use strict';
  const P = DWMControl.prototype;

  const SETTINGS_TABS = ['general', 'control', 'accessibility', 'updates'];
  const THEMES = [
    ['dark', 'Dark'], ['light', 'Light'], ['ocean', 'Ocean'], ['carbon', 'Carbon'], ['amber', 'Amber'],
  ];
  const BOARD_LAYOUTS = [
    ['column', 'Single Column'], ['auto-fit', 'Auto-Fit Grid'], ['grid-2', '2 Columns'],
    ['grid-3', '3 Columns'], ['grid-4', '4 Columns'],
  ];

  const option = (value, text, selected) => `<option value="${value}"${value === selected ? ' selected' : ''}>${text}</option>`;

  P.setupSettingsDialog = function() {
    for (const key of SETTINGS_TABS) {
      const panel = document.getElementById(`settings-panel-${key}`);
      if (!panel) continue;
      panel.innerHTML = this._renderSettingsPanel(key);
      this._bindSettingsPanel(key);
    }

    document.getElementById('settings-button')?.addEventListener('click', () => this.openSettings());
    document.getElementById('app-settings-close')?.addEventListener('click', () => this.closeSettings());

    const dialog = document.getElementById('app-settings-dialog');
    if (dialog) {
      // Escape fires `cancel`; route it through closeSettings so focus is restored.
      dialog.addEventListener('cancel', (event) => {
        event?.preventDefault?.();
        this.closeSettings();
      });
      dialog.addEventListener('close', () => this._settingsRestoreFocus());
    }

    const tabList = document.querySelector('.settings-tabs');
    if (tabList) {
      tabList.addEventListener('click', (event) => {
        const btn = event?.target?.closest?.('.settings-tab');
        if (!btn) return;
        const activated = this.activateSettingsTab(btn.getAttribute('data-settings-tab'));
        if (activated) activated.focus();
      });
      tabList.addEventListener('keydown', (event) => this._onSettingsTabKeydown(event));
    }

    window.electronAPI?.onMenuAction?.('menu-settings-open', () => this.openSettings());
    window.electronAPI?.onMenuAction?.('menu-add-swr-card', () => { this.activateTab?.('control'); this.addSwrCard(); });
    if (typeof this.applyUpdateChannel === 'function') this.applyUpdateChannel();
  };

  P.activateSettingsTab = function(tabKey) {
    const buttons = Array.from(document.querySelectorAll('.settings-tab'));
    const panels = Array.from(document.querySelectorAll('.settings-panel'));
    const target = buttons.find(btn => btn.getAttribute('data-settings-tab') === tabKey);
    if (!target) return null;

    buttons.forEach(btn => {
      const on = btn === target;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      btn.setAttribute('tabindex', on ? '0' : '-1');
    });
    panels.forEach(panel => {
      const on = panel.id === `settings-panel-${tabKey}`;
      panel.classList.toggle('active', on);
      panel.hidden = !on;
      if (on) panel.removeAttribute('hidden');
      else panel.setAttribute('hidden', '');
    });
    this._settingsLastTab = tabKey;
    return target;
  };

  P._onSettingsTabKeydown = function(event) {
    const current = event?.target;
    if (!current || !current.classList || !current.classList.contains('settings-tab')) return;
    const tabs = Array.from(document.querySelectorAll('.settings-tab'));
    const index = tabs.indexOf(current);
    if (index === -1 || tabs.length === 0) return;

    let next;
    switch (event.key) {
      case 'ArrowRight': next = tabs[(index + 1) % tabs.length]; break;
      case 'ArrowLeft': next = tabs[(index - 1 + tabs.length) % tabs.length]; break;
      case 'Home': next = tabs[0]; break;
      case 'End': next = tabs[tabs.length - 1]; break;
      default: return;
    }
    event.preventDefault();
    const activated = this.activateSettingsTab(next.getAttribute('data-settings-tab'));
    if (activated) activated.focus();
  };

  P.openSettings = function(tabKey) {
    const dialog = document.getElementById('app-settings-dialog');
    if (!dialog) return;
    const key = SETTINGS_TABS.includes(tabKey) ? tabKey
      : (SETTINGS_TABS.includes(this._settingsLastTab) ? this._settingsLastTab : 'general');
    const tab = this.activateSettingsTab(key);

    if (!dialog.open) {
      this._settingsReturnFocus = document.activeElement || null;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      this._refreshSettingsUpdates();
    }
    if (tab) tab.focus();
  };

  P.closeSettings = function() {
    const dialog = document.getElementById('app-settings-dialog');
    if (dialog && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
    this._settingsRestoreFocus();
  };

  P._settingsRestoreFocus = function() {
    const el = this._settingsReturnFocus;
    this._settingsReturnFocus = null;
    if (el && typeof el.focus === 'function') {
      try { el.focus(); } catch (_) { /* element gone */ }
    }
  };

  // ─── Panel markup ──────────────────────────────────────────────────────────

  P._renderSettingsPanel = function(key) {
    switch (key) {
      case 'general': return this._renderSettingsGeneral();
      case 'control': return this._renderSettingsControl();
      case 'accessibility': return this._a11yRenderSettingsGroup();
      case 'updates': return this._renderSettingsUpdates();
      default: return '';
    }
  };

  P._renderSettingsGeneral = function() {
    const theme = THEMES.some(([v]) => v === this.config?.theme) ? this.config.theme : 'carbon';
    return `<div class="sv-props-section">
                        <div class="sv-props-title">Appearance</div>
                        <div class="sv-props-field">
                            <label class="sv-props-label" for="theme-select">Theme</label>
                            <select id="theme-select" class="sv-props-select">
                                ${THEMES.map(([v, t]) => option(v, t, theme)).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="sv-props-section">
                        <div class="sv-props-title">Demo</div>
                        <div class="sv-props-field">
                            <label class="sv-props-label" for="general-demo-mode"><input type="checkbox" id="general-demo-mode" aria-describedby="general-demo-mode-help"${this.config?.demoMode === true ? ' checked' : ''}> Demo mode (two simulated meters)</label>
                            <p class="settings-help" id="general-demo-mode-help">Shows a steady meter and a voice-like meter without hardware. Off by default.</p>
                        </div>
                    </div>`;
  };

  P._renderSettingsControl = function() {
    const timingMs = this._getGlobalTimingMs();
    const boardLayout = this._getBoardLayout();
    const smoothingPct = this._getGlobalGaugeSmoothing();
    const debugLoggingEnabled = this.config?.globalDebugLoggingEnabled === true;
    const autoStart = this.config?.globalAutoStartPolling !== false;
    return `<div class="sv-props-section">
                        <div class="sv-props-title">Meters</div>
                        <div class="sv-props-field">
                            <label class="sv-props-label" for="global-timing-ms">Refresh Rate (ms)</label>
                            <input type="number" id="global-timing-ms" class="sv-props-input"
                                min="10" max="2000" step="10" value="${timingMs}">
                        </div>
                        <div class="sv-props-field" style="display:none">
                            <label class="sv-props-label" for="global-gauge-smoothing">Gauge Smoothing (%)</label>
                            <input type="range" id="global-gauge-smoothing" min="0" max="95" step="5" value="${smoothingPct}">
                            <span id="global-gauge-smoothing-value" class="sv-props-label">${smoothingPct}%</span>
                        </div>
                        <div class="sv-props-field">
                            <label class="sv-props-label" for="global-auto-start-polling"><input type="checkbox" id="global-auto-start-polling"${autoStart ? ' checked' : ''}> Start polling automatically when a meter connects</label>
                        </div>
                        <div class="sv-props-field">
                            <label class="sv-props-label" for="global-board-layout">Board Layout</label>
                            <select id="global-board-layout" class="sv-props-select">
                                ${BOARD_LAYOUTS.map(([v, t]) => option(v, t, boardLayout)).join('')}
                            </select>
                        </div>
                        <div class="sv-props-field">
                            <label class="sv-props-label" for="global-debug-logging"><input type="checkbox" id="global-debug-logging"${debugLoggingEnabled ? ' checked' : ''}> Serial debug logging</label>
                        </div>
                    </div>
                    <div class="sv-props-section">
                        <div class="sv-props-title">Cards</div>
                        <div class="sv-props-field sv-props-field--action">
                            <button type="button" class="btn btn-secondary btn-small" id="add-swr-card-btn">Add SWR / Return Loss Card</button>
                        </div>
                    </div>`;
  };

  P._renderSettingsUpdates = function() {
    return `<div class="sv-props-section">
                        <div class="sv-props-title">Updates</div>
                        <p class="settings-version">Version <span id="settings-app-version">…</span></p>
                        <div class="sv-props-field">
                            <label class="sv-props-label" for="update-channel-beta"><input type="checkbox" id="update-channel-beta" aria-describedby="update-channel-beta-help"> Accept beta (pre-release) updates</label>
                            <p class="settings-help" id="update-channel-beta-help">Beta builds arrive before the stable release. Leave this off unless you are testing.</p>
                        </div>
                        <div class="sv-props-field sv-props-field--action">
                            <button type="button" class="btn btn-secondary btn-small" id="settings-check-updates">Check for updates now</button>
                        </div>
                    </div>`;
  };

  // ─── Bindings ──────────────────────────────────────────────────────────────

  P._bindSettingsPanel = function(key) {
    switch (key) {
      case 'general': return this._bindSettingsGeneral(); // theme select is wired by setupThemeToggle (renderer.js)
      case 'control': return this._bindSettingsControl();
      case 'accessibility': return this._a11yBindSettingsEvents();
      case 'updates': return this._bindSettingsUpdates();
      default: return undefined;
    }
  };

  P._bindSettingsGeneral = function() {
    const demoBox = document.getElementById('general-demo-mode');
    if (demoBox) {
      demoBox.addEventListener('change', () => {
        const on = Boolean(demoBox.checked);
        this.config.demoMode = on;
        this.saveConfig();
        if (typeof this.setDemoMode === 'function') this.setDemoMode(on);
      });
    }
  };

  P._bindSettingsControl = function() {
    const timingInput = document.getElementById('global-timing-ms');
    if (timingInput) {
      timingInput.addEventListener('change', () => {
        const ms = Number.parseInt(timingInput.value, 10);
        if (!Number.isFinite(ms) || ms < 10 || ms > 2000) {
          timingInput.value = String(this._getGlobalTimingMs());
          return;
        }
        this._applyGlobalTimingMs(ms, { persist: true, restartTimers: true });
      });
    }

    const smoothingInput = document.getElementById('global-gauge-smoothing');
    const smoothingValue = document.getElementById('global-gauge-smoothing-value');
    if (smoothingInput && smoothingValue) {
      const updateSmoothing = () => {
        const pct = Math.max(0, Math.min(95, Number.parseInt(smoothingInput.value, 10) || 0));
        this.config.globalGaugeSmoothingPct = pct;
        smoothingValue.textContent = `${pct}%`;
        this.saveConfig();
      };
      smoothingInput.addEventListener('input', updateSmoothing);
      smoothingInput.addEventListener('change', updateSmoothing);
    }

    const autoStartInput = document.getElementById('global-auto-start-polling');
    if (autoStartInput) {
      autoStartInput.addEventListener('change', () => {
        this.config.globalAutoStartPolling = Boolean(autoStartInput.checked);
        this.saveConfig();
      });
    }

    const debugLoggingInput = document.getElementById('global-debug-logging');
    if (debugLoggingInput) {
      debugLoggingInput.addEventListener('change', () => {
        this.config.globalDebugLoggingEnabled = Boolean(debugLoggingInput.checked);
        this.saveConfig();
      });
    }

    const boardLayoutSelect = document.getElementById('global-board-layout');
    if (boardLayoutSelect) {
      boardLayoutSelect.addEventListener('change', () => {
        this._applyBoardLayout(boardLayoutSelect.value, true);
      });
    }

    document.getElementById('add-swr-card-btn')?.addEventListener('click', () => {
      this.activateTab?.('control');
      this.addSwrCard();
      this.closeSettings();
    });
  };

  P._bindSettingsUpdates = function() {
    const betaBox = document.getElementById('update-channel-beta');
    if (betaBox) {
      betaBox.addEventListener('change', () => {
        if (typeof this.setUpdateChannel === 'function') {
          this.setUpdateChannel(betaBox.checked ? 'beta' : 'stable');
        }
      });
    }
    document.getElementById('settings-check-updates')?.addEventListener('click', () => {
      document.getElementById('update-button')?.click();
    });
    return this._refreshSettingsUpdates();
  };

  // Version label + beta checkbox. Betas are opt-in: the box is unchecked unless the
  // user ticked it, whatever the running version.
  P._refreshSettingsUpdates = async function() {
    let version = '';
    try {
      version = (await window.electronAPI?.getAppVersion?.()) || '';
    } catch (_) { /* bridge unavailable */ }
    const span = document.getElementById('settings-app-version');
    if (span) span.textContent = version || 'unknown';
    const betaBox = document.getElementById('update-channel-beta');
    if (betaBox && typeof this.isBetaUpdatesEnabled === 'function') {
      try { betaBox.checked = Boolean(this.isBetaUpdatesEnabled(version)); } catch (_) { /* leave as is */ }
    }
  };
})();
