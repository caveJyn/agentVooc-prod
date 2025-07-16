// packages/plugin-email/src/utils/emailListener.ts
import type { IAgentRuntime, Memory } from "@elizaos/core";
import { elizaLogger, stringToUuid, validateUuid } from "@elizaos/core";
import { EmailClient } from "../clients/emailClient";
import { emailProvider } from "../providers/emailProvider";
import { type ExtendedEmailContent } from "../types";
import { simpleParser } from 'mailparser';

interface EmailMetadata {
  from?: { address?: string; name?: string }[];
  subject?: string;
  date?: string | Date;
  emailId?: string;
  messageId?: string;
  references?: string[];
  threadId?: string;
  collection: string;
  originalEmailId?: string;
  originalMessageId?: string;
  originalThreadId?: string;
  body?: string;
}

interface EmailMemory extends Omit<Memory, "content"> {
  content: {
    text: string;
    metadata?: EmailMetadata;
    action?: string;
    source?: string;
    url?: string;
    inReplyTo?: `${string}-${string}-${string}-${string}-${string}` | undefined;
    attachments?: any[];
    [key: string]: unknown;
  };
}

interface NotificationQueueItem {
  email: {
    from?: { address?: string; name?: string }[];
    subject?: string;
    summary?: string;
  };
  timestamp: number;
}

const memoryQueue: EmailMemory[] = [];
const regularQueue: NotificationQueueItem[] = [];
const MIN_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 20;
const MIN_BATCH_DELAY = 2500; // 2.5 seconds
const MAX_BATCH_DELAY = 10000; // 10 seconds
const REGULAR_NOTIFICATION_INTERVAL = 60000; // 60 seconds
let batchDelay = MIN_BATCH_DELAY;

async function processMemoryBatch(runtime: IAgentRuntime) {
  if (memoryQueue.length === 0) return;
  const batchSize = Math.min(Math.max(MIN_BATCH_SIZE, Math.ceil(memoryQueue.length / 2)), MAX_BATCH_SIZE);
  const batch = memoryQueue.splice(0, batchSize);
  elizaLogger.debug(`[EmailListener:${runtime.character.id}] Processing memory batch`, {
    batchSize: batch.length,
    roomId: runtime.character.id,
  });
  try {
    await Promise.allSettled(batch.map((memory) => {
      elizaLogger.debug(`[EmailListener:${runtime.character.id}] Creating memory`, {
        memoryId: memory.id,
        emailUUID: memory.content.metadata?.emailId,
        originalEmailId: memory.content.metadata?.originalEmailId,
        subject: memory.content.metadata?.subject,
      });
      return runtime.messageManager.createMemory(memory);
    }));
    elizaLogger.debug(`[EmailListener:${runtime.character.id}] Processed memory batch successfully`, {
      batchSize: batch.length,
      roomId: runtime.character.id,
    });
  } catch (error: any) {
    elizaLogger.error(`[EmailListener:${runtime.character.id}] Failed to process memory batch`, {
      error: error.message,
      batchSize: batch.length,
      roomId: runtime.character.id,
    });
    memoryQueue.push(...batch); // Re-queue failed memories
  }
}

function normalizeId(id: string | undefined): `${string}-${string}-${string}-${string}-${string}` | undefined {
  if (!id) return undefined;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(id)) return id as `${string}-${string}-${string}-${string}-${string}`;
  return stringToUuid(id) as `${string}-${string}-${string}-${string}-${string}`;
}

export function setupEmailListener(runtime: IAgentRuntime, emailClient: EmailClient) {
  elizaLogger.debug(`[EmailListener:${runtime.character.id}] Setting up email listener`, { roomId: runtime.character.id });

  const intervals: NodeJS.Timeout[] = [];

  emailClient.receive(async (mail: ExtendedEmailContent) => {
    elizaLogger.debug(`[EmailListener:${runtime.character.id}] Received email`, {
      messageId: mail.messageId,
      from: mail.from,
      subject: mail.subject,
      roomId: runtime.character.id,
    });

    // Parse email to extract clean body
    let parsedBody = mail.text || mail.subject || "No content";
    try {
      const parsed = await simpleParser(mail.text || '');
      parsedBody = parsed.text || parsed.textAsHtml || mail.subject || "No content";
      // Basic cleanup to remove quoted replies
      parsedBody = parsedBody
        .split(/^-{2,}\s*Original Message\s*-{2,}|^-{2,}\s*Forwarded Message\s*-{2,}/gim)[0]
        .trim();
      elizaLogger.debug(`[EmailListener:${runtime.character.id}] Parsed email body`, {
        parsedBody,
        emailUUID: mail.emailUUID,
      });
    } catch (error) {
      elizaLogger.warn(`[EmailListener:${runtime.character.id}] Failed to parse email`, {
        error: error.message,
        emailUUID: mail.emailUUID,
      });
    }

    const emailUUID = mail.emailUUID || stringToUuid(mail.messageId || `${Date.now()}${Math.random()}`);
    if (!validateUuid(emailUUID)) {
      elizaLogger.error(`[EmailListener:${runtime.character.id}] Generated invalid email UUID`, {
        emailUUID,
        originalEmailId: mail.messageId,
      });
      throw new Error(`Invalid email UUID generated for messageId: ${mail.messageId}`);
    }

    const emailMemory: EmailMemory = {
      id: stringToUuid(`${Date.now()}${Math.random()}`),
      content: {
        text: mail.text || mail.subject || "New email received",
        metadata: {
          from: mail.from,
          subject: mail.subject,
          date: mail.date,
          emailId: emailUUID, // Use emailUUID
          messageId: mail.messageId,
          references: mail.references || [],
          threadId: mail.threadId,
          collection: "emails",
          originalEmailId: mail.messageId || `generated-${Date.now()}@mail.gmail.com`,
          originalMessageId: mail.messageId,
          originalThreadId: mail.threadId,
          body: parsedBody,
        },
        inReplyTo: mail.messageId ? normalizeId(mail.messageId) : undefined,
      },
      agentId: runtime.agentId,
      roomId: runtime.character.id,
      userId: runtime.character.id,
      createdAt: Date.now(),
    };

    memoryQueue.push(emailMemory);
    elizaLogger.debug(`[EmailListener:${runtime.character.id}] Queued email memory`, {
      memoryId: emailMemory.id,
      emailUUID: emailMemory.content.metadata.emailId,
      originalEmailId: emailMemory.content.metadata.originalEmailId,
      subject: mail.subject,
      body: parsedBody,
      roomId: runtime.character.id,
    });

    const batchSize = Math.min(Math.max(MIN_BATCH_SIZE, Math.ceil(memoryQueue.length / 2)), MAX_BATCH_SIZE);
    if (memoryQueue.length >= batchSize) {
      await processMemoryBatch(runtime);
    }

    const isImportant =
      mail.from?.some((f) => f.address?.toLowerCase().includes("important@domain.com")) ||
      mail.subject?.toLowerCase().includes("urgent") ||
      mail.text?.toLowerCase().includes("urgent");

    if (isImportant) {
      const syntheticMessage: Memory = {
        id: stringToUuid(`${Date.now()}${Math.random()}`),
        content: { text: "New important email received" },
        agentId: runtime.agentId,
        roomId: runtime.character.id,
        userId: runtime.character.id,
        createdAt: Date.now(),
      };
      elizaLogger.debug(`[EmailListener:${runtime.character.id}] Triggering important email notification`, {
        emailUUID,
        originalEmailId: mail.messageId,
        subject: mail.subject,
        roomId: runtime.character.id,
      });
      await emailProvider.get(runtime, syntheticMessage);
    } else {
      regularQueue.push({
        email: {
          from: mail.from,
          subject: mail.subject,
          summary: parsedBody.substring(0, 100) + "...",
        },
        timestamp: Date.now(),
      });
    }
  });

  intervals.push(
    setInterval(() => {
      batchDelay = memoryQueue.length > 10 ? MIN_BATCH_DELAY : MAX_BATCH_DELAY;
      processMemoryBatch(runtime);
    }, batchDelay)
  );

  intervals.push(
    setInterval(async () => {
      if (regularQueue.length === 0) return;
      const batch = regularQueue.splice(0, regularQueue.length);
      const syntheticMessage: Memory = {
        id: stringToUuid(`${Date.now()}${Math.random()}`),
        content: { text: `You have ${batch.length} new email${batch.length > 1 ? 's' : ''}` },
        agentId: runtime.agentId,
        roomId: runtime.character.id,
        userId: runtime.character.id,
        createdAt: Date.now(),
      };
      elizaLogger.debug(`[EmailListener:${runtime.character.id}] Triggering regular email notification`, {
        count: batch.length,
        roomId: runtime.character.id,
      });
      await emailProvider.get(runtime, syntheticMessage);
    }, REGULAR_NOTIFICATION_INTERVAL)
  );

  process.on("SIGTERM", async () => {
    intervals.forEach(clearInterval);
    await emailClient.stop();
  });

  elizaLogger.debug(`[EmailListener:${runtime.character.id}] Memory batch processing interval set`, {
    intervalMs: batchDelay,
    roomId: runtime.character.id,
  });
}