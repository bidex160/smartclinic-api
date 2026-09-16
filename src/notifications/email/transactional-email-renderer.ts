const BRAND_NAME = 'SmartClinic Network';
const BRAND_COLOR = '#7139d6';

export interface TransactionalEmailAction {
  label: string;
  url: string;
}

export interface TransactionalEmailDetail {
  label: string;
  value: string | null | undefined;
}

export interface TransactionalEmailRenderInput {
  preheader?: string;
  title: string;
  greeting?: string;
  body: string | string[];
  action?: TransactionalEmailAction | null;
  details?: TransactionalEmailDetail[];
  reference?: string | null;
  footerNote?: string;
}

export interface TransactionalEmailRenderOptions {
  logoUrl?: string | null;
  year?: number;
}

export function sanitizeEmailSubject(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function renderTransactionalEmail(input: TransactionalEmailRenderInput, options: TransactionalEmailRenderOptions = {}) {
  const safeAction = input.action && safeHttpUrl(input.action.url) ? input.action : null;
  const paragraphs = Array.isArray(input.body) ? input.body : [input.body];
  const details = (input.details ?? []).filter((detail) => detail.value !== undefined && detail.value !== null && String(detail.value).trim() !== '');
  const reference = input.reference?.trim() || null;
  const year = options.year ?? new Date().getUTCFullYear();
  const logoUrl = options.logoUrl && safeHttpUrl(options.logoUrl) ? options.logoUrl : null;

  const preheader = input.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(input.preheader)}</div>` : '';
  const logoOrText = logoUrl
    ? `<img src="${escapeAttribute(logoUrl)}" width="180" alt="${BRAND_NAME}" style="display:block;border:0;max-width:180px;height:auto;">`
    : `<div style="font-size:20px;line-height:28px;font-weight:700;color:${BRAND_COLOR};">${BRAND_NAME}</div>`;
  const greeting = input.greeting ? `<p style="margin:0 0 16px 0;color:#374151;font-size:16px;line-height:24px;">${escapeHtml(input.greeting)}</p>` : '';
  const bodyHtml = paragraphs.map((paragraph) => `<p style="margin:0 0 16px 0;color:#374151;font-size:16px;line-height:24px;">${escapeHtml(paragraph)}</p>`).join('');
  const detailRows = [
    ...details.map((detail) => `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px;line-height:18px;">${escapeHtml(detail.label)}</td><td style="padding:8px 0;color:#111827;font-size:13px;line-height:18px;text-align:right;font-weight:600;">${escapeHtml(String(detail.value))}</td></tr>`),
    ...(reference ? [`<tr><td style="padding:8px 0;color:#6b7280;font-size:13px;line-height:18px;">Reference</td><td style="padding:8px 0;color:#111827;font-size:13px;line-height:18px;text-align:right;font-weight:600;">${escapeHtml(reference)}</td></tr>`] : []),
  ].join('');
  const detailsHtml = detailRows
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px 0;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">${detailRows}</table>`
    : '';
  const ctaHtml = safeAction
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px 0;"><tr><td bgcolor="${BRAND_COLOR}" style="border-radius:10px;"><a href="${escapeAttribute(safeAction.url)}" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;line-height:20px;border-radius:10px;">${escapeHtml(safeAction.label)}</a></td></tr></table>`
    : '';
  const footerNote = input.footerNote ? `<p style="margin:0 0 8px 0;color:#6b7280;font-size:12px;line-height:18px;">${escapeHtml(input.footerNote)}</p>` : '';

  const html = `<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f5f3ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    ${preheader}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f3ff;margin:0;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ede9fe;">
            <tr>
              <td style="padding:28px 32px 20px 32px;border-bottom:1px solid #ede9fe;">${logoOrText}</td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 20px 0;color:#111827;font-size:24px;line-height:32px;font-weight:700;">${escapeHtml(input.title)}</h1>
                ${greeting}
                ${bodyHtml}
                ${detailsHtml}
                ${ctaHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #f3f4f6;">
                ${footerNote}
                <p style="margin:0;color:#6b7280;font-size:12px;line-height:18px;">This is an automated ${BRAND_NAME} service message.</p>
                <p style="margin:8px 0 0 0;color:#9ca3af;font-size:12px;line-height:18px;">&copy; ${year} ${BRAND_NAME}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    BRAND_NAME,
    '',
    input.title,
    '',
    input.greeting,
    ...paragraphs.flatMap((paragraph) => [paragraph, '']),
    ...details.flatMap((detail) => [`${detail.label}: ${detail.value}`, '']),
    reference ? `Reference: ${reference}` : null,
    reference ? '' : null,
    safeAction ? `${safeAction.label}:` : null,
    safeAction ? safeAction.url : null,
    safeAction ? '' : null,
    input.footerNote || null,
    input.footerNote ? '' : null,
    `This is an automated ${BRAND_NAME} service message.`,
  ].filter((line) => line !== undefined && line !== null).join('\n').replace(/\n{4,}/g, '\n\n\n');

  return { html, text };
}

export function joinUrl(base: string, path: string): string {
  const url = new URL(path.startsWith('/') ? path : `/${path}`, normalizedBaseUrl(base));
  return url.toString();
}

export function safeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function normalizedBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Public web URL must use http or https');
  return `${url.origin}/`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

