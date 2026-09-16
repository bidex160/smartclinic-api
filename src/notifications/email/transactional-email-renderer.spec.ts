import { joinUrl, renderTransactionalEmail, sanitizeEmailSubject } from './transactional-email-renderer';

describe('transactional email renderer', () => {
  it('renders branded responsive HTML and meaningful text with CTA, reference, and details', () => {
    const result = renderTransactionalEmail({
      preheader: 'Preview text',
      title: 'Care request accepted',
      greeting: 'Hello Ada',
      body: ['Your care provider has accepted your request.'],
      action: { label: 'View care request', url: 'https://smartclinicnetwork.com/me/care/SC-CARE-1' },
      details: [{ label: 'Service', value: 'General Consultation' }],
      reference: 'SC-CARE-1',
      footerNote: 'You can manage this in your SmartClinic account.',
    }, { year: 2026 });
    expect(result.html).toContain('SmartClinic Network');
    expect(result.html).toContain('#7139d6');
    expect(result.html).toContain('Preview text');
    expect(result.html).toContain('View care request');
    expect(result.html).toContain('max-width:640px');
    expect(result.text).toContain('SmartClinic Network');
    expect(result.text).toContain('View care request:\nhttps://smartclinicnetwork.com/me/care/SC-CARE-1');
    expect(result.text).toContain('Reference: SC-CARE-1');
  });

  it('escapes dynamic HTML and falls back to text brand when no logo exists', () => {
    const result = renderTransactionalEmail({
      title: '<img src=x onerror=alert(1)>',
      body: 'Hello <script>alert(1)</script>',
      details: [{ label: '<b>Name</b>', value: '<Ada>' }],
      action: { label: '<Click>', url: 'https://example.test/path?q=<bad>' },
    });
    expect(result.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(result.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(result.html).toContain('&lt;Click&gt;');
    expect(result.html).not.toContain('<script>');
    expect(result.html).toContain('SmartClinic Network</div>');
  });

  it('omits unsafe CTA URLs and accepts optional safe logo URLs', () => {
    const unsafe = renderTransactionalEmail({ title: 'Title', body: 'Body', action: { label: 'Open', url: 'javascript:alert(1)' } });
    expect(unsafe.html).not.toContain('javascript:');
    expect(unsafe.text).not.toContain('javascript:');
    const withLogo = renderTransactionalEmail({ title: 'Title', body: 'Body' }, { logoUrl: 'https://cdn.example.test/logo.png' });
    expect(withLogo.html).toContain('src="https://cdn.example.test/logo.png"');
  });

  it('sanitizes subjects and safely joins public frontend routes', () => {
    expect(sanitizeEmailSubject('Hello\r\nBcc: victim@example.test')).toBe('Hello Bcc: victim@example.test');
    expect(joinUrl('https://smartclinicnetwork.com/', '/me/care/SC-CARE-1')).toBe('https://smartclinicnetwork.com/me/care/SC-CARE-1');
  });
});

