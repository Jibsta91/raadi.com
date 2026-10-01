import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { retryDelayMs, toLocale } from '../../src/notifications/model.js';
import { renderEmail } from '../../src/notifications/templates.js';

const links = {
  action: 'http://raadi.localhost/nb/messages/0d7c1f3e-9a51-4c47-8f0e-1c2b3a4d5e6f',
  settings: 'http://raadi.localhost/nb/notifications',
};

describe('e-mail templates', () => {
  it('renders every kind in every locale with a link back and a settings link', () => {
    for (const kind of ['new_message', 'listing_removed'] as const) {
      for (const locale of ['nb', 'en', 'so'] as const) {
        const e = renderEmail(kind, locale, { title: 'Sykkel' }, links);
        assert.ok(e.subject.length > 5, `${kind}/${locale} subject`);
        assert.ok(e.text.includes(links.action) && e.text.includes(links.settings));
        assert.ok(e.html.includes(`href="${links.action}"`));
      }
    }
  });

  it('escapes listing titles in HTML', () => {
    const e = renderEmail('listing_removed', 'en', { title: '<script>x</script> & "co"' }, links);
    assert.ok(!e.html.includes('<script>'));
    assert.ok(e.html.includes('&#60;script&#62;'));
    assert.ok(e.text.includes('<script>x</script>'), 'plain text keeps the title as is');
  });
});

describe('helpers', () => {
  it('maps Keycloak locales and backs off exponentially up to an hour', () => {
    assert.equal(toLocale('no'), 'nb');
    assert.equal(toLocale(undefined), 'nb');
    assert.equal(toLocale('so'), 'so');
    assert.equal(toLocale('en'), 'en');
    assert.deepEqual([1, 2, 3].map(retryDelayMs), [30_000, 60_000, 120_000]);
    assert.equal(retryDelayMs(20), 3_600_000);
  });
});
