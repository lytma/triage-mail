import Stripe from "stripe";
import { env, features, PRICING } from "@/server/lib/env";
import { prisma } from "@/server/db/prisma";

/**
 * Stripe billing — with a stub mode when STRIPE_SECRET_KEY is absent so the
 * preview boots and checkout "works" against an internal confirmation page.
 */

let stripe: Stripe | null = null;
export function getStripe(): Stripe | null {
  if (!features.stripeLive) return null;
  if (!stripe) stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2026-06-24.dahlia" });
  return stripe;
}

export function priceIdFor(plan: "monthly" | "yearly"): string {
  return plan === "monthly" ? env.STRIPE_PRICE_MONTHLY : env.STRIPE_PRICE_YEARLY;
}

export function amountCentsFor(plan: "monthly" | "yearly"): number {
  return plan === "monthly" ? PRICING.monthlyCents : PRICING.yearlyCents;
}

/**
 * Create a checkout session. In stub mode, activate the subscription locally
 * and return an internal confirmation URL.
 */
export async function createCheckout(
  userAccountId: string,
  plan: "monthly" | "yearly",
  origin: string,
): Promise<{ checkoutUrl: string }> {
  const user = await prisma.userAccount.findUnique({ where: { id: userAccountId } });
  if (!user) throw new Error("User not found");

  const client = getStripe();
  if (!client) {
    // Stub: locally mark the subscription active and jump to a confirmation page.
    await activateSubscriptionLocally(userAccountId, plan);
    return { checkoutUrl: `${origin}/settings?checkout=success&plan=${plan}&stub=1` };
  }

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await client.customers.create({ email: user.email, name: user.displayName });
    customerId = customer.id;
    await prisma.userAccount.update({ where: { id: userAccountId }, data: { stripeCustomerId: customerId } });
  }

  const session = await client.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceIdFor(plan), quantity: 1 }],
    success_url: `${origin}/settings?checkout=success`,
    cancel_url: `${origin}/settings?checkout=cancel`,
    subscription_data: { trial_period_days: PRICING.trialDays },
    metadata: { userAccountId, plan },
  });
  return { checkoutUrl: session.url ?? `${origin}/settings` };
}

/** Idempotently create/activate a local subscription + ledger entry (stub path). */
export async function activateSubscriptionLocally(
  userAccountId: string,
  plan: "monthly" | "yearly",
): Promise<void> {
  const now = new Date();
  const periodEnd = new Date(now.getTime() + (plan === "monthly" ? 30 : 365) * 24 * 3600 * 1000);
  const sub = await prisma.subscription.upsert({
    where: { userAccountId },
    update: { plan, status: "active", currentPeriodStart: now, currentPeriodEnd: periodEnd },
    create: {
      userAccountId,
      plan,
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
  });
  await prisma.userAccount.update({
    where: { id: userAccountId },
    data: { subscriptionStatus: "active", subscriptionPlan: plan },
  });
  await prisma.subscriptionLedgerEntry.create({
    data: {
      subscriptionId: sub.id,
      userAccountId,
      entryType: "charge",
      amountCents: amountCentsFor(plan),
      status: "succeeded",
      description: `Subscription (${plan}) — stub checkout`,
    },
  });
}

export async function cancelSubscription(userAccountId: string): Promise<void> {
  const sub = await prisma.subscription.findUnique({ where: { userAccountId } });
  const client = getStripe();
  if (client && sub?.stripeSubscriptionId) {
    await client.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
  }
  if (sub) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: "canceled", canceledAt: new Date() },
    });
    await prisma.subscriptionLedgerEntry.create({
      data: {
        subscriptionId: sub.id,
        userAccountId,
        entryType: "cancellation",
        amountCents: 0,
        status: "succeeded",
        description: "Subscription canceled at period end",
      },
    });
  }
  await prisma.userAccount.update({
    where: { id: userAccountId },
    data: { subscriptionStatus: "canceled" },
  });
}
