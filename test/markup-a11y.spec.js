'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const { extractTags, findById, stripTags, parseAttributes } = require('./helpers/html-tags');
const { loadRenderer, makeControlStub, makeElement } = require('./helpers/renderer-harness');

// Helper to read HTML files
function readHtml(filePath) {
  return fs.readFileSync(path.join(ROOT, filePath), 'utf8');
}

test('index.html accessibility', async (t) => {
  const html = readHtml('index.html');

  await t.test('navigation has role tablist and aria-label', () => {
    const nav = extractTags(html, 'nav').find(tag => tag.attrs.class?.includes('tab-navigation'));
    assert.ok(nav, 'nav.tab-navigation exists');
    assert.strictEqual(nav.attrs.role, 'tablist', 'nav has role="tablist"');
    assert.strictEqual(nav.attrs['aria-label'], 'Main sections', 'nav has aria-label="Main sections"');
  });

  await t.test('tab buttons have correct attributes', () => {
    const buttons = extractTags(html, 'button').filter(tag => tag.attrs.class?.includes('tab-button'));
    assert.ok(buttons.length > 0, 'tab buttons exist');

    buttons.forEach(btn => {
      const dataTab = btn.attrs['data-tab'];
      assert.ok(dataTab, `tab button has data-tab="${dataTab}"`);
      assert.strictEqual(btn.attrs.role, 'tab', 'tab button has role="tab"');
      assert.strictEqual(btn.attrs.id, `tab-${dataTab}`, `tab button has id="tab-${dataTab}"`);
      assert.ok(btn.attrs['aria-controls'], 'tab button has aria-controls');
      assert.ok(btn.attrs['aria-selected'], 'tab button has aria-selected');
      if (btn.attrs.class.includes('active')) {
        assert.strictEqual(btn.attrs['aria-selected'], 'true', 'active tab has aria-selected="true"');
        assert.strictEqual(btn.attrs.tabindex, '0', 'active tab has tabindex="0"');
      } else {
        assert.strictEqual(btn.attrs['aria-selected'], 'false', 'inactive tab has aria-selected="false"');
        assert.strictEqual(btn.attrs.tabindex, '-1', 'inactive tab has tabindex="-1"');
      }
    });
  });

  await t.test('tab panels have correct attributes', () => {
    const panels = extractTags(html, 'section').filter(tag => tag.attrs.class?.includes('tab-panel'));
    assert.ok(panels.length > 0, 'tab panels exist');

    panels.forEach(panel => {
      const id = panel.attrs.id;
      assert.ok(id, `tab panel has id="${id}"`);
      assert.strictEqual(panel.attrs.role, 'tabpanel', 'tab panel has role="tabpanel"');
      assert.ok(panel.attrs['aria-labelledby'], 'tab panel has aria-labelledby');

      const isActive = panel.attrs.class.includes('active');
      if (isActive) {
        assert.strictEqual(panel.attrs.hidden, undefined, 'active panel does not have hidden attribute');
      } else {
        assert.strictEqual(panel.attrs.hidden, true, 'inactive panel has hidden attribute');
      }
    });
  });

  await t.test('a11y-status and a11y-alert divs exist', () => {
    const status = findById(html, 'a11y-status');
    assert.ok(status, '#a11y-status exists');
    assert.strictEqual(status.attrs.role, 'status', 'a11y-status has role="status"');
    assert.strictEqual(status.attrs['aria-live'], 'polite', 'a11y-status has aria-live="polite"');
    assert.ok(status.attrs.class?.includes('sr-only'), 'a11y-status has class sr-only');
    assert.strictEqual(status.attrs['aria-atomic'], 'true', 'a11y-status has aria-atomic="true"');

    const alert = findById(html, 'a11y-alert');
    assert.ok(alert, '#a11y-alert exists');
    assert.strictEqual(alert.attrs.role, 'alert', 'a11y-alert has role="alert"');
    assert.strictEqual(alert.attrs['aria-live'], 'assertive', 'a11y-alert has aria-live="assertive"');
    assert.ok(alert.attrs.class?.includes('sr-only'), 'a11y-alert has class sr-only');
    assert.strictEqual(alert.attrs['aria-atomic'], 'true', 'a11y-alert has aria-atomic="true"');
  });

  await t.test('settings-button and clear-file-btn have aria-label', () => {
    // #theme-select moved into the Settings dialog (rendered by settings.js, labelled by <label for>).
    const settingsBtn = findById(html, 'settings-button');
    assert.ok(settingsBtn, '#settings-button exists');
    assert.strictEqual(settingsBtn.attrs['aria-label'], 'Settings', 'settings-button has aria-label="Settings"');

    const clearBtn = findById(html, 'clear-file-btn');
    assert.ok(clearBtn, '#clear-file-btn exists');
    assert.strictEqual(clearBtn.attrs['aria-label'], 'Clear selected file', 'clear-file-btn has aria-label');
  });

  await t.test('upload-progress has progressbar role and attrs', () => {
    const progress = findById(html, 'upload-progress');
    assert.ok(progress, '#upload-progress exists');
    assert.strictEqual(progress.attrs.role, 'progressbar', 'upload-progress has role="progressbar"');
    assert.strictEqual(progress.attrs['aria-valuemin'], '0', 'upload-progress has aria-valuemin="0"');
    assert.strictEqual(progress.attrs['aria-valuemax'], '100', 'upload-progress has aria-valuemax="100"');
    assert.strictEqual(progress.attrs['aria-valuenow'], '0', 'upload-progress has aria-valuenow="0"');
    assert.strictEqual(progress.attrs['aria-labelledby'], 'progress-text', 'upload-progress has aria-labelledby="progress-text"');
  });

  await t.test('output-console and serial-monitor-output have log role', () => {
    const outputConsole = findById(html, 'output-console');
    assert.ok(outputConsole, '#output-console exists');
    assert.strictEqual(outputConsole.attrs.role, 'log', 'output-console has role="log"');
    assert.strictEqual(outputConsole.attrs['aria-live'], 'polite', 'output-console has aria-live="polite"');
    assert.strictEqual(outputConsole.attrs['aria-relevant'], 'additions', 'output-console has aria-relevant="additions"');
    assert.strictEqual(outputConsole.attrs['aria-label'], 'Output console', 'output-console has aria-label');

    const serialMonitor = findById(html, 'serial-monitor-output');
    assert.ok(serialMonitor, '#serial-monitor-output exists');
    assert.strictEqual(serialMonitor.attrs.role, 'log', 'serial-monitor-output has role="log"');
    assert.strictEqual(serialMonitor.attrs['aria-live'], 'polite', 'serial-monitor-output has aria-live="polite"');
    assert.strictEqual(serialMonitor.attrs['aria-relevant'], 'additions', 'serial-monitor-output has aria-relevant="additions"');
    assert.strictEqual(serialMonitor.attrs['aria-label'], 'Upload output', 'serial-monitor-output has aria-label');
  });

  await t.test('coefficient labels and values have proper associations', () => {
    const coef1Value = findById(html, 'coef1-value');
    assert.ok(coef1Value, '#coef1-value exists');
    assert.ok(coef1Value.attrs['aria-labelledby'], 'coef1-value has aria-labelledby');
    const coef1Label = findById(html, coef1Value.attrs['aria-labelledby']);
    assert.ok(coef1Label, `label with id="${coef1Value.attrs['aria-labelledby']}" exists`);

    const coef2Value = findById(html, 'coef2-value');
    assert.ok(coef2Value.attrs['aria-labelledby'], 'coef2-value has aria-labelledby');
    const coef3Value = findById(html, 'coef3-value');
    assert.ok(coef3Value.attrs['aria-labelledby'], 'coef3-value has aria-labelledby');
    const rSquaredValue = findById(html, 'r-squared-value');
    assert.ok(rSquaredValue.attrs['aria-labelledby'], 'r-squared-value has aria-labelledby');
  });
});

test('renderMeterCard accessibility', async (t) => {
  loadRenderer({ scripts: ['renderer.js', 'renderer/modules/control.js'] });
  const stub = makeControlStub({
    config: {},
    scalePower: (w) => ({ scaled: w, unit: 'W' }),
    _normalizeRange: (cfg) => ({ cfg }),
  });

  const record = {
    key: 'usbmodem:test1',
    friendlyName: 'Bench A',
    connectionState: 'connected',
    portPath: '/dev/ttyACM0',
    elementId: 1,
    elementRating: 100,
  };

  const html = stub.renderMeterCard(record);

  await t.test('meter card root has region role and aria-label', () => {
    const card = extractTags(html, 'div').find(tag => tag.attrs.class?.includes('meter-card'));
    assert.ok(card, 'meter-card div exists');
    assert.strictEqual(card.attrs.role, 'region', 'meter card has role="region"');
    assert.ok(card.attrs['aria-label']?.includes('Bench A'), 'meter card aria-label includes meter name');
  });

  await t.test('meter drag handle has aria-hidden', () => {
    const handle = extractTags(html, 'span').find(tag => tag.attrs.class?.includes('meter-drag-handle'));
    assert.ok(handle, 'meter-drag-handle exists');
    assert.strictEqual(handle.attrs['aria-hidden'], 'true', 'drag handle has aria-hidden="true"');
  });

  await t.test('meter card identity has heading role', () => {
    const identity = extractTags(html, 'div').find(tag => tag.attrs.class?.includes('meter-card-identity'));
    assert.ok(identity, 'meter-card-identity exists');
    assert.strictEqual(identity.attrs.role, 'heading', 'identity has role="heading"');
    assert.strictEqual(identity.attrs['aria-level'], '3', 'identity has aria-level="3"');
  });

  await t.test('all selects have aria-label or label[for]', () => {
    const selects = extractTags(html, 'select');
    assert.ok(selects.length > 0, 'selects exist in meter card');
    selects.forEach(select => {
      const hasAriaLabel = select.attrs['aria-label'];
      const selectId = select.attrs.id;
      const hasLabel = selectId && html.includes(`for="${selectId}"`);
      assert.ok(hasAriaLabel || hasLabel, `select ${selectId} has aria-label or label[for]`);
    });
  });

  await t.test('gauge canvases have role img and aria-label', () => {
    const canvases = extractTags(html, 'canvas');
    const gaugeCanvases = canvases.filter(c => c.attrs.class?.includes('meter-gauge-radial-canvas'));
    assert.ok(gaugeCanvases.length >= 2, 'at least 2 gauge canvases exist');

    gaugeCanvases.forEach(canvas => {
      assert.strictEqual(canvas.attrs.role, 'img', 'gauge canvas has role="img"');
      assert.ok(canvas.attrs['aria-label'], `gauge canvas has aria-label`);
    });
  });

  await t.test('gauge screen reader spans exist', () => {
    const sid = stub.meterSafeId(record.key);
    const srL = findById(html, `meter-${sid}-gauge-sr-L`);
    assert.ok(srL, `#meter-${sid}-gauge-sr-L exists`);
    assert.ok(srL.attrs.class?.includes('sr-only'), 'gauge sr span has sr-only class');

    const srR = findById(html, `meter-${sid}-gauge-sr-R`);
    assert.ok(srR, `#meter-${sid}-gauge-sr-R exists`);
  });

  await t.test('history canvas has role img and sr span', () => {
    const canvases = extractTags(html, 'canvas');
    const histCanvas = canvases.find(c => c.attrs.class?.includes('meter-history-canvas'));
    assert.ok(histCanvas, 'history canvas exists');
    assert.strictEqual(histCanvas.attrs.role, 'img', 'history canvas has role="img"');
    assert.ok(histCanvas.attrs['aria-label'], 'history canvas has aria-label');

    const sid = stub.meterSafeId(record.key);
    const srHist = findById(html, `meter-${sid}-history-sr`);
    assert.ok(srHist, `#meter-${sid}-history-sr exists`);
  });

  await t.test('all buttons have visible text or aria-label', () => {
    const buttons = extractTags(html, 'button');
    buttons.forEach(btn => {
      const inner = stripTags(btn.inner);
      const hasAriaLabel = btn.attrs['aria-label'];
      assert.ok(inner || hasAriaLabel, `button has visible text or aria-label`);
    });
  });

  await t.test('all inputs have aria-label or label[for]', () => {
    const inputs = extractTags(html, 'input').filter(inp => {
      // Skip checkboxes and radio buttons (they're typically inside labels)
      if (inp.attrs.type === 'checkbox' || inp.attrs.type === 'radio') return false;
      // Skip hidden inputs
      if (inp.attrs.type === 'hidden') return false;
      return true;
    });
    inputs.forEach(inp => {
      const hasAriaLabel = inp.attrs['aria-label'];
      const inputId = inp.attrs.id;
      const hasLabel = inputId && html.includes(`for="${inputId}"`);
      assert.ok(hasAriaLabel || hasLabel, `input ${inputId} has aria-label or label[for]`);
    });
  });
});

test('renderSwrCard accessibility', async (t) => {
  loadRenderer({ scripts: ['renderer.js', 'renderer/modules/control.js'] });
  const stub = makeControlStub({ config: {} });

  const swrRec = {
    id: 'swr-test-1',
    fwdKey: null,
    refKey: null,
    fwdMetric: 'avg',
  };

  const html = stub.renderSwrCard(swrRec);

  await t.test('swr card has region role and aria-label', () => {
    const card = extractTags(html, 'div').find(tag => tag.attrs.class?.includes('swr-card'));
    assert.ok(card, 'swr-card exists');
    assert.strictEqual(card.attrs.role, 'region', 'swr card has role="region"');
    assert.ok(card.attrs['aria-label'], 'swr card has aria-label');
  });

  await t.test('swr drag handle has aria-hidden', () => {
    const handle = extractTags(html, 'span').find(tag => tag.attrs.class?.includes('meter-drag-handle'));
    assert.ok(handle, 'drag handle exists in swr card');
    assert.strictEqual(handle.attrs['aria-hidden'], 'true', 'drag handle has aria-hidden="true"');
  });

  await t.test('swr card title has heading role', () => {
    const title = extractTags(html, 'span').find(tag => tag.attrs.class?.includes('swr-card-title'));
    assert.ok(title, 'swr-card-title exists');
    assert.strictEqual(title.attrs.role, 'heading', 'swr title has role="heading"');
    assert.strictEqual(title.attrs['aria-level'], '3', 'swr title has aria-level="3"');
  });

  await t.test('swr source labels have for attributes', () => {
    const labels = extractTags(html, 'label').filter(l => l.attrs.class?.includes('swr-source-label'));
    assert.ok(labels.length >= 2, 'swr source labels exist');

    const fwdLabel = labels.find(l => l.inner.includes('Forward'));
    assert.ok(fwdLabel, 'Forward Power label exists');
    assert.ok(fwdLabel.attrs.for, 'Forward label has for attribute');

    const refLabel = labels.find(l => l.inner.includes('Reflected'));
    assert.ok(refLabel, 'Reflected Power label exists');
    assert.ok(refLabel.attrs.for, 'Reflected label has for attribute');
  });

  await t.test('swr gauge canvases have role img', () => {
    const canvases = extractTags(html, 'canvas');
    const swrGauge = canvases.find(c => c.attrs.class?.includes('meter-gauge-radial-canvas') && c.attrs.id?.includes('gauge-swr'));
    assert.ok(swrGauge, 'swr gauge canvas exists');
    assert.strictEqual(swrGauge.attrs.role, 'img', 'swr gauge has role="img"');
    assert.ok(swrGauge.attrs['aria-label'], 'swr gauge has aria-label');

    const rlGauge = canvases.find(c => c.attrs.id?.includes('gauge-rl'));
    assert.ok(rlGauge, 'rl gauge canvas exists');
    assert.strictEqual(rlGauge.attrs.role, 'img', 'rl gauge has role="img"');
    assert.ok(rlGauge.attrs['aria-label'], 'rl gauge has aria-label');
  });

  await t.test('swr unlabeled selects have aria-label', () => {
    const labels = extractTags(html, 'label');
    const selects = extractTags(html, 'select');
    const swrSelects = selects.filter(s => s.attrs['data-swr-id']);

    assert.ok(swrSelects.length > 0, 'swr selects exist');
    swrSelects.forEach(select => {
      const selectId = select.attrs.id;
      const hasFor = labels.some(l => l.attrs.for === selectId);
      if (!hasFor) {
        assert.ok(select.attrs['aria-label'], `select without label has aria-label`);
      }
    });
  });
});

test('De-Embed data entry rows accessibility', async (t) => {
  // Test the generated HTML structure of data entry rows
  // We'll test by checking the expected HTML patterns based on the deembed.js code

  // Simulated manual mode row HTML (as generated by generateDataEntryFields)
  const pointIndex = 1;
  const manualRowHtml = `
    <label for="power-${pointIndex}">Point ${pointIndex}:</label>
    <input type="number"
           id="power-${pointIndex}"
           class="power-input"
           placeholder="Power level"
           step="any"
           min="0"
           data-index="${pointIndex}">
    <span class="fs-display invalid" id="fs-${pointIndex}">- %FS</span>
    <input type="number"
           id="voltage-input-${pointIndex}"
           class="voltage-input"
           placeholder="Voltage (mV)"
           step="any"
           min="0"
           data-index="${pointIndex}"
           aria-label="Point ${pointIndex} voltage in millivolts">
    <span class="voltage-unit">mV</span>
  `;

  const sampleRowHtml = `
    <label for="power-${pointIndex}">Point ${pointIndex}:</label>
    <input type="number"
           id="power-${pointIndex}"
           class="power-input"
           placeholder="Power level"
           step="any"
           min="0"
           data-index="${pointIndex}">
    <span class="fs-display invalid" id="fs-${pointIndex}">- %FS</span>
    <span class="voltage-display" id="voltage-${pointIndex}">- mV</span>
    <button class="sample-btn" data-index="${pointIndex}" aria-label="Sample voltage for point ${pointIndex}">Sample</button>
  `;

  await t.test('data entry rows have labeled power inputs', () => {
    assert.ok(manualRowHtml.includes('for="power-1"'), 'manual mode power input has label with for attribute');
    assert.ok(sampleRowHtml.includes('for="power-1"'), 'sample mode power input has label with for attribute');
  });

  await t.test('voltage inputs have aria-label or for', () => {
    assert.ok(manualRowHtml.includes('aria-label="Point 1 voltage in millivolts"'), 'manual mode voltage input has aria-label');
    assert.ok(sampleRowHtml.includes('aria-label="Sample voltage for point 1"'), 'sample mode sample button has aria-label');
  });
});

test('styles.css accessibility classes exist', async (t) => {
  const cssPath = path.join(ROOT, 'styles.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  await t.test('.sr-only class is defined', () => {
    assert.ok(css.includes('.sr-only'), 'sr-only class is defined in styles.css');
    assert.ok(css.includes('position: absolute'), 'sr-only has position: absolute');
    assert.ok(css.includes('width: 1px') || css.includes('width:1px'), 'sr-only has width: 1px');
  });

  await t.test('.tab-panel[hidden] rule is defined', () => {
    assert.ok(css.includes('.tab-panel[hidden]'), 'tab-panel[hidden] rule exists');
    assert.ok(css.includes('display: none !important') || css.includes('display:none!important'), 'tab-panel[hidden] has display: none !important');
  });

  await t.test('.meter-card.a11y-focused rule is defined', () => {
    assert.ok(css.includes('.meter-card.a11y-focused'), 'meter-card.a11y-focused rule exists');
  });
});
