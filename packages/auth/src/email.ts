import { Resend } from "resend"

function getResend() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required to send auth emails")
  }
  return new Resend(apiKey)
}

function getFromAddress() {
  const from = process.env.EMAIL_FROM
  if (!from) {
    throw new Error("EMAIL_FROM is required to send auth emails")
  }
  return from
}

type SendEmailInput = {
  to: string
  subject: string
  html: string
  text?: string
}

export function sendEmail({ to, subject, html, text }: SendEmailInput) {
  void getResend().emails.send({
    from: getFromAddress(),
    to,
    subject,
    html,
    text,
  })
}
