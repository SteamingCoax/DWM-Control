'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { extractTags, findById, stripTags } = require('./helpers/html-tags');
const { RENDERER_SCRIPTS } = require('./helpers/renderer-harness');
const fs = require('node:fs');
const path = require('node:path');

describe('HTML tag extractor', () => {
  describe('extractTags', () => {
    it('extracts opening tags with double-quoted attributes', () => {
      const html = '<button id="btn1" class="primary">Click</button>';
      const tags = extractTags(html, 'button');
      assert.equal(tags.length, 1);
      assert.equal(tags[0].tag, 'button');
      assert.deepEqual(tags[0].attrs, { id: 'btn1', class: 'primary' });
      assert.equal(tags[0].inner, 'Click');
    });

    it('extracts tags with single-quoted attributes', () => {
      const html = "<div id='main' data-x='test'>content</div>";
      const tags = extractTags(html, 'div');
      assert.equal(tags.length, 1);
      assert.deepEqual(tags[0].attrs, { id: 'main', 'data-x': 'test' });
      assert.equal(tags[0].inner, 'content');
    });

    it('extracts tags with unquoted attributes', () => {
      const html = '<input type=text value=hello>';
      const tags = extractTags(html, 'input');
      assert.equal(tags.length, 1);
      assert.deepEqual(tags[0].attrs, { type: 'text', value: 'hello' });
    });

    it('parses boolean attributes as true', () => {
      const html = '<input type=checkbox disabled>';
      const tags = extractTags(html, 'input');
      assert.equal(tags.length, 1);
      assert.deepEqual(tags[0].attrs, { type: 'checkbox', disabled: true });
    });

    it('is case-insensitive for tag name', () => {
      const html = '<BUTTON ID="btn">Click</BUTTON>';
      const tags = extractTags(html, 'button');
      assert.equal(tags.length, 1);
      assert.equal(tags[0].tag, 'BUTTON');
    });

    it('captures raw opening tag text', () => {
      const html = '<div id="x" class="y" data-z="w">text</div>';
      const tags = extractTags(html, 'div');
      assert.equal(tags[0].raw, '<div id="x" class="y" data-z="w">');
    });

    it('finds inner text between opening and closing tags', () => {
      const html = '<p>Line 1<br/>Line 2</p>';
      const tags = extractTags(html, 'p');
      assert.equal(tags[0].inner, 'Line 1<br/>Line 2');
    });

    it('ignores script tag contents by default', () => {
      const html = '<script>var x = "<button>ignored</button>";</script><button id="real">Click</button>';
      const tags = extractTags(html, 'button');
      assert.equal(tags.length, 1);
      assert.equal(tags[0].attrs.id, 'real');
    });

    it('extracts script tags when tagName is "script"', () => {
      const html = '<script>var x = 1;</script>';
      const tags = extractTags(html, 'script');
      assert.equal(tags.length, 1);
      assert.equal(tags[0].inner, 'var x = 1;');
    });

    it('handles multiple tags of the same type', () => {
      const html = '<div id="a">A</div><div id="b">B</div>';
      const tags = extractTags(html, 'div');
      assert.equal(tags.length, 2);
      assert.equal(tags[0].attrs.id, 'a');
      assert.equal(tags[1].attrs.id, 'b');
    });
  });

  describe('findById', () => {
    it('returns the element with matching id', () => {
      const html = '<div id="first">A</div><div id="target">B</div>';
      const elem = findById(html, 'target');
      assert(elem);
      assert.equal(elem.attrs.id, 'target');
      assert.equal(elem.inner, 'B');
    });

    it('returns null when id not found', () => {
      const html = '<div id="first">A</div>';
      const elem = findById(html, 'missing');
      assert.equal(elem, null);
    });

    it('returns the first element if multiple have same id', () => {
      const html = '<div id="dup">First</div><div id="dup">Second</div>';
      const elem = findById(html, 'dup');
      assert.equal(elem.inner, 'First');
    });
  });

  describe('stripTags', () => {
    it('removes all tags', () => {
      const text = '<button id="btn">Click <b>me</b></button>';
      const stripped = stripTags(text);
      assert.equal(stripped, 'Click me');
    });

    it('collapses whitespace', () => {
      const text = '<p>  Multiple   spaces  </p>';
      const stripped = stripTags(text);
      assert.equal(stripped, 'Multiple spaces');
    });

    it('trims leading and trailing whitespace', () => {
      const text = '  <div>content</div>  ';
      const stripped = stripTags(text);
      assert.equal(stripped, 'content');
    });

    it('handles empty strings', () => {
      const stripped = stripTags('');
      assert.equal(stripped, '');
    });

    it('handles text with only tags', () => {
      const stripped = stripTags('<div></div>');
      assert.equal(stripped, '');
    });
  });

  describe('renderer script order in index.html', () => {
    it('matches RENDERER_SCRIPTS from harness', () => {
      const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
      const srcScripts = extractTags(html, 'script')
        .filter(s => s.attrs.src && s.attrs.src.startsWith('renderer'))
        .map(s => s.attrs.src);
      assert.deepEqual(srcScripts, RENDERER_SCRIPTS, 'Script order in index.html must match RENDERER_SCRIPTS');
    });
  });
});
