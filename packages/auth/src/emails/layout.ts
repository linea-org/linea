import { resolveEmailLogoUrl, type EmailLogo } from "./logos.js"

type EmailLayoutInput = {
  preview: string
  title: string
  bodyHtml: string
  ctaLabel?: string
  ctaUrl?: string
  footerNote?: string
  logo?: EmailLogo
  logoUrl?: string
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

export function renderEmailLayout({
  preview,
  title,
  bodyHtml,
  ctaLabel,
  ctaUrl,
  footerNote,
  logo = "linea",
  logoUrl: logoUrlOverride,
}: EmailLayoutInput) {
  const brandName = process.env.EMAIL_BRAND_NAME ?? "Linea"
  const supportEmail = process.env.EMAIL_SUPPORT_EMAIL
  const logoUrl = resolveEmailLogoUrl(logo, logoUrlOverride)

  const logoBlock = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" width="40" height="40" alt="${escapeHtml(brandName)}" style="display:block;border:0;outline:none;text-decoration:none;height:40px;width:40px;" />`
    : `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:22px;line-height:1;letter-spacing:-0.02em;color:#0a0a0a;font-weight:700;">${escapeHtml(brandName)}</div>`

  const ctaBlock =
    ctaLabel && ctaUrl
      ? `<tr>
          <td style="padding:28px 0 8px;">
            <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#0a0a0a;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:600;line-height:1;text-decoration:none;padding:14px 22px;border-radius:8px;">
              ${escapeHtml(ctaLabel)}
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;line-height:1.5;color:#6b7280;word-break:break-all;">
            If the button doesn’t work, paste this link into your browser:<br />
            <a href="${escapeHtml(ctaUrl)}" style="color:#0a0a0a;">${escapeHtml(ctaUrl)}</a>
          </td>
        </tr>`
      : ""

  const footer = footerNote
    ? escapeHtml(footerNote)
    : `You’re receiving this because of activity on your ${escapeHtml(brandName)} account.${
        supportEmail
          ? ` Questions? Contact <a href="mailto:${escapeHtml(supportEmail)}" style="color:#0a0a0a;">${escapeHtml(supportEmail)}</a>.`
          : ""
      }`

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      ${escapeHtml(preview)}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f4f6;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 12px;border-bottom:1px solid #f3f4f6;">
                ${logoBlock}
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 36px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:24px;line-height:1.3;color:#0a0a0a;font-weight:650;padding-bottom:14px;">
                      ${escapeHtml(title)}
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.65;color:#374151;">
                      ${bodyHtml}
                    </td>
                  </tr>
                  ${ctaBlock}
                </table>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">
            <tr>
              <td style="padding:18px 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;line-height:1.5;color:#9ca3af;text-align:center;">
                ${footer}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export { escapeHtml }
