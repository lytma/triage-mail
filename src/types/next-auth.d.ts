import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isDemo: boolean;
      isAdmin: boolean;
      subscriptionStatus: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userAccountId?: string;
    isDemo?: boolean;
    isAdmin?: boolean;
    subscriptionStatus?: string;
  }
}
