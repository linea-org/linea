import { betterAuth } from "better-auth"
import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { organization } from "better-auth/plugins"
import { db, repositories, schema } from "@linea/db"
import { sendEmail } from "./email.js"
import {
  organizationInviteEmailHtml,
  resetPasswordEmailHtml,
  verificationEmailHtml,
} from "./emails/index.js"

const baseUrl = process.env.BETTER_AUTH_URL
const secret = process.env.BETTER_AUTH_SECRET
const appUrl = process.env.APP_URL ?? baseUrl
const trustedOrigins = (process.env.TRUSTED_ORIGINS ?? appUrl ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)

if (!baseUrl) {
  throw new Error("BETTER_AUTH_URL is required to initialize @linea/auth")
}

if (!secret) {
  throw new Error("BETTER_AUTH_SECRET is required to initialize @linea/auth")
}

function envCredential(idKey: string, secretKey: string) {
  const clientId = process.env[idKey]?.trim()
  const clientSecret = process.env[secretKey]?.trim()
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

const googleCredentials = envCredential(
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET"
)
const githubCredentials = envCredential(
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET"
)

export const enabledSocialProviders = [
  ...(googleCredentials ? (["google"] as const) : []),
  ...(githubCredentials ? (["github"] as const) : []),
]

export const auth = betterAuth({
  appName: "Linea",
  baseURL: baseUrl,
  secret,
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema,
  }),
  advanced: {
    database: {
      generateId: "uuid",
    },
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: {
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    },
    ipAddress: {
      ipAddressHeaders: ["x-real-ip", "x-forwarded-for"],
      ...(process.env.TRUSTED_PROXIES
        ? {
            trustedProxies: process.env.TRUSTED_PROXIES.split(",")
              .map((proxy) => proxy.trim())
              .filter(Boolean),
          }
        : {}),
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
  },
  socialProviders: {
    ...(googleCredentials
      ? {
          google: {
            ...googleCredentials,
            prompt: "select_account" as const,
          },
        }
      : {}),
    ...(githubCredentials ? { github: githubCredentials } : {}),
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your Linea password",
        html: resetPasswordEmailHtml({ name: user.name, url }),
        text: `Reset your password: ${url}`,
      })
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your Linea email",
        html: verificationEmailHtml({ name: user.name, url }),
        text: `Verify your email: ${url}`,
      })
    },
  },
  plugins: [
    organization({
      async sendInvitationEmail(data) {
        const inviteLink = `${appUrl}/accept-invitation/${data.id}`
        await sendEmail({
          to: data.email,
          subject: `Join ${data.organization.name} on Linea`,
          html: organizationInviteEmailHtml({
            inviterName: data.inviter.user.name,
            organizationName: data.organization.name,
            inviteUrl: inviteLink,
          }),
          text: `${data.inviter.user.name} invited you to join ${data.organization.name}. Accept: ${inviteLink}`,
        })
      },
      organizationHooks: {
        // Best-effort: a notification failure shouldn't undo an invitation that already landed — the membership itself was created moments earlier by this same request.
        async afterAcceptInvitation({ invitation, user, organization }) {
          try {
            await repositories.notification.createNotification(db, {
              userId: invitation.inviterId,
              workspaceId: organization.id,
              type: "workspace.invitation_accepted",
              severity: "success",
              title: `${user.name} joined ${organization.name}`,
              body: `${user.email} accepted your invitation to join ${organization.name}.`,
              metadata: {
                workspaceId: organization.id,
                invitationId: invitation.id,
              },
            })
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error)
            console.error(
              `Failed to create invitation-accepted notification for invitation ${invitation.id}: ${message}`
            )
          }
        },
      },
    }),
  ],
})

export type Auth = typeof auth
