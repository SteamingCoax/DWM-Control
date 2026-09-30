'use strict';
// Regex-based HTML tag/attribute extractor with no dependencies. The test harness
// has no DOM parser, so markup tests inspect index.html and rendered template
// strings through this helper instead. Good enough for well-formed app markup;
// it does not handle nested same-name tags when computing `inner`.

// name, name="v", name='v', name=v
const ATTR_RE = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/g;

function parseAttributes(attrsStr) {
  const attrs = {};
  if (!attrsStr) return attrs;
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(attrsStr)) !== null) {
    const [, name, dq, sq, uq] = m;
    attrs[name] = dq !== undefined ? dq : sq !== undefined ? sq : uq !== undefined ? uq : true;
  }
  return attrs;
}

function stripScripts(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (s) => ' '.repeat(s.length));
}

function innerAfter(html, tagName, startPos) {
  const close = new RegExp(`</${tagName}\\s*>`, 'i').exec(html.slice(startPos));
  return close ? html.slice(startPos, startPos + close.index) : '';
}

// Every opening tag in `html` (script bodies blanked unless scanning for scripts),
// as { tag, attrs, raw, inner, index }. `tagName` narrows to one element name.
function scanTags(html, tagName) {
  const working = tagName && tagName.toLowerCase() === 'script' ? html : stripScripts(html);
  const name = tagName ? tagName.replace(/[^\w-]/g, '') : '[a-zA-Z][\\w-]*';
  const re = new RegExp(`<(${name})\\b([^>]*?)/?>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(working)) !== null) {
    const tag = m[1];
    const raw = m[0];
    out.push({
      tag, raw, index: m.index,
      attrs: parseAttributes(m[2]),
      inner: raw.endsWith('/>') ? '' : innerAfter(working, tag, m.index + raw.length),
    });
  }
  return out;
}

function extractTags(html, tagName) {
  return scanTags(html, tagName);
}

function findById(html, id) {
  return scanTags(html).find((t) => t.attrs.id === id) || null;
}

function stripTags(text) {
  return String(text).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

module.exports = { extractTags, findById, stripTags, parseAttributes };
