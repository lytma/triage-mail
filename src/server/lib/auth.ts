import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import bcrypt from "bcryptjs";
import { prisma } from "@/server/db/prisma";
import { env, features } from "./env";

/**
 * Auth.js (NextAuth v5) configuration.
 *
 * Session strategy: JWT (TECH_SPEC allows the JWT alternative to DB sessions).
 * Providers:
 *  - "password": email + password — the always-works primary login (works in
 *    preview with no external credentials).
 *  - "broker": lytma preview Google broker — the callback verifies the broker
 *    JWT then hands the verified identity here to mint an app session.
 *  - "demo": signs into a seeded demo UserAccount by token (PRD: demo is
 *    explorable without signup — the sanctioned exception to no-auto-login).
 *  - Google / MicrosoftEntraID: real OAuth when client creds are configured.
 */

function buildProviders() {
  const providers: NextAuthConfig["providers"] = [
    Credentials({
      id: "password",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        const email = String(creds?.email ?? "").toLowerCase().trim();
        const password = String(creds?.password ?? "");
        if (!email || !password) return null;
        const user = await prisma.userAccount.findUnique({ where: { email } });
        if (!user || !user.passwordHash) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.displayName,
          isDemo: user.isDemo,
          isAdmin: user.isAdmin,
          subscriptionStatus: user.subscriptionStatus,
        } as never;
      },
    }),
    Credentials({
      id: "broker",
      name: "Google (preview broker)",
      credentials: {
        sub: {}, email: {}, name: {}, verified: {},
      },
      async authorize(creds) {
        // The broker callback route has ALREADY verified the JWT before
        // redirecting here, so we only find-or-create the user.
        const email = String(creds?.email ?? "").toLowerCase().trim();
        const sub = String(creds?.sub ?? "");
        if (!email || !sub || creds?.verified !== "true") return null;
        const user = await findOrCreateOAuthUser({
          email,
          name: String(creds?.name ?? email),
          provider: "google",
          subject: sub,
        });
        return {
          id: user.id, email: user.email, name: user.displayName,
          isDemo: user.isDemo, isAdmin: user.isAdmin,
          subscriptionStatus: user.subscriptionStatus,
        } as never;
      },
    }),
    Credentials({
      id: "demo",
      name: "Demo account",
      credentials: { token: {} },
      async authorize(creds) {
        const token = String(creds?.token ?? "");
        if (!token) return null;
        const demo = await prisma.demoAccount.findUnique({ where: { demoToken: token } });
        if (!demo || !demo.isActive) return null;
        // The demo UserAccount is seeded with email demo+<token>@triagemail.app
        const user = await prisma.userAccount.findFirst({
          where: { isDemo: true, email: `demo@triagemail.app` },
        });
        if (!user) return null;
        return {
          id: user.id, email: user.email, name: user.displayName,
          isDemo: true, isAdmin: false,
          subscriptionStatus: user.subscriptionStatus,
        } as never;
      },
    }),
  ];

  if (features.googleDirect) {
    providers.push(
      Google({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }
  if (features.microsoft) {
    providers.push(
      MicrosoftEntraID({
        clientId: env.MICROSOFT_CLIENT_ID,
        clientSecret: env.MICROSOFT_CLIENT_SECRET,
        issuer: `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/v2.0`,
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }
  return providers;
}

export async function findOrCreateOAuthUser(input: {
  email: string;
  name: string;
  provider: "google" | "microsoft";
  subject: string;
}) {
  const existing = await prisma.userAccount.findUnique({ where: { email: input.email } });
  if (existing) return existing;
  const { seedCategoryFolders } = await import("@/server/services/category-folders");
  const user = await prisma.userAccount.create({
    data: {
      email: input.email,
      displayName: input.name,
      authProvider: input.provider,
      authProviderSubject: input.subject,
      subscriptionStatus: "trialing",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });
  await seedCategoryFolders(user.id);
  return user;
}

export const authConfig: NextAuthConfig = {
  trustHost: true,
  secret: env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  providers: buildProviders(),
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as {
          id: string; isDemo?: boolean; isAdmin?: boolean; subscriptionStatus?: string;
        };
        token.userAccountId = u.id;
        token.isDemo = Boolean(u.isDemo);
        token.isAdmin = Boolean(u.isAdmin);
        token.subscriptionStatus = u.subscriptionStatus ?? "trialing";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.userAccountId as string) ?? "";
        session.user.isDemo = Boolean(token.isDemo);
        session.user.isAdmin = Boolean(token.isAdmin);
        session.user.subscriptionStatus = (token.subscriptionStatus as string) ?? "trialing";
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
