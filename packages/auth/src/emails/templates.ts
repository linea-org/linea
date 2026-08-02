import { escapeHtml, renderEmailLayout } from "./layout.js"
import type { EmailLogo } from "./logos.js"

type EmailTemplateOptions = {
  logo?: EmailLogo
  logoUrl?: string
}

export function verificationEmailHtml(
  input: {
    name?: string | null
    url: string
  } & EmailTemplateOptions
) {
  const greeting = input.name ? `Hi ${escapeHtml(input.name)},` : "Hi,"

  return renderEmailLayout({
    logo: input.logo ?? "linea",
    logoUrl: input.logoUrl,
    preview: "Confirm your email to finish setting up your Linea account.",
    title: "Verify your email",
    bodyHtml: `
      <p style="margin:0 0 14px;">${greeting}</p>
      <p style="margin:0 0 14px;">Confirm this email address to activate your Linea account and start building workflows.</p>
      <p style="margin:0;">This link expires soon. If you didn’t create an account, you can ignore this email.</p>
    `,
    ctaLabel: "Verify email",
    ctaUrl: input.url,
  })
}

export function resetPasswordEmailHtml(
  input: {
    name?: string | null
    url: string
  } & EmailTemplateOptions
) {
  const greeting = input.name ? `Hi ${escapeHtml(input.name)},` : "Hi,"

  return renderEmailLayout({
    logo: input.logo ?? "linea",
    logoUrl: input.logoUrl,
    preview: "Reset your Linea password.",
    title: "Reset your password",
    bodyHtml: `
      <p style="margin:0 0 14px;">${greeting}</p>
      <p style="margin:0 0 14px;">We received a request to reset the password for your Linea account.</p>
      <p style="margin:0;">If you didn’t ask for this, you can safely ignore this email. Your password won’t change.</p>
    `,
    ctaLabel: "Reset password",
    ctaUrl: input.url,
    footerNote:
      "For security, this reset link works only once and expires after a short time.",
  })
}

export function organizationInviteEmailHtml(
  input: {
    inviterName: string
    organizationName: string
    inviteUrl: string
  } & EmailTemplateOptions
) {
  return renderEmailLayout({
    logo: input.logo ?? "linea",
    logoUrl: input.logoUrl,
    preview: `${input.inviterName} invited you to join ${input.organizationName} on Linea.`,
    title: "You’re invited",
    bodyHtml: `
      <p style="margin:0 0 14px;">Hi,</p>
      <p style="margin:0 0 14px;"><strong>${escapeHtml(input.inviterName)}</strong> invited you to join <strong>${escapeHtml(input.organizationName)}</strong> on Linea.</p>
      <p style="margin:0;">Accept the invitation to collaborate on workflows in that workspace.</p>
    `,
    ctaLabel: "Accept invitation",
    ctaUrl: input.inviteUrl,
  })
}
