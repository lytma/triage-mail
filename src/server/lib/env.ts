/**
 * Runtime environment access + feature flags.
 * Every external dependency is reached through env; side-effecting services
 * fall back to stub/console mode when their keys are absent so the preview
 * boots with no real credentials.
 */

export const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",

  AUTH_SECRET: process.env.AUTH_SECRET ?? "dev-insecure-secret-change-me",
  AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST ?? "true",
  APP_URL: process.env.APP_URL ?? process.env.AUTH_URL ?? process.env.PREVIEW_PUBLIC_URL ?? "",

  TOKEN_ENCRYPTION_KEY:
    process.env.TOKEN_ENCRYPTION_KEY ?? "0123456789abcdef0123456789abcdef",

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "",
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI ?? "",

  OAUTH_BROKER_URL: process.env.OAUTH_BROKER_URL ?? "",
  OAUTH_BROKER_SECRET: process.env.OAUTH_BROKER_SECRET ?? "",

  MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID ?? "",
  MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET ?? "",
  MICROSOFT_REDIRECT_URI: process.env.MICROSOFT_REDIRECT_URI ?? "",
  MICROSOFT_TENANT_ID: process.env.MICROSOFT_TENANT_ID ?? "common",

  GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? "",
  GMAIL_CLIENT_SECRET:
    process.env.GMAIL_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "",
  GMAIL_PUBSUB_TOPIC: process.env.GMAIL_PUBSUB_TOPIC ?? "",
  GMAIL_WEBHOOK_TOKEN: process.env.GMAIL_WEBHOOK_TOKEN ?? "",

  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
  OPENAI_MODEL: process.env.OPENAI_MODEL ?? "gpt-4o-mini",

  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  STRIPE_PRICE_MONTHLY: process.env.STRIPE_PRICE_MONTHLY ?? "",
  STRIPE_PRICE_YEARLY: process.env.STRIPE_PRICE_YEARLY ?? "",

  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY ?? "",
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY ?? "",
  VAPID_SUBJECT: process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",

  ANALYTICS_PROVIDER_URL: process.env.ANALYTICS_PROVIDER_URL ?? "",

  SEED_ON_BOOT: process.env.SEED_ON_BOOT === "true",
  FORCE_RESEED: process.env.FORCE_RESEED === "true",

  NODE_ENV: process.env.NODE_ENV ?? "development",
};

/** Pricing constants (PRD business rules). */
export const PRICING = {
  monthlyCents: 1200,
  yearlyCents: 10800,
  trialDays: 14,
};

/** Feature flags derived from which credentials are present. */
export const features = {
  /** True when OpenAI should be called for real; false => deterministic stub. */
  openaiLive: Boolean(env.OPENAI_API_KEY),
  /** True when Stripe should be called for real; false => stub checkout page. */
  stripeLive: Boolean(env.STRIPE_SECRET_KEY),
  /** Google login available directly (user's own client). */
  googleDirect: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  /** Google login available via lytma preview broker. */
  googleBroker: Boolean(!env.GOOGLE_CLIENT_ID && env.OAUTH_BROKER_URL && env.OAUTH_BROKER_SECRET),
  /** Microsoft login available. */
  microsoft: Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET),
  /** Whether the demo/seed UI (credential hints, demo links) should show. */
  showSeedUi: env.SEED_ON_BOOT,
};

export function googleLoginEnabled(): boolean {
  return features.googleDirect || features.googleBroker;
}
