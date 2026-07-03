import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/server/db/prisma";
import { env, features } from "@/server/lib/env";
import { getStripe } from "@/server/services/billing";
import { track } from "@/server/lib/analytics";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/stripe — verified Stripe events; mirror subscription
 * status + append ledger entries. In stub mode (no keys) accepts a plain JSON
 * test event without signature verification.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  let event: Stripe.Event;

  const client = getStripe();
  if (features.stripeLive && client && env.STRIPE_WEBHOOK_SECRET) {
    const sig = req.headers.get("stripe-signature") ?? "";
    try {
      event = client.webhooks.constructEvent(raw, sig, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return NextResponse.json({ error: `Invalid signature: ${(err as Error).message}` }, { status: 400 });
    }
  } else {
    // Stub mode: trust the payload (preview/test only).
    try {
      event = JSON.parse(raw) as Stripe.Event;
    } catch {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
  }

  try {
    await handleEvent(event);
  } catch (err) {
    console.error("[webhook:stripe]", err);
  }
  return NextResponse.json({ received: true });
}

async function handleEvent(event: Stripe.Event) {
  const statusMap: Record<string, string> = {
    trialing: "trialing",
    active: "active",
    past_due: "past_due",
    canceled: "canceled",
    unpaid: "past_due",
    incomplete: "past_due",
    incomplete_expired: "expired",
  };

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userAccountId = (sub.metadata?.userAccountId as string) ?? null;
      const user = userAccountId
        ? await prisma.userAccount.findUnique({ where: { id: userAccountId } })
        : await prisma.userAccount.findFirst({ where: { stripeCustomerId: String(sub.customer) } });
      if (!user) return;
      const status = statusMap[sub.status] ?? "active";
      const plan = sub.items.data[0]?.price?.recurring?.interval === "year" ? "yearly" : "monthly";
      const record = await prisma.subscription.upsert({
        where: { userAccountId: user.id },
        update: {
          stripeSubscriptionId: sub.id,
          status: status as never,
          plan: plan as never,
        },
        create: {
          userAccountId: user.id,
          stripeSubscriptionId: sub.id,
          status: status as never,
          plan: plan as never,
        },
      });
      await prisma.userAccount.update({
        where: { id: user.id },
        data: { subscriptionStatus: status as never, subscriptionPlan: plan as never },
      });
      if (event.type === "customer.subscription.created") {
        await track("subscription_started", { plan }, user.id);
        await prisma.subscriptionLedgerEntry.create({
          data: {
            subscriptionId: record.id,
            userAccountId: user.id,
            entryType: "trial_start",
            amountCents: 0,
            status: "succeeded",
            description: "Subscription started",
          },
        });
      }
      break;
    }
    case "invoice.paid":
    case "invoice.payment_succeeded": {
      const inv = event.data.object as Stripe.Invoice;
      await recordInvoiceLedger(inv, "charge", "succeeded");
      break;
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const user = await prisma.userAccount.findFirst({ where: { stripeCustomerId: String(inv.customer) } });
      if (user) {
        await prisma.userAccount.update({ where: { id: user.id }, data: { subscriptionStatus: "past_due" } });
        await prisma.subscription.updateMany({ where: { userAccountId: user.id }, data: { status: "past_due" } });
        await recordInvoiceLedger(inv, "charge", "failed");
      }
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const user = await prisma.userAccount.findFirst({ where: { stripeCustomerId: String(charge.customer) } });
      const sub = user ? await prisma.subscription.findUnique({ where: { userAccountId: user.id } }) : null;
      if (user && sub) {
        await prisma.subscriptionLedgerEntry.create({
          data: {
            subscriptionId: sub.id,
            userAccountId: user.id,
            stripeChargeId: charge.id,
            entryType: "refund",
            amountCents: -(charge.amount_refunded / 100),
            status: "refunded",
            description: "Refund",
          },
        });
      }
      break;
    }
  }
}

async function recordInvoiceLedger(
  inv: Stripe.Invoice,
  entryType: "charge",
  status: "succeeded" | "failed",
) {
  const user = await prisma.userAccount.findFirst({ where: { stripeCustomerId: String(inv.customer) } });
  if (!user) return;
  const sub = await prisma.subscription.findUnique({ where: { userAccountId: user.id } });
  if (!sub) return;
  await prisma.subscriptionLedgerEntry.create({
    data: {
      subscriptionId: sub.id,
      userAccountId: user.id,
      stripeInvoiceId: inv.id,
      entryType,
      amountCents: (inv.amount_paid ?? inv.amount_due ?? 0) / 100,
      status,
      description: status === "succeeded" ? "Invoice paid" : "Invoice payment failed",
    },
  });
}
