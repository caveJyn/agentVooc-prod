import express from "express";
import { Router } from 'express';
import bodyParser from "body-parser";
import cors from "cors";
import path from "path";
import fs from "fs";

import {
    type AgentRuntime,
    elizaLogger,
    getEnvVariable,
    type UUID,
    validateCharacterConfig,
    ServiceType,
    type Character,
    stringToUuid,
    ensureKeys,
    type Plugin,
      type RAGKnowledgeItem,
      embed,
      type Secret
} from "@elizaos/core";

// import type { TeeLogQuery, TeeLogService } from "@elizaos/plugin-tee-log";
// import { REST, Routes } from "discord.js";
import type { DirectClient } from ".";
import { validateUuid } from "@elizaos/core";
import SuperTokens from "supertokens-node";
import { middleware, errorHandler } from "supertokens-node/framework/express";
import { backendConfig } from "./config/backendConfig";
import { sanityClient, urlFor } from "@elizaos-plugins/plugin-sanity";
import Session from "supertokens-node/recipe/session";
import Stripe from "stripe";
// import fetch from "node-fetch"; // Add this import for microservice requests
import rateLimit from "express-rate-limit";
import { v4 as uuidv4 } from "uuid";
import type { EmailClient } from "@elizaos-plugins/plugin-email";
import { computeHash,encryptValue } from './utils/cryptoUtils';
import { randomUUID } from 'crypto';
import { clearConnectionCache } from "@elizaos-plugins/plugin-shared-email-sanity";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "your-secret-key", {
  apiVersion: "2025-06-30.basil",
});


// Define the Item interface
interface Item {
    id: string;
    name: string;
    description: string;
    price: number; // Price in cents (e.g., 1000 = $10.00)
    itemType?: string; // Optional, set for Sanity items, undefined for others
    pluginName?: string; // Added for plugin items
  stripePriceId?: string; // Added for base items
    source?: string; // Optional: Indicates where the item came from
    features?: string[]; // Optional: List of features for the item
    isPopular?: boolean; // Optional: Indicates if the item is popular
    trialInfo?: string; // Optional: Information about trial details
    useCase?: string; // Optional: Describes the use case for the item
}


interface UUIDParams {
    agentId: UUID;
    roomId?: UUID;
}

function validateUUIDParams(
    params: { agentId: string; roomId?: string },
    res: express.Response
): UUIDParams | null {
    const agentId = validateUuid(params.agentId);
    if (!agentId) {
        res.status(400).json({
            error: "Invalid AgentId format. Expected to be a UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        });
        return null;
    }

    if (params.roomId) {
        const roomId = validateUuid(params.roomId);
        if (!roomId) {
            res.status(400).json({
                error: "Invalid RoomId format. Expected to be a UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
            });
            return null;
        }
        return { agentId, roomId };
    }

    return { agentId };
}


// Rate limiter for /checkout-session
const checkoutLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit to 10 requests per window
  });

  
export function createApiRouter(
    agents: Map<string, IAgentRuntime>,
    directClient: DirectClient
):Router {
    const router = express.Router();


     // Add SuperTokens middleware for authentication routes
    // Debug middleware to log requests
    router.use((req, res, next) => {
        elizaLogger.debug(`[CLIENT-DIRECT] Request received: ${req.method} ${req.originalUrl}`);
        next();
    });
    router.get("/", (req, res) => {
        res.send("Welcome, this is the REST API!");
    });
    

    router.get("/hello", (req, res) => {
        res.json({ message: "Hello World!" });
    });
// ... inside createApiRouter
router.post("/crypto-auth", async (req, res) => {
    try {
      const { walletAddress } = req.body;
      const userId = walletAddress; // Use wallet address as userId
      elizaLogger.debug(`[CLIENT-DIRECT] Crypto auth attempt for wallet: ${walletAddress}`);
  
      // Create session with userType in accessTokenPayload
      await Session.createNewSession(req, res, userId, { userType: "crypto" });
  
      const existingUser = await sanityClient.fetch(
        `*[_type == "User" && userId == $userId][0]`,
        { userId }
      );
      if (!existingUser) {
        const User = await sanityClient.create({
          _type: "User",
          name: "Crypto User",
          email: `${walletAddress}@crypto.example.com`,
          interest: "agentVooc",
          referralSource: "phantom-wallet",
          userId,
          createdAt: new Date().toISOString(),
          userType: "crypto",
        });
        elizaLogger.debug(`[CLIENT-DIRECT] Created crypto User: userId=${userId}, _id=${User._id}`);
      }
      res.status(501).json({ message: "Crypto authentication not yet implemented" });
    } catch (error: any) {
      elizaLogger.error("[CLIENT-DIRECT] Error in crypto auth:", error);
      res.status(500).json({ error: "Failed to process crypto auth", details: error.message });
    }
  });

  // Helper function to map price IDs to plugin names
async function getPluginNameFromPriceId(priceId: string): Promise<string | null> {
  try {
    const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
    const product = typeof price.product === 'object' && price.product !== null ? price.product : await stripe.products.retrieve(price.product as string);
    // Only access metadata if product is not a DeletedProduct
    if ('metadata' in product && product.metadata) {
      return product.metadata.pluginName || null;
    }
    return null;
  } catch (error) {
    elizaLogger.warn(`[CLIENT-DIRECT] Failed to fetch pluginName for priceId=${priceId}`, { error: error.message });
    return null;
  }
}


  // Webhook handler
   // Webhook handler with raw body parser
// WEBHOOK HANDLER - IMPROVED
router.post(  "/webhook",
  bodyParser.raw({ type: "application/json" }),
  async (req, res) => {
    elizaLogger.debug("[CLIENT-DIRECT] [WEBHOOK] Received webhook request", {
      headers: req.headers,
      bodyLength: req.body?.length,
      isBuffer: Buffer.isBuffer(req.body),
      bodyType: typeof req.body,
    });

    const sig = req.headers["stripe-signature"];
    let event;

    try {
      if (!process.env.STRIPE_WEBHOOK_SECRET) {
        elizaLogger.error("[CLIENT-DIRECT] [WEBHOOK] STRIPE_WEBHOOK_SECRET is not set");
        return res.status(500).json({ error: "Server configuration error: Missing webhook secret" });
      }

      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
      elizaLogger.debug("[CLIENT-DIRECT] [WEBHOOK] Webhook event constructed", { type: event.type, id: event.id });
    } catch (err) {
      elizaLogger.error("[CLIENT-DIRECT] [WEBHOOK] Webhook signature verification failed", {
        message: err.message,
        signature: sig,
      });
      return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
    }

    try {
      switch (event.type) {
  case "customer.subscription.created":
  case "customer.subscription.updated":
    await handleSubscriptionUpdate(event);
    break;
  case "customer.subscription.deleted":
    await handleSubscriptionDelete(event);
    break;
  case "checkout.session.completed":
    await handleCheckoutCompleted(event);
    break;
  case "invoice.created":
    await handleInvoiceCreated(event);
    break;
  case "invoice.paid":
    await handleInvoicePaid(event);
    break;
  case "invoice.payment_failed":
    await handleInvoicePaymentFailed(event);
    break;
  default:
    elizaLogger.debug("[CLIENT-DIRECT] Unhandled event type", { type: event.type });
}
      res.json({ received: true });
    } catch (err) {
      elizaLogger.error("[CLIENT-DIRECT] [WEBHOOK] Error processing webhook event", {
        eventType: event?.type,
        message: err.message,
        stack: err.stack,
      });
      await sanityClient.create({
        _type: "WebhookError",
        eventType: event?.type,
        errorMessage: err.message,
        timestamp: new Date().toISOString(),
      });
      return res.status(500).json({ error: `Failed to process webhook: ${err.message}` });
    }
  }
);


async function handleInvoiceCreated(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  elizaLogger.debug("[CLIENT-DIRECT] [WEBHOOK] Processing invoice.created event", {
    eventType: event.type,
    invoiceId: invoice.id,
    customerId: invoice.customer,
  });

  // Retrieve the invoice with expanded price and product data
  const expandedInvoice = await stripe.invoices.retrieve(invoice.id, {
    expand: ['lines.data.price', 'lines.data.price.product'],
  });

  const customer = invoice.customer
    ? await stripe.customers.retrieve(invoice.customer as string)
    : null;

  // Type guard to check if customer is not a DeletedCustomer
  if (!customer || 'deleted' in customer) {
    elizaLogger.warn("[CLIENT-DIRECT] No valid customer found for invoice", {
      eventType: event.type,
      invoiceId: invoice.id,
      customerId: invoice.customer,
    });
    throw new Error("[CLIENT-DIRECT] No valid customer found for invoice");
  }

  const userId = customer.metadata?.userId || null;
  if (!userId) {
    elizaLogger.warn("[CLIENT-DIRECT] No userId in invoice customer metadata", {
      eventType: event.type,
      invoiceId: invoice.id,
      customerId: invoice.customer,
    });
    throw new Error("[CLIENT-DIRECT] No userId in invoice customer metadata");
  }

  const user = await sanityClient.fetch(
    `*[_type == "User" && userId == $userId][0]`,
    { userId }
  );

  if (!user) {
    elizaLogger.warn("[CLIENT-DIRECT] User not found for userId", {
      userId,
      invoiceId: invoice.id,
    });
    throw new Error(`[CLIENT-DIRECT] User not found for userId: ${userId}`);
  }

  // Log user subscription details for reference
  elizaLogger.debug("[CLIENT-DIRECT] Fetched user for invoice", {
    userId,
    stripeSubscriptionId: user.stripeSubscriptionId,
    subscriptionStatus: user.subscriptionStatus,
  });

  // Map line items for Sanity
  const lineItems = expandedInvoice.lines.data.map((line: Stripe.InvoiceLineItem) => {
    const price = line.price as Stripe.Price | null;
    let productName = 'Unknown Product';

    if (price?.product && typeof price.product !== 'string') {
      productName = (price.product as Stripe.Product).name || line.description || 'Unknown Product';
    } else if (line.description) {
      // Fallback to description for trial periods or when product is not available
      productName = line.description.replace(/^Trial period for /i, '');
    }

    return {
      _key: randomUUID(), // Generate unique key for Sanity
      description: line.description || 'No description',
      amount: line.amount / 100,
      currency: line.currency,
      quantity: line.quantity || 1,
      period: {
        start: line.period?.start ? new Date(line.period.start * 1000).toISOString() : null,
        end: line.period?.end ? new Date(line.period.end * 1000).toISOString() : null,
      },
      productName,
    };
  });

  // Store invoice in Sanity with line items
  const invoiceData = {
    _type: "invoice",
    user: { _type: "reference", _ref: user._id },
    stripeInvoiceId: invoice.id,
    status: invoice.status || "draft",
    amountDue: invoice.amount_due / 100,
    amountPaid: invoice.amount_paid / 100,
    currency: invoice.currency,
    createdAt: new Date(invoice.created * 1000).toISOString(),
    dueDate: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
    invoiceUrl: invoice.hosted_invoice_url || null,
    invoicePdf: invoice.invoice_pdf || null,
    periodStart: invoice.lines.data[0]?.period?.start
      ? new Date(invoice.lines.data[0].period.start * 1000).toISOString()
      : null,
    periodEnd: invoice.lines.data[0]?.period?.end
      ? new Date(invoice.lines.data[0].period.end * 1000).toISOString()
      : null,
    lineItems,
  };

  elizaLogger.debug("[CLIENT-DIRECT] Prepared invoice data for Sanity", {
    invoiceId: invoice.id,
    userId,
    lineItemsCount: lineItems.length,
  });

  const existingInvoice = await sanityClient.fetch(
    `*[_type == "invoice" && stripeInvoiceId == $stripeInvoiceId][0]`,
    { stripeInvoiceId: invoice.id }
  );

  if (!existingInvoice) {
    const createdInvoice = await sanityClient.create(invoiceData);
    elizaLogger.debug("[CLIENT-DIRECT] Created invoice in Sanity", {
      userId,
      invoiceId: invoice.id,
      sanityInvoiceId: createdInvoice._id,
      lineItemsCount: lineItems.length,
    });
  } else {
    const updatedInvoice = await sanityClient
      .patch(existingInvoice._id)
      .set({
        status: invoice.status,
        amountDue: invoice.amount_due / 100,
        amountPaid: invoice.amount_paid / 100,
        invoiceUrl: invoice.hosted_invoice_url || null,
        invoicePdf: invoice.invoice_pdf || null,
        lineItems,
      })
      .commit();
    elizaLogger.debug("[CLIENT-DIRECT] Updated invoice in Sanity", {
      userId,
      invoiceId: invoice.id,
      sanityInvoiceId: existingInvoice._id,
      lineItemsCount: lineItems.length,
    });
  }
}

async function handleInvoicePaid(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const customer = invoice.customer
    ? await stripe.customers.retrieve(invoice.customer as string)
    : null;

  // Type guard to check if customer is not a DeletedCustomer
  if (!customer || 'deleted' in customer) {
    elizaLogger.warn("[CLIENT-DIRECT] No valid customer found for invoice", {
      eventType: event.type,
      invoiceId: invoice.id,
    });
    throw new Error("[CLIENT-DIRECT] No valid customer found for invoice");
  }

  const userId = customer.metadata?.userId || null;

  if (!userId) {
    elizaLogger.warn("[CLIENT-DIRECT] No userId in invoice customer metadata", {
      eventType: event.type,
      invoiceId: invoice.id,
    });
    throw new Error("[CLIENT-DIRECT] No userId in invoice customer metadata");
  }

  // Retrieve the invoice with expanded price and product data
  const expandedInvoice = await stripe.invoices.retrieve(invoice.id, {
    expand: ['lines.data.price', 'lines.data.price.product'],
  });

  const existingInvoice = await sanityClient.fetch(
    `*[_type == "invoice" && stripeInvoiceId == $stripeInvoiceId][0]`,
    { stripeInvoiceId: invoice.id }
  );

  if (existingInvoice) {
    const lineItems = expandedInvoice.lines.data.map((line: Stripe.InvoiceLineItem) => {
      const price = line.price as Stripe.Price | null;
      let productName = 'Unknown Product';

      if (price?.product && typeof price.product !== 'string') {
        productName = (price.product as Stripe.Product).name || line.description || 'Unknown Product';
      } else if (line.description) {
        productName = line.description.replace(/^Trial period for /i, '');
      }

      return {
        _key: randomUUID(),
        description: line.description || 'No description',
        amount: line.amount / 100,
        currency: line.currency,
        quantity: line.quantity || 1,
        period: {
          start: line.period?.start ? new Date(line.period.start * 1000).toISOString() : null,
          end: line.period?.end ? new Date(line.period.end * 1000).toISOString() : null,
        },
        productName,
      };
    });

    await sanityClient
      .patch(existingInvoice._id)
      .set({
        status: invoice.status,
        amountPaid: invoice.amount_paid / 100,
        invoiceUrl: invoice.hosted_invoice_url || null,
        invoicePdf: invoice.invoice_pdf || null,
        lineItems,
      })
      .commit();
    elizaLogger.debug("[CLIENT-DIRECT] Updated invoice status to paid", {
      userId,
      invoiceId: invoice.id,
      lineItemsCount: lineItems.length,
    });
  }
}

async function handleInvoicePaymentFailed(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const customer = invoice.customer
    ? await stripe.customers.retrieve(invoice.customer as string)
    : null;

  if (!customer || 'deleted' in customer) {
    elizaLogger.warn("[CLIENT-DIRECT] No valid customer found for invoice", {
      eventType: event.type,
      invoiceId: invoice.id,
    });
    throw new Error("[CLIENT-DIRECT] No valid customer found for invoice");
  }

  const userId = customer.metadata?.userId || null;


  if (!userId) {
    elizaLogger.warn("[CLIENT-DIRECT] No userId in invoice customer metadata", {
      eventType: event.type,
      invoiceId: invoice.id,
    });
    throw new Error("[CLIENT-DIRECT] No userId in invoice customer metadata");
  }

  const existingInvoice = await sanityClient.fetch(
    `*[_type == "invoice" && stripeInvoiceId == $stripeInvoiceId][0]`,
    { stripeInvoiceId: invoice.id }
  );

  if (existingInvoice) {
    await sanityClient
      .patch(existingInvoice._id)
      .set({
        status: invoice.status,
        invoiceUrl: invoice.hosted_invoice_url || null,
        invoicePdf: invoice.invoice_pdf || null,
      })
      .commit();
    elizaLogger.debug("[CLIENT-DIRECT] Updated invoice status to payment_failed", {
      userId,
      invoiceId: invoice.id,
    });

    // Optionally notify user or trigger retry logic
    // Example: Send email or update user status
  }
}

// In packages/client-direct/src/api.ts
router.get("/invoices", async (req, res) => {
  try {
    const session = await Session.getSession(req, res, { sessionRequired: true });
    const userId = session.getUserId();

    const user = await sanityClient.fetch(
      `*[_type == "User" && userId == $userId][0]{_id, stripeSubscriptionId}`,
      { userId }
    );

    if (!user) {
      elizaLogger.warn(`[CLIENT-DIRECT] User not found for userId=${userId}`);
      return res.status(404).json({ error: "User not found" });
    }

    const invoices = await sanityClient.fetch(
      `*[_type == "invoice" && user._ref == $userId] | order(createdAt desc) {
        _id,
        stripeInvoiceId,
        status,
        amountDue,
        amountPaid,
        currency,
        createdAt,
        dueDate,
        invoiceUrl,
        invoicePdf,
        periodStart,
        periodEnd,
        lineItems[] {
          description,
          amount,
          currency,
          quantity,
          period { start, end },
          productName
        }
      }`,
      { userId: user._id }
    );

    elizaLogger.debug("[CLIENT-DIRECT] Fetched invoices for user", {
      userId,
      userSubscriptionId: user.stripeSubscriptionId,
      invoiceCount: invoices.length,
      invoices: invoices.map((inv: any) => ({
        invoiceId: inv.stripeInvoiceId,
        status: inv.status,
        lineItemsCount: inv.lineItems?.length || 0,
      })),
    });

    res.json({ invoices, subscriptionId: user.stripeSubscriptionId || null });
  } catch (error: any) {
    elizaLogger.error("[CLIENT-DIRECT] Error in /invoices endpoint:", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: "Failed to fetch invoices", details: error.message });
  }
});


// packages/client-direct/src/api.ts
router.get("/invoice", async (req, res) => {
  try {
    const session = await Session.getSession(req, res, { sessionRequired: true });
    const userId = session.getUserId();
    const sessionId = req.query.sessionId as string;

    if (!sessionId) {
      elizaLogger.warn("[CLIENT-DIRECT] Missing sessionId in /invoice request");
      return res.status(400).json({ error: "Missing session ID" });
    }

    // Fetch the Checkout session from Stripe
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription.latest_invoice'],
    });

    if (!checkoutSession.customer || checkoutSession.metadata?.userId !== userId) {
      elizaLogger.warn("[CLIENT-DIRECT] Invalid session or user mismatch", {
        userId,
        sessionId,
      });
      return res.status(403).json({ error: "Invalid session or user mismatch" });
    }

    let invoice: Stripe.Invoice | null = null;
    if (checkoutSession.subscription && typeof checkoutSession.subscription !== 'string') {
      invoice = checkoutSession.subscription.latest_invoice as Stripe.Invoice | null;
    }

    if (!invoice) {
      elizaLogger.warn("[CLIENT-DIRECT] No invoice found for session", { sessionId });
      return res.status(404).json({ error: "No invoice found for this session" });
    }

    // Fetch invoice with expanded line items
    const expandedInvoice = await stripe.invoices.retrieve(invoice.id, {
      expand: ['lines.data.price', 'lines.data.price.product'],
    });

    // Map line items for response
    const lineItems = expandedInvoice.lines.data.map((line: Stripe.InvoiceLineItem) => {
      const price = line.price as Stripe.Price | null;
      let productName = 'Unknown Product';
      if (price?.product && typeof price.product !== 'string') {
        productName = (price.product as Stripe.Product).name || line.description || 'Unknown Product';
      } else if (line.description) {
        productName = line.description.replace(/^Trial period for /i, '');
      }

      return {
        _key: randomUUID(),
        description: line.description || 'No description',
        amount: line.amount / 100,
        currency: line.currency,
        quantity: line.quantity || 1,
        period: {
          start: line.period?.start ? new Date(line.period.start * 1000).toISOString() : null,
          end: line.period?.end ? new Date(line.period.end * 1000).toISOString() : null,
        },
        productName,
      };
    });

    const invoiceData = {
      _id: `invoice_${invoice.id}`, // Temporary ID for frontend
      stripeInvoiceId: invoice.id,
      status: invoice.status || "draft",
      amountDue: invoice.amount_due / 100,
      amountPaid: invoice.amount_paid / 100,
      currency: invoice.currency,
      createdAt: new Date(invoice.created * 1000).toISOString(),
      dueDate: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
      invoiceUrl: invoice.hosted_invoice_url || null,
      invoicePdf: invoice.invoice_pdf || null,
      periodStart: invoice.lines.data[0]?.period?.start
        ? new Date(invoice.lines.data[0].period.start * 1000).toISOString()
        : null,
      periodEnd: invoice.lines.data[0]?.period?.end
        ? new Date(invoice.lines.data[0].period.end * 1000).toISOString()
        : null,
      lineItems,
    };

    elizaLogger.debug("[CLIENT-DIRECT] Fetched invoice for session", {
      userId,
      sessionId,
      invoiceId: invoice.id,
      lineItemsCount: lineItems.length,
    });

    res.json({ invoice: invoiceData });
  } catch (error: any) {
    elizaLogger.error("[CLIENT-DIRECT] Error in /invoice endpoint:", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: "Failed to fetch invoice", details: error.message });
  }
});


// Helper functions for webhook handlers
// Add this near the top of packages/client-direct/src/api.ts
async function getUserSubscriptionLimits(userId: string): Promise<{
  maxAgents: number;
  maxKnowledgeDocsPerAgent: number;
  maxTotalCharsPerAgent: number;
  maxCharsPerKnowledgeDoc?: number;
}> {
  const user = await sanityClient.fetch(
    `*[_type == "User" && userId == $userId][0]{activePriceIds, subscriptionStatus}`,
    { userId }
  );

  if (user.subscriptionStatus !== "active" && user.subscriptionStatus !== "trialing") {
    throw new Error("No active subscription");
  }
  if (!user.activePriceIds || user.activePriceIds.length === 0) {
    throw new Error("No active subscription plan");
  }

  // Find base subscription price ID
  const basePriceId = await (async () => {
    for (const id of user.activePriceIds) {
      const item = await sanityClient.fetch(
        `*[_type == "Item" && stripePriceId == $id && itemType == "base"][0]`,
        { id }
      );
      if (item) return id;
    }
    return null;
  })();

  if (!basePriceId) {
    throw new Error("No active base subscription");
  }

  const subscriptionItem = await sanityClient.fetch(
    `*[_type == "Item" && stripePriceId == $priceId][0]{
      maxAgents,
      maxKnowledgeDocsPerAgent,
      maxTotalCharsPerAgent,
      maxCharsPerKnowledgeDoc
    }`,
    { priceId: basePriceId }
  );

  if (!subscriptionItem) {
    throw new Error("Subscription plan not found");
  }

  return {
    maxAgents: subscriptionItem.maxAgents || 0,
    maxKnowledgeDocsPerAgent: subscriptionItem.maxKnowledgeDocsPerAgent || 0,
    maxTotalCharsPerAgent: subscriptionItem.maxTotalCharsPerAgent || 0,
    maxCharsPerKnowledgeDoc: subscriptionItem.maxCharsPerKnowledgeDoc || undefined,
  };
}





async function handleSubscriptionDelete(event) {
  const subscription = event.data.object;
  const userId = subscription.metadata?.userId;
  const status = subscription.status;

  if (!userId) {
    elizaLogger.warn("[CLIENT-DIRECT] No userId in subscription metadata", {
      eventType: event.type,
      subscriptionId: subscription.id,
    });
    throw new Error("[CLIENT-DIRECT] No userId in subscription metadata");
  }

  const user = await sanityClient.fetch(
    `*[_type == "User" && userId == $userId][0]`,
    { userId }
  );

  if (!user) {
    elizaLogger.warn("[CLIENT-DIRECT] User not found for userId", { userId });
    throw new Error(`[CLIENT-DIRECT] User not found for userId: ${userId}`);
  }

  await sanityClient
    .patch(user._id)
    .set({
      subscriptionStatus: status,
      stripeSubscriptionId: null,
      trialStartDate: undefined,
      trialEndDate: undefined,
      cancelAtPeriodEnd: false,
      activePriceIds: [],
      activePlugins: [], // Clear activePlugins
    })
    .commit();
  
  elizaLogger.debug("[CLIENT-DIRECT] Cleared subscription data", {
    userId,
    status,
    subscriptionId: subscription.id,
    activePriceIds: [],
    activePlugins: [],
  });
}




async function handleCheckoutCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  const userId = session.metadata?.userId;
  
  if (!userId) {
    elizaLogger.warn("[CLIENT-DIRECT] No userId in session metadata", {
      eventType: event.type,
      sessionId: session.id,
    });
    throw new Error("[CLIENT-DIRECT] No userId in session metadata");
  }

  const user = await sanityClient.fetch(
    `*[_type == "User" && userId == $userId][0]`,
    { userId }
  );
  
  if (!user) {
    elizaLogger.warn("[CLIENT-DIRECT] User not found for userId", { userId });
    throw new Error(`[CLIENT-DIRECT] User not found for userId: ${userId}`);
  }

  const subscriptionId = session.subscription as string;
  
  if (!subscriptionId) {
    elizaLogger.warn("[CLIENT-DIRECT] No subscription in session", { sessionId: session.id });
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price'],
  });

  const activePriceIds = (subscription as any).items.data.map((item: any) => item.price.id);

  // Fetch plugin items from Sanity to determine active plugins
  const pluginItems = await sanityClient.fetch(
    `*[_type == "Item" && itemType == "plugin" && stripePriceId in $activePriceIds]{pluginName}`,
    { activePriceIds }
  );
  const activePlugins = pluginItems.map(item => item.pluginName);

  // Calculate current period dates with fallbacks
  const currentPeriodStart = (subscription as any).current_period_start
    ? new Date((subscription as any).current_period_start * 1000).toISOString()
    : user.currentPeriodStart || new Date().toISOString();
    
  const currentPeriodEnd = (subscription as any).current_period_end
    ? new Date((subscription as any).current_period_end * 1000).toISOString()
    : user.currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // Calculate trial dates with fallbacks to preserve existing data
  const trialStartDate = (subscription as any).trial_start
    ? new Date((subscription as any).trial_start * 1000).toISOString()
    : user.trialStartDate;
    
  const trialEndDate = (subscription as any).trial_end
    ? new Date((subscription as any).trial_end * 1000).toISOString()
    : user.trialEndDate;

  await sanityClient
    .patch(user._id)
    .set({
      subscriptionStatus: (subscription as any).status,
      stripeSubscriptionId: subscriptionId,
      trialStartDate,
      trialEndDate,
      cancelAtPeriodEnd: (subscription as any).cancel_at_period_end,
      activePriceIds,
      activePlugins, // New: store active plugins based on subscribed price IDs
      hasUsedTrial: (subscription as any).trial_start ? true : user.hasUsedTrial || false,
      currentPeriodStart,
      currentPeriodEnd,
      responseCount: 0, // Reset counters on subscription update
      tokenCount: 0,
    })
    .commit();

  elizaLogger.debug("[CLIENT-DIRECT] Updated subscription from checkout", {
    userId,
    subscriptionId,
    activePriceIds,
    activePlugins,
    subscriptionStatus: (subscription as any).status,
    trialStartDate,
    trialEndDate,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd: (subscription as any).cancel_at_period_end,
  });
}




async function handleSubscriptionUpdate(event: Stripe.Event) {
  const subscription = event.data.object as any;
  const userId = subscription.metadata?.userId;
  const status = subscription.status;
  
  if (!userId) {
    elizaLogger.warn("[CLIENT-DIRECT] No userId in subscription metadata", {
      eventType: event.type,
      subscriptionId: subscription.id,
    });
    throw new Error("[CLIENT-DIRECT] No userId in subscription metadata");
  }

  const user = await sanityClient.fetch(
    `*[_type == "User" && userId == $userId][0]`,
    { userId }
  );
  
  if (!user) {
    elizaLogger.warn("[CLIENT-DIRECT] User not found for userId", { userId });
    throw new Error(`[CLIENT-DIRECT] User not found for userId: ${userId}`);
  }

  // Fetch subscription items to get price IDs (keeping original approach for reliability)
  const subscriptionItems = await stripe.subscriptions.retrieve(subscription.id, {
    expand: ['items.data.price'],
  });
  
  const activePriceIds = (subscriptionItems as any).items.data.map((item: any) => item.price.id);

  // Fetch plugin items from Sanity to determine active plugins
  const pluginItems = await sanityClient.fetch(
    `*[_type == "Item" && itemType == "plugin" && stripePriceId in $activePriceIds]{pluginName}`,
    { activePriceIds }
  );
  const activePlugins = pluginItems.map(item => item.pluginName);

  // Calculate current period dates with fallbacks
  const currentPeriodStart = subscription.current_period_start
    ? new Date(subscription.current_period_start * 1000).toISOString()
    : user.currentPeriodStart || new Date().toISOString();
    
  const currentPeriodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : user.currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // Check if usage should be reset (new billing period)
  const resetUsage = user.currentPeriodStart !== currentPeriodStart;

  // Calculate trial dates with fallbacks to preserve existing data
  const trialStartDate = subscription.trial_start
    ? new Date(subscription.trial_start * 1000).toISOString()
    : user.trialStartDate;
    
  const trialEndDate = subscription.trial_end
    ? new Date(subscription.trial_end * 1000).toISOString()
    : user.trialEndDate;

  await sanityClient
    .patch(user._id)
    .set({
      subscriptionStatus: status,
      stripeSubscriptionId: subscription.id,
      trialStartDate,
      trialEndDate,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      activePriceIds,
      activePlugins, // New: store active plugins based on subscribed price IDs
      hasUsedTrial: subscription.trial_start ? true : user.hasUsedTrial || false,
      currentPeriodStart,
      currentPeriodEnd,
      // Reset usage counters only if it's a new billing period
      ...(resetUsage ? { responseCount: 0, tokenCount: 0 } : {}),
    })
    .commit();

  elizaLogger.debug("[CLIENT-DIRECT] Updated subscription status", {
    userId,
    status,
    subscriptionId: subscription.id,
    activePriceIds,
    activePlugins,
    trialStartDate,
    trialEndDate,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    resetUsage,
  });
}




// CHECKOUT SESSION ENDPOINT - IMPROVED & FIXED
router.post("/checkout-session", checkoutLimiter, async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      elizaLogger.error("[CLIENT-DIRECT] STRIPE_SECRET_KEY is not set in environment variables");
      return res.status(500).json({ error: "Server configuration error: Missing Stripe secret key" });
    }


    if (!process.env.WEBSITE_DOMAIN) {
      elizaLogger.error("[CLIENT-DIRECT] WEBSITE_DOMAIN is not set in environment variables");
      return res.status(500).json({ error: "Server configuration error: Missing WEBSITE_DOMAIN" });
    }

    // Validate WEBSITE_DOMAIN
    const websiteDomain = process.env.WEBSITE_DOMAIN;
    elizaLogger.info("[CLIENT-DIRECT] Validating WEBSITE_DOMAIN:", websiteDomain);
    const isValidUrl = (url) => {
      try {
        new URL(url);
        return url.startsWith('http://') || url.startsWith('https://');
      } catch {
        return false;
      }
    };

    if (!isValidUrl(websiteDomain)) {
      elizaLogger.error("[CLIENT-DIRECT] Invalid WEBSITE_DOMAIN", { websiteDomain });
      return res.status(500).json({ error: "Server configuration error: Invalid WEBSITE_DOMAIN" });
    }

    elizaLogger.debug("[CLIENT-DIRECT]  /checkout-session request body:", req.body);
    const { userId, items } = req.body;
    
    if (!userId) {
      elizaLogger.warn("[CLIENT-DIRECT] Missing userId in /checkout-session request");
      return res.status(400).json({ error: "Missing userId" });
    }
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      elizaLogger.warn("[CLIENT-DIRECT] No items provided in /checkout-session request");
      return res.status(400).json({ error: "[CLIENT-DIRECT] At least one item is required" });
    }

    // Validate items: must include exactly one base subscription
    const baseItems = items.filter(item => item.itemType === "base");
    const pluginItems = items.filter(item => item.itemType === "plugin");

    if (baseItems.length !== 1) {
      elizaLogger.warn("[CLIENT-DIRECT] Invalid number of base subscriptions:", baseItems.length);
      return res.status(400).json({ error: "Exactly one base subscription is required" });
    }

    // Session validation
    const session = await Session.getSession(req, res, { sessionRequired: true });
    const sessionUserId = session.getUserId();
    if (userId !== sessionUserId) {
      elizaLogger.warn(`[CLIENT-DIRECT] User ID mismatch: request=${userId}, session=${sessionUserId}`);
      return res.status(403).json({ error: "[CLIENT-DIRECT] User ID does not match session" });
    }

    // Fetch user data
    const user = await sanityClient.fetch(
      `*[_type == "User" && userId == $userId][0]`,
      { userId }
    );

    if (!user) {
      elizaLogger.warn(`[CLIENT-DIRECT] No User found in Sanity for userId=${userId}`);
      return res.status(404).json({ error: "[CLIENT-DIRECT] User not found in Sanity" });
    }

    // Check if user already has a subscription
    const hasActiveSubscription = user.subscriptionStatus === "active" || 
                                user.subscriptionStatus === "trialing";
    
    if (hasActiveSubscription) {
      elizaLogger.warn(`[CLIENT-DIRECT] User ${userId} already has an active subscription: ${user.stripeSubscriptionId}`);
      return res.status(400).json({ 
        error: "[CLIENT-DIRECT] User already has an active subscription", 
        subscriptionId: user.stripeSubscriptionId,
        subscriptionStatus: user.subscriptionStatus
      });
    }

    // Fetch subscription items from Sanity - keep original query for backward compatibility
    const sanityItems = await sanityClient.fetch(`*[_type == "Item"]`);

    // Validate items - making sure they match what's in Sanity
    const validatedItems = [];
    const subscriptionItems = []; // Track subscription items with price IDs
    const activePlugins = []; // Track active plugin names
    
    for (const item of [...baseItems, ...pluginItems]) {
      const sanityItem = sanityItems.find((si) => si.id === item.id);
      
      if (sanityItem && sanityItem.price === item.price && sanityItem.itemType === item.itemType) {
        validatedItems.push(sanityItem);
        subscriptionItems.push({ id: sanityItem.id, price: sanityItem.price });
        
        // Track plugin names for activePlugins array
        if (sanityItem.itemType === "plugin" && sanityItem.pluginName) {
          activePlugins.push(sanityItem.pluginName);
        }
        continue;
      }
      
      // Allow static items for backward compatibility (from original code)
      if (item.source === "static" && (item.itemType === "base" || item.itemType === "plugin")) {
        validatedItems.push({
          id: item.id,
          name: item.name,
          description: item.description,
          price: item.price,
          itemType: item.itemType,
          pluginName: item.pluginName,
          source: item.source,
        });
        subscriptionItems.push({ id: item.id, price: item.price });
        
        // Track plugin names for static items too
        if (item.itemType === "plugin" && item.pluginName) {
          activePlugins.push(item.pluginName);
        }
        continue;
      }
      
      elizaLogger.warn(`[CLIENT-DIRECT] Invalid item or price: id=${item.id}, price=${item.price}, itemType=${item.itemType}`);
      return res.status(400).json({ error: `Invalid item or price: ${item.id}` });
    }

    // Get or create Stripe customer
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId },
      });
      stripeCustomerId = customer.id;
      await sanityClient
        .patch(user._id)
        .set({ stripeCustomerId })
        .commit();
      elizaLogger.debug(`[CLIENT-DIRECT] Created Stripe customer for userId=${userId}: customerId=${stripeCustomerId}`);
    }

    // Get existing Stripe products
    const stripeProducts = await stripe.products.list({ 
      limit: 100, 
      active: true 
    });

    // Create line items for checkout
    const lineItems = [];
    const activePriceIds = []; // Track price IDs for the subscription
    
    // Keep track of active item IDs for product archiving
    const activeItemIds = validatedItems.map(item => item.id);
    
    for (const item of validatedItems) {
      // Find existing product or create new one
      let product = stripeProducts.data.find(p => 
        p.metadata.sanityItemId === item.id && p.active
      );

      if (!product) {
        // Create new product with enhanced metadata
        product = await stripe.products.create({
          name: item.name,
          description: item.description,
          metadata: { 
            sanityItemId: item.id,
            itemType: item.itemType || "subscription", // fallback for backward compatibility
            pluginName: item.pluginName || ""
          },
          active: true,
        });
        elizaLogger.debug(`[CLIENT-DIRECT] Created Stripe product for item ${item.id}: ${product.id}`);
      } else if (
        product.name !== item.name || 
        product.description !== item.description ||
        product.metadata.itemType !== (item.itemType || "subscription") ||
        product.metadata.pluginName !== (item.pluginName || "")
      ) {
        // Update existing product if name/description/metadata changed
        product = await stripe.products.update(product.id, {
          name: item.name,
          description: item.description,
          metadata: { 
            sanityItemId: item.id,
            itemType: item.itemType || "subscription",
            pluginName: item.pluginName || ""
          },
        });
        elizaLogger.debug(`[CLIENT-DIRECT] Updated Stripe product ${product.id} for item ${item.id}`);
      }

      // Find existing price or create new one
      const prices = await stripe.prices.list({
        product: product.id,
        active: true,
        limit: 100,
      });

      let price = prices.data.find(p => 
        p.unit_amount === item.price && 
        p.recurring?.interval === "month"
      );

      if (!price) {
        // Create new price if no matching price exists
        price = await stripe.prices.create({
          product: product.id,
          unit_amount: item.price,
          currency: "usd",
          recurring: { interval: "month" },
          metadata: { sanityItemId: item.id },
        });
        elizaLogger.debug(`[CLIENT-DIRECT] Created Stripe price ${price.id} for item ${item.id}`);
      }

      // Add to checkout line items
      lineItems.push({
        price: price.id,
        quantity: 1,
      });

      // Track price ID
      activePriceIds.push(price.id);

      // Update Sanity with price ID if needed
      if (item._id && (!item.stripePriceId || item.stripePriceId !== price.id)) {
        await sanityClient
          .patch(item._id)
          .set({ stripePriceId: price.id })
          .commit();
        elizaLogger.debug(`[CLIENT-DIRECT] Updated Sanity item ${item.id} with stripePriceId=${price.id}`);
      }
    }

    // Determine trial eligibility with enhanced checks (from original)
    const trialStatus = await checkTrialEligibility(userId);
    const trialPeriodDays = trialStatus.eligible ? trialStatus.trialPeriodDays : null;
    
    // Log trial eligibility status
    if (trialStatus.eligible) {
      elizaLogger.debug(`[CLIENT-DIRECT] User ${userId} is eligible for a ${trialPeriodDays}-day trial`);
    } else {
      elizaLogger.debug(`[CLIENT-DIRECT] User ${userId} is not eligible for trial: ${trialStatus.reason}`);
    }

    // Create subscription_data object, conditionally including trial_period_days
    const subscriptionData: any = {
      metadata: { userId },
    };
    if (trialPeriodDays !== null) {
      subscriptionData.trial_period_days = trialPeriodDays;
    }

    // Create checkout session
    elizaLogger.debug(`[CLIENT-DIRECT] Creating Checkout Session for userId=${userId}, trial=${trialPeriodDays || 'none'} days`);
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "subscription",
      success_url: `${websiteDomain}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${websiteDomain}/cancel`,
      metadata: { userId },
      customer: stripeCustomerId,
      billing_address_collection: "auto",
      subscription_data: subscriptionData,
    });

    if (!checkoutSession.url) {
      elizaLogger.error("[CLIENT-DIRECT] Checkout Session created but URL is missing", checkoutSession);
      return res.status(500).json({ error: "[CLIENT-DIRECT] Failed to generate checkout session URL" });
    }

    // Update subscription metadata and store price IDs and plugins if created
    if (checkoutSession.subscription) {
      const subscriptionId = typeof checkoutSession.subscription === 'string' 
        ? checkoutSession.subscription 
        : checkoutSession.subscription.id;
        
      await stripe.subscriptions.update(subscriptionId, {
        metadata: { userId },
      });

      // Update user with price IDs and active plugins immediately
      await sanityClient
        .patch(user._id)
        .set({
          activePriceIds: activePriceIds,
          activePlugins: activePlugins, // Store plugin names for frontend checking
        })
        .commit();

      elizaLogger.debug(`[CLIENT-DIRECT] Updated subscription ${subscriptionId} with userId and stored activePriceIds: ${activePriceIds}, activePlugins: ${activePlugins}`);
    }

    elizaLogger.debug(`[CLIENT-DIRECT] Checkout Session created: id=${checkoutSession.id}`);
    
    // Clean up unused products in the background (from original)
    setTimeout(() => cleanupUnusedProducts(activeItemIds), 0);
    
    res.json({ 
      checkoutUrl: checkoutSession.url,
      trialEligible: trialStatus.eligible,
      trialDays: trialPeriodDays
    });
  } catch (error) {
    elizaLogger.error("[CLIENT-DIRECT] Error in checkout-session:", {
      message: error.message,
      type: error.type,
      code: error.code,
      raw: error.raw,
    });
    res.status(500).json({ 
      error: "[CLIENT-DIRECT] Failed to create checkout session", 
      details: error.message 
    });
  }
});

// Cleanup function for unused products
async function cleanupUnusedProducts(activeItemIds) {
  try {
    elizaLogger.debug("[CLIENT-DIRECT] Running cleanup for unused Stripe products");
    
    // Get all active products from Stripe
    const products = await stripe.products.list({
      limit: 100,
      active: true,
    });
    
    // Filter for products that have sanityItemId but are no longer in our active items
    const productsToArchive = products.data.filter(product => {
      // Only consider products with sanityItemId metadata
      if (!product.metadata || !product.metadata.sanityItemId) {
        return false;
      }
      
      // If the item is not in our active list, mark for archiving
      return !activeItemIds.includes(product.metadata.sanityItemId);
    });
    
    // Archive unused products
    for (const product of productsToArchive) {
      await stripe.products.update(product.id, {
        active: false,
      });
      elizaLogger.debug(`[CLIENT-DIRECT] Archived Stripe product ${product.id} with sanityItemId=${product.metadata.sanityItemId}`);
    }
    
    elizaLogger.debug(`[CLIENT-DIRECT] Archived ${productsToArchive.length} unused Stripe products`);
  } catch (error) {
    // Don't let this error affect the main checkout process
    elizaLogger.error("[CLIENT-DIRECT] Error during product cleanup:", {
      message: error.message,
      stack: error.stack,
    });
  }
}

// Enhanced function to check if user has previously had trials
async function checkTrialEligibility(userId) {
  try {
    // First check the Sanity user record
    const user = await sanityClient.fetch(
      `*[_type == "User" && userId == $userId][0]`,
      { userId }
    );
    
    // If hasUsedTrial is already set to true in Sanity, user is not eligible
    if (user && user.hasUsedTrial === true) {
      return {
        eligible: false,
        reason: "User has already used a trial according to our records",
        trialPeriodDays: null, // Explicitly indicate no trial
      };
    }
    
    // Double-check with Stripe API if there's a customer record
    if (user && user.stripeCustomerId) {
      // Get all subscriptions for this customer, including canceled ones
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        status: 'all',
        limit: 100,
      });
      
      // Check if any previous subscription had a trial
      const hadTrialBefore = subscriptions.data.some(sub => sub.trial_start);
      
      if (hadTrialBefore) {
        // Update Sanity record to reflect this
        await sanityClient
          .patch(user._id)
          .set({ hasUsedTrial: true })
          .commit();
          
        return {
          eligible: false,
          reason: "User has had a trial in a previous subscription",
          trialPeriodDays: null, // Explicitly indicate no trial
        };
      }
    }
    
    // If we get here, user is eligible for trial
    return {
      eligible: true,
      trialPeriodDays: 7, // Default trial period
    };
  } catch (error) {
    elizaLogger.error("[CLIENT-DIRECT] Error checking trial eligibility:", {
      message: error.message,
      stack: error.stack,
      userId,
    });
    
    // Default to ineligible in case of errors
    return {
      eligible: false,
      reason: "[CLIENT-DIRECT] Error determining trial eligibility",
      trialPeriodDays: null, // Explicitly indicate no trial in case of error
    };
  }
}

// API endpoint to get user's active price IDs
router.get("/subscription-items", async (req, res) => {
  try {
    // Session validation - retaining original logic
    const session = await Session.getSession(req, res, { sessionRequired: true });
    const userId = session.getUserId();
    
    if (!userId) {
      elizaLogger.warn("[CLIENT-DIRECT] No userId in session for /subscription-items request");
      return res.status(401).json({ error: "[CLIENT-DIRECT] Not authenticated" });
    }

    // Fetch user data with all necessary fields from original + new activePlugins
    const user = await sanityClient.fetch(
      `*[_type == "User" && userId == $userId][0]{
        _id,
        subscriptionStatus,
        stripeSubscriptionId,
        activePriceIds,
        activePlugins,
        currentPeriodStart,
        currentPeriodEnd,
        trialStartDate,
        trialEndDate,
        cancelAtPeriodEnd
      }`,
      { userId }
    );

    if (!user) {
      elizaLogger.warn(`[CLIENT-DIRECT] No User found in Sanity for userId=${userId}`);
      return res.status(404).json({ error: "[CLIENT-DIRECT] User not found" });
    }

    // Retaining original subscription status logic
    const hasActiveSubscription = user.subscriptionStatus === "active" || 
                                  user.subscriptionStatus === "trialing";
    
    if (!hasActiveSubscription) {
      return res.json({ 
        active: false, 
        subscriptionStatus: user.subscriptionStatus || "none",
        priceIds: [],
        plugins: [],
        items: [],
        // Include trial/subscription period info even for inactive subscriptions
        currentPeriodStart: user.currentPeriodStart,
        currentPeriodEnd: user.currentPeriodEnd,
        trialStartDate: user.trialStartDate,
        trialEndDate: user.trialEndDate,
        cancelAtPeriodEnd: user.cancelAtPeriodEnd
      });
    }

    // Initialize with existing data
    let activePriceIds = user.activePriceIds || [];
    let activePlugins = user.activePlugins || [];
    let subscriptionData = {
      currentPeriodStart: user.currentPeriodStart,
      currentPeriodEnd: user.currentPeriodEnd,
      trialStartDate: user.trialStartDate,
      trialEndDate: user.trialEndDate,
      cancelAtPeriodEnd: user.cancelAtPeriodEnd
    };
    
    // If active price IDs are missing in Sanity but there's a subscription ID,
    // fetch them from Stripe as a fallback (retaining original logic)
    if (user.stripeSubscriptionId && (!activePriceIds || activePriceIds.length === 0)) {
      try {
        // Fetch subscription details from Stripe with expanded data
        const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId, {
          expand: ['items.data.price', 'items.data.price.product']
        });
        
        // Extract price IDs
        activePriceIds = subscription.items.data.map(item => item.price.id);
        
        // Extract subscription period information
        const sub = subscription as any; // Type assertion for Stripe subscription properties
        subscriptionData = {
          currentPeriodStart: new Date(sub.current_period_start * 1000).toISOString(),
          currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
          trialStartDate: sub.trial_start ? new Date(sub.trial_start * 1000).toISOString() : user.trialStartDate,
          trialEndDate: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : user.trialEndDate,
          cancelAtPeriodEnd: sub.cancel_at_period_end || false
        };
        
        // Fetch plugin names for active subscriptions
        if (activePriceIds.length > 0) {
          const pluginItems = await sanityClient.fetch(
            `*[_type == "Item" && itemType == "plugin" && stripePriceId in $activePriceIds]{pluginName}`,
            { activePriceIds }
          );
          activePlugins = pluginItems.map(item => item.pluginName).filter(Boolean);
        }
        
        // Update Sanity with the fetched data (do this in the background)
        sanityClient
          .patch(user._id)
          .set({ 
            activePriceIds,
            activePlugins,
            ...subscriptionData
          })
          .commit()
          .then(() => {
            elizaLogger.debug(`[CLIENT-DIRECT] Updated user ${userId} with data from Stripe`);
          })
          .catch(error => {
            elizaLogger.error(`[CLIENT-DIRECT] Failed to update user ${userId} with Stripe data`, {
              error: error.message
            });
          });
      } catch (stripeError) {
        elizaLogger.error(`[CLIENT-DIRECT] Failed to fetch subscription from Stripe for user ${userId}`, {
          error: stripeError.message
        });
      }
    } else if (user.stripeSubscriptionId) {
      // If we have price IDs but activePlugins might be outdated, refresh them
      if (activePriceIds.length > 0 && (!activePlugins || activePlugins.length === 0)) {
        try {
          const pluginItems = await sanityClient.fetch(
            `*[_type == "Item" && itemType == "plugin" && stripePriceId in $activePriceIds]{pluginName}`,
            { activePriceIds }
          );
          activePlugins = pluginItems.map(item => item.pluginName).filter(Boolean);
          
          // Update activePlugins in Sanity if we found any
          if (activePlugins.length > 0) {
            sanityClient
              .patch(user._id)
              .set({ activePlugins })
              .commit()
              .then(() => {
                elizaLogger.debug(`[CLIENT-DIRECT] Updated user ${userId} with activePlugins`);
              })
              .catch(error => {
                elizaLogger.error(`[CLIENT-DIRECT] Failed to update user ${userId} with activePlugins`, {
                  error: error.message
                });
              });
          }
        } catch (pluginError) {
          elizaLogger.warn(`[CLIENT-DIRECT] Failed to fetch plugin names for user ${userId}`, {
            error: pluginError.message
          });
        }
      }
    }

    // Fetch full item details for the price IDs if requested (retaining original logic with plugin support)
    let subscriptionItems = [];
    
    if (req.query.includeDetails === 'true' && (activePriceIds.length > 0 || activePlugins.length > 0)) {
      // Fetch items from Sanity that match these price IDs or plugin names
      const items = await sanityClient.fetch(
        `*[_type == "Item" && (stripePriceId in $priceIds || pluginName in $pluginNames)]{
          id,
          name,
          description,
          price,
          stripePriceId,
          pluginName,
          itemType,
          features,
          isPopular,
          trialInfo,
          useCase
        }`,
        { priceIds: activePriceIds, pluginNames: activePlugins }
      );
      
      // For any price IDs that don't have Sanity items, get info from Stripe (retaining original logic)
      const foundPriceIds = items.map(item => item.stripePriceId).filter(Boolean);
      const missingPriceIds = activePriceIds.filter(id => !foundPriceIds.includes(id));
      
      if (missingPriceIds.length > 0) {
        // For each missing ID, fetch from Stripe
        for (const priceId of missingPriceIds) {
          try {
            const price = await stripe.prices.retrieve(priceId, {
              expand: ['product']
            });
            
            // Fix TypeScript errors by checking the type of price.product
            if (typeof price.product === 'object' && price.product !== null) {
              const product = price.product;
              items.push({
                id: 'metadata' in product && product.metadata?.sanityItemId ? product.metadata.sanityItemId : `stripe_${product.id}`,
                name: 'name' in product ? product.name : 'Unknown Product',
                description: 'description' in product ? product.description || '' : '',
                price: price.unit_amount,
                stripePriceId: price.id,
                itemType: 'unknown'
              });
            } else {
              // If product is just an ID (string), fetch the product separately
              const productId = typeof price.product === 'string' ? price.product : '';
              if (productId) {
                const product = await stripe.products.retrieve(productId);
                items.push({
                  id: product.metadata?.sanityItemId || `stripe_${product.id}`,
                  name: product.name || 'Unknown Product',
                  description: product.description || '',
                  price: price.unit_amount,
                  stripePriceId: price.id,
                  itemType: 'unknown'
                });
              } else {
                // Fallback if we can't get product details
                items.push({
                  id: `price_${price.id}`,
                  name: 'Unknown Product',
                  description: '',
                  price: price.unit_amount,
                  stripePriceId: price.id,
                  itemType: 'unknown'
                });
              }
            }
          } catch (err) {
            elizaLogger.warn(`[CLIENT-DIRECT] Failed to fetch details for price ${priceId}`, {
              error: err.message
            });
          }
        }
      }
      
      subscriptionItems = items;
    }

    // Return the response with all original data plus new plugin data
    res.json({
      active: hasActiveSubscription,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionId: user.stripeSubscriptionId,
      priceIds: activePriceIds,
      plugins: activePlugins, // New field for plugin-based subscriptions
      items: subscriptionItems,
      // Include subscription period information
      currentPeriodStart: subscriptionData.currentPeriodStart,
      currentPeriodEnd: subscriptionData.currentPeriodEnd,
      trialStartDate: subscriptionData.trialStartDate,
      trialEndDate: subscriptionData.trialEndDate,
      cancelAtPeriodEnd: subscriptionData.cancelAtPeriodEnd
    });
    
  } catch (error) {
    elizaLogger.error("[CLIENT-DIRECT] Error in /subscription-items:", {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      error: "[CLIENT-DIRECT] Failed to fetch subscription items", 
      details: error.message 
    });
  }
});


// Add Plugin to Subscription
router.post("/subscription/add-plugin", async (req, res) => {
  try {
    const session = await Session.getSession(req, res, { sessionRequired: true });
    const userId = session.getUserId();
    const { pluginName } = req.body;

    if (!pluginName) return res.status(400).json({ error: "Plugin name is required" });

    const user = await sanityClient.fetch(
      `*[_type == "User" && userId == $userId][0]`,
      { userId }
    );
    if (!user || !user.stripeSubscriptionId) return res.status(400).json({ error: "No active subscription" });

    const pluginItem = await sanityClient.fetch(
      `*[_type == "Item" && itemType == "plugin" && pluginName == $pluginName][0]`,
      { pluginName }
    );
    if (!pluginItem || !pluginItem.stripePriceId) return res.status(404).json({ error: "Plugin not found" });

    const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId, {
      expand: ['items.data.price'],
    });

    if (subscription.items.data.some(item => item.price.id === pluginItem.stripePriceId)) {
      return res.status(400).json({ error: "Plugin already subscribed" });
    }

    const updatedItems = [
      ...subscription.items.data.map(item => ({ id: item.id, price: item.price.id })),
      { price: pluginItem.stripePriceId },
    ];

    await stripe.subscriptions.update(user.stripeSubscriptionId, {
      items: updatedItems,
    });

    const updatedSubscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId, {
      expand: ['items.data.price'],
    });

    const activePriceIds = updatedSubscription.items.data.map(item => item.price.id);
    const pluginItems = await sanityClient.fetch(
      `*[_type == "Item" && itemType == "plugin" && stripePriceId in $activePriceIds]{pluginName}`,
      { activePriceIds }
    );
    const activePlugins = pluginItems.map(item => item.pluginName);

    await sanityClient.patch(user._id).set({ activePriceIds, activePlugins }).commit();

    res.json({ success: true });
  } catch (error) {
    elizaLogger.error("[CLIENT-DIRECT] Error adding plugin:", error);
    res.status(500).json({ error: "Failed to add plugin" });
  }
});

// Remove Plugin from Subscription
router.post("/subscription/remove-plugin", async (req, res) => {
  try {
    const session = await Session.getSession(req, res, { sessionRequired: true });
    const userId = session.getUserId();
    const { pluginName } = req.body;

    if (!pluginName) return res.status(400).json({ error: "Plugin name is required" });

    const user = await sanityClient.fetch(
      `*[_type == "User" && userId == $userId][0]`,
      { userId }
    );
    if (!user || !user.stripeSubscriptionId) return res.status(400).json({ error: "No active subscription" });

    // Check if any characters are using the plugin
    const charactersUsingPlugin = await sanityClient.fetch(
      `*[_type == "character" && createdBy._ref == $userId && $pluginName in plugins]`,
      { userId: user._id, pluginName }
    );

    if (charactersUsingPlugin.length > 0) {
      const characterNames = charactersUsingPlugin.map((char: any) => char.name).join(", ");
      return res.status(400).json({
        error: `Cannot remove plugin "${pluginName}" because it is still enabled for the following characters: ${characterNames}. Please delete those characters first.`,
      });
    }

    const pluginItem = await sanityClient.fetch(
      `*[_type == "Item" && itemType == "plugin" && pluginName == $pluginName][0]`,
      { pluginName }
    );
    if (!pluginItem || !pluginItem.stripePriceId) return res.status(404).json({ error: "Plugin not found" });

    const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId, {
      expand: ['items.data.price'],
    });

    const itemToRemove = subscription.items.data.find(item => item.price.id === pluginItem.stripePriceId);
    if (!itemToRemove) return res.status(400).json({ error: "Plugin not subscribed" });

    await stripe.subscriptions.update(user.stripeSubscriptionId, {
      items: [{ id: itemToRemove.id, deleted: true }],
    });

    const updatedSubscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId, {
      expand: ['items.data.price'],
    });

    const activePriceIds = updatedSubscription.items.data.map(item => item.price.id);
    const pluginItems = await sanityClient.fetch(
      `*[_type == "Item" && itemType == "plugin" && stripePriceId in $activePriceIds]{pluginName}`,
      { activePriceIds }
    );
    const activePlugins = pluginItems.map(item => item.pluginName);

    await sanityClient.patch(user._id).set({ activePriceIds, activePlugins }).commit();

    res.json({ success: true });
  } catch (error) {
    elizaLogger.error("[CLIENT-DIRECT] Error removing plugin:", error);
    res.status(500).json({ error: "Failed to remove plugin" });
  }
});

// Update Base Plan
router.post("/subscription/update-base-plan", async (req, res) => {
  try {
    const session = await Session.getSession(req, res, { sessionRequired: true });
    const userId = session.getUserId();
    const { newBasePlanId } = req.body;

    if (!newBasePlanId) {
      return res.status(400).json({ error: "New base plan ID is required" });
    }

    const user = await sanityClient.fetch(
      `*[_type == "User" && userId == $userId][0]`,
      { userId }
    );

    if (!user || !user.stripeSubscriptionId) {
      return res.status(400).json({ error: "No active subscription" });
    }

    const newBaseItem = await sanityClient.fetch(
      `*[_type == "Item" && id == $newBasePlanId && itemType == "base"][0]`,
      { newBasePlanId }
    );

    if (!newBaseItem || !newBaseItem.stripePriceId) {
      return res.status(404).json({ error: "Base plan not found or misconfigured" });
    }

    const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId, {
      expand: ['items.data.price.product'],
    });

    const currentBaseItem = subscription.items.data.find(item =>
      typeof item.price.product === "object" &&
      item.price.product !== null &&
      "metadata" in item.price.product &&
      (item.price.product as any).metadata?.itemType === "base"
    );

    if (!currentBaseItem) {
      return res.status(400).json({ error: "No current base plan found" });
    }

    await stripe.subscriptions.update(user.stripeSubscriptionId, {
      items: [{ id: currentBaseItem.id, price: newBaseItem.stripePriceId }],
    });

    const updatedSubscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId, {
      expand: ['items.data.price'],
    });

    const activePriceIds = updatedSubscription.items.data.map(item => item.price.id);

    await sanityClient.patch(user._id).set({ activePriceIds }).commit();

    res.json({ success: true });
  } catch (error) {
    elizaLogger.error("Error updating base plan:", error);
    res.status(500).json({ error: "Failed to update base plan", details: error.message });
  }
});

router.get("/subscription-status", async (req, res) => {
    try {
        const session = await Session.getSession(req, res, { sessionRequired: true });
        const userId = session.getUserId();

        const user = await sanityClient.fetch(
            `*[_type == "User" && userId == $userId][0]`,
            { userId }
        );

        if (!user) {
            elizaLogger.warn(`[CLIENT-DIRECT] User not found for userId=${userId}`);
            return res.status(404).json({ error: "User not found" });
        }

        const now = new Date();
        const trialEndDate = user.trialEndDate ? new Date(user.trialEndDate) : null;
        const isTrialActive = trialEndDate && now <= trialEndDate;

        res.json({
            status: user.subscriptionStatus || "none",
            isTrialActive,
        });
    } catch (error: any) {
        elizaLogger.error("[CLIENT-DIRECT] Error in /subscription-status endpoint:", error);
        res.status(500).json({ error: "Failed to fetch subscription status" });
    }
});
// Cancel Subscription Endpoint
router.post("/cancel-subscription", checkoutLimiter, async (req, res) => {
    try {
      if (!process.env.STRIPE_SECRET_KEY) {
        elizaLogger.error("[CLIENT-DIRECT] STRIPE_SECRET_KEY is not set in environment variables");
        return res.status(500).json({ error: "Server configuration error: Missing Stripe secret key" });
      }
  
      const session = await Session.getSession(req, res, { sessionRequired: true });
      const userId = session.getUserId();
  
      const user = await sanityClient.fetch(
        `*[_type == "User" && userId == $userId][0]`,
        { userId }
      );
  
      if (!user) {
        elizaLogger.warn(`[CLIENT-DIRECT] No User found in Sanity for userId=${userId}`);
        return res.status(404).json({ error: "[CLIENT-DIRECT] User not found in Sanity" });
      }
  
      const stripeSubscriptionId = user.stripeSubscriptionId;
      if (!stripeSubscriptionId) {
        elizaLogger.warn(`[CLIENT-DIRECT] No subscription found for userId=${userId}`);
        return res.status(400).json({ error: "[CLIENT-DIRECT] No active subscription found" });
      }
  
      const subscription = await stripe.subscriptions.update(stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
  
      await sanityClient
        .patch(user._id)
        .set({
          subscriptionStatus: subscription.status,
          cancelAtPeriodEnd: true,
          activePriceIds: [], // Clear activePriceIds
          activePlugins: [], // Clear activePlugins
        })
        .commit();
  
      elizaLogger.debug(`[CLIENT-DIRECT] Subscription ${stripeSubscriptionId} for userId=${userId} set to cancel at period end`);
      res.json({ message: "[CLIENT-DIRECT] Subscription will cancel at the end of the billing period" });
    } catch (error: any) {
      elizaLogger.error("[CLIENT-DIRECT] Error in cancel-subscription:", {
        message: error.message,
        type: error.type,
        code: error.code,
        raw: error.raw,
      });
      res.status(500).json({ error: "Failed to cancel subscription", details: error.message });
    }
});
  
router.post("/create-portal-session", async (req, res) => {
    try {
        const session = await Session.getSession(req, res, { sessionRequired: true });
        const userId = session.getUserId();
        const user = await sanityClient.fetch(
            `*[_type == "User" && userId == $userId][0]`,
            { userId }
        );
        if (!user) {
            elizaLogger.warn(`[CLIENT-DIRECT] User not found for userId=${userId}`);
            return res.status(404).json({ error: "[CLIENT-DIRECT] User not found" });
        }
        const subscriptions = await stripe.subscriptions.list({ customer: user.stripeCustomerId });
        if (!subscriptions.data.length) {
            elizaLogger.warn(`[CLIENT-DIRECT] No subscription found for userId=${userId}`);
            return res.status(404).json({ error: "[CLIENT-DIRECT] No subscription found" });
        }
        const portalSession = await stripe.billingPortal.sessions.create({
            customer: user.stripeCustomerId,
            return_url: `${process.env.WEBSITE_DOMAIN}/home`,
        });
        res.json({ url: portalSession.url });
    } catch (error: any) {
        elizaLogger.error("[CLIENT-DIRECT] Error in /create-portal-session endpoint:", error);
        res.status(500).json({ error: "[CLIENT-DIRECT] Failed to create portal session" });
    }
});

router.get("/sync-subscriptions", async (req, res) => {
  try {
    const users = await sanityClient.fetch(`*[_type == "User" && stripeCustomerId != null]{
      _id,
      userId,
      stripeCustomerId,
      subscriptionStatus,
      stripeSubscriptionId,
      activePriceIds,
      activePlugins
    }`);

    let syncedCount = 0;
    let errorCount = 0;
    let syncedInvoicesCount = 0;

    for (const user of users) {
      try {
        const subscriptions = await stripe.subscriptions.list({
          customer: user.stripeCustomerId,
          expand: ['data.items.data.price', 'data.items.data.price.product'],
        });

        const activeSub = subscriptions.data.find(sub =>
          ["active", "trialing", "past_due"].includes(sub.status)
        );

        // Sync invoices for this customer
        const invoices = await stripe.invoices.list({
          customer: user.stripeCustomerId,
          limit: 100,
          expand: ['data.lines.data.price', 'data.lines.data.price.product'],
        });

        for (const invoice of invoices.data) {
          const lineItems = invoice.lines.data.map((line: Stripe.InvoiceLineItem) => {
            const price = line.price as Stripe.Price | null;
            let productName = 'Unknown Product';

            if (price?.product && typeof price.product !== 'string') {
              productName = (price.product as Stripe.Product).name || line.description || 'Unknown Product';
            } else if (line.description) {
              productName = line.description.replace(/^Trial period for /i, '');
            }

            return {
              _key: randomUUID(),
              description: line.description || 'No description',
              amount: line.amount / 100,
              currency: line.currency,
              quantity: line.quantity || 1,
              period: {
                start: line.period?.start ? new Date(line.period.start * 1000).toISOString() : null,
                end: line.period?.end ? new Date(line.period.end * 1000).toISOString() : null,
              },
              productName,
            };
          });

          const invoiceData = {
            _type: "invoice",
            user: { _type: "reference", _ref: user._id },
            stripeInvoiceId: invoice.id,
            status: invoice.status || "draft",
            amountDue: invoice.amount_due / 100,
            amountPaid: invoice.amount_paid / 100,
            currency: invoice.currency,
            createdAt: new Date(invoice.created * 1000).toISOString(),
            dueDate: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
            invoiceUrl: invoice.hosted_invoice_url || null,
            invoicePdf: invoice.invoice_pdf || null,
            periodStart: invoice.lines.data[0]?.period?.start
              ? new Date(invoice.lines.data[0].period.start * 1000).toISOString()
              : null,
            periodEnd: invoice.lines.data[0]?.period?.end
              ? new Date(invoice.lines.data[0].period.end * 1000).toISOString()
              : null,
            lineItems,
          };

          const existingInvoice = await sanityClient.fetch(
            `*[_type == "invoice" && stripeInvoiceId == $stripeInvoiceId][0]`,
            { stripeInvoiceId: invoice.id }
          );

          if (!existingInvoice) {
            await sanityClient.create(invoiceData);
            elizaLogger.debug("[CLIENT-DIRECT] Synced new invoice for user", {
              userId: user.userId,
              invoiceId: invoice.id,
              lineItemsCount: lineItems.length,
            });
            syncedInvoicesCount++;
          } else {
            await sanityClient
              .patch(existingInvoice._id)
              .set({
                status: invoice.status,
                amountDue: invoice.amount_due / 100,
                amountPaid: invoice.amount_paid / 100,
                invoiceUrl: invoice.hosted_invoice_url || null,
                invoicePdf: invoice.invoice_pdf || null,
                lineItems,
              })
              .commit();
            elizaLogger.debug("[CLIENT-DIRECT] Updated existing invoice for user", {
              userId: user.userId,
              invoiceId: invoice.id,
              lineItemsCount: lineItems.length,
            });
            syncedInvoicesCount++;
          }
        }

        if (activeSub) {
          const activePriceIds = activeSub.items.data.map(item => item.price.id);
          let activePlugins = [];
          if (activePriceIds.length > 0) {
            try {
              const pluginItems = await sanityClient.fetch(
                `*[_type == "Item" && itemType == "plugin" && stripePriceId in $activePriceIds]{pluginName}`,
                { activePriceIds }
              );
              activePlugins = pluginItems.map(item => item.pluginName).filter(Boolean);
            } catch (pluginError) {
              elizaLogger.warn(`[CLIENT-DIRECT] Failed to fetch plugin names for user ${user.userId}`, {
                error: pluginError.message
              });
            }
          }

          const sub = activeSub as any;
          const subscriptionData = {
            subscriptionStatus: activeSub.status,
            stripeSubscriptionId: activeSub.id,
            activePriceIds,
            activePlugins,
            currentPeriodStart: new Date(sub.current_period_start * 1000).toISOString(),
            currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
            trialStartDate: sub.trial_start ? new Date(sub.trial_start * 1000).toISOString() : null,
            trialEndDate: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
            cancelAtPeriodEnd: sub.cancel_at_period_end || false
          };

          const hasChanges = (
            activeSub.status !== user.subscriptionStatus ||
            activeSub.id !== user.stripeSubscriptionId ||
            JSON.stringify(activePriceIds) !== JSON.stringify(user.activePriceIds || []) ||
            JSON.stringify(activePlugins) !== JSON.stringify(user.activePlugins || [])
          );

          if (hasChanges) {
            await sanityClient
              .patch(user._id)
              .set(subscriptionData)
              .commit();

            elizaLogger.debug(`[CLIENT-DIRECT] Synced subscription for user ${user.userId}:`, {
              status: activeSub.status,
              subscriptionId: activeSub.id,
              activePriceIds,
              activePlugins,
              currentPeriodEnd: subscriptionData.currentPeriodEnd
            });
            syncedCount++;
          }
        } else {
          const shouldClearData = ["active", "trialing", "past_due"].includes(user.subscriptionStatus);
          if (shouldClearData) {
            await sanityClient
              .patch(user._id)
              .set({
                subscriptionStatus: "inactive",
                stripeSubscriptionId: null,
                activePriceIds: [],
                activePlugins: [],
                cancelAtPeriodEnd: false,
                currentPeriodStart: null,
                currentPeriodEnd: null
              })
              .commit();

            elizaLogger.debug(`[CLIENT-DIRECT] Cleared subscription data for user ${user.userId} - no active subscription found`);
            syncedCount++;
          }
        }
      } catch (userError) {
        elizaLogger.error(`[CLIENT-DIRECT] Error syncing subscription for user ${user.userId}:`, {
          error: userError.message,
          userId: user.userId,
          stripeCustomerId: user.stripeCustomerId
        });
        errorCount++;
      }
    }

    elizaLogger.debug(`[CLIENT-DIRECT] Subscription sync completed:`, {
      totalUsers: users.length,
      syncedUsers: syncedCount,
      errors: errorCount,
      syncedInvoices: syncedInvoicesCount
    });

    res.json({ 
      success: true,
      synced: syncedCount,
      errors: errorCount,
      total: users.length,
      syncedInvoices: syncedInvoicesCount
    });
  } catch (error: any) {
    elizaLogger.error("[CLIENT-DIRECT] Error in /sync-subscriptions endpoint:", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ 
      error: "Failed to sync subscriptions",
      details: error.message 
    });
  }
});

router.get("/sync-items", async (req, res) => {
  try {
    // Fetch all active Stripe products
    const stripeProducts = await stripe.products.list({ limit: 100, active: true });
    const stripePrices = await stripe.prices.list({ limit: 100, active: true });

    // Fetch all Sanity items
    const sanityItems = await sanityClient.fetch(`
      *[_type == "Item"]{
        _id,
        id,
        name,
        description,
        price,
        itemType,
        pluginName,
        stripePriceId,
        features,
        isPopular,
        trialInfo,
        useCase
      }
    `);

    let syncedCount = 0;
    let createdCount = 0;
    let errorCount = 0;

    // Process each Sanity item
    for (const sanityItem of sanityItems) {
      try {
        // Find matching Stripe product by metadata.sanityItemId or name
        let product = stripeProducts.data.find(
          (p) =>
            p.metadata.sanityItemId === sanityItem.id ||
            p.name === sanityItem.name
        );

        // If no matching product, create a new one
        if (!product) {
          product = await stripe.products.create({
            name: sanityItem.name,
            description: sanityItem.description || "",
            metadata: {
              sanityItemId: sanityItem.id,
              itemType: sanityItem.itemType || "subscription",
              pluginName: sanityItem.pluginName || "",
            },
            active: true,
          });
          elizaLogger.debug(
            `[CLIENT-DIRECT] Created Stripe product for Sanity item ${sanityItem.id}: ${product.id}`
          );
          createdCount++;
        } else if (
          product.name !== sanityItem.name ||
          product.description !== (sanityItem.description || "") ||
          product.metadata.itemType !== (sanityItem.itemType || "subscription") ||
          product.metadata.pluginName !== (sanityItem.pluginName || "")
        ) {
          // Update existing product if details have changed
          product = await stripe.products.update(product.id, {
            name: sanityItem.name,
            description: sanityItem.description || "",
            metadata: {
              sanityItemId: sanityItem.id,
              itemType: sanityItem.itemType || "subscription",
              pluginName: sanityItem.pluginName || "",
            },
          });
          elizaLogger.debug(
            `[CLIENT-DIRECT] Updated Stripe product ${product.id} for Sanity item ${sanityItem.id}`
          );
        }

        // Find or create a price for the product
        const prices = stripePrices.data.filter((p) => p.product === product.id);
        let price = prices.find(
          (p) =>
            p.unit_amount === sanityItem.price &&
            p.currency === "usd" &&
            p.recurring?.interval === "month"
        );

        if (!price) {
          price = await stripe.prices.create({
            product: product.id,
            unit_amount: sanityItem.price,
            currency: "usd",
            recurring: { interval: "month" },
            metadata: { sanityItemId: sanityItem.id },
          });
          elizaLogger.debug(
            `[CLIENT-DIRECT] Created Stripe price ${price.id} for item ${sanityItem.id}`
          );
          createdCount++;
        }

        // Update Sanity item with stripePriceId if missing or different
        if (!sanityItem.stripePriceId || sanityItem.stripePriceId !== price.id) {
          await sanityClient
            .patch(sanityItem._id)
            .set({ stripePriceId: price.id })
            .commit();
          elizaLogger.debug(
            `[CLIENT-DIRECT] Updated Sanity item ${sanityItem.id} with stripePriceId=${price.id}`
          );
          syncedCount++;
        }
      } catch (error) {
        elizaLogger.error(
          `[CLIENT-DIRECT] Error syncing item ${sanityItem.id}:`,
          {
            message: error.message,
            stack: error.stack,
          }
        );
        errorCount++;
      }
    }

    // Archive Stripe products that no longer have corresponding Sanity items
    const activeSanityItemIds = sanityItems.map((item) => item.id);
    const productsToArchive = stripeProducts.data.filter(
      (product) =>
        product.metadata.sanityItemId &&
        !activeSanityItemIds.includes(product.metadata.sanityItemId)
    );

    for (const product of productsToArchive) {
      await stripe.products.update(product.id, { active: false });
      elizaLogger.debug(
        `[CLIENT-DIRECT] Archived Stripe product ${product.id} with sanityItemId=${product.metadata.sanityItemId}`
      );
    }

    elizaLogger.debug(`[CLIENT-DIRECT] Item sync completed:`, {
      totalItems: sanityItems.length,
      syncedItems: syncedCount,
      createdItems: createdCount,
      archivedProducts: productsToArchive.length,
      errors: errorCount,
    });

    res.json({
      success: true,
      synced: syncedCount,
      created: createdCount,
      archived: productsToArchive.length,
      errors: errorCount,
      total: sanityItems.length,
    });
  } catch (error) {
    elizaLogger.error("[CLIENT-DIRECT] Error in /sync-items endpoint:", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      error: "Failed to sync items",
      details: error.message,
    });
  }
});

  // WaitlistCheck route
  router.get("/user/check", async (req, res) => {
    try {
      const { userId } = req.query;
      if (!userId || typeof userId !== "string") {
        return res.status(400).json({ error: "userId is required" });
      }
  
      const User = await sanityClient.fetch(
        `*[_type == "User" && userId == $userId][0]`,
        { userId }
      );
  
      if (User) {
        return res.json({ exists: true, User });
      }
      return res.json({ exists: false });
    } catch (error) {
      elizaLogger.error("Error checking user:", error);
      res.status(500).json({ error: "Failed to check user", details: error.message });
    }
  });

  
      // User routes
      
router.post("/user", async (req: express.Request, res: express.Response) => {
  elizaLogger.debug("[CLIENT-DIRECT] Handling /user POST request");
  elizaLogger.debug("[CLIENT-DIRECT] Request body:", req.body);
  try {
    const session = await Session.getSession(req, res, { sessionRequired: true });
    const userId = session.getUserId();
    const { name, email, interest, referralSource, createdAt, userType } = req.body;

    if (!name || !email || !interest || !referralSource) {
      elizaLogger.warn("[CLIENT-DIRECT] Missing required fields in /user request", {
        name: !!name,
        email: !!email,
        interest: !!interest,
        referralSource: !!referralSource,
      });
      return res.status(400).json({ error: "[CLIENT-DIRECT] Missing required fields" });
    }

    const trialStartDate = new Date();
    const trialEndDate = new Date(trialStartDate.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    let existingUser = null;
    const maxRetries = 3;
    for (let i = 0; i < maxRetries; i++) {
      try {
        existingUser = await sanityClient.fetch(
          `*[_type == "User" && userId == $userId][0]`,
          { userId }
        );
        break;
      } catch (err) {
        if (i === maxRetries - 1) {
          elizaLogger.error("[CLIENT-DIRECT] Failed to fetch user after retries:", err);
          throw err;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (existingUser) {
      elizaLogger.debug(`[CLIENT-DIRECT] User already exists for userId: ${userId}`);
      return res.status(200).json({
        user: {
          _id: existingUser._id,
          userId: existingUser.userId,
          userType: existingUser.userType || "email",
          email: existingUser.email,
          name: existingUser.name,
          trialStartDate: existingUser.trialStartDate,
          trialEndDate: existingUser.trialEndDate,
          subscriptionStatus: existingUser.subscriptionStatus || "none",
          responseCount: existingUser.responseCount || 0,
          tokenCount: existingUser.tokenCount || 0,
          currentPeriodStart: existingUser.currentPeriodStart,
          currentPeriodEnd: existingUser.currentPeriodEnd,
          activePlugins: existingUser.activePlugins || [],
          activePriceIds: existingUser.activePriceIds || [],
          stripeCustomerId: existingUser.stripeCustomerId,
          stripeSubscriptionId: existingUser.stripeSubscriptionId,
          hasUsedTrial: existingUser.hasUsedTrial || false,
          cancelAtPeriodEnd: existingUser.cancelAtPeriodEnd || false,
          isConnected: existingUser.isConnected || false,
        }
      });
    }

    const user = await sanityClient.create({
      _type: "User",
      name,
      email,
      interest,
      referralSource,
      userId,
      createdAt: createdAt || new Date().toISOString(),
      userType: userType || "email",
      trialStartDate: trialStartDate.toISOString(),
      trialEndDate: trialEndDate.toISOString(),
      subscriptionStatus: "trialing",
      responseCount: 0,
      tokenCount: 0,
      currentPeriodStart: trialStartDate.toISOString(),
      currentPeriodEnd: trialEndDate.toISOString(),
      activePlugins: [],
      activePriceIds: [],
      hasUsedTrial: false,
      cancelAtPeriodEnd: false,
      isConnected: false,
    });

    elizaLogger.debug("[CLIENT-DIRECT] Created User:", {
      userId: user.userId,
      email: user.email,
      name: user.name,
      subscriptionStatus: user.subscriptionStatus,
      trialStartDate: user.trialStartDate,
      trialEndDate: user.trialEndDate,
      responseCount: user.responseCount,
      tokenCount: user.tokenCount,
      currentPeriodStart: user.currentPeriodStart,
      currentPeriodEnd: user.currentPeriodEnd,
      activePlugins: user.activePlugins,
      activePriceIds: user.activePriceIds,
    });

    res.json({
      user: {
        userId: user.userId,
        userType: user.userType || "email",
        email: user.email,
        name: user.name,
        trialStartDate: user.trialStartDate,
        trialEndDate: user.trialEndDate,
        subscriptionStatus: user.subscriptionStatus,
        responseCount: user.responseCount,
        tokenCount: user.tokenCount,
        currentPeriodStart: user.currentPeriodStart,
        currentPeriodEnd: user.currentPeriodEnd,
        activePlugins: user.activePlugins,
        activePriceIds: user.activePriceIds,
        stripeCustomerId: user.stripeCustomerId,
        stripeSubscriptionId: user.stripeSubscriptionId,
        hasUsedTrial: user.hasUsedTrial,
        cancelAtPeriodEnd: user.cancelAtPeriodEnd,
        isConnected: user.isConnected,
      }
    });
  } catch (error: any) {
    elizaLogger.error("[CLIENT-DIRECT] Error creating user:", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: "[CLIENT-DIRECT] Failed to create user", details: error.message });
  }
});

router.get("/user", async (req: express.Request, res: express.Response) => {
  try {
    const session = await Session.getSession(req, res, { sessionRequired: true });
    const userId = session.getUserId();
    let user = null;
    
    const maxRetries = 3;
    for (let i = 0; i < maxRetries; i++) {
      try {
        user = await sanityClient.fetch(
          `*[_type == "User" && userId == $userId][0]`,
          { userId }
        );
        elizaLogger.debug(`[USER_ENDPOINT] Raw Sanity user data for userId=${userId}:`, user);
        break;
      } catch (err) {
        if (i === maxRetries - 1) {
          elizaLogger.error("Failed to fetch user after retries:", err);
          throw err;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!user) {
      elizaLogger.warn(`User not found for userId=${userId}`);
      return res.status(404).json({ error: "User not found" });
    }

    elizaLogger.debug(`Fetched user data for userId=${userId}`);
    const responseUser = {
      _id: user._id,
      userId: user.userId,
      userType: user.userType || "email",
      email: user.email,
      name: user.name,
      trialStartDate: user.trialStartDate,
      trialEndDate: user.trialEndDate,
      subscriptionStatus: user.subscriptionStatus || "none",
      responseCount: user.responseCount || 0,
      tokenCount: user.tokenCount || 0,
      currentPeriodStart: user.currentPeriodStart,
      currentPeriodEnd: user.currentPeriodEnd,
      activePlugins: user.activePlugins || [],
      activePriceIds: user.activePriceIds || [],
      stripeCustomerId: user.stripeCustomerId,
      stripeSubscriptionId: user.stripeSubscriptionId,
      hasUsedTrial: user.hasUsedTrial || false,
      cancelAtPeriodEnd: user.cancelAtPeriodEnd || false,
      isConnected: user.isConnected || false,
    };

    elizaLogger.debug(`[USER_ENDPOINT] Response user data for userId=${userId}:`, responseUser);
    res.json({ user: responseUser });
  } catch (error: any) {
    // elizaLogger.error("Error in /user endpoint:", error);
    
    // Handle SuperTokens session errors properly
    if (error.type === "TRY_REFRESH_TOKEN") {
      elizaLogger.warn(`[USER_ENDPOINT] Session refresh required for user endpoint`);
      return res.status(401).json({ 
        message: "try refresh token",
        type: "TRY_REFRESH_TOKEN" 
      });
    }

    if (error.type === "UNAUTHORISED") {
      elizaLogger.warn(`[USER_ENDPOINT] Unauthorized access to user endpoint`);
      return res.status(401).json({ 
        message: "Unauthorized",
        type: "UNAUTHORISED" 
      });
    }

    // Generic error handling
    res.status(error.status || 500).json({ 
      error: error.message || "Failed to fetch user data" 
    });
  }
});

let cachedStats: { totalUsers: number; onlineUsers: number; timestamp: number } | null = null;
const cacheDuration = 60 * 1000; // Cache for 1 minute

router.get("/user-stats", async (req, res) => {
  try {
    if (cachedStats && Date.now() - cachedStats.timestamp < cacheDuration) {
      elizaLogger.debug("[CLIENT-DIRECT] Using cached user stats", cachedStats);
      return res.json({
        totalUsers: cachedStats.totalUsers,
        onlineUsers: cachedStats.onlineUsers
      });
    }

    const totalUsers = await sanityClient.fetch(
      `count(*[_type == "User"])`
    );

    const onlineUsers = await sanityClient.fetch(
      `count(*[_type == "User" && isConnected == true])`
    );

    cachedStats = { totalUsers, onlineUsers, timestamp: Date.now() };

    elizaLogger.debug("[CLIENT-DIRECT] Fetched user stats", {
      totalUsers,
      onlineUsers
    });

    return res.json({
      totalUsers,
      onlineUsers
    });
  } catch (error: any) {
    elizaLogger.error("[CLIENT-DIRECT] Error fetching user stats", {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: "Failed to fetch user stats", details: error.message });
  }
});

router.get("/items", async (req, res) => {
  try {
    const { itemType } = req.query;
    const items: Item[] = [];

    // 1. Fetch items from Sanity
    try {
      let query = `*[_type == "Item"]{id, name, description, price, itemType, pluginName, stripePriceId, features, isPopular, trialInfo, useCase}`;
      let params = {};

      if (itemType && typeof itemType === "string") {
        query = `*[_type == "Item" && itemType == $itemType]{id, name, description, price, itemType, pluginName, stripePriceId, features, isPopular, trialInfo, useCase}`;
        params = { itemType };
      }

      // Use params instead of { itemType }
      const sanityItems = await sanityClient.fetch(query, params);
      items.push(
        ...sanityItems.map((item: any) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          price: item.price,
          itemType: item.itemType,
          pluginName: item.pluginName || undefined, // New field for plugin-based subscriptions
          stripePriceId: item.stripePriceId || undefined, // New field for Stripe integration
          features: item.features || [], // Ensure features is an array, even if undefined
          isPopular: item.isPopular || false, // Default to false if undefined
          trialInfo: item.trialInfo || undefined, // Optional field
          useCase: item.useCase || undefined, // Optional field
          source: "sanity",
        }))
      );
      elizaLogger.debug(`Fetched ${sanityItems.length} items from Sanity`, { itemType });
    } catch (error) {
      elizaLogger.error("Error fetching items from Sanity:", error);
    }

    // 2. Fetch items from a microservice (simulated)
    // try {
    //   const microserviceUrl = "https://api.example.com/items"; // Replace with your microservice URL
    //   const response = await fetch(microserviceUrl);
    //   if (response.ok) {
    //     const microserviceItems = await response.json();
    //     items.push(
    //       ...microserviceItems.map((item: any) => ({
    //         id: item.id,
    //         name: item.name,
    //         description: item.description,
    //         price: item.price,
    //         itemType: item.itemType,
    //         pluginName: item.pluginName || undefined, // Support for plugin-based model
    //         stripePriceId: item.stripePriceId || undefined, // Support for Stripe integration
    //         features: item.features || [], // Add support for new fields
    //         isPopular: item.isPopular || false,
    //         trialInfo: item.trialInfo || undefined,
    //         useCase: item.useCase || undefined,
    //         source: "microservice1",
    //       }))
    //     );
    //     elizaLogger.debug(`Fetched ${microserviceItems.length} items from microservice`);
    //   } else {
    //     elizaLogger.warn("Microservice fetch failed:", response.statusText);
    //   }
    // } catch (error) {
    //   elizaLogger.error("Error fetching items from microservice:", error);
    // }

    // // 3. Add static fallback items (updated for plugin-based model)
    // const staticItems: Item[] = [
    //   {
    //     id: "static-base",
    //     name: "Base Plan",
    //     description: "Essential plan to access agentVooc dashboard and create characters.",
    //     price: 500, // $5.00
    //     itemType: "subscription",
    //     stripePriceId: "price_base_plan", // Stripe price ID for base plan
    //     features: [
    //       "Access to agentVooc dashboard",
    //       "Create unlimited AI characters",
    //       "Basic character management",
    //       "Community support",
    //     ],
    //     isPopular: false,
    //     trialInfo: "7-day free trial",
    //     useCase: "Required for dashboard access",
    //     source: "static",
    //   },
    //   {
    //     id: "static-plugin-email",
    //     name: "Email Plugin",
    //     description: "Enable email functionality for your AI characters.",
    //     price: 300, // $3.00
    //     itemType: "plugin",
    //     pluginName: "email",
    //     stripePriceId: "price_plugin_email",
    //     features: [
    //       "Send and receive emails",
    //       "Email templates",
    //       "Automated responses",
    //       "Email analytics",
    //     ],
    //     isPopular: true,
    //     trialInfo: "3-day free trial",
    //     useCase: "Best for customer support",
    //     source: "static",
    //   },
    //   {
    //     id: "static-plugin-twitter",
    //     name: "Twitter Plugin",
    //     description: "Connect your AI characters to Twitter/X platform.",
    //     price: 400, // $4.00
    //     itemType: "plugin",
    //     pluginName: "twitter",
    //     stripePriceId: "price_plugin_twitter",
    //     features: [
    //       "Post tweets automatically",
    //       "Respond to mentions",
    //       "Trend analysis",
    //       "Engagement metrics",
    //     ],
    //     isPopular: true,
    //     trialInfo: "3-day free trial",
    //     useCase: "Best for social media management",
    //     source: "static",
    //   },
    //   {
    //     id: "static-plugin-discord",
    //     name: "Discord Plugin",
    //     description: "Deploy your AI characters as Discord bots.",
    //     price: 350, // $3.50
    //     itemType: "plugin",
    //     pluginName: "discord",
    //     stripePriceId: "price_plugin_discord",
    //     features: [
    //       "Discord bot integration",
    //       "Server management",
    //       "Custom commands",
    //       "Voice channel support",
    //     ],
    //     isPopular: false,
    //     trialInfo: "3-day free trial",
    //     useCase: "Best for community management",
    //     source: "static",
    //   },
    //   // Legacy plans (commented out but kept for reference)
    //   // {
    //   //   id: "static-1",
    //   //   name: "Basic Plan",
    //   //   description: "A basic subscription plan for agentVooc.",
    //   //   price: 500, // $5.00
    //   //   itemType: "subscription",
    //   //   features: [
    //   //     "1 AI character",
    //   //     "100 conversations/month",
    //   //     "Basic RAG knowledge",
    //   //     "Sanity CMS access",
    //   //   ],
    //   //   isPopular: false,
    //   //   trialInfo: "7-day free trial",
    //   //   useCase: "Best for individuals",
    //   //   source: "static",
    //   // },
    //   // {
    //   //   id: "static-2",
    //   //   name: "Premium Plan",
    //   //   description: "A premium subscription plan for agentVooc.",
    //   //   price: 1500, // $15.00
    //   //   itemType: "subscription",
    //   //   features: [
    //   //     "5 AI characters",
    //   //     "1000 conversations/month",
    //   //     "Advanced RAG knowledge",
    //   //     "Priority support",
    //   //   ],
    //   //   isPopular: true,
    //   //   trialInfo: "30-day money-back guarantee",
    //   //   useCase: "Best for teams",
    //   //   source: "static",
    //   // },
    // ];
    // items.push(...staticItems);
    // elizaLogger.debug(`Added ${staticItems.length} static items`);

    // Remove duplicates (if any) based on id
    const uniqueItems = Array.from(
      new Map(items.map((item) => [item.id, item])).values()
    );

    res.json({ items: uniqueItems });
  } catch (error: any) {
    elizaLogger.error("Error in /items endpoint:", error);
    res.status(500).json({ error: "Failed to fetch items", details: error.message });
  }
});

router.get("/agents", async (req, res) => {
  try {
    const session = await Session.getSession(req, res, { sessionRequired: false });
    const userId = session?.getUserId();
    if (!userId) {
      elizaLogger.debug("[CLIENT-DIRECT] No session found for /agents request, returning empty agents list");
      return res.json({ agents: [] });
    }
    const User = await sanityClient.fetch(
      `*[_type == "User" && userId == $userId][0]`,
      { userId }
    );
    if (!User) {
      elizaLogger.warn(`[CLIENT-DIRECT] No User found for userId: ${userId}`);
      return res.status(404).json({ error: "User not found in Sanity" });
    }
    const characters = await sanityClient.fetch(
      `*[_type == "character" && createdBy._ref == $userRef && enabled == true]{
        id,
        _id,
        name,
        username,
        bio,
        enabled,
        createdBy,
        profile {
          image
        }
      }`,
      { userRef: User._id }
    );
    const agentsList = Array.from(agents.values())
      .filter((agent) => {
        const matchingChar = characters.find((char: any) => char.id === agent.agentId && char.enabled);
        if (!matchingChar) {
          elizaLogger.debug(`[CLIENT-DIRECT] No matching character found for agentId: ${agent.agentId}, name: ${agent.character.name}`);
        }
        return !!matchingChar;
      })
      .map((agent) => {
        const character = characters.find((char: any) => char.id === agent.agentId);
        return {
          id: agent.agentId,
          name: agent.character.name,
          username: character?.username,
          bio: character?.bio || [],
          clients: Object.keys(agent.clients),
          profile: character?.profile?.image
            ? { image: urlFor(character.profile.image).url() }
            : undefined, // Updated: Include profile.image as URL
        };
      });
    elizaLogger.debug(`[CLIENT-DIRECT] Filtered agents for user ${userId}:`, {
      count: agentsList.length,
      agents: agentsList,
    });
    res.json({ agents: agentsList });
  } catch (error) {
    // elizaLogger.warn("[CLIENT-DIRECT] Anon User Browsing Home || Error fetching agents", { message: error.message, stack: error.stack });
    res.status(500).json({ error: "[CLIENT-DIRECT] Failed to fetch agents", details: error.message });
  }
});

    router.get('/storage', async (req, res) => {
        try {
            const uploadDir = path.join(process.cwd(), "data", "characters");
            const files = await fs.promises.readdir(uploadDir);
            res.json({ files });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

router.get("/agents/:agentId", async (req, res) => {
    try {
        const session = await Session.getSession(req, res, { sessionRequired: true });
        const userId = session.getUserId();
        if (!userId) {
            elizaLogger.warn("[CLIENT-DIRECT] No userId found in session for /agents/:agentId");
            return res.status(401).json({ error: "[CLIENT-DIRECT] Unauthorized: No user ID found in session" });
        }
        const User = await sanityClient.fetch(
            `*[_type == "User" && userId == $userId][0]`,
            { userId }
        );
        if (!User) {
            elizaLogger.warn(`[CLIENT-DIRECT] No User found for userId: ${userId}`);
            return res.status(404).json({ error: "[CLIENT-DIRECT] User not found in Sanity" });
        }
        const { agentId } = validateUUIDParams(req.params, res) ?? { agentId: null };
        if (!agentId) return;
        const agent = agents.get(agentId);
        if (!agent) {
            res.status(404).json({ error: "Agent not found" });
            return;
        }
        // Check if the character belongs to the user
        const character = await sanityClient.fetch(
            `*[_type == "character" && id == $agentId && createdBy._ref == $userRef][0]`,
            { agentId, userRef: User._id }
        );
        if (!character) {
            elizaLogger.warn(`[CLIENT-DIRECT] Character not found for agentId: ${agentId} and userRef: ${User._id}`);
            return res.status(403).json({ error: "[CLIENT-DIRECT] Character not found or access denied" });
        }
        const characterData = agent.character;
        if (characterData?.settings?.secrets) {
            delete characterData.settings.secrets;
        }
        res.json({
            id: agent.agentId,
            character: characterData,
        });
    } catch (error) {
        elizaLogger.error("[CLIENT-DIRECT] Error fetching agent:", { message: error.message, stack: error.stack });
        res.status(500).json({ error: "[CLIENT-DIRECT] Failed to fetch agent", details: error.message });
    }
});

    router.delete("/agents/:agentId", async (req, res) => {
        const { agentId } = validateUUIDParams(req.params, res) ?? {
            agentId: null,
        };
        if (!agentId) return;

        const agent: AgentRuntime = agents.get(agentId);

        if (agent) {
            agent.stop();
            directClient.unregisterAgent(agent);
            res.status(204).json({ success: true });
        } else {
            res.status(404).json({ error: "Agent not found" });
        }
    });


// Define unique keys that require unique values across characters
const uniqueKeysRequired = [
  "EMAIL_OUTGOING_USER",
  "EMAIL_OUTGOING_PASS",
  "EMAIL_INCOMING_USER",
  "EMAIL_INCOMING_PASS",
  "TWITTER_USERNAME",
  "TWITTER_PASSWORD",
  "TWITTER_EMAIL",
  "TELEGRAM_BOT_TOKEN",
  "INSTAGRAM_USERNAME",
  "INSTAGRAM_PASSWORD",
  "INSTAGRAM_APP_ID",
];

// Helper function to fetch used key-value pairs for unique keys
async function getUsedUniqueKeyValues(excludeCharacterId = null) {
  const filter = excludeCharacterId ? `&& _id != $excludeId` : '';
  const query = `*[_type == "character" ${filter}]{
    "secrets": settings.secrets.dynamic[ @.key in $uniqueKeysRequired ]{key, value}
  }`;
  const params = {
    uniqueKeysRequired,
    ...(excludeCharacterId ? { excludeId: excludeCharacterId } : {})
  };
  const result = await sanityClient.fetch(query, params);
  const allSecrets = result.flatMap(char => char.secrets);
  const used = new Set(allSecrets.map(secret => `${secret.key}:${secret.value}`));
  return used;
}

// Fetch used hashes for unique keys
async function getUsedUniqueKeyHashes(excludeCharacterId: string | null = null) {
  const filter = excludeCharacterId ? `&& _id != $excludeId` : '';
  const query = `*[_type == "character" ${filter}]{
    "secrets": settings.secrets.dynamic[ @.key in $uniqueKeysRequired ]{key, hash}
  }`;
  const params = {
    uniqueKeysRequired,
    ...(excludeCharacterId ? { excludeId: excludeCharacterId } : {})
  };
  const result = await sanityClient.fetch(query, params);
  const allSecrets = result.flatMap((char: any) => char.secrets);
  return new Set(allSecrets.map((secret: any) => `${secret.key}:${secret.hash}`));
}

router.post('/check-duplicate-secrets', async (req, res) => {
  try {
    const session = await Session.getSession(req, res, { sessionRequired: true });
    const userId = session.getUserId();
    if (!userId) {
      elizaLogger.warn('[CLIENT-DIRECT] No userId found in session for duplicate check');
      return res.status(401).json({ error: '[CLIENT-DIRECT] Unauthorized: No user ID found in session' });
    }

    const { secrets, characterId } = req.body;
    if (!secrets || !Array.isArray(secrets)) {
      return res.status(400).json({ error: 'Secrets must be an array of { key, value } objects' });
    }

    const usedHashes = await getUsedUniqueKeyHashes(characterId || null);
    const duplicates: { key: string; value: string }[] = [];

    for (const secret of secrets) {
      if (uniqueKeysRequired.includes(secret.key)) {
        const hash = computeHash(secret.value);
        const keyHash = `${secret.key}:${hash}`;
        if (usedHashes.has(keyHash)) {
          duplicates.push({ key: secret.key, value: secret.value });
        }
      }
    }

    if (duplicates.length > 0) {
      return res.status(400).json({
        error: 'Duplicate secret values found',
        duplicates,
      });
    }

    res.json({ valid: true });
  } catch (error) {
    elizaLogger.error('[CLIENT-DIRECT] Error checking duplicates:', {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: '[CLIENT-DIRECT] Failed to check duplicates', details: error.message });
  }
});

router.post("/characters", async (req, res) => {
  try {
    const session = await Session.getSession(req, res, { sessionRequired: true });
    const userId = session.getUserId();
    if (!userId) {
      elizaLogger.warn("[CLIENT-DIRECT] No userId found in session for character creation");
      return res.status(401).json({ error: "[CLIENT-DIRECT] Unauthorized: No user ID found in session" });
    }
    const User = await sanityClient.fetch(
      `*[_type == "User" && userId == $userId][0]`,
      { userId }
    );
    if (!User) {
      elizaLogger.warn(`[CLIENT-DIRECT] No User found for userId: ${userId}`);
      return res.status(404).json({ error: "[CLIENT-DIRECT] User not found in Sanity" });
    }
    elizaLogger.debug(`[CLIENT-DIRECT] Creating character for user:`, {
      _id: User._id,
      userId: User.userId,
      name: User.name,
    });

    // Validate plugins against activePlugins
    const activePlugins = User.activePlugins || [];
    const { plugins } = req.body;
    if (plugins && Array.isArray(plugins)) {
      const invalidPlugins = plugins.filter(plugin => !activePlugins.includes(plugin));
      if (invalidPlugins.length > 0) {
        return res.status(403).json({
          error: `User does not have active subscriptions for plugins: ${invalidPlugins.join(", ")}`,
        });
      }
    }

    // Check subscription limits
    let limits;
    try {
      limits = await getUserSubscriptionLimits(userId);
    } catch (error) {
      elizaLogger.warn(`[CLIENT-DIRECT] Subscription check failed for userId: ${userId}`, error);
      return res.status(403).json({ error: "Unable to verify subscription limits, go to Settings to confirm" });
    }
    const existingAgentsCount = await sanityClient.fetch(
      `count(*[_type == "character" && createdBy._ref == $userRef])`,
      { userRef: User._id }
    );
    if (existingAgentsCount >= limits.maxAgents) {
      return res.status(403).json({ error: "Maximum number of agents reached for your subscription plan" });
    }

    const {
      id,
      name,
      username,
      system,
      bio,
      lore,
      messageExamples,
      postExamples,
      topics,
      adjectives,
      style,
      modelProvider,
      settings,
      knowledge,
      enabled = true,
    } = req.body;
    if (!id || !name) {
      return res.status(400).json({ error: "id and name are required" });
    }
    if (!validateUuid(id)) {
      return res.status(400).json({
        error: "Invalid id format. Expected to be a UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      });
    }
    const existingId = await sanityClient.fetch(
      `*[_type == "character" && id == $id][0]`,
      { id }
    );
    if (existingId) {
      return res.status(400).json({ error: "Character ID already exists" });
    }
    const existingName = await sanityClient.fetch(
      `*[_type == "character" && name == $name][0]`,
      { name }
    );
    if (existingName) {
      return res.status(400).json({ error: "Character name already exists" });
    }
    if (username) {
      const existingUsername = await sanityClient.fetch(
        `*[_type == "character" && username == $username][0]`,
        { username }
      );
      if (existingUsername) {
        return res.status(400).json({ error: "Username already exists" });
      }
    }
    const validModelProviders = ["OPENAI", "OLLAMA", "CUSTOM"];
    const validatedModelProvider = modelProvider && validModelProviders.includes(modelProvider)
      ? modelProvider
      : "OPENAI";
    let validatedSettings = settings || {
      secrets: { dynamic: [] },
      ragKnowledge: false,
      voice: { model: "default" },
      email: {
        outgoing: {},
        incoming: {}
      },
      ...settings
    };

  // Ensure secrets is always defined
    if (!validatedSettings.secrets) {
      validatedSettings.secrets = { dynamic: [] };
    }

    // Handle email plugin secrets
  if (plugins && plugins.includes('email')) {
  if (!validatedSettings.email?.outgoing?.service) {
    return res.status(400).json({ error: 'Email outgoing service is required when email plugin is enabled' });
  }
  if (validatedSettings.email.outgoing.service === 'smtp') {
    if (!validatedSettings.email.outgoing.host || !validatedSettings.email.outgoing.port) {
      return res.status(400).json({ error: 'SMTP host and port are required for SMTP service' });
    }
  }
  if (!validatedSettings.email.outgoing.user || !validatedSettings.email.outgoing.pass) {
    return res.status(400).json({ error: 'Email outgoing user and password are required' });
  }
  if (validatedSettings.email.incoming?.service === 'imap') {
    if (!validatedSettings.email.incoming.host || !validatedSettings.email.incoming.port) {
      return res.status(400).json({ error: 'IMAP host and port are required for IMAP service' });
    }
    if (!validatedSettings.email.incoming.user || !validatedSettings.email.incoming.pass) {
      return res.status(400).json({ error: 'IMAP user and password are required' });
    }
  }

      // Filter out existing email-related secrets
      validatedSettings.secrets.dynamic = validatedSettings.secrets.dynamic.filter(
        (item: any) => ![
          'EMAIL_OUTGOING_USER',
          'EMAIL_OUTGOING_PASS',
          'EMAIL_OUTGOING_SERVICE',
          'EMAIL_OUTGOING_HOST',
          'EMAIL_OUTGOING_PORT',
          'EMAIL_SECURE',
          'EMAIL_INCOMING_SERVICE',
          'EMAIL_INCOMING_HOST',
          'EMAIL_INCOMING_PORT',
          'EMAIL_INCOMING_USER',
          'EMAIL_INCOMING_PASS',
        ].includes(item.key)
      );

       // Check if incoming and outgoing credentials are the same
  const isSameCredentials =
    validatedSettings.email?.outgoing?.user === validatedSettings.email?.incoming?.user &&
    validatedSettings.email?.outgoing?.pass === validatedSettings.email?.incoming?.pass;

  // Add email secrets
  if (validatedSettings.email?.outgoing?.user) {
    validatedSettings.secrets.dynamic.push(
      { key: 'EMAIL_OUTGOING_USER', value: validatedSettings.email.outgoing.user },
      { key: 'EMAIL_OUTGOING_PASS', value: validatedSettings.email.outgoing.pass },
      { key: 'EMAIL_OUTGOING_SERVICE', value: validatedSettings.email.outgoing.service }
    );
    if (validatedSettings.email.outgoing.service === 'smtp') {
      validatedSettings.secrets.dynamic.push(
        { key: 'EMAIL_OUTGOING_HOST', value: validatedSettings.email.outgoing.host },
        { key: 'EMAIL_OUTGOING_PORT', value: String(validatedSettings.email.outgoing.port) },
        { key: 'EMAIL_SECURE', value: String(validatedSettings.email.outgoing.secure || false) }
      );
    }
  }

  // Only add incoming secrets if they differ from outgoing or if explicitly provided
  if (validatedSettings.email?.incoming?.user && !isSameCredentials) {
    validatedSettings.secrets.dynamic.push(
      { key: 'EMAIL_INCOMING_SERVICE', value: validatedSettings.email.incoming.service || 'imap' },
      { key: 'EMAIL_INCOMING_HOST', value: validatedSettings.email.incoming.host },
      { key: 'EMAIL_INCOMING_PORT', value: String(validatedSettings.email.incoming.port || 993) },
      { key: 'EMAIL_INCOMING_USER', value: validatedSettings.email.incoming.user },
      { key: 'EMAIL_INCOMING_PASS', value: validatedSettings.email.incoming.pass }
    );
  } else if (isSameCredentials) {
    // Reference outgoing credentials for incoming
    validatedSettings.secrets.dynamic.push(
      { key: 'EMAIL_INCOMING_SERVICE', value: validatedSettings.email.incoming.service || 'imap' },
      { key: 'EMAIL_INCOMING_HOST', value: validatedSettings.email.incoming.host || validatedSettings.email.outgoing.host },
      { key: 'EMAIL_INCOMING_PORT', value: String(validatedSettings.email.incoming.port || 993) },
      { key: 'EMAIL_INCOMING_USER', value: validatedSettings.email.outgoing.user },
      { key: 'EMAIL_INCOMING_PASS', value: validatedSettings.email.outgoing.pass }
    );
  }
}

    // Add duplicate key check within character
if (validatedSettings.secrets.dynamic.length > 0) {
  const secretKeys = validatedSettings.secrets.dynamic.map((item: Secret) => item.key);
  const uniqueKeys = new Set(secretKeys);
  if (uniqueKeys.size !== secretKeys.length) {
    return res.status(400).json({ error: 'Invalid key: Duplicate keys found in secrets' });
  }
}

  // Check for unique key values across characters
    const usedHashes = await getUsedUniqueKeyHashes();
    const newUniqueSecrets = validatedSettings.secrets.dynamic.filter((secret: Secret) => uniqueKeysRequired.includes(secret.key));
    for (const secret of newUniqueSecrets) {
      const hash = computeHash(secret.value!);
      const keyHash = `${secret.key}:${hash}`;
      if (usedHashes.has(keyHash)) {
        return res.status(400).json({ error: `Key ${secret.key} is already used by another character` });
      }
    }

     // Encrypt all secrets
    validatedSettings.secrets.dynamic = validatedSettings.secrets.dynamic.map((secret: Secret) => {
      const encrypted = encryptValue(secret.value!);
      return {
        key: secret.key,
        encryptedValue: {
          iv: encrypted.iv,
          ciphertext: encrypted.ciphertext,
        },
        hash: uniqueKeysRequired.includes(secret.key) ? computeHash(secret.value!) : undefined,
      };
    });
    validatedSettings.secrets.dynamic = ensureKeys(validatedSettings.secrets.dynamic);


    const validatedMessageExamples = messageExamples
  ? ensureKeys(
      Array.isArray(messageExamples)
        ? messageExamples.reduce((acc, example, index) => {
            let messages = [];
            // Handle [[{user, content}, ...], ...]
            if (Array.isArray(example)) {
              messages = example.map((msg: any) => ({
                user: typeof msg.user === 'string' && msg.user ? msg.user : '',
                content: {
                  text: typeof msg.content?.text === 'string' && msg.content.text ? msg.content.text : '',
                  action: typeof msg.content?.action === 'string' ? msg.content.action : undefined,
                },
              }));
            }
            // Handle [{ messages: [...] }, ...]
            else if (example.messages && Array.isArray(example.messages)) {
              messages = example.messages.map((msg: any) => ({
                user: typeof msg.user === 'string' && msg.user ? msg.user : '',
                content: {
                  text: typeof msg.content?.text === 'string' && msg.content.text ? msg.content.text : '',
                  action: typeof msg.content?.action === 'string' ? msg.content.action : undefined,
                },
              }));
            }
            // Handle [{user, content}, ...] (flat array case)
            else if (example.user && example.content) {
              messages = [{
                user: typeof example.user === 'string' && example.user ? example.user : '',
                content: {
                  text: typeof example.content?.text === 'string' && example.content.text ? example.content.text : '',
                  action: typeof example.content?.action === 'string' ? example.content.action : undefined,
                },
              }];
            }
            // Only add valid conversations
            if (messages.length > 0) {
              acc.push({ messages: ensureKeys(messages) });
            }
            return acc;
          }, [])
        : []
    )
  : [];
elizaLogger.debug("[CLIENT-DIRECT] req.body.messageExamples:", JSON.stringify(req.body.messageExamples, null, 2));
elizaLogger.debug("[CLIENT-DIRECT] validatedMessageExamples:", JSON.stringify(validatedMessageExamples, null, 2));
    const validatedKnowledge = knowledge
      ? ensureKeys(
          knowledge.map((item: any) =>
            item._type === 'reference' ? item : { ...item, directory: item.directory, shared: item.shared ?? false }
          )
        )
      : [];
    const validatedBio = Array.isArray(bio) ? bio : [];
    const validatedLore = Array.isArray(lore) ? lore : [];
    const validatedPostExamples = Array.isArray(postExamples) ? postExamples : [];
    const validatedTopics = Array.isArray(topics) ? topics : [];
    const validatedAdjectives = Array.isArray(adjectives) ? adjectives : [];
    const validatedStyle = style && typeof style === "object"
      ? {
          all: Array.isArray(style.all) ? style.all : [],
          chat: Array.isArray(style.chat) ? style.chat : [],
          post: Array.isArray(style.post) ? style.post : [],
        }
      : { all: [], chat: [], post: [] };

    const mappedPlugins = await mapSanityPlugins(plugins || []);    


    // Do not populate settings.secrets; let startAgent handle it
    const secrets: { [key: string]: string } = {};


    const characterDoc = {
  _type: "character",
  id,
  name,
  username: username || undefined,
  system: system || "",
  bio: validatedBio,
  lore: validatedLore,
  messageExamples: validatedMessageExamples,
  postExamples: validatedPostExamples,
  topics: validatedTopics,
  adjectives: validatedAdjectives,
  style: validatedStyle,
  modelProvider: validatedModelProvider,
  plugins: plugins || [],
  settings: validatedSettings, // Remove nested settings
  knowledge: validatedKnowledge,
  enabled,
  createdBy: {
    _type: "reference",
    _ref: User._id,
  },
};
    const createdCharacter = await sanityClient.create(characterDoc);
    elizaLogger.debug(`[CLIENT-DIRECT] Character created:`, {
      _id: createdCharacter._id,
      id: createdCharacter.id,
      name: createdCharacter.name,
      createdBy: createdCharacter.createdBy,
    });
    try {
      const character: Character = {
        id,
        name,
        username: username || undefined,
        system: system || "",
        bio: validatedBio,
        lore: validatedLore,
  messageExamples: validatedMessageExamples.map((conv: any) => conv.messages || []),        postExamples: validatedPostExamples,
        topics: validatedTopics,
        adjectives: validatedAdjectives,
        style: validatedStyle,
        modelProvider: validatedModelProvider.toLowerCase() as any,
        plugins: mappedPlugins,
        settings: {
          secrets,
          secretsDynamic: validatedSettings.secrets.dynamic,
          ragKnowledge: validatedSettings.ragKnowledge,
          voice: validatedSettings.voice,
          email: validatedSettings.email,
        },
        knowledge: validatedKnowledge,
        createdBy: { _type: "reference", _ref: User._id },
        enabled,
      };
      const agentRuntime = await directClient.startAgent(character);
      directClient.registerAgent(agentRuntime);
      elizaLogger.debug(`[CLIENT-DIRECT] ${name} agent started and registered, agentId: ${agentRuntime.agentId}`);
    } catch (error) {
      elizaLogger.error(`[CLIENT-DIRECT] Failed to start agent:`, {
        message: error.message,
        stack: error.stack,
      });
      await sanityClient.delete(createdCharacter._id);
      return res.status(500).json({ error: "[CLIENT-DIRECT] Failed to start agent", details: error.message });
    }
    res.json({ character: createdCharacter });
  } catch (error) {
    elizaLogger.error("[CLIENT-DIRECT] Error creating character:", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: "[CLIENT-DIRECT] Failed to create character", details: error.message });
  }
});


router.get("/characters", async (req, res) => {
  let userId; // Declare userId at the top to ensure it's in scope
  try {
    const session = await Session.getSession(req, res, { sessionRequired: true });
    userId = session.getUserId();
    if (!userId) {
      elizaLogger.warn("[CLIENT-DIRECT] No userId found in session", { userId: null });
      return res.status(401).json({ error: "[CLIENT-DIRECT] Unauthorized: No user ID found in session" });
    }
    
    elizaLogger.info("[CLIENT-DIRECT] Fetching characters for user", { userId });

    const User = await sanityClient.fetch(
      `*[_type == "User" && userId == $userId][0]`,
      { userId }
    );
    if (!User) {
      elizaLogger.warn("[CLIENT-DIRECT] No User found for userId", { userId });
      return res.status(404).json({ error: "[CLIENT-DIRECT] User not found in Sanity" });
    }

    elizaLogger.info("[CLIENT-DIRECT] User found", { 
      userId, 
      sanityUserId: User._id 
    });

    const query = `
      *[_type == "character" && createdBy._ref == $userId] {
        _id,
        id,
        name,
        username,
        system,
        bio,
        lore,
        topics,
        adjectives,
        postExamples,
        messageExamples,
        modelProvider,
        plugins,
        settings,
        style,
        knowledge,
        enabled,
        profile {
          image
        }
      }
    `;
    const agents = await sanityClient.fetch(query, { userId });

    elizaLogger.info("[CLIENT-DIRECT] Characters fetched", { 
      userId,
      characterCount: agents.length,
      characterIds: agents.map(agent => agent.id)
    });

    const processedAgents = agents.map(agent => ({
      ...agent,
      profile: agent.profile?.image
        ? { image: urlFor(agent.profile.image).url() }
        : undefined,
    }));

    elizaLogger.info("[CLIENT-DIRECT] Characters processed", { 
      userId,
      characterCount: processedAgents.length
    });

    res.json({ agents: processedAgents });
  } catch (error) {
    elizaLogger.error("[CLIENT-DIRECT] Error fetching characters", { 
      userId: userId || null, // Fallback to null if userId is undefined
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: "[CLIENT-DIRECT] Failed to fetch characters", details: error.message });
  }
});

// New endpoint: GET /characters/:characterId
router.get("/characters/:characterId", async (req, res) => {
  let userId; // Declare userId at the top to ensure it's in scope
  try {
    const session = await Session.getSession(req, res, { sessionRequired: true });
    userId = session.getUserId();
    if (!userId) {
      elizaLogger.warn("[CLIENT-DIRECT] No userId found in session", { userId: null });
      return res.status(401).json({ error: "[CLIENT-DIRECT] Unauthorized: No user ID found in session" });
    }

    elizaLogger.info("[CLIENT-DIRECT] Fetching character", { 
      userId, 
      characterId: req.params.characterId 
    });

    const User = await sanityClient.fetch(
      `*[_type == "User" && userId == $userId][0]`,
      { userId }
    );
    if (!User) {
      elizaLogger.warn("[CLIENT-DIRECT] No User found for userId", { userId });
      return res.status(404).json({ error: "[CLIENT-DIRECT] User not found in Sanity" });
    }

    elizaLogger.info("[CLIENT-DIRECT] User found for character fetch", { 
      userId, 
      sanityUserId: User._id 
    });

    const { characterId } = req.params;
    if (!validateUuid(characterId)) {
      elizaLogger.warn("[CLIENT-DIRECT] Invalid characterId format", { 
        userId, 
        characterId 
      });
      return res.status(400).json({
        error: "Invalid characterId format. Expected to be a UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      });
    }

    const query = `
      *[_type == "character" && id == $characterId && createdBy._ref == $userRef][0] {
        _id,
        id,
        name,
        username,
        system,
        bio,
        lore,
        topics,
        adjectives,
        postExamples,
        messageExamples,
        modelProvider,
        plugins,
        settings,
        style,
        knowledge,
        enabled,
        profile {
          image
        }
      }
    `;
    const character = await sanityClient.fetch(query, { characterId, userRef: User._id });

    if (!character) {
      elizaLogger.warn("[CLIENT-DIRECT] Character not found", { 
        userId, 
        characterId, 
        userRef: User._id 
      });
      return res.status(404).json({ error: "[CLIENT-DIRECT] Character not found or access denied" });
    }

    elizaLogger.info("[CLIENT-DIRECT] Character fetched", { 
      userId, 
      characterId, 
      characterName: character.name,
      characterUsername: character.username
    });

    const processedCharacter = {
      ...character,
      profile: character.profile?.image
        ? { image: urlFor(character.profile.image).url() }
        : undefined,
    };

    elizaLogger.info("[CLIENT-DIRECT] Character processed", { 
      userId, 
      characterId, 
      hasProfileImage: !!processedCharacter.profile?.image 
    });

    res.json({ character: processedCharacter });
  } catch (error) {
    elizaLogger.error("[CLIENT-DIRECT] Error fetching character", { 
      userId: userId || null, // Fallback to null if userId is undefined
      characterId: req.params.characterId, 
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: "[CLIENT-DIRECT] Failed to fetch character", details: error.message });
  }
});

    
    async function mapSanityPlugins(plugins: any[]): Promise<Plugin[]> {
      const pluginPromises = plugins.map(async (plugin: any): Promise<Plugin | undefined> => {
        try {
          let pluginName: string;
          let pluginConfig: any = {};
          if (typeof plugin === "string") {
            pluginName = plugin;
          } else if (typeof plugin === "object" && plugin?.name) {
            pluginName = plugin.name;
            pluginConfig = plugin;
          } else {
            elizaLogger.warn(`[CLIENT-DIRECT] Invalid plugin format:`, plugin);
            return undefined;
          }
    
          let pluginModule;
          switch (pluginName) {
            case "telegram":
              try {
                pluginModule = await import("@elizaos-plugins/client-telegram");
                if (!pluginModule.default && !pluginModule.telegramPlugin) {
                  elizaLogger.error(`[CLIENT-DIRECT] Plugin ${pluginName} has no valid default or named (telegramPlugin) export`);
                  return undefined;
                }
                return {
                  name: "telegram",
                  description: pluginConfig.description || "Telegram client plugin",
                  clients: pluginConfig.clients || (pluginModule.default?.clients || pluginModule.telegramPlugin?.clients) || [],
                  actions: pluginConfig.actions || (pluginModule.default?.actions || pluginModule.telegramPlugin?.actions) || [],
                };
              } catch (error) {
                elizaLogger.error(`[Client-Direct] Failed to import plugin ${pluginName}:`, {
                  message: error.message,
                  stack: error.stack,
                });
                return undefined;
              }
            case "twitter":
              try {
                pluginModule = await import("@elizaos-plugins/plugin-twitter");
                if (!pluginModule.default && !pluginModule.twitterPlugin) {
                  elizaLogger.error(`[CLIENT-DIRECT] Plugin ${pluginName} has no valid default or named (twitterPlugin) export`);
                  return undefined;
                }
                return {
                  name: "twitter",
                  description: pluginConfig.description || "Twitter plugin",
                  actions: pluginConfig.actions || (pluginModule.default?.actions || pluginModule.twitterPlugin?.actions) || [],
                  services: pluginModule.default?.services || [], // Add services
                };
              } catch (error) {
                elizaLogger.error(`[Client-Direct] Failed to import plugin ${pluginName}:`, {
                  message: error.message,
                  stack: error.stack,
                });
                return undefined;
              }
                      case "email":
          try {
            pluginModule = await import("@elizaos-plugins/plugin-email");
            if (!pluginModule.default && !pluginModule.emailPlugin) {
              elizaLogger.error(`[CLIENT-DIRECT] Plugin ${pluginName} has no valid default or named (emailPlugin) export`);
              return undefined;
            }
            return {
              name: "email",
              description: pluginConfig.description || "Email client plugin",
              clients: pluginConfig.clients || (pluginModule.default?.clients || pluginModule.emailPlugin?.clients) || [],
              actions: pluginConfig.actions || pluginModule.default?.actions || [], // Add actions
            };
          } catch (error) {
            elizaLogger.error(`[Client-Direct] Failed to import plugin ${pluginName}:`, {
              message: error.message,
              stack: error.stack,
            });
            return undefined;
          }
            default:
              elizaLogger.warn(`[CLIENT-DIRECT] Unknown plugin: ${pluginName}`);
              return undefined;
          }
          
        } catch (error) {
          elizaLogger.error(`[CLIENT-DIRECT] Unexpected error processing plugin ${plugin}:`, {
            message: error.message,
            stack: error.stack,
          });
          return undefined;
        }
      });
    
      const mappedPlugins = (await Promise.all(pluginPromises)).filter(
        (plugin): plugin is Plugin => plugin !== undefined
      );
      return mappedPlugins;
    }
    
    // In the PATCH /characters/:characterId endpoint
router.patch("/characters/:characterId", async (req, res) => {
  try {
    const session = await Session.getSession(req, res, { sessionRequired: true });
    const userId = session.getUserId();
    const { characterId } = req.params;

    const User = await sanityClient.fetch(
      `*[_type == "User" && userId == $userId][0]`,
      { userId }
    );
    if (!User) {
      elizaLogger.warn(`[CLIENT-DIRECT] No User found for userId: ${userId}`);
      return res.status(404).json({ error: "[CLIENT-DIRECT] User not found in Sanity" });
    }

    // Validate plugins against activePlugins
    const activePlugins = User.activePlugins || [];
    const { plugins } = req.body;
    if (plugins && Array.isArray(plugins)) {
      const invalidPlugins = plugins.filter(plugin => !activePlugins.includes(plugin));
      if (invalidPlugins.length > 0) {
        return res.status(403).json({
          error: `User does not have active subscriptions for plugins: ${invalidPlugins.join(", ")}`,
        });
      }
    }

    const character = await sanityClient.fetch(
      `*[_type == "character" && id == $characterId && createdBy._ref == $userRef][0]`,
      { characterId, userRef: User._id }
    );
    if (!character) {
      elizaLogger.warn(`[CLIENT-DIRECT] Character not found for characterId: ${characterId} and userRef: ${User._id}`);
      return res.status(404).json({ error: "[CLIENT-DIRECT] Character not found or access denied" });
    }

    const {
      name,
      username,
      system,
      bio,
      lore,
      messageExamples,
      postExamples,
      topics,
      adjectives,
      style,
      modelProvider,
      settings,
      knowledge,
      enabled,
      plugins: updatedPlugins
    } = req.body;

    // Validate input
    if (
      !name &&
      !username &&
      !system &&
      !bio &&
      !lore &&
      messageExamples === undefined &&
      !postExamples &&
      !topics &&
      !adjectives &&
      !style &&
      !modelProvider &&
      !settings &&
      !knowledge &&
      enabled === undefined &&
      !updatedPlugins
    ) {
      return res.status(400).json({ error: "At least one field is required to update" });
    }

    // Validate fields
    if (name && typeof name !== 'string') {
      return res.status(400).json({ error: "Name must be a string" });
    }
    if (name) {
      const existingName = await sanityClient.fetch(
        `*[_type == "character" && name == $name && _id != $characterId][0]`,
        { name, characterId: character._id }
      );
      if (existingName) {
        return res.status(400).json({ error: "Character name already exists" });
      }
    }
    if (username && typeof username !== 'string') {
      return res.status(400).json({ error: "Username must be a string" });
    }
    if (username) {
      const existingUsername = await sanityClient.fetch(
        `*[_type == "character" && username == $username && _id != $characterId][0]`,
        { username, characterId: character._id }
      );
      if (existingUsername) {
        return res.status(400).json({ error: "Username already exists" });
      }
    }

    const validModelProviders = ["OPENAI", "OLLAMA", "CUSTOM"];
    const validatedModelProvider = modelProvider && validModelProviders.includes(modelProvider)
      ? modelProvider
      : character.modelProvider;

    // Validate and transform messageExamples
    let validatedMessageExamples = character.messageExamples;
    if (messageExamples !== undefined) {
      validatedMessageExamples = Array.isArray(messageExamples)
        ? messageExamples.reduce((acc, example, index) => {
            let messages = [];
            if (Array.isArray(example)) {
              messages = example.map((msg) => ({
                user: typeof msg.user === 'string' && msg.user ? msg.user : '',
                content: {
                  text: typeof msg.content?.text === 'string' && msg.content.text ? msg.content.text : '',
                  action: typeof msg.content?.action === 'string' ? msg.content.action : undefined,
                },
              }));
            } else if (example.messages && Array.isArray(example.messages)) {
              messages = example.messages.map((msg) => ({
                user: typeof msg.user === 'string' && msg.user ? msg.user : '',
                content: {
                  text: typeof msg.content?.text === 'string' && msg.content.text ? msg.content.text : '',
                  action: typeof msg.content?.action === 'string' ? msg.content.action : undefined,
                },
              }));
            } else if (example.user && example.content) {
              messages = [{
                user: typeof example.user === 'string' && example.user ? example.user : '',
                content: {
                  text: typeof example.content?.text === 'string' && example.content.text ? example.content.text : '',
                  action: typeof example.content?.action === 'string' ? example.content.action : undefined,
                },
              }];
            }
            if (messages.length > 0) {
              acc.push({
                _key: example._key || character.messageExamples[index]?._key || crypto.randomUUID(),
                messages: ensureKeys(messages)
              });
            }
            return acc;
          }, [])
        : [];
      elizaLogger.debug("[CLIENT-DIRECT] validatedMessageExamples:", JSON.stringify(validatedMessageExamples, null, 2));
    }

    // Validate other fields
    const validatedBio = bio ? (Array.isArray(bio) ? bio : []) : character.bio;
    const validatedLore = lore ? (Array.isArray(lore) ? lore : []) : character.lore;
    const validatedPostExamples = postExamples ? (Array.isArray(postExamples) ? postExamples : []) : character.postExamples;
    const validatedTopics = topics ? (Array.isArray(topics) ? topics : []) : character.topics;
    const validatedAdjectives = adjectives ? (Array.isArray(adjectives) ? adjectives : []) : character.adjectives;
    const validatedStyle = style && typeof style === "object"
      ? {
          all: Array.isArray(style.all) ? style.all : character.style?.all || [],
          chat: Array.isArray(style.chat) ? style.chat : character.style?.chat || [],
          post: Array.isArray(style.post) ? style.post : character.style?.post || [],
        }
      : character.style;
    const validatedKnowledge = knowledge
      ? ensureKeys(
          knowledge.map((item) =>
            item._type === 'reference' ? item : { ...item, directory: item.directory, shared: item.shared ?? false }
          )
        )
      : character.knowledge;

     // Initialize validatedSettings, preserving existing settings
    let validatedSettings = { ...character.settings, ...settings };
    if (!validatedSettings.secrets || typeof validatedSettings.secrets !== "object") {
      elizaLogger.debug("[CLIENT-DIRECT] Initializing validatedSettings.secrets as { dynamic: [] } in PATCH");
      validatedSettings.secrets = { dynamic: [] };
    }
    if (!Array.isArray(validatedSettings.secrets.dynamic)) {
      elizaLogger.debug("[CLIENT-DIRECT] Setting validatedSettings.secrets.dynamic to [] in PATCH");
      validatedSettings.secrets.dynamic = [];
    }


    // Handle email plugin secrets, preserving existing secrets if not updated
    if (updatedPlugins && updatedPlugins.includes("email")) {
      if (!validatedSettings.email?.outgoing?.service) {
        return res.status(400).json({ error: "Email outgoing service is required when email plugin is enabled" });
      }
      if (validatedSettings.email.outgoing.service === "smtp") {
        if (!validatedSettings.email.outgoing.host || !validatedSettings.email.outgoing.port) {
          return res.status(400).json({ error: "SMTP host and port are required for SMTP service" });
        }
      }
      // Only validate user/pass if provided in the update
      if (settings?.email?.outgoing?.user || settings?.email?.outgoing?.pass) {
        if (!validatedSettings.email.outgoing.user || !validatedSettings.email.outgoing.pass) {
          return res.status(400).json({ error: "Email outgoing user and password are required when updating email settings" });
        }
      }
      if (validatedSettings.email.incoming?.service === "imap") {
        if (!validatedSettings.email.incoming.host || !validatedSettings.email.incoming.port) {
          return res.status(400).json({ error: "IMAP host and port are required for IMAP service" });
        }
        // Only validate incoming user/pass if provided
        if (settings?.email?.incoming?.user || settings?.email?.incoming?.pass) {
          if (!validatedSettings.email.incoming.user || !validatedSettings.email.incoming.pass) {
            return res.status(400).json({ error: "IMAP user and password are required when updating incoming email settings" });
          }
        }
      }

      // Preserve existing secrets if not updated
      let existingSecrets = character.settings.secrets?.dynamic || [];
      validatedSettings.secrets.dynamic = existingSecrets.filter(
        (item) => ![
          "EMAIL_OUTGOING_SERVICE",
          "EMAIL_OUTGOING_HOST",
          "EMAIL_OUTGOING_PORT",
          "EMAIL_OUTGOING_USER",
          "EMAIL_OUTGOING_PASS",
          "EMAIL_SECURE",
          "EMAIL_INCOMING_SERVICE",
          "EMAIL_INCOMING_HOST",
          "EMAIL_INCOMING_PORT",
          "EMAIL_INCOMING_USER",
          "EMAIL_INCOMING_PASS"
        ].includes(item.key)
      );



       // Check if incoming and outgoing credentials are the same
  // Add new email secrets if provided
      const isSameCredentials =
        validatedSettings.email?.outgoing?.user === validatedSettings.email?.incoming?.user &&
        validatedSettings.email?.outgoing?.pass === validatedSettings.email?.incoming?.pass;

      if (validatedSettings.email?.outgoing?.user) {
        validatedSettings.secrets.dynamic.push(
          { key: "EMAIL_OUTGOING_USER", value: validatedSettings.email.outgoing.user },
          { key: "EMAIL_OUTGOING_PASS", value: validatedSettings.email.outgoing.pass },
          { key: "EMAIL_OUTGOING_SERVICE", value: validatedSettings.email.outgoing.service }
        );
        if (validatedSettings.email.outgoing.service === "smtp") {
          validatedSettings.secrets.dynamic.push(
            { key: "EMAIL_OUTGOING_HOST", value: validatedSettings.email.outgoing.host },
            { key: "EMAIL_OUTGOING_PORT", value: String(validatedSettings.email.outgoing.port) },
            { key: "EMAIL_SECURE", value: String(validatedSettings.email.outgoing.secure || true) }
          );
        }
      }

      if (validatedSettings.email?.incoming?.user && !isSameCredentials) {
        validatedSettings.secrets.dynamic.push(
          { key: "EMAIL_INCOMING_SERVICE", value: validatedSettings.email.incoming.service || "imap" },
          { key: "EMAIL_INCOMING_HOST", value: validatedSettings.email.incoming.host },
          { key: "EMAIL_INCOMING_PORT", value: String(validatedSettings.email.incoming.port || 993) },
          { key: "EMAIL_INCOMING_USER", value: validatedSettings.email.incoming.user },
          { key: "EMAIL_INCOMING_PASS", value: validatedSettings.email.incoming.pass }
        );
      } else if (isSameCredentials) {
        validatedSettings.secrets.dynamic.push(
          { key: "EMAIL_INCOMING_SERVICE", value: validatedSettings.email.incoming.service || "imap" },
          { key: "EMAIL_INCOMING_HOST", value: validatedSettings.email.incoming.host || validatedSettings.email.outgoing.host },
          { key: "EMAIL_INCOMING_PORT", value: String(validatedSettings.email.incoming.port || 993) },
          { key: "EMAIL_INCOMING_USER", value: validatedSettings.email.outgoing.user },
          { key: "EMAIL_INCOMING_PASS", value: validatedSettings.email.outgoing.pass }
        );
      }

      // Log secrets for debugging
      elizaLogger.debug("[CLIENT-DIRECT] Secrets after processing:", validatedSettings.secrets.dynamic);
    }

   //duplicate key check within character
if (settings && settings.secrets && settings.secrets.dynamic && settings.secrets.dynamic.length > 0) {
  const secretKeys = settings.secrets.dynamic.map((item: Secret) => item.key);
  const uniqueKeys = new Set(secretKeys);
  if (uniqueKeys.size !== secretKeys.length) {
    return res.status(400).json({ error: 'Invalid key: Duplicate keys found in secrets' });
  }
}

    // Check for unique key values across characters
const usedHashes = await getUsedUniqueKeyHashes(character._id);
const updatedUniqueSecrets = validatedSettings.secrets.dynamic.filter((secret: Secret) => uniqueKeysRequired.includes(secret.key));
for (const secret of updatedUniqueSecrets) {
  const hash = computeHash(secret.value!);
  const keyHash = `${secret.key}:${hash}`;
  if (usedHashes.has(keyHash)) {
    return res.status(400).json({ error: `Key ${secret.key} is already used by another character` });
  }
}

    // Encrypt all secrets
    validatedSettings.secrets.dynamic = validatedSettings.secrets.dynamic.map((secret: Secret) => {
      if (!secret.value) {
        // Preserve existing encrypted secret if no new value provided
        const existingSecret = character.settings.secrets?.dynamic?.find(s => s.key === secret.key);
        if (existingSecret) {
          return existingSecret;
        }
        elizaLogger.warn(`[CLIENT-DIRECT] No value provided for secret ${secret.key}, skipping encryption`);
        return secret;
      }
      const encrypted = encryptValue(secret.value);
      return {
        key: secret.key,
        encryptedValue: { iv: encrypted.iv, ciphertext: encrypted.ciphertext },
        hash: uniqueKeysRequired.includes(secret.key) ? computeHash(secret.value) : undefined,
      };
    });
    validatedSettings.secrets.dynamic = ensureKeys(validatedSettings.secrets.dynamic);


    // Construct update fields
    const updateFields = {
      ...(name && { name }),
      ...(username && { username }),
      ...(system && { system }),
      ...(bio && { bio: validatedBio }),
      ...(lore && { lore: validatedLore }),
      ...(messageExamples !== undefined && { messageExamples: validatedMessageExamples }),
      ...(postExamples && { postExamples: validatedPostExamples }),
      ...(topics && { topics: validatedTopics }),
      ...(adjectives && { adjectives: validatedAdjectives }),
      ...(style && { style: validatedStyle }),
      ...(knowledge && { knowledge: validatedKnowledge }),
      ...(settings && { settings: validatedSettings }),
      ...(enabled !== undefined && { enabled }),
      ...(updatedPlugins && { plugins: updatedPlugins }),
      ...(modelProvider && { modelProvider: validatedModelProvider }),
      updatedAt: new Date().toISOString(),
    };

    // Update character in Sanity
    const updatedCharacter = await sanityClient
      .patch(character._id)
      .set(updateFields)
      .commit();
    elizaLogger.debug(`[CLIENT-DIRECT] Updated character in Sanity: characterId=${characterId}, name=${updatedCharacter.name}`);

    // Map plugins to Plugin objects
    const mappedPlugins = await mapSanityPlugins(updatedCharacter.plugins || []);

    
    const requiredSecrets = {
      twitter: ['TWITTER_USERNAME', 'TWITTER_PASSWORD'],
      telegram: ['TELEGRAM_BOT_TOKEN'],
      email: ['EMAIL_OUTGOING_USER', 'EMAIL_OUTGOING_PASS'],
    };
    for (const plugin of mappedPlugins) {
      const neededKeys = requiredSecrets[plugin.name];
      if (neededKeys) {
        for (const key of neededKeys) {
          const secretExists = validatedSettings.secrets.dynamic.some((item: Secret) => item.key === key);
          if (!secretExists) {
            elizaLogger.warn(
              `[CLIENT-DIRECT] Missing secret ${key} for plugin ${plugin.name} in character ${updatedCharacter.name}`
            );
          }
        }
      }
    }

    // Construct full Character object for runtime
    const validatedBioFinal = Array.isArray(updatedCharacter.bio) ? updatedCharacter.bio : [];
    const validatedLoreFinal = Array.isArray(updatedCharacter.lore) ? updatedCharacter.lore : [];
    const validatedMessageExamplesFinal = Array.isArray(updatedCharacter.messageExamples) ? updatedCharacter.messageExamples : [];
    const validatedPostExamplesFinal = Array.isArray(updatedCharacter.postExamples) ? updatedCharacter.postExamples : [];
    const validatedTopicsFinal = Array.isArray(updatedCharacter.topics) ? updatedCharacter.topics : [];
    const validatedAdjectivesFinal = Array.isArray(updatedCharacter.adjectives) ? updatedCharacter.adjectives : [];
    const validatedStyleFinal = updatedCharacter.style && typeof updatedCharacter.style === "object"
      ? {
          all: Array.isArray(updatedCharacter.style.all) ? updatedCharacter.style.all : [],
          chat: Array.isArray(updatedCharacter.style.chat) ? updatedCharacter.style.chat : [],
          post: Array.isArray(updatedCharacter.style.post) ? updatedCharacter.style.post : [],
        }
      : { all: [], chat: [], post: [] };

    const characterData = {
  id: validateUuid(characterId) ? characterId : (() => { throw new Error("Invalid UUID format for characterId"); })(),
  name: updatedCharacter.name,
  username: updatedCharacter.username || updatedCharacter.name,
  system: updatedCharacter.system || "",
  bio: validatedBioFinal,
  lore: validatedLoreFinal,
  messageExamples: validatedMessageExamplesFinal.map((conv) => conv.messages || []),
  postExamples: validatedPostExamplesFinal,
  topics: validatedTopicsFinal,
  adjectives: validatedAdjectivesFinal,
  style: validatedStyleFinal,
  modelProvider: validatedModelProvider.toLowerCase(),
  plugins: mappedPlugins,
  settings: {
    ...updatedCharacter.settings,
    secrets: {}, // Empty object, consistent with router.post
    secretsDynamic: updatedCharacter.settings.secrets?.dynamic || [], // Rename to secretsDynamic
  },
  knowledge: updatedCharacter.knowledge || [],
  profile: updatedCharacter.profile || undefined,
  createdBy: {
    _type: "reference",
    _ref: User._id,
  },
  enabled: updatedCharacter.enabled ?? true,
};

    // Log characterData for debugging
    elizaLogger.debug("[CLIENT-DIRECT] characterData for startAgent:", {
      characterId,
      secretsDynamic: characterData.settings.secrets.dynamic,
    });

    // Stop and unregister existing agent
    try {
      const agent = agents.get(characterId);
      if (agent) {
        agent.stop();
        directClient.unregisterAgent(agent);
        agents.delete(characterId);
        elizaLogger.debug(`[CLIENT-DIRECT] Stopped and unregistered agent for characterId=${characterId}`);
      }
    } catch (error) {
      elizaLogger.warn(`[CLIENT-DIRECT] Error stopping existing agent for characterId=${characterId}:`, error);
    }

    // Start new agent
    try {
      const newAgent = await directClient.startAgent(characterData);
      agents.set(characterId, newAgent);
      directClient.registerAgent(newAgent);
      elizaLogger.debug(`[CLIENT-DIRECT] Started and registered new agent for characterId=${characterId}, agentId=${newAgent.agentId}`);
    } catch (error) {
      elizaLogger.error(`[CLIENT-DIRECT] Failed to start agent for characterId=${characterId}:`, {
        message: error.message,
        stack: error.stack,
      });
      return res.status(500).json({ error: "[CLIENT-DIRECT] Failed to initialize agent after update", details: error.message });
    }

    res.json({ character: updatedCharacter });
  } catch (error) {
    elizaLogger.error("[CLIENT-DIRECT] Error updating character:", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: "[CLIENT-DIRECT] Failed to update character", details: error.message });
  }
});

// Delete Character
router.delete("/characters/:characterId", async (req, res) => {
  try {
    const session = await Session.getSession(req, res, { sessionRequired: true });
    const userId = session.getUserId();
    const { characterId } = req.params;

    // Fetch User document to get _id
    const User = await sanityClient.fetch(
      `*[_type == "User" && userId == $userId][0]`,
      { userId }
    );
    if (!User) {
      elizaLogger.warn(`[CLIENT-DIRECT] No User found for userId: ${userId}`);
      return res.status(404).json({ error: "[CLIENT-DIRECT] User not found in Sanity" });
    }

    // Validate that the character exists and belongs to the user
    const character = await sanityClient.fetch(
      `*[_type == "character" && id == $characterId && createdBy._ref == $userRef][0]`,
      { characterId, userRef: User._id }
    );
    if (!character) {
      elizaLogger.warn(`[CLIENT-DIRECT] Character not found for characterId: ${characterId} and userRef: ${User._id}`);
      return res.status(404).json({ error: "[CLIENT-DIRECT] Character not found or access denied" });
    }

    // Delete associated knowledge items
    const knowledgeItems = await sanityClient.fetch(
      `*[_type == "knowledge" && agentId == $characterId]`,
      { characterId }
    );
    for (const knowledge of knowledgeItems) {
      await sanityClient.delete(knowledge._id);
      elizaLogger.debug(`[CLIENT-DIRECT] Deleted knowledge item: knowledgeId=${knowledge.id}, characterId=${characterId}`);
    }

    // Delete character from Sanity
    await sanityClient.delete(character._id);
    elizaLogger.debug(`[CLIENT-DIRECT] Deleted character: characterId=${characterId}, name=${character.name}`);

    // Stop and unregister the agent
    const agent = agents.get(characterId);
    if (agent) {
      agent.stop();
      directClient.unregisterAgent(agent);
      elizaLogger.debug(`[CLIENT-DIRECT] Agent stopped and unregistered for characterId=${characterId}`);
    }

    res.status(204).end();
  } catch (error) {
    elizaLogger.error("[CLIENT-DIRECT] Error deleting character:", error);
    res.status(500).json({ error: "[CLIENT-DIRECT] Failed to delete character", details: error.message });
  }
});

router.post('/webhooks/sanity/knowledge', async (req, res) => {
    elizaLogger.debug('[WEBHOOK] Received request', { headers: req.headers, body: req.body });

    const document = req.body; // Document fields are in req.body directly
    const operation = req.headers['sanity-operation']; // Get operation from header

    // Validate payload
    if (!document || !document.agentId || !document.id || !operation) {
        elizaLogger.warn('[WEBHOOK] Invalid payload received:', { body: req.body, operation });
        return res.status(400).json({ error: 'Invalid payload: missing agentId, id, or operation' });
    }

    const agentId = document.agentId;
    const agent = agents.get(agentId);

    if (!agent) {
        elizaLogger.warn(`[WEBHOOK] Agent not found for agentId: ${agentId}`);
        return res.status(404).json({ error: 'Agent not found' });
    }

    const knowledgeManager = agent.ragKnowledgeManager;

    try {
        if (operation === 'create' || operation === 'update') {
            // Remove existing knowledge and chunks
            await knowledgeManager.removeKnowledge(document.id);
            const chunksSql = "DELETE FROM knowledge WHERE json_extract(content, '$.metadata.originalId') = ?";
            agent.databaseAdapter.db.prepare(chunksSql).run(document.id);
            elizaLogger.debug(`[WEBHOOK] Removed existing knowledge and chunks for id: ${document.id}`);

            // Generate embedding for the new/updated knowledge
            const text = document.text;
            const embeddingArray = await embed(agent, text);
            const embedding = new Float32Array(embeddingArray);

            // Create new knowledge item
            const knowledgeItem: RAGKnowledgeItem = {
                id: document.id,
                agentId: document.agentId,
                content: {
                    text: document.text,
                    metadata: document.metadata || {},
                },
                embedding,
                createdAt: new Date(document.createdAt || Date.now()).getTime(),
            };

            await knowledgeManager.createKnowledge(knowledgeItem);
            elizaLogger.debug(`[WEBHOOK] Processed ${operation} for knowledge id: ${document.id}, agentId: ${agentId}`);
        } else if (operation === 'delete') {
            // Remove knowledge and its chunks
            await knowledgeManager.removeKnowledge(document.id);
            const chunksSql = "DELETE FROM knowledge WHERE json_extract(content, '$.metadata.originalId') = ?";
            agent.databaseAdapter.db.prepare(chunksSql).run(document.id);
            elizaLogger.debug(`[WEBHOOK] Deleted knowledge id: ${document.id} and its chunks for agentId: ${agentId}`);
        } else {
            elizaLogger.warn(`[WEBHOOK] Unsupported operation: ${operation}`);
            return res.status(400).json({ error: `Unsupported operation: ${operation}` });
        }

        return res.status(200).json({ success: true });
    } catch (error) {
        elizaLogger.error('[WEBHOOK] Error processing webhook:', error);
        return res.status(500).json({ error: 'Failed to process webhook', details: error.message });
    }
});
    // character Knowledge
    // GET /agents/:agentId/knowledge
router.get("/agents/:agentId/knowledge", async (req, res) => {
  try {
    const session = await Session.getSession(req, res, { sessionRequired: true });
    const userId = session.getUserId();
    const { agentId } = req.params;

    // Fetch User document to get _id
    const User = await sanityClient.fetch(
      `*[_type == "User" && userId == $userId][0]`,
      { userId }
    );
    if (!User) {
      elizaLogger.warn(`[CLIENT-DIRECT] No User found for userId: ${userId}`);
      return res.status(404).json({ error: "[CLIENT-DIRECT] User not found in Sanity" });
    }

    // Validate that the character belongs to the user
    const character = await sanityClient.fetch(
      `*[_type == "character" && id == $agentId && createdBy._ref == $userRef][0]`,
      { agentId, userRef: User._id }
    );
    if (!character) {
      elizaLogger.warn(`[CLIENT-DIRECT] Character not found for agentId: ${agentId} and userRef: ${User._id}`);
      return res.status(403).json({ error: "[CLIENT-DIRECT] Character not found or access denied" });
    }

    // Fetch knowledge items for this agent
    const knowledgeItems = await sanityClient.fetch(
      `*[_type == "knowledge" && agentId == $agentId]`,
      { agentId }
    );
    res.json({ knowledge: knowledgeItems });
  } catch (error) {
    elizaLogger.error("[CLIENT-DIRECT] Error fetching knowledge:", error);
    res.status(500).json({ error: "[CLIENT-DIRECT] Failed to fetch knowledge" });
  }
});

// POST /agents/:agentId/knowledge
router.post("/agents/:agentId/knowledge", async (req, res) => {
  try {
    const session = await Session.getSession(req, res, { sessionRequired: true });
    const userId = session.getUserId();
    const { agentId } = req.params;

    const User = await sanityClient.fetch(
      `*[_type == "User" && userId == $userId][0]`,
      { userId }
    );
    if (!User) {
      elizaLogger.warn(`[CLIENT-DIRECT] No User found for userId: ${userId}`);
      return res.status(404).json({ error: "[CLIENT-DIRECT] User not found in Sanity" });
    }

    const character = await sanityClient.fetch(
      `*[_type == "character" && id == $agentId && createdBy._ref == $userRef][0]{settings}`,
      { agentId, userRef: User._id }
    );
    if (!character) {
      elizaLogger.warn(`[CLIENT-DIRECT] Character not found for agentId: ${agentId} and userRef: ${User._id}`);
      return res.status(403).json({ error: "[CLIENT-DIRECT] Character not found or access denied" });
    }
    if (!character.settings?.ragKnowledge) {
      return res.status(403).json({ error: "[CLIENT-DIRECT] Knowledge feature is not enabled for this character" });
    }

    // Check subscription limits**
    let limits;
    try {
      limits = await getUserSubscriptionLimits(userId);
    } catch (error) {
      elizaLogger.warn(`[CLIENT-DIRECT] Subscription check failed for userId: ${userId}`, error);
      return res.status(403).json({ error: "Unable to verify subscription limits" });
    }
    const existingDocsCount = await sanityClient.fetch(
      `count(*[_type == "knowledge" && agentId == $agentId])`,
      { agentId }
    );
    if (existingDocsCount >= limits.maxKnowledgeDocsPerAgent) {
      return res.status(403).json({ error: "Maximum number of knowledge documents reached for this agent" });
    }
    const existingDocs = await sanityClient.fetch(
      `*[_type == "knowledge" && agentId == $agentId]{text}`,
      { agentId }
    );
    const currentTotalChars = existingDocs.reduce((sum, doc) => sum + (doc.text?.length || 0), 0);

    const { name, text, metadata } = req.body;
    if (!name || !text) {
      return res.status(400).json({ error: "[CLIENT-DIRECT] Name and text are required" });
    }
    if (text.length > limits.maxCharsPerKnowledgeDoc) {
      return res.status(403).json({
        error: `Knowledge document exceeds maximum characters allowed: ${limits.maxCharsPerKnowledgeDoc}`,
      });
    }
    if (currentTotalChars + text.length > limits.maxTotalCharsPerAgent) {
      return res.status(403).json({
        error: "Adding this knowledge document would exceed the total character limit for the agent",
      });
    }

    const knowledgeId = uuidv4();
    const knowledgeDoc = {
      _type: "knowledge",
      id: knowledgeId,
      name,
      agentId: req.params.agentId,
      text,
      metadata: metadata || {},
      createdAt: new Date().toISOString(),
    };
    const createdKnowledge = await sanityClient.create(knowledgeDoc);

    res.json({ knowledge: createdKnowledge });
  } catch (error) {
    elizaLogger.error("[CLIENT-DIRECT] Error creating knowledge:", error);
    res.status(500).json({ error: "[CLIENT-DIRECT] Failed to create knowledge" });
  }
});

// PATCH /agents/:agentId/knowledge/:knowledgeId
router.patch("/agents/:agentId/knowledge/:knowledgeId", async (req, res) => {
  try {
    const session = await Session.getSession(req, res, { sessionRequired: true });
    const userId = session.getUserId();
    const { agentId, knowledgeId } = req.params;

    elizaLogger.debug(`[PATCH] Processing knowledge update for agentId: ${agentId}, knowledgeId: ${knowledgeId}`);

    const User = await sanityClient.fetch(
      `*[_type == "User" && userId == $userId][0]`,
      { userId }
    );
    if (!User) {
      elizaLogger.warn(`[CLIENT-DIRECT] No User found for userId: ${userId}`);
      return res.status(404).json({ error: "[CLIENT-DIRECT] User not found in Sanity" });
    }

    const character = await sanityClient.fetch(
      `*[_type == "character" && id == $agentId && createdBy._ref == $userRef][0]{settings}`,
      { agentId, userRef: User._id }
    );
    if (!character) {
      elizaLogger.warn(`[CLIENT-DIRECT] Character not found for agentId: ${agentId}, userRef: ${User._id}`);
      return res.status(403).json({ error: "[CLIENT-DIRECT] Character not found or access denied" });
    }
    if (!character.settings?.ragKnowledge) {
      return res.status(403).json({ error: "[CLIENT-DIRECT] Knowledge feature is not enabled for this character" });
    }

    const knowledge = await sanityClient.fetch(
      `*[_type == "knowledge" && id == $knowledgeId && agentId == $agentId][0]{_id, text}`,
      { knowledgeId, agentId }
    );
    if (!knowledge || !knowledge._id) {
      elizaLogger.warn(`[CLIENT-DIRECT] Knowledge not found or missing _id for knowledgeId: ${knowledgeId}, agentId: ${agentId}`);
      return res.status(404).json({ error: "[CLIENT-DIRECT] Knowledge item not found or invalid" });
    }

    let limits;
    try {
      limits = await getUserSubscriptionLimits(userId);
    } catch (error) {
      elizaLogger.error(`[CLIENT-DIRECT] Failed to fetch subscription limits for userId: ${userId}`, error);
      return res.status(500).json({ error: "[CLIENT-DIRECT] Unable to verify subscription limits", details: error.message });
    }

    const existingDocs = await sanityClient.fetch(
      `*[_type == "knowledge" && agentId == $agentId && id != $knowledgeId]{text}`,
      { agentId, knowledgeId }
    );
    const currentTotalChars = existingDocs.reduce((sum, doc) => sum + (doc.text?.length || 0), 0);
    const oldTextLength = knowledge.text?.length || 0;

    const { name, text, metadata } = req.body;
    elizaLogger.debug(`[PATCH] Request body:`, { name, textLength: text?.length, metadata });
    if (!name && !text && !metadata) {
      return res.status(400).json({ error: "[CLIENT-DIRECT] At least one field (name, text, or metadata) is required" });
    }
    const newTextLength = text ? text.length : oldTextLength;
    if (newTextLength > limits.maxCharsPerKnowledgeDoc) {
      return res.status(403).json({
        error: `Updated knowledge document exceeds maximum characters allowed: ${limits.maxCharsPerKnowledgeDoc}`,
      });
    }
    if (currentTotalChars - oldTextLength + newTextLength > limits.maxTotalCharsPerAgent) {
      return res.status(403).json({
        error: "Updating this knowledge document would exceed the total character limit for the agent",
      });
    }

    const updatedKnowledge = await sanityClient
      .patch(knowledge._id)
      .set({
        ...(name && { name }),
        ...(text && { text }),
        ...(metadata && { metadata }),
        updatedAt: new Date().toISOString(),
      })
      .commit();

    elizaLogger.debug(`[CLIENT-DIRECT] Updated knowledge item: knowledgeId=${knowledgeId}, agentId=${agentId}`);
    res.json({ knowledge: updatedKnowledge });
  } catch (error) {
    elizaLogger.error("[CLIENT-DIRECT] Error updating knowledge:", {
      error: error.message,
      stack: error.stack,
      agentId: req.params.agentId,
      knowledgeId: req.params.knowledgeId,
      requestBody: req.body,
    });
    res.status(500).json({ error: "[CLIENT-DIRECT] Failed to update knowledge", details: error.message });
  }
});

// DELETE /agents/:agentId/knowledge/:knowledgeId
router.delete("/agents/:agentId/knowledge/:knowledgeId", async (req, res) => {
  try {
    const session = await Session.getSession(req, res, { sessionRequired: true });
    const userId = session.getUserId();
    const { agentId, knowledgeId } = req.params;

    // Fetch User document to get _id
    const User = await sanityClient.fetch(
      `*[_type == "User" && userId == $userId][0]`,
      { userId }
    );
    if (!User) {
      elizaLogger.warn(`[CLIENT-DIRECT] No User found for userId: ${userId}`);
      return res.status(404).json({ error: "[CLIENT-DIRECT] User not found in Sanity" });
    }

    // Validate character ownership and ragKnowledge setting
    const character = await sanityClient.fetch(
      `*[_type == "character" && id == $agentId && createdBy._ref == $userRef][0]{settings}`,
      { agentId, userRef: User._id }
    );
    if (!character) {
      elizaLogger.warn(`[CLIENT-DIRECT] Character not found for agentId: ${agentId} and userRef: ${User._id}`);
      return res.status(403).json({ error: "[CLIENT-DIRECT] Character not found or access denied" });
    }
    if (!character.settings?.ragKnowledge) {
      return res.status(403).json({ error: "[CLIENT-DIRECT] Knowledge feature is not enabled for this character" });
    }

    // Validate knowledge item exists and belongs to the agent
    const knowledge = await sanityClient.fetch(
      `*[_type == "knowledge" && id == $knowledgeId && agentId == $agentId][0]`,
      { knowledgeId, agentId }
    );
    if (!knowledge) {
      elizaLogger.warn(`[CLIENT-DIRECT] Knowledge not found for knowledgeId: ${knowledgeId} and agentId: ${agentId}`);
      return res.status(404).json({ error: "[CLIENT-DIRECT] Knowledge item not found" });
    }

    // Delete knowledge document
    await sanityClient.delete(knowledge._id);
    elizaLogger.debug(`[CLIENT-DIRECT] Deleted knowledge item: knowledgeId=${knowledgeId}, agentId=${agentId}`);
    res.status(204).json({ success: true });
  } catch (error) {
    elizaLogger.error("[CLIENT-DIRECT] Error deleting knowledge:", error);
    res.status(500).json({ error: "[CLIENT-DIRECT] Failed to delete knowledge" });
  }
});



// Google OAuth callback
// Google OAuth callback
router.get("/auth/callback/google", async (req, res) => {
  elizaLogger.debug("[CLIENT-DIRECT] Handling /auth/callback/google GET request");
  try {
    const session = await Session.getSession(req, res, { sessionRequired: false });
    const userId = session?.getUserId();

    if (!userId) {
      elizaLogger.error("[CLIENT-DIRECT] No session found in Google OAuth callback");
      return res.status(401).json({ error: "[CLIENT-DIRECT] No session found" });
    }

    // Fetch user info from SuperTokens
    const userInfo = await SuperTokens.getUserById(userId);
    if (!userInfo) {
      elizaLogger.error("[CLIENT-DIRECT] User not found in SuperTokens");
      return res.status(404).json({ error: "[CLIENT-DIRECT] User not found in SuperTokens" });
    }

    const email = userInfo.emails?.[0];
    const name =
      userInfo.loginMethods.find((lm) => lm.thirdParty?.thirdPartyId === "google")?.thirdParty?.userInfo?.name ||
      "Google User";

    const existingUser = await sanityClient.fetch(
      `*[_type == "User" && userId == $userId][0]`,
      { userId }
    );

    res.redirect(`${process.env.WEBSITE_DOMAIN}/home`);
  } catch (error) {
    elizaLogger.error("[CLIENT-DIRECT] Error in Google OAuth callback:", error);
    res.status(500).json({ error: "[CLIENT-DIRECT] Failed to process Google OAuth callback", details: error.message });
  }
});



router.post("/agents/:agentId/set", async (req, res) => {
  const { agentId } = validateUUIDParams(req.params, res) ?? {
    agentId: null,
  };
  if (!agentId) return;

  let agent: AgentRuntime = agents.get(agentId);

  if (agent) {
    agent.stop();
    directClient.unregisterAgent(agent);
  }

  const characterJson = { ...req.body };
  const character = req.body;
  try {
    validateCharacterConfig(character);
  } catch (e) {
    elizaLogger.error(`[CLIENT-DIRECT] Error parsing character: ${e}`);
    res.status(400).json({
      success: false,
      message: e.message,
    });
    return;
  }

  // Add _key to arrays requiring it
  if (character.settings?.secrets?.dynamic) {
    character.settings.secrets.dynamic = ensureKeys(character.settings.secrets.dynamic);
  }
  const validatedMessageExamples = character.messageExamples
    ? ensureKeys(
        character.messageExamples.map((example: any) => ({
          ...example,
          conversation: ensureKeys(example.conversation || []),
        }))
      )
    : [];
  const validatedKnowledge = character.knowledge
    ? ensureKeys(
        character.knowledge.map((item: any) =>
          item._type === 'reference' ? item : { ...item, directory: item.directory, shared: item.shared ?? false }
        )
      )
    : [];
  character.messageExamples = validatedMessageExamples;
  character.knowledge = validatedKnowledge;

  // Check if character exists in Sanity and update if necessary
  const existingCharacter = await sanityClient.fetch(
    `*[_type == "character" && id == $agentId][0]`,
    { agentId }
  );
  if (existingCharacter) {
    await sanityClient
      .patch(existingCharacter._id)
      .set({
        name: character.name,
        username: character.username,
        system: character.system || "",
        bio: character.bio || [],
        lore: character.lore || [],
        messageExamples: validatedMessageExamples,
        postExamples: character.postExamples || [],
        topics: character.topics || [],
        adjectives: character.adjectives || [],
        style: character.style || { all: [], chat: [], post: [] },
        modelProvider: character.modelProvider || "OPENAI",
        plugins: character.plugins || [],
        settings: character.settings || {
          secrets: { dynamic: [] },
          ragKnowledge: false,
          voice: { model: "default" },
        },
        knowledge: validatedKnowledge,
        updatedAt: new Date().toISOString(),
      })
      .commit();
    elizaLogger.debug(`[CLIENT-DIRECT] Updated character in Sanity: id=${agentId}`);
  }

  try {
    agent = await directClient.startAgent(character);
    elizaLogger.log(`[CLIENT-DIRECT] ${character.name} started`);
  } catch (e) {
    elizaLogger.error(`[CLIENT-DIRECT] Error starting agent: ${e}`);
    res.status(500).json({
      success: false,
      message: e.message,
    });
    return;
  }

  if (process.env.USE_CHARACTER_STORAGE === "true") {
    try {
      const filename = `${agent.agentId}.json`;
      const uploadDir = path.join(process.cwd(), "data", "characters");
      const filepath = path.join(uploadDir, filename);
      await fs.promises.mkdir(uploadDir, { recursive: true });
      await fs.promises.writeFile(
        filepath,
        JSON.stringify({ ...characterJson, id: agent.agentId }, null, 2)
      );
      elizaLogger.debug(`[CLIENT-DIRECT] Character stored successfully at ${filepath}`);
    } catch (error) {
      elizaLogger.error(`[CLIENT-DIRECT] Failed to store character: ${error.message}`);
    }
  }

  res.json({
    id: character.id,
    character,
  });
});

    // router.get("/agents/:agentId/channels", async (req, res) => {
    //     const { agentId } = validateUUIDParams(req.params, res) ?? {
    //         agentId: null,
    //     };
    //     if (!agentId) return;

    //     const runtime = agents.get(agentId);

    //     if (!runtime) {
    //         res.status(404).json({ error: "Runtime not found" });
    //         return;
    //     }

    //     const API_TOKEN = runtime.getSetting("DISCORD_API_TOKEN") as string;
    //     const rest = new REST({ version: "10" }).setToken(API_TOKEN);

    //     try {
    //         const guilds = (await rest.get(Routes.userGuilds())) as Array<any>;

    //         res.json({
    //             id: runtime.agentId,
    //             guilds: guilds,
    //             serverCount: guilds.length,
    //         });
    //     } catch (error) {
    //         console.error("Error fetching guilds:", error);
    //         res.status(500).json({ error: "Failed to fetch guilds" });
    //     }
    // });

    router.get("/agents/:agentId/:roomId/memories", async (req, res) => {
        const { agentId, roomId } = validateUUIDParams(req.params, res) ?? {
            agentId: null,
            roomId: null,
        };
        if (!agentId || !roomId) return;

        let runtime = agents.get(agentId);

        // if runtime is null, look for runtime with the same name
        if (!runtime) {
            runtime = Array.from(agents.values()).find(
                (a) => a.character.name.toLowerCase() === agentId.toLowerCase()
            );
        }

        if (!runtime) {
            res.status(404).send("Agent not found");
            return;
        }

        try {
            const memories = await runtime.messageManager.getMemories({
                roomId,
            });
            const response = {
                agentId,
                roomId,
                memories: memories.map((memory) => ({
                    id: memory.id,
                    userId: memory.userId,
                    agentId: memory.agentId,
                    createdAt: memory.createdAt,
                    content: {
                        text: memory.content.text,
                        action: memory.content.action,
                        source: memory.content.source,
                        url: memory.content.url,
                        inReplyTo: memory.content.inReplyTo,
                        attachments: memory.content.attachments?.map(
                            (attachment) => ({
                                id: attachment.id,
                                url: attachment.url,
                                title: attachment.title,
                                source: attachment.source,
                                description: attachment.description,
                                text: attachment.text,
                                contentType: attachment.contentType,
                            })
                        ),
                    },
                    embedding: memory.embedding,
                    roomId: memory.roomId,
                    unique: memory.unique,
                    similarity: memory.similarity,
                })),
            };

            res.json(response);
        } catch (error) {
            console.error("[CLIENT-DIRECT] Error fetching memories:", error);
            res.status(500).json({ error: "[CLIENT-DIRECT] Failed to fetch memories" });
        }
    });

    // router.get("/tee/agents", async (req, res) => {
    //     try {
    //         const allAgents = [];

    //         for (const agentRuntime of agents.values()) {
    //             const teeLogService = agentRuntime
    //                 .getService<TeeLogService>(ServiceType.TEE_LOG)
    //                 .getInstance();

    //             const agents = await teeLogService.getAllAgents();
    //             allAgents.push(...agents);
    //         }

    //         const runtime: AgentRuntime = agents.values().next().value;
    //         const teeLogService = runtime
    //             .getService<TeeLogService>(ServiceType.TEE_LOG)
    //             .getInstance();
    //         const attestation = await teeLogService.generateAttestation(
    //             JSON.stringify(allAgents)
    //         );
    //         res.json({ agents: allAgents, attestation: attestation });
    //     } catch (error) {
    //         elizaLogger.error("[CLIENT-DIRECT] Failed to get TEE agents:", error);
    //         res.status(500).json({
    //             error: "[CLIENT-DIRECT] Failed to get TEE agents",
    //         });
    //     }
    // });

    // router.get("/tee/agents/:agentId", async (req, res) => {
    //     try {
    //         const agentId = req.params.agentId;
    //         const agentRuntime = agents.get(agentId);
    //         if (!agentRuntime) {
    //             res.status(404).json({ error: "Agent not found" });
    //             return;
    //         }

    //         const teeLogService = agentRuntime
    //             .getService<TeeLogService>(ServiceType.TEE_LOG)
    //             .getInstance();

    //         const teeAgent = await teeLogService.getAgent(agentId);
    //         const attestation = await teeLogService.generateAttestation(
    //             JSON.stringify(teeAgent)
    //         );
    //         res.json({ agent: teeAgent, attestation: attestation });
    //     } catch (error) {
    //         elizaLogger.error("[CLIENT-DIRECT] Failed to get TEE agent:", error);
    //         res.status(500).json({
    //             error: "[CLIENT-DIRECT] Failed to get TEE agent",
    //         });
    //     }
    // });

    // router.post(
    //     "/tee/logs",
    //     async (req: express.Request, res: express.Response) => {
    //         try {
    //             const query = req.body.query || {};
    //             const page = Number.parseInt(req.body.page) || 1;
    //             const pageSize = Number.parseInt(req.body.pageSize) || 10;

    //             const teeLogQuery: TeeLogQuery = {
    //                 agentId: query.agentId || "",
    //                 roomId: query.roomId || "",
    //                 userId: query.userId || "",
    //                 type: query.type || "",
    //                 containsContent: query.containsContent || "",
    //                 startTimestamp: query.startTimestamp || undefined,
    //                 endTimestamp: query.endTimestamp || undefined,
    //             };
    //             const agentRuntime: AgentRuntime = agents.values().next().value;
    //             const teeLogService = agentRuntime
    //                 .getService<TeeLogService>(ServiceType.TEE_LOG)
    //                 .getInstance();
    //             const pageQuery = await teeLogService.getLogs(
    //                 teeLogQuery,
    //                 page,
    //                 pageSize
    //             );
    //             const attestation = await teeLogService.generateAttestation(
    //                 JSON.stringify(pageQuery)
    //             );
    //             res.json({
    //                 logs: pageQuery,
    //                 attestation: attestation,
    //             });
    //         } catch (error) {
    //             elizaLogger.error("[CLIENT-DIRECT] Failed to get TEE logs:", error);
    //             res.status(500).json({
    //                 error: "[CLIENT-DIRECT] Failed to get TEE logs",
    //             });
    //         }
    //     }
    // );

    router.post("/agent/start", async (req, res) => {
        const { characterPath, characterJson } = req.body;
        console.log("characterPath:", characterPath);
        console.log("characterJson:", characterJson);
        try {
            let character: Character;
            if (characterJson) {
                character = await directClient.jsonToCharacter(
                    characterPath,
                    characterJson
                );
            } else if (characterPath) {
                character =
                    await directClient.loadCharacterTryPath(characterPath);
            } else {
                throw new Error("No character path or JSON provided");
            }
            await directClient.startAgent(character);
            elizaLogger.log(`[CLIENT-DIRECT] ${character.name} started`);

            res.json({
                id: character.id,
                character: character,
            });
        } catch (e) {
            elizaLogger.error(`[CLIENT-DIRECT] Error parsing character: ${e}`);
            res.status(400).json({
                error: e.message,
            });
            return;
        }
    });

    router.post("/agents/:agentId/stop", async (req, res) => {
        const agentId = req.params.agentId;
        console.log("agentId", agentId);
        const agent: AgentRuntime = agents.get(agentId);

        // update character
        if (agent) {
            // stop agent
            agent.stop();
            directClient.unregisterAgent(agent);
            // if it has a different name, the agentId will change
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "[CLIENT-DIRECT] Agent not found" });
        }
    });
     // Add SuperTokens error handler
  router.use(errorHandler());

  // Custom error handler
  router.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    elizaLogger.error("[CLIENT-DIRECT] Error:", err);
    res.status(500).json({ error: "[CLIENT-DIRECT] Internal server error" });
  });





  router.get("/landing-page", async (req, res) => {
  try {
    // Query the landingPage document from Sanity
    const query = `*[_type == "landingPage"][0] {
      _updatedAt,
      title,
      slug,
      heroSection {
        title,
        subtitle,
        primaryCtaText,
        secondaryCtaText,
        trustSignal,
        backgroundImage {
          asset-> {
            _id,
            url
          }
        },
        mascotModel {
          asset-> {
            _id,
            url
          }
        }
      },
      featuresSection {
        heading,
        features[] {
          title,
          description,
          icon {
            asset-> {
              _id,
              url
            }
          }
        },
        ctaText
      },
      benefitsSection {
        heading,
        description,
        benefitsList,
        image {
          asset-> {
            _id,
            url
          }
        }
      },
      testimonialsSection {
        heading,
        testimonials[] {
          quote,
          author,
          role,
          image {
            asset-> {
              _id,
              url
            }
          }
        },
        trustSignal,
        sectionImage {
          asset-> {
            _id,
            url
          }
        }
      },
      ctaSection {
        heading,
        description,
        ctaText,
        ctaUrl,
      },
      footerSection {
        tagline,
        companyLinks[] { label, url },
        productLinks[] { label, url },
        legalLinks[] { label, url },
        socialLinks[] { platform, url }
      },
      subFooterSection {
        ctaText,
        ctaUrl,
        copyright
      }
    }`;

    const landingPage = await sanityClient.fetch(query);

    if (!landingPage) {
      elizaLogger.debug("[CLIENT-DIRECT] No landing page found in Sanity");
      return res.status(404).json({ error: "[CLIENT-DIRECT] Landing page not found" });
    }

    // Use urlFor to generate optimized image URLs with multiple variants
    const formattedLandingPage = {
      ...landingPage,
      heroSection: {
        ...landingPage.heroSection,
        backgroundImage: landingPage.heroSection.backgroundImage
          ? {
              raw: landingPage.heroSection.backgroundImage.asset.url,
              main: urlFor(landingPage.heroSection.backgroundImage)
                  
                  .fit("fill")
                  .quality(98)
                  .format("webp")
                  .url(),
              thumbnail: urlFor(landingPage.heroSection.backgroundImage)
            
                  .fit("crop")
                  .quality(80)
                  .format("webp")
                  .url(),
              medium: urlFor(landingPage.heroSection.backgroundImage)
                 
                  .fit("fill")
                  .quality(80)
                  .format("webp")
                  .url(),
            }
          : null,
      },
      featuresSection: {
        ...landingPage.featuresSection,
        features: landingPage.featuresSection.features.map((feature: any) => ({
          ...feature,
          icon: feature.icon
            ? {
                main: urlFor(feature.icon)
                    .width(100)
                    .height(100)
                    .fit("crop")
                    .quality(80)
                    .format("webp")
                    .url(),
                thumbnail: urlFor(feature.icon)
                    .width(50)
                    .height(50)
                    .fit("crop")
                    .quality(80)
                    .format("webp")
                    .url(),
                medium: urlFor(feature.icon)
                    .width(75)
                    .height(75)
                    .fit("crop")
                    .quality(80)
                    .format("webp")
                    .url(),
              }
            : null,
        })),
      },
      benefitsSection: {
        ...landingPage.benefitsSection,
        image: landingPage.benefitsSection.image
          ? {
              main: urlFor(landingPage.benefitsSection.image)
              .width(300)
                  .height(600)
                  .quality(80)
                  .url(),
              thumbnail: urlFor(landingPage.benefitsSection.image)
                  .width(300)
                  .height(200)
                  .fit("crop")
                  .quality(80)
                  .format("webp")
                  .url(),
              medium: urlFor(landingPage.benefitsSection.image)
                  .width(600)
                  .height(400)
                  .fit("crop")
                  .quality(80)
                  .format("webp")
                  .url(),
            }
          : null,
      },
      testimonialsSection: {
        ...landingPage.testimonialsSection,
        testimonials: landingPage.testimonialsSection.testimonials.map((testimonial: any) => ({
          ...testimonial,
          image: testimonial.image
            ? {
                main: urlFor(testimonial.image)
                    .width(100)
                    .height(100)
                    .fit("crop")
                    .quality(80)
                    .format("webp")
                    .url(),
                thumbnail: urlFor(testimonial.image)
                    .width(50)
                    .height(50)
                    .fit("crop")
                    .quality(80)
                    .format("webp")
                    .url(),
                medium: urlFor(testimonial.image)
                    .width(75)
                    .height(75)
                    .fit("crop")
                    .quality(80)
                    .format("webp")
                    .url(),
              }
            : null,
        })),
        sectionImage: landingPage.testimonialsSection.sectionImage
          ? {
              main: urlFor(landingPage.testimonialsSection.sectionImage)
                  .width(1200)
                  .height(630)
                  .fit("crop")
                  .quality(80)
                  .format("webp")
                  .url(),
              thumbnail: urlFor(landingPage.testimonialsSection.sectionImage)
                  .width(300)
                  .height(200)
                  .fit("crop")
                  .quality(80)
                  .format("webp")
                  .url(),
              medium: urlFor(landingPage.testimonialsSection.sectionImage)
                  .width(600)
                  .height(400)
                  .fit("crop")
                  .quality(80)
                  .format("webp")
                  .url(),
            }
          : null,
      },
    };

    elizaLogger.debug("[CLIENT-DIRECT] Fetched landing page from Sanity", {
      title: landingPage.title,
    });

    res.json({ landingPage: formattedLandingPage });
  } catch (error: any) {
    elizaLogger.error("[CLIENT-DIRECT] Error fetching landing page:", error);
    res.status(500).json({ error: "[CLIENT-DIRECT] Failed to fetch landing page", details: error.message });
  }
});

router.get("/agents/:agentId/email-template", async (req, res) => {
  try {
    const session = await Session.getSession(req, res, { sessionRequired: true });
    const userId = session.getUserId();
    const { agentId } = req.params;

    // Fetch User document to get _id
    const User = await sanityClient.fetch(
      `*[_type == "User" && userId == $userId][0]`,
      { userId }
    );
    if (!User) {
      elizaLogger.warn(`[CLIENT-DIRECT] No User found for userId: ${userId}`);
      return res.status(404).json({ error: "[CLIENT-DIRECT] User not found in Sanity" });
    }

    // Validate that the character belongs to the user
    const character = await sanityClient.fetch(
      `*[_type == "character" && id == $agentId && createdBy._ref == $userRef][0]`,
      { agentId, userRef: User._id }
    );
    if (!character) {
      elizaLogger.warn(`[CLIENT-DIRECT] Character not found for agentId: ${agentId} and userRef: ${User._id}`);
      return res.status(403).json({ error: "[CLIENT-DIRECT] Character not found or access denied" });
    }

    // Fetch email template for this agent
    const emailTemplate = await sanityClient.fetch(
      `*[_type == "emailTemplate" && agentId == $agentId][0]`,
      { agentId }
    );

    res.json({ emailTemplate: emailTemplate || null });
  } catch (error) {
    elizaLogger.error("[CLIENT-DIRECT] Error fetching email template:", error);
    res.status(500).json({ error: "[CLIENT-DIRECT] Failed to fetch email template" });
  }
});

router.patch("/agents/:agentId/email-template", async (req, res) => {
  try {
    const session = await Session.getSession(req, res, { sessionRequired: true });
    const userId = session.getUserId();
    const { agentId } = req.params;
    const { position, emailAddress, companyName, instructions, bestRegard, template } = req.body;

    // Validate template field
    if (!template || !template.includes('{{body}}')) {
      elizaLogger.warn(`[CLIENT-DIRECT] Invalid template: missing {{body}} placeholder`);
      return res.status(400).json({ error: "[CLIENT-DIRECT] Template must include {{body}} placeholder" });
    }

    // Fetch User document to get _id
    const User = await sanityClient.fetch(
      `*[_type == "User" && userId == $userId][0]`,
      { userId }
    );
    if (!User) {
      elizaLogger.warn(`[CLIENT-DIRECT] No User found for userId: ${userId}`);
      return res.status(404).json({ error: "[CLIENT-DIRECT] User not found in Sanity" });
    }

    // Validate that the character belongs to the user
    const character = await sanityClient.fetch(
      `*[_type == "character" && id == $agentId && createdBy._ref == $userRef][0]`,
      { agentId, userRef: User._id }
    );
    if (!character) {
      elizaLogger.warn(`[CLIENT-DIRECT] Character not found for agentId: ${agentId} and userRef: ${User._id}`);
      return res.status(403).json({ error: "[CLIENT-DIRECT] Character not found or access denied" });
    }

    // Fetch existing email template
    const existingTemplate = await sanityClient.fetch(
      `*[_type == "emailTemplate" && agentId == $agentId][0]`,
      { agentId }
    );

    const templateData = {
      _type: "emailTemplate",
      agentId,
      position: position || '',
      emailAddress: emailAddress || '',
      companyName: companyName || '',
      instructions: instructions || '',
      bestRegard: bestRegard || '',
      template: template || 'Dear {{sender}},\n\n{{body}}\n\n{{bestRegard}},\n{{agentName}}',
    };

    let updatedTemplate;
    if (existingTemplate) {
      // Update existing template
      updatedTemplate = await sanityClient
        .patch(existingTemplate._id)
        .set(templateData)
        .commit();
    } else {
      // Create new template
      updatedTemplate = await sanityClient.create(templateData);
    }

    elizaLogger.debug(`[CLIENT-DIRECT] Email template updated for agentId: ${agentId}`);
    res.json({ emailTemplate: updatedTemplate });
  } catch (error) {
    elizaLogger.error("[CLIENT-DIRECT] Error updating email template:", error);
    res.status(500).json({ error: "[CLIENT-DIRECT] Failed to update email template" });
  }
});

// routes/characterPreset.js
router.get("/character-presets", async (req, res) => {
  try {
    const query = `*[_type == "characterPreset"] {
      _id,
      name,
      username,
      system,
      bio,
      lore,
      messageExamples[] {
        conversation[] {
          user,
          content { text }
        }
      },
      postExamples,
      topics,
      adjectives,
      style {
        all,
        chat,
        post
      },
      modelProvider,
      plugins,
      settings {
        ragKnowledge,
        secrets { dynamic }
      },
      knowledge[]-> {
        _id,
        title
      }
    }`;

    const characterPresets = await sanityClient.fetch(query);

    if (!characterPresets || characterPresets.length === 0) {
      elizaLogger.warn("[CLIENT-DIRECT] No character presets found in Sanity");
      return res.status(404).json({ error: "[CLIENT-DIRECT] No character presets found" });
    }

    elizaLogger.debug("[CLIENT-DIRECT] Fetched character presets from Sanity", {
      count: characterPresets.length,
    });

    res.json({ characterPresets });
  } catch (error) {
    elizaLogger.error("[CLIENT-DIRECT] Error fetching character presets:", error);
    res.status(500).json({ error: "[CLIENT-DIRECT] Failed to fetch character presets", details: error.message });
  }
});

router.post('/characters/:characterId/email/reconnect', async (req, res) => {
    const { characterId } = req.params;
    const agentId = validateUuid(characterId);
    if (!agentId) {
        return res.status(400).json({ error: "Invalid character ID format" });
    }
    try {
        const agentRuntime = agents.get(characterId);
        if (!agentRuntime) {
            return res.status(404).json({ error: "Character not found" });
        }
        const emailClient = agentRuntime.clients.find(c => c.type === 'email')?.client as EmailClient;
        if (!emailClient) {
            return res.status(404).json({ error: "Email service not found for character" });
        }
        const imapClient = emailClient.getImapClient();
        if (imapClient && imapClient.isConnected) {
            return res.json({ status: "already_connected" });
        }
        await emailClient.incomingEmailManager?.reset();
        res.json({ status: "reconnected" });
    } catch (error: any) {
        elizaLogger.error(`[CLIENT-DIRECT] Failed to reconnect email for character ${characterId}`, {
            error: error.message,
            stack: error.stack,
        });
        res.status(500).json({ error: "Failed to reconnect email service" });
    }
});


  router.post("/connection-status", async (req, res) => {
  try {
    const session = await Session.getSession(req, res, { sessionRequired: true });
    const userId = session.getUserId();
    const { isConnected } = req.body;

    elizaLogger.debug(`[CLIENT-DIRECT] Processing POST /connection-status for userId: ${userId}, isConnected: ${isConnected}`);

    if (typeof isConnected !== "boolean") {
      elizaLogger.warn("[CLIENT-DIRECT] Invalid isConnected value in /connection-status", { isConnected });
      return res.status(400).json({ error: "isConnected must be a boolean" });
    }

    const user = await sanityClient.fetch(
      `*[_type == "User" && userId == $userId][0]{_id}`,
      { userId }
    );

    if (!user) {
      elizaLogger.warn(`[CLIENT-DIRECT] User not found for userId: ${userId}`);
      return res.status(404).json({ error: "User not found" });
    }

    await sanityClient
      .patch(user._id)
      .set({ isConnected })
      .commit();

    // Clear connection cache
    clearConnectionCache();

    elizaLogger.debug(`[CLIENT-DIRECT] User connection status updated for userId: ${userId}`, { isConnected });

    res.json({ status: "updated", isConnected });
  } catch (error: any) {
    if (error.type === "UNAUTHORISED") {
      elizaLogger.warn(`[CLIENT-DIRECT] Unauthorized access to POST /connection-status`, { userId: req.body.userId || "unknown" });
      return res.status(401).json({ error: "Unauthorized", type: "UNAUTHORISED" });
    }
    elizaLogger.error("[CLIENT-DIRECT] Error updating connection status:", {
      userId: req.body.userId || "unknown",
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: "Failed to update connection status", details: error.message });
  }
});

router.get("/connection-status", async (req, res) => {
  try {
    const session = await Session.getSession(req, res, { sessionRequired: false });
    const userId = session?.getUserId();

    elizaLogger.debug(`[CLIENT-DIRECT] Processing GET /connection-status`, { userId: userId || "no-session" });

    if (!session || !userId) {
      elizaLogger.debug(`[CLIENT-DIRECT] No session found for GET /connection-status`);
      return res.json({
        isConnected: false,
        userId: null,
        timestamp: new Date().toISOString(),
      });
    }

    // Query Sanity to get user connection status
    const user = await sanityClient.fetch(
      `*[_type == "User" && userId == $userId][0]{ userId, isConnected }`,
      { userId }
    );

    if (!user) {
      elizaLogger.warn(`[CLIENT-DIRECT] User not found in connection status check`, { userId });
      return res.status(404).json({ error: "User not found" });
    }

    const isConnected = user.isConnected === true;

    elizaLogger.debug(`[CLIENT-DIRECT] Connection status retrieved for userId: ${userId}`, {
      isConnected,
      userId: user.userId,
    });

    res.json({
      isConnected,
      userId: user.userId,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    if (error.type === "UNAUTHORISED") {
      elizaLogger.warn(`[CLIENT-DIRECT] Unauthorized access to GET /connection-status`, { userId: userId || "unknown" });
      return res.status(401).json({ error: "Unauthorized", type: "UNAUTHORISED" });
    }
    elizaLogger.error("[CLIENT-DIRECT] Error checking connection status:", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: "Failed to check connection status", details: error.message });
  }
});


router.get("/legal-documents/:slug?", async (req, res) => {
  try {
    const { slug } = req.params;

    let query;
    let params = {};

    if (slug) {
      // Fetch a single legal document by slug
      query = `*[_type == "legalDocument" && slug.current == $slug && published == true][0] {
        title,
        slug,
        content,
        lastUpdated,
        mainImage {
          asset-> {
            _id,
            url
          },
          alt
        }
      }`;
      params = { slug };
    } else {
      // Fetch all legal documents
      query = `*[_type == "legalDocument" && published == true] | order(title asc) {
        title,
        slug,
        lastUpdated,
        mainImage {
          asset-> {
            _id,
            url
          },
          alt
        }
      }`;
    }

    const legalDocuments = await sanityClient.fetch(query, params);

    if (!legalDocuments) {
      elizaLogger.warn(`[CLIENT-DIRECT] No legal document${slug ? ` for slug: ${slug}` : "s"} found in Sanity`);
      return res.status(404).json({ error: `[CLIENT-DIRECT] No legal document${slug ? ` for slug: ${slug}` : "s"} found` });
    }

    // Format response to match LegalDocument interface
    const formattedLegalDocuments = Array.isArray(legalDocuments)
      ? legalDocuments.map((doc) => ({
          ...doc,
          slug: doc.slug?.current || doc.slug, // Ensure slug is string
          mainImage: doc.mainImage?.asset?.url
            ? urlFor(doc.mainImage.asset).width(1200).height(630).fit("crop").quality(80).format("webp").url()
            : null,
          mainImageAlt: doc.mainImage?.alt || doc.title,
        }))
      : {
          ...legalDocuments,
          slug: legalDocuments.slug?.current || legalDocuments.slug, // Ensure slug is string
          mainImage: legalDocuments.mainImage?.asset?.url
            ? urlFor(legalDocuments.mainImage.asset).width(1200).height(630).fit("crop").quality(80).format("webp").url()
            : null,
          mainImageAlt: legalDocuments.mainImage?.alt || legalDocuments.title,
        };

    elizaLogger.debug(`[CLIENT-DIRECT] Fetched legal document${slug ? ` for slug: ${slug}` : "s"} from Sanity`, {
      count: Array.isArray(legalDocuments) ? legalDocuments.length : 1,
    });

    res.json({ legalDocuments: formattedLegalDocuments });
  } catch (error: any) {
    elizaLogger.error(`[CLIENT-DIRECT] Error fetching legal document${slug ? ` for slug: ${slug}` : "s"}:`, error);
    res.status(500).json({ error: `[CLIENT-DIRECT] Failed to fetch legal document${slug ? ` for slug: ${slug}` : "s"}`, details: error.message });
  }
});




router.get("/blog-posts/:slug?", async (req, res) => {
  try {
    const { slug } = req.params;

    let query;
    let params = {};

    if (slug) {
      query = `*[_type == "blogPost" && slug.current == $slug && published == true][0] {
        title,
        slug,
        content[] {
          ...,
          _type == "image" => {
            ...,
            asset-> {
              _id,
              url
            }
          },
          _type == 'table' => {
          ...,
          caption,
          columns[] {
            content[] {
              ...,
              children[] {
                ...,
                _type == 'span' => {
                  ...,
                  marks[]
                }
              }
            },
            align,
            width
            },
            rows[] {
              cells[] {
                content[] {
                  ...,
                  children[] {
                    ...,
                    _type == 'span' => {
                      ...,
                      marks[]
                    }
                  }
                },
                colspan,
                rowspan,
                align
              }
            }
          }
        },
        publishedAt,
        modifiedAt,
        seoDescription,
        excerpt,
        mainImage {
          asset-> {
            _id,
            url
          },
          alt
        },
        heroImage {
          asset-> {
            _id,
            url
          },
          alt
        },
        galleryImages[] {
          asset-> {
            _id,
            url
          },
          alt
        },
        thumbnailImage {
          asset-> {
            _id,
            url
          }
        },
        mediumImage {
          asset-> {
            _id,
            url
          }
        },
        tags,
        adSlotHeader,
        adSlotContent,
        adSlotRightSide,
        relatedContent[0..2]-> {
          _type,
          title,
          slug,
          excerpt,
          mainImage {
            asset-> {
              _id,
              url
            },
            alt
          }
        }
      }`;
      params = { slug };
    } else {
      query = `*[_type == "blogPost" && published == true] | order(publishedAt desc) {
        title,
        slug,
        publishedAt,
        modifiedAt,
        seoDescription,
        excerpt,
        mainImage {
          asset-> {
            _id,
            url
          },
          alt
        },
        heroImage {
          asset-> {
            _id,
            url
          },
          alt
        },
        thumbnailImage {
          asset-> {
            _id,
            url
          }
        },
        mediumImage {
          asset-> {
            _id,
            url
          }
        },
        tags,
        adSlotIndex
      }`;
    }

    const blogPosts = await sanityClient.fetch(query, params);

    if (!blogPosts) {
      elizaLogger.warn(`[CLIENT-DIRECT] No blog post${slug ? ` for slug: ${slug}` : "s"} found in Sanity`);
      return res.status(404).json({ error: `[CLIENT-DIRECT] No blog post${slug ? ` for slug: ${slug}` : "s"} found` });
    }

    const formattedBlogPosts = Array.isArray(blogPosts)
      ? blogPosts.map((post) => ({
          ...post,
          slug: post.slug?.current || post.slug, // Ensure slug is string
          mainImage: post.mainImage?.asset?.url
            ? urlFor(post.mainImage.asset).width(1200).height(630).fit("crop").quality(80).format("webp").url()
            : null,
          mainImageAlt: post.mainImage?.alt || post.title,
          heroImage: post.heroImage?.asset?.url
            ? urlFor(post.heroImage.asset).width(1200).height(400).fit("crop").quality(80).format("webp").url()
            : null,
          heroImageAlt: post.heroImage?.alt || post.title,
          galleryImages: post.galleryImages?.map((img) => ({
            url: img.asset?.url
              ? urlFor(img.asset).width(600).height(400).fit("crop").quality(80).format("webp").url()
              : null,
            alt: img.alt || post.title,
          })).filter((img) => img.url),
          thumbnailImage: post.thumbnailImage?.asset?.url
            ? urlFor(post.thumbnailImage.asset).width(300).height(200).fit("crop").quality(80).format("webp").url()
            : null,
          mediumImage: post.mediumImage?.asset?.url
            ? urlFor(post.mediumImage.asset).width(600).height(400).fit("crop").quality(80).format("webp").url()
            : null,
          adSlotIndex: post.adSlotIndex || null,
          relatedContent: post.relatedContent?.map((item) => ({
            _type: item._type,
            title: item.title,
            slug: item.slug?.current || item.slug, // Ensure slug is string
            excerpt: item.excerpt || "",
            mainImage: item.mainImage?.asset?.url
              ? urlFor(item.mainImage.asset).width(300).height(200).fit("crop").quality(80).format("webp").url()
              : null,
            mainImageAlt: item.mainImage?.alt || item.title,
          })) || [],
        }))
      : {
          ...blogPosts,
          slug: blogPosts.slug?.current || blogPosts.slug, // Ensure slug is string
          mainImage: blogPosts.mainImage?.asset?.url
            ? urlFor(blogPosts.mainImage.asset).width(1200).height(630).fit("crop").quality(80).format("webp").url()
            : null,
          mainImageAlt: blogPosts.mainImage?.alt || blogPosts.title,
          heroImage: blogPosts.heroImage?.asset?.url
            ? urlFor(blogPosts.heroImage.asset).width(1200).height(400).fit("crop").quality(80).format("webp").url()
            : null,
          heroImageAlt: blogPosts.heroImage?.alt || blogPosts.title,
          galleryImages: blogPosts.galleryImages?.map((img) => ({
            url: img.asset?.url
              ? urlFor(img.asset).width(600).height(400).fit("crop").quality(80).format("webp").url()
              : null,
            alt: img.alt || blogPosts.title,
          })).filter((img) => img.url),
          thumbnailImage: blogPosts.thumbnailImage?.asset?.url
            ? urlFor(blogPosts.thumbnailImage.asset).width(300).height(200).fit("crop").quality(80).format("webp").url()
            : null,
          mediumImage: blogPosts.mediumImage?.asset?.url
            ? urlFor(blogPosts.mediumImage.asset).width(600).height(400).fit("crop").quality(80).format("webp").url()
            : null,
          adSlotHeader: blogPosts.adSlotHeader || null,
          adSlotContent: blogPosts.adSlotContent || null,
          adSlotRightSide: blogPosts.adSlotRightSide || null,
          relatedContent: blogPosts.relatedContent?.map((item) => ({
            _type: item._type,
            title: item.title,
            slug: item.slug?.current || item.slug, // Ensure slug is string
            excerpt: item.excerpt || "",
            mainImage: item.mainImage?.asset?.url
              ? urlFor(item.mainImage.asset).width(300).height(200).fit("crop").quality(80).format("webp").url()
              : null,
            mainImageAlt: item.mainImage?.alt || item.title,
          })) || [],
        };

    elizaLogger.debug(`[CLIENT-DIRECT] Fetched blog post${slug ? ` for slug: ${slug}` : "s"} from Sanity`, {
      count: Array.isArray(blogPosts) ? blogPosts.length : 1,
    });

    res.json({ blogPosts: formattedBlogPosts });
  } catch (error: any) {
    elizaLogger.error(`[CLIENT-DIRECT] Error fetching blog post${slug ? ` for slug: ${slug}` : "s"}:`, error);
    res.status(500).json({ error: `[CLIENT-DIRECT] Failed to fetch blog post${slug ? ` for slug: ${slug}` : "s"}`, details: error.message });
  }
});

router.get("/docs/:slug?", async (req, res) => {
  try {
    const { slug } = req.params;

    let query;
    let params = {};

    if (slug) {
      query = `*[_type == "doc" && slug.current == $slug && published == true][0] {
        title,
        slug,
        sortOrder,
        content[] {
          ...,
          _type == "image" => {
            ...,
            asset-> {
              _id,
              url
            }
          }
        },
        publishedAt,
        modifiedAt,
        seoDescription,
        excerpt,
        mainImage {
          asset-> {
            _id,
            url
          },
          alt
        },
        heroImage {
          asset-> {
            _id,
            url
          },
          alt
        },
        galleryImages[] {
          asset-> {
            _id,
            url
          },
          alt
        },
        thumbnailImage {
          asset-> {
            _id,
            url
          }
        },
        mediumImage {
          asset-> {
            _id,
            url
          }
        },
        tags,
        relatedContent[0..2]-> {
          _type,
          title,
          slug,
          excerpt,
          mainImage {
            asset-> {
              _id,
              url
            },
            alt
          }
        }
      }`;
      params = { slug };
    } else {
      query = `*[_type == "doc" && published == true] | order(publishedAt desc) {
  title,
  slug,
  sortOrder,
  content[] {
    ...,
    _type == "block" => {
      _key,
      style,
      children[] {
        _key,
        _type,
        text,
        marks
      },
      markDefs
    },
    _type == "image" => {
      _key,
      asset-> {
        _id,
        url
      },
      alt
    }
  },
  publishedAt,
  modifiedAt,
  seoDescription,
  excerpt,
  mainImage {
    asset-> {
      _id,
      url
    },
    alt
  },
  heroImage {
    asset-> {
      _id,
      url
    },
    alt
  },
  thumbnailImage {
    asset-> {
      _id,
      url
    }
  },
  mediumImage {
    asset-> {
      _id,
      url
    }
  },
  tags,
  relatedContent[0..2]-> {
    _type,
    title,
    slug,
    excerpt,
    mainImage {
      asset-> {
        _id,
        url
      },
      alt
    }
  }
}`;
    }

    const docs = await sanityClient.fetch(query, params);

    if (!docs) {
      elizaLogger.warn(`[CLIENT-DIRECT] No doc${slug ? ` for slug: ${slug}` : "s"} found in Sanity`);
      return res.status(404).json({ error: `[CLIENT-DIRECT] No doc${slug ? ` for slug: ${slug}` : "s"} found` });
    }

    const formattedDocs = Array.isArray(docs)
      ? docs.map((doc) => ({
          ...doc,
          slug: doc.slug?.current || doc.slug,
          mainImage: doc.mainImage?.asset?.url
            ? urlFor(doc.mainImage.asset).width(1200).height(630).fit("crop").quality(80).format("webp").url()
            : null,
          mainImageAlt: doc.mainImage?.alt || doc.title,
          heroImage: doc.heroImage?.asset?.url
            ? urlFor(doc.heroImage.asset).width(1200).height(400).fit("crop").quality(80).format("webp").url()
            : null,
          heroImageAlt: doc.heroImage?.alt || doc.title,
          galleryImages: doc.galleryImages?.map((img) => ({
            url: img.asset?.url
              ? urlFor(img.asset).width(600).height(400).fit("crop").quality(80).format("webp").url()
              : null,
            alt: img.alt || doc.title,
          })).filter((img) => img.url),
          thumbnailImage: doc.thumbnailImage?.asset?.url
            ? urlFor(doc.thumbnailImage.asset).width(300).height(200).fit("crop").quality(80).format("webp").url()
            : null,
          mediumImage: doc.mediumImage?.asset?.url
            ? urlFor(doc.mediumImage.asset).width(600).height(400).fit("crop").quality(80).format("webp").url()
            : null,
          relatedContent: doc.relatedContent?.map((item) => ({
            _type: item._type,
            title: item.title,
            slug: item.slug?.current || item.slug,
            excerpt: item.excerpt || "",
            mainImage: item.mainImage?.asset?.url
              ? urlFor(item.mainImage.asset).width(300).height(200).fit("crop").quality(80).format("webp").url()
              : null,
            mainImageAlt: item.mainImage?.alt || item.title,
          })) || [],
        }))
      : {
          ...docs,
          slug: docs.slug?.current || docs.slug,
          mainImage: docs.mainImage?.asset?.url
            ? urlFor(docs.mainImage.asset).width(1200).height(630).fit("crop").quality(80).format("webp").url()
            : null,
          mainImageAlt: docs.mainImage?.alt || docs.title,
          heroImage: docs.heroImage?.asset?.url
            ? urlFor(docs.heroImage.asset).width(1200).height(400).fit("crop").quality(80).format("webp").url()
            : null,
          heroImageAlt: docs.heroImage?.alt || docs.title,
          galleryImages: docs.galleryImages?.map((img) => ({
            url: img.asset?.url
              ? urlFor(img.asset).width(600).height(400).fit("crop").quality(80).format("webp").url()
              : null,
            alt: img.alt || docs.title,
          })).filter((img) => img.url),
          thumbnailImage: docs.thumbnailImage?.asset?.url
            ? urlFor(doc.thumbnailImage.asset).width(300).height(200).fit("crop").quality(80).format("webp").url()
            : null,
          mediumImage: docs.mediumImage?.asset?.url
            ? urlFor(doc.mediumImage.asset).width(600).height(400).fit("crop").quality(80).format("webp").url()
            : null,
          relatedContent: docs.relatedContent?.map((item) => ({
            _type: item._type,
            title: item.title,
            slug: item.slug?.current || item.slug,
            excerpt: item.excerpt || "",
            mainImage: item.mainImage?.asset?.url
              ? urlFor(item.mainImage.asset).width(300).height(200).fit("crop").quality(80).format("webp").url()
              : null,
            mainImageAlt: item.mainImage?.alt || item.title,
          })) || [],
        };

    elizaLogger.debug(`[CLIENT-DIRECT] Fetched doc${slug ? ` for slug: ${slug}` : "s"} from Sanity`, {
      count: Array.isArray(docs) ? docs.length : 1,
    });

    res.json({ docs: formattedDocs });
  } catch (error: any) {
    elizaLogger.error(`[CLIENT-DIRECT] Error fetching doc${slug ? ` for slug: ${slug}` : "s"}:`, error);
    res.status(500).json({ error: `[CLIENT-DIRECT] Failed to fetch doc${slug ? ` for slug: ${slug}` : "s"}`, details: error.message });
  }
});

router.get("/press-posts/:slug?", async (req, res) => {
  try {
    const { slug } = req.params;

    let query;
    let params = {};

    if (slug) {
      query = `*[_type == "pressPost" && slug.current == $slug && published == true][0] {
        title,
        slug,
        content[] {
          ...,
          _type == "image" => {
            ...,
            asset-> {
              _id,
              url
            }
          }
        },
        publishedAt,
        modifiedAt,
        seoDescription,
        excerpt,
        mainImage {
          asset-> {
            _id,
            url
          },
          alt
        },
        heroImage {
          asset-> {
            _id,
            url
          },
          alt
        },
        galleryImages[] {
          asset-> {
            _id,
            url
          },
          alt
        },
        thumbnailImage {
          asset-> {
            _id,
            url
          }
        },
        mediumImage {
          asset-> {
            _id,
            url
          }
        },
        tags,
        relatedContent[0..2]-> {
          _type,
          title,
          slug,
          excerpt,
          mainImage {
            asset-> {
              _id,
              url
            },
            alt
          }
        }
      }`;
      params = { slug };
    } else {
      query = `*[_type == "pressPost" && published == true] | order(publishedAt desc) {
        title,
        slug,
        publishedAt,
        modifiedAt,
        seoDescription,
        excerpt,
        mainImage {
          asset-> {
            _id,
            url
          },
          alt
        },
        heroImage {
          asset-> {
            _id,
            url
          },
          alt
        },
        thumbnailImage {
          asset-> {
            _id,
            url
          }
        },
        mediumImage {
          asset-> {
            _id,
            url
          }
        },
        tags
      }`;
    }

    const pressPosts = await sanityClient.fetch(query, params);

    if (!pressPosts) {
      elizaLogger.warn(`[CLIENT-DIRECT] No press post${slug ? ` for slug: ${slug}` : "s"} found in Sanity`);
      return res.status(404).json({ error: `[CLIENT-DIRECT] No press post${slug ? ` for slug: ${slug}` : "s"} found` });
    }

    const formattedPressPosts = Array.isArray(pressPosts)
      ? pressPosts.map((post) => ({
          ...post,
          slug: post.slug?.current || post.slug, // Ensure slug is string
          mainImage: post.mainImage?.asset?.url
            ? urlFor(post.mainImage.asset).width(1200).height(630).fit("crop").quality(80).format("webp").url()
            : null,
          mainImageAlt: post.mainImage?.alt || post.title,
          heroImage: post.heroImage?.asset?.url
            ? urlFor(post.heroImage.asset).width(1200).height(400).fit("crop").quality(80).format("webp").url()
            : null,
          heroImageAlt: post.heroImage?.alt || post.title,
          galleryImages: post.galleryImages?.map((img) => ({
            url: img.asset?.url
              ? urlFor(img.asset).width(600).height(400).fit("crop").quality(80).format("webp").url()
              : null,
            alt: img.alt || post.title,
          })).filter((img) => img.url) || [],
          thumbnailImage: post.thumbnailImage?.asset?.url
            ? urlFor(post.thumbnailImage.asset).width(300).height(200).fit("crop").quality(80).format("webp").url()
            : null,
          mediumImage: post.mediumImage?.asset?.url
            ? urlFor(post.mediumImage.asset).width(600).height(400).fit("crop").quality(80).format("webp").url()
            : null,
          relatedContent: post.relatedContent?.map((item) => ({
            _type: item._type,
            title: item.title,
            slug: item.slug?.current || item.slug, // Ensure slug is string
            excerpt: item.excerpt || "",
            mainImage: item.mainImage?.asset?.url
              ? urlFor(item.mainImage.asset).width(300).height(200).fit("crop").quality(80).format("webp").url()
              : null,
            mainImageAlt: item.mainImage?.alt || item.title,
          })) || [],
        }))
      : {
          ...pressPosts,
          slug: pressPosts.slug?.current || pressPosts.slug, // Ensure slug is string
          mainImage: pressPosts.mainImage?.asset?.url
            ? urlFor(pressPosts.mainImage.asset).width(1200).height(630).fit("crop").quality(80).format("webp").url()
            : null,
          mainImageAlt: pressPosts.mainImage?.alt || pressPosts.title,
          heroImage: pressPosts.heroImage?.asset?.url
            ? urlFor(pressPosts.heroImage.asset).width(1200).height(400).fit("crop").quality(80).format("webp").url()
            : null,
          heroImageAlt: pressPosts.heroImage?.alt || pressPosts.title,
          galleryImages: pressPosts.galleryImages?.map((img) => ({
            url: img.asset?.url
              ? urlFor(img.asset).width(600).height(400).fit("crop").quality(80).format("webp").url()
              : null,
            alt: img.alt || pressPosts.title,
          })).filter((img) => img.url) || [],
          thumbnailImage: pressPosts.thumbnailImage?.asset?.url
            ? urlFor(pressPosts.thumbnailImage.asset).width(300).height(200).fit("crop").quality(80).format("webp").url()
            : null,
          mediumImage: pressPosts.mediumImage?.asset?.url
            ? urlFor(pressPosts.mediumImage.asset).width(600).height(400).fit("crop").quality(80).format("webp").url()
            : null,
          relatedContent: pressPosts.relatedContent?.map((item) => ({
            _type: item._type,
            title: item.title,
            slug: item.slug?.current || item.slug, // Ensure slug is string
            excerpt: item.excerpt || "",
            mainImage: item.mainImage?.asset?.url
              ? urlFor(item.mainImage.asset).width(300).height(200).fit("crop").quality(80).format("webp").url()
              : null,
            mainImageAlt: item.mainImage?.alt || item.title,
          })) || [],
        };

    elizaLogger.debug(`[CLIENT-DIRECT] Fetched press post${slug ? ` for slug: ${slug}` : "s"} from Sanity`, {
      count: Array.isArray(pressPosts) ? pressPosts.length : 1,
    });

    res.json({ pressPosts: formattedPressPosts });
  } catch (error: any) {
    elizaLogger.error(`[CLIENT-DIRECT] Error fetching press post${slug ? ` for slug: ${slug}` : "s"}:`, error);
    res.status(500).json({ error: `[CLIENT-DIRECT] Failed to fetch press post${slug ? ` for slug: ${slug}` : "s"}`, details: error.message });
  }
});

router.get("/company-pages/:slug?", async (req, res) => {
  try {
    const { slug } = req.params;

    let query;
    let params = {};

    if (slug) {
      // Fetch a single company page by slug
      query = `*[_type == "companyPage" && slug.current == $slug && published == true][0] {
        title,
        slug,
        content[] {
          ...,
          _type == "image" => {
            ...,
            asset-> {
              _id,
              url
            }
          }
        },
        lastUpdated,
        mainImage {
          asset-> {
            _id,
            url
          },
          alt
        }
      }`;
      params = { slug };
    } else {
      // Fetch all company pages
      query = `*[_type == "companyPage" && published == true] | order(title asc) {
        title,
        slug,
        content[] {
          ...,
          _type == "image" => {
            ...,
            asset-> {
              _id,
              url
            }
          }
        },
        lastUpdated,
        mainImage {
          asset-> {
            _id,
            url
          },
          alt
        }
      }`;
    }

    const companyPages = await sanityClient.fetch(query, params);

    if (!companyPages) {
      elizaLogger.warn(`[CLIENT-DIRECT] No company page${slug ? ` for slug: ${slug}` : "s"} found in Sanity`);
      return res.status(404).json({ error: `[CLIENT-DIRECT] No company page${slug ? ` for slug: ${slug}` : "s"} found` });
    }

    // Format response to match CompanyPage interface
    const formattedCompanyPages = Array.isArray(companyPages)
      ? companyPages.map((page) => ({
          ...page,
          slug: page.slug?.current || page.slug, // Ensure slug is string
          mainImage: page.mainImage?.asset?.url
            ? urlFor(page.mainImage.asset).width(1200).height(630).fit("crop").quality(80).format("webp").url()
            : null,
          mainImageAlt: page.mainImage?.alt || page.title,
        }))
      : {
          ...companyPages,
          slug: companyPages.slug?.current || companyPages.slug, // Ensure slug is string
          mainImage: companyPages.mainImage?.asset?.url
            ? urlFor(companyPages.mainImage.asset).width(1200).height(630).fit("crop").quality(80).format("webp").url()
            : null,
          mainImageAlt: companyPages.mainImage?.alt || companyPages.title,
        };

    elizaLogger.debug(`[CLIENT-DIRECT] Fetched company page${slug ? ` for slug: ${slug}` : "s"} from Sanity`, {
      count: Array.isArray(companyPages) ? companyPages.length : 1,
    });

    res.json({ companyPages: formattedCompanyPages });
  } catch (error: any) {
    elizaLogger.error(`[CLIENT-DIRECT] Error fetching company page${slug ? ` for slug: ${slug}` : "s"}:`, error);
    res.status(500).json({ error: `[CLIENT-DIRECT] Failed to fetch company page${slug ? ` for slug: ${slug}` : "s"}`, details: error.message });
  }
});


router.get("/product-pages/:slug?", async (req, res) => {
  try {
    const { slug } = req.params;

    let query;
    let params = {};

    if (slug) {
      query = `*[_type == "productPage" && slug.current == $slug && published == true][0] {
        title,
        slug,
        content[] {
          ...,
          _type == "image" => {
            ...,
            asset-> {
              _id,
              url
            }
          }
        },
        publishedAt,
        modifiedAt,
        seoDescription,
        excerpt,
        mainImage {
          asset-> {
            _id,
            url
          },
          alt
        },
        heroImage {
          asset-> {
            _id,
            url
          },
          alt
        },
        galleryImages[] {
          asset-> {
            _id,
            url
          },
          alt
        },
        thumbnailImage {
          asset-> {
            _id,
            url
          }
        },
        mediumImage {
          asset-> {
            _id,
            url
          }
        },
        tags,
        relatedContent[0..2]-> {
          _type,
          title,
          slug,
          excerpt,
          mainImage {
            asset-> {
              _id,
              url
            },
            alt
          }
        }
      }`;
      params = { slug };
    } else {
      query = `*[_type == "productPage" && published == true] | order(publishedAt desc) {
        title,
        slug,
        publishedAt,
        modifiedAt,
        seoDescription,
        excerpt,
        mainImage {
          asset-> {
            _id,
            url
          },
          alt
        },
        heroImage {
          asset-> {
            _id,
            url
          },
          alt
        },
        thumbnailImage {
          asset-> {
            _id,
            url
          }
        },
        mediumImage {
          asset-> {
            _id,
            url
          }
        },
        tags,
        relatedContent[0..2]-> {
          _type,
          title,
          slug,
          excerpt,
          mainImage {
            asset-> {
              _id,
              url
            },
            alt
          }
        }
      }`;
    }

    const productPages = await sanityClient.fetch(query, params);

    if (!productPages) {
      elizaLogger.warn(`[CLIENT-DIRECT] No product page${slug ? ` for slug: ${slug}` : "s"} found in Sanity`);
      return res.status(404).json({ error: `[CLIENT-DIRECT] No product page${slug ? ` for slug: ${slug}` : "s"} found` });
    }

    const formattedProductPages = Array.isArray(productPages)
      ? productPages.map((page) => ({
          ...page,
          slug: page.slug?.current || page.slug, // Ensure slug is string
          mainImage: page.mainImage?.asset?.url
            ? urlFor(page.mainImage.asset).width(1200).height(630).fit("crop").quality(80).format("webp").url()
            : null,
          mainImageAlt: page.mainImage?.alt || page.title,
          heroImage: page.heroImage?.asset?.url
            ? urlFor(page.heroImage.asset).width(1200).height(400).fit("crop").quality(80).format("webp").url()
            : null,
          heroImageAlt: page.heroImage?.alt || page.title,
          galleryImages: page.galleryImages?.map((img) => ({
            url: img.asset?.url
              ? urlFor(img.asset).width(600).height(400).fit("crop").quality(80).format("webp").url()
              : null,
            alt: img.alt || page.title,
          })).filter((img) => img.url) || [],
          thumbnailImage: page.thumbnailImage?.asset?.url
            ? urlFor(page.thumbnailImage.asset).width(300).height(200).fit("crop").quality(80).format("webp").url()
            : null,
          mediumImage: page.mediumImage?.asset?.url
            ? urlFor(page.mediumImage.asset).width(600).height(400).fit("crop").quality(80).format("webp").url()
            : null,
          relatedContent: page.relatedContent?.map((item) => ({
            _type: item._type,
            title: item.title,
            slug: item.slug?.current || item.slug, // Ensure slug is string
            excerpt: item.excerpt || "",
            mainImage: item.mainImage?.asset?.url
              ? urlFor(item.mainImage.asset).width(300).height(200).fit("crop").quality(80).format("webp").url()
              : null,
            mainImageAlt: item.mainImage?.alt || item.title,
          })) || [],
        }))
      : {
          ...productPages,
          slug: productPages.slug?.current || productPages.slug, // Ensure slug is string
          mainImage: productPages.mainImage?.asset?.url
            ? urlFor(productPages.mainImage.asset).width(1200).height(630).fit("crop").quality(80).format("webp").url()
            : null,
          mainImageAlt: productPages.mainImage?.alt || productPages.title,
          heroImage: productPages.heroImage?.asset?.url
            ? urlFor(productPages.heroImage.asset).width(1200).height(400).fit("crop").quality(80).format("webp").url()
            : null,
          heroImageAlt: productPages.heroImage?.alt || productPages.title,
          galleryImages: productPages.galleryImages?.map((img) => ({
            url: img.asset?.url
              ? urlFor(img.asset).width(600).height(400).fit("crop").quality(80).format("webp").url()
              : null,
            alt: img.alt || productPages.title,
          })).filter((img) => img.url) || [],
          thumbnailImage: productPages.thumbnailImage?.asset?.url
            ? urlFor(productPages.thumbnailImage.asset).width(300).height(200).fit("crop").quality(80).format("webp").url()
            : null,
          mediumImage: productPages.mediumImage?.asset?.url
            ? urlFor(productPages.mediumImage.asset).width(600).height(400).fit("crop").quality(80).format("webp").url()
            : null,
          relatedContent: productPages.relatedContent?.map((item) => ({
            _type: item._type,
            title: item.title,
            slug: item.slug?.current || item.slug, // Ensure slug is string
            excerpt: item.excerpt || "",
            mainImage: item.mainImage?.asset?.url
              ? urlFor(item.mainImage.asset).width(300).height(200).fit("crop").quality(80).format("webp").url()
              : null,
            mainImageAlt: item.mainImage?.alt || item.title,
          })) || [],
        };

    elizaLogger.debug(`[CLIENT-DIRECT] Fetched product page${slug ? ` for slug: ${slug}` : "s"} from Sanity`, {
      count: Array.isArray(productPages) ? productPages.length : 1,
    });

    res.json({ productPages: formattedProductPages });
  } catch (error: any) {
    elizaLogger.error(`[CLIENT-DIRECT] Error fetching product page${slug ? ` for slug: ${slug}` : "s"}:`, error);
    res.status(500).json({ error: `[CLIENT-DIRECT] Failed to fetch product page${slug ? ` for slug: ${slug}` : "s"}`, details: error.message });
  }
});


// Static routes in the application
const staticRoutes = [
  { path: "/", changefreq: "hourly", priority: 1.0 },
  { path: "/demo", changefreq: "daily", priority: 0.8 },
  { path: "/company/blog", changefreq: "daily", priority: 0.8 },
  { path: "/company/press", changefreq: "daily", priority: 0.8 },
  { path: "/company/docs", changefreq: "daily", priority: 0.8 },
  { path: "/company/contact-us", changefreq: "daily", priority: 0.8 },
  { path: "/company/legal", changefreq: "weekly", priority: 0.8 },
];

router.get("/sitemap.xml", async (req, res) => {
  try {
    const baseUrl = process.env.SERVER_URL; // Align with other endpoints

    // Fetch all blog posts
    const blogPosts = await sanityClient.fetch(
      `*[_type == "blogPost" && defined(slug.current) && published == true] { slug, publishedAt, modifiedAt }`
    );

    // Fetch all press posts
    const pressPosts = await sanityClient.fetch(
      `*[_type == "pressPost" && defined(slug.current) && published == true] { slug, publishedAt, modifiedAt }`
    );

    // Fetch all company pages
    const companyPages = await sanityClient.fetch(
      `*[_type == "companyPage" && defined(slug.current)] { slug, lastUpdated }`
    );

    // Fetch all legal documents
    const legalDocuments = await sanityClient.fetch(
      `*[_type == "legalDocument" && defined(slug.current)] { slug, lastUpdated }`
    );

    // Fetch all product pages
    const productPages = await sanityClient.fetch(
      `*[_type == "productPage" && defined(slug.current) && published == true] { slug, publishedAt, modifiedAt }`
    );

    // Fetch all docs
    const docs = await sanityClient.fetch(
      `*[_type == "doc" && defined(slug.current) && published == true] { slug, publishedAt, modifiedAt }`
    );

    const currentDate = new Date().toISOString();

    const formatLastmod = (modifiedAt: string | undefined, publishedAt: string | undefined) =>
      modifiedAt && !isNaN(new Date(modifiedAt).getTime())
        ? new Date(modifiedAt).toISOString()
        : publishedAt && !isNaN(new Date(publishedAt).getTime())
        ? new Date(publishedAt).toISOString()
        : currentDate;

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  ${staticRoutes
    .map(
      (route) => `
  <url>
    <loc>${baseUrl}${route.path}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`
    )
    .join("")}
  ${blogPosts
    .map(
      (post: any) => `
  <url>
    <loc>${baseUrl}/company/blog/${post.slug.current}</loc>
    <lastmod>${formatLastmod(post.modifiedAt, post.publishedAt)}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`
    )
    .join("")}
  ${pressPosts
    .map(
      (post: any) => `
  <url>
    <loc>${baseUrl}/company/press/${post.slug.current}</loc>
    <lastmod>${formatLastmod(post.modifiedAt, post.publishedAt)}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`
    )
    .join("")}
  ${companyPages
    .map(
      (page: any) => `
  <url>
    <loc>${baseUrl}/company/${page.slug.current}</loc>
    <lastmod>${formatLastmod(page.lastUpdated, undefined)}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`
    )
    .join("")}
  ${legalDocuments
    .map(
      (doc: any) => `
  <url>
    <loc>${baseUrl}/legal/${doc.slug.current}</loc>
    <lastmod>${formatLastmod(doc.lastUpdated, undefined)}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.6</priority>
  </url>`
    )
    .join("")}
  ${productPages
    .map(
      (page: any) => `
  <url>
    <loc>${baseUrl}/product/${page.slug.current}</loc>
    <lastmod>${formatLastmod(page.modifiedAt, page.publishedAt)}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`
    )
    .join("")}
  ${docs
    .map(
      (doc: any) => `
  <url>
    <loc>${baseUrl}/company/docs/${doc.slug.current}</loc>
    <lastmod>${formatLastmod(doc.modifiedAt, doc.publishedAt)}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`
    )
    .join("")}
</urlset>`;

    res.header("Content-Type", "application/xml");
    res.send(sitemap);
  } catch (error: any) {
    elizaLogger.error("[CLIENT-DIRECT] Error generating sitemap:", error);
    res.status(500).json({ error: "Error generating sitemap", details: error.message });
  }
});

router.get("/robots.txt", async (req, res) => {
  try {
    const websiteDomain = process.env.WEBSITE_DOMAIN;
    
    const robots = `User-agent: *
Allow: /

# Sitemap
Sitemap: ${websiteDomain}/api/sitemap.xml

# Crawl-delay (optional - adjust as needed)
Crawl-delay: 1

# Disallow certain paths if needed (uncomment and modify as required)
Disallow: /admin/
Disallow: /api/
Disallow: /auth
Disallow: /private/`;

    res.header("Content-Type", "text/plain");
    res.send(robots);
  } catch (error: any) {
    elizaLogger.error("[CLIENT-DIRECT] Error generating robots.txt:", error);
    res.status(500).send("Error generating robots.txt");
  }
});



  


    return router;
}
