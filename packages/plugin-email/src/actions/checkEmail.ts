import type { Action, ActionExample, HandlerCallback, IAgentRuntime, Memory, State, Content, UUID } from "@elizaos/core";
import { elizaLogger, stringToUuid, validateUuid } from "@elizaos/core";
import { EmailClient } from "../clients/emailClient";
import { convert } from "html-to-text";
import quotedPrintable from "quoted-printable";
import { normalizeEmailId } from "../utils/normalizeEmailId";

interface EmailMetadata {
  from?: { address: string; name?: string }[];
  subject?: string;
  date?: string | Date;
  emailId?: string;
  messageId?: string;
  references?: string[];
  threadId?: string;
  collection?: string;
  originalEmailId?: string;
  originalMessageId?: string;
  originalThreadId?: string;
  body?: string;
}

interface EmailMemory extends Memory {
  id?: UUID;
  createdAt?: number;
  content: {
    text: string;
    metadata?: EmailMetadata;
    source?: string;
    thought?: string;
    actions?: string[];
    user?: string;
    createdAt?: number;
  };
}

interface EmailClientContainer {
  client?: EmailClient;
  stop: (runtime: IAgentRuntime) => Promise<boolean>;
  send: (options: any) => Promise<any>;
  receive: (callback: (mail: any) => void) => Promise<void>;
}

function wrapLongUrls(text: string, maxLength: number = 50): string {
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s]*)/g;
  return text.replace(urlRegex, (url) => {
    if (url.length <= maxLength) return url;
    let wrapped = '';
    for (let i = 0; i < url.length; i += maxLength) {
      const chunk = url.substring(i, i + maxLength);
      wrapped += chunk;
      if (i + maxLength < url.length) wrapped += '\n  ';
    }
    return wrapped;
  });
}

function formatEmailAddresses(addresses: { address: string; name?: string }[] | undefined): string {
  if (!addresses || addresses.length === 0) return "Unknown";
  return addresses.map(addr => {
    if (addr.name && addr.name !== addr.address && addr.name.trim()) {
      return `${addr.name} <${addr.address}>`;
    }
    return addr.address;
  }).join(", ");
}

function decodeQuotedPrintable(text: string): string {
  try {
    return quotedPrintable.decode(text);
  } catch (error) {
    elizaLogger.warn("[EMAIL-PLUGIN] Failed to decode quoted-printable", { error: (error as Error).message });
    return text;
  }
}

function enhancedCleanEmailBody(rawBody: string, preserveFormatting: boolean = true, metadata?: EmailMetadata): string {
  if (!rawBody) return "No content";

  let cleaned = decodeQuotedPrintable(rawBody);

  // Step 1: Apply header removal (as a safeguard)
  cleaned = cleaned.replace(
    /^(Delivered-To|Received|X-Received|ARC-Seal|ARC-Message-Signature|ARC-Authentication-Results|Date|From|To|Cc|Bcc|Message-ID|In-Reply-To|References|Return-Path|Authentication-Results|DKIM-Signature|Content-Type|Content-Transfer-Encoding|MIME-Version|d=\s*[^\s;]+|s=\s*[^\s;]+|b=\s*[A-Za-z0-9+/=]+.*$|h=[^\n]+|by \S+ with SMTP id \S+|:\s.*$|from:dkim-signature|spf \([^\)]+\)|dmarc \([^\)]+\)|dara header\.i=[^\s;]+|Google Transport Security|client-ip \d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|for \([^\)]+\))/gim,
    ""
  );

  // Step 2: Convert HTML to text
  cleaned = convert(cleaned, {
    wordwrap: 80,
    preserveNewlines: preserveFormatting,
    selectors: [
      { selector: "a", options: { hideLinkHrefIfSameAsText: true, noLinkBrackets: true }, format: "inline" },
      { selector: "img", format: "skip" },
      { selector: "style", format: "skip" },
      { selector: "script", format: "skip" },
      { selector: "h1", options: { uppercase: false } },
      { selector: "h2", options: { uppercase: false } },
      { selector: "h3", options: { uppercase: false } },
      { selector: "ul", options: { itemPrefix: "• " } },
      { selector: "ol", options: { itemPrefix: "1. " } },
      { selector: "table", format: "dataTable" },
    ],
  });

  // Step 3: Remove URLs, email addresses, and specific phrases
  cleaned = cleaned.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
    const cleanUrl = url.replace(/[\u200B-\u200F\uFEFF]/g, '').trim();
    const cleanText = text.trim();
    return cleanText === cleanUrl || cleanText.includes(cleanUrl) || cleanUrl.includes(cleanText)
      ? cleanText
      : `${cleanText} (${wrapLongUrls(cleanUrl, 50)})`;
  });
  cleaned = cleaned.replace(/(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s]*)/g, "");
  cleaned = cleaned.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "");
  cleaned = cleaned.replace(/[:]\s*agentvooc\[.*?\]/g, "");
  cleaned = cleaned.replace(
    /(unsubscribe|opt-out|opt out|privacy policy|terms & conditions|terms of service|view this email in your browser|you received this email because|read in browser|follow us on|connect with us|facebook|x\.com|twitter|instagram|pinterest|youtube|linkedin|tiktok|© \d{4}|View.*>|Estimate.*>|Compare.*>|Browse.*>|best regards|sincerely|sent from my.*|this email was sent.*|click here.*|learn more.*|cloud pricing calculator|automate resource deployment)/gi,
    ""
  );

  // Step 4: Deduplicate lines
  const lines = cleaned.split("\n").map(line => line.trim()).filter(line => line);
  const uniqueLines = Array.from(new Set(lines));
  cleaned = uniqueLines.join("\n");

  // Step 5: Final cleanup
  cleaned = cleaned
    .replace(/[\u200B-\u200F\uFEFF͏]+/g, "")
    .replace(/[a-f0-9]{16,}|=[A-Za-z0-9+/=]+/gi, "")
    .replace(/\[image: [^\]]+\]/g, "[Image]")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const contentLines = lines.filter(line => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return false;
    const isMetadata = trimmedLine.match(
      /^[-═~]+$|^.*?(b=[A-Za-z0-9+/=]+|d=[a-zA-Z0-9-.]+|s=[a-zA-Z0-9-.]+|ARC-Message-Signature:.*$|[a-zA-Z0-9+/=]+=[A-Za-z0-9+/=]+.*$|by \S+ with SMTP id \S+|:\s.*$|header\.[a-z]=.*$|for \([^\)]+\)|client-ip \d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/i
    );
    const isDate = trimmedLine.match(
      /^\d{4}-\d{2}-\d{2}|[A-Za-z]{3}, \d{1,2} [A-Za-z]{3} \d{4}/
    );
    const isShortNumeric = trimmedLine.match(/^\d{4,8}$/) && rawBody.toLowerCase().includes("otp");
    return (
      !isMetadata &&
      !isDate &&
      (isShortNumeric || trimmedLine.match(/[A-Za-z]/) || trimmedLine.length > 10)
    );
  });

  cleaned = contentLines.join("\n").trim();

  if (!cleaned || cleaned.length < 3) {
    return "No meaningful content found";
  }

  return cleaned;
}

function formatEmailForDisplay(email: EmailMemory, index: number, showFullBody: boolean = false): string {
  const metadata = email.content.metadata;
  const fromFormatted = formatEmailAddresses(metadata?.from);
  const subject = metadata?.subject || "No subject";
  const date = metadata?.date
    ? new Date(metadata.date).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : "Unknown";
  const emailUUID = normalizeEmailId(metadata?.emailId || "Unknown");
  if (emailUUID !== "Unknown" && !validateUuid(emailUUID)) {
    elizaLogger.warn("[EMAIL-PLUGIN] Invalid email UUID in display", { emailUUID, originalEmailId: metadata?.originalEmailId });
  }

  // Use metadata.body if available, otherwise clean email.content.text
  const rawBody = metadata?.body || email.content.text;
  elizaLogger.debug("[EMAIL-PLUGIN] Raw email body before cleaning", {
    emailUUID,
    rawBody,
  });
  const body = metadata?.body ? rawBody : enhancedCleanEmailBody(rawBody, true, metadata);

  let displayBody: string;
  if (showFullBody) {
    displayBody = body;
  } else {
    const maxLength = 500;
    displayBody = body.length > maxLength ? body.substring(0, maxLength) + "\n\n[Email truncated - use 'show full emails' to see complete content]" : body;
  }

  let formattedEmail = `\n${"═".repeat(60)}\n`;
  formattedEmail += `📧 Email ${index + 1}\n`;
  formattedEmail += `${"─".repeat(60)}\n`;
  formattedEmail += `From: ${fromFormatted}\n`;
  formattedEmail += `Subject: ${subject}\n`;
  formattedEmail += `Date: ${date}\n`;
  formattedEmail += `Email UUID: ${emailUUID}\n`;
  formattedEmail += `Original Email ID: ${metadata?.originalEmailId || "N/A"}\n`;
  formattedEmail += `${"─".repeat(60)}\n`;
  formattedEmail += `Body:\n${displayBody}\n`;
  formattedEmail += `${"═".repeat(60)}\n`;

  return formattedEmail;
}

export const checkEmailAction: Action = {
  name: "CHECK_EMAIL",
  similes: ["CHECK_EMAIL", "CHECK_MAIL", "RECEIVE_EMAIL"],
  description: "Checks for new emails and stores them for display, incorporating relevant knowledge.",
  suppressInitialMessage: true,

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = message.content.text?.toLowerCase() || "";
    const isValid = (
      text.includes("check email") ||
      text.includes("check mail") ||
      text.includes("new email") ||
      text.includes("received email") ||
      text.includes("receive email") ||
      text.includes("have i received") ||
      text.includes("have you received") ||
      text.includes("any email") ||
      text.includes("inbox") ||
      text.includes("mailbox") ||
      text.includes("got any email") ||
      text.includes("show email") ||
      text.includes("display email") ||
      text.includes("read email")
    );
    elizaLogger.debug("[EMAIL-PLUGIN] Validating CHECK_EMAIL action", { text, isValid });
    return isValid;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: { ragKnowledge?: string },
    callback?: HandlerCallback
  ): Promise<boolean> => {
    elizaLogger.debug("[EMAIL-PLUGIN] Executing CHECK_EMAIL action", {
      messageText: message.content.text,
      roomId: runtime.character.id,
      ragKnowledge: options?.ragKnowledge,
    });

    try {
      const emailClientContainer = runtime.clients.find(
        c => (c as any).type === "email" || (c as any).name === "EmailClientInterface"
      ) as EmailClientContainer | undefined;

      const emailClient = emailClientContainer?.client;
      if (!emailClient) {
        elizaLogger.error("[EMAIL-PLUGIN] Email client not initialized for CHECK_EMAIL");
        const response: Content = {
          text: "Sorry, I couldn't check emails. Email client not initialized.\n\nRelevant knowledge:\n" + (options?.ragKnowledge || "No relevant knowledge found."),
          thought: "Email client not initialized",
          source: "CHECK_EMAIL",
          user: runtime.character.id,
          createdAt: Date.now(),
        };
        if (callback) await callback(response);
        return false;
      }

      await emailClient.receive((mail: any) => {
        elizaLogger.debug("[EMAIL-PLUGIN] Received email during action fetch", {
          emailUUID: mail.emailUUID,
          originalEmailId: mail.messageId,
          from: mail.from?.[0]?.address,
        });
      });

      const roomId = runtime.character.id;
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const memories = await runtime.messageManager.getMemories({
        roomId,
        count: 50,
        start: oneDayAgo,
      }) as EmailMemory[];

      const emails = memories.filter(
        memory =>
          (memory.content.metadata as EmailMetadata | undefined)?.collection === "emails" &&
          memory.createdAt >= oneDayAgo
      );

      elizaLogger.debug("[EMAIL-PLUGIN] Retrieved emails for action", {
        emailCount: emails.length,
        roomId,
        emails: emails.map(e => ({
          memoryId: e.id,
          emailUUID: normalizeEmailId(e.content.metadata?.emailId ?? ""),
          originalEmailId: e.content.metadata?.originalEmailId ?? "",
          from: e.content.metadata?.from?.[0]?.address ?? "Unknown",
          subject: e.content.metadata?.subject ?? "No subject",
          date: e.content.metadata?.date ? new Date(e.content.metadata.date).toLocaleString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          }) : "Unknown",
        })),
      });

      let responseText: string;
      const isListingIds = (
        message.content.text?.toLowerCase().includes("what emailid") ||
        message.content.text?.toLowerCase().includes("list email ids") ||
        message.content.text?.toLowerCase().includes("which email ids") ||
        message.content.text?.toLowerCase().includes("emailid do you have") ||
        message.content.text?.toLowerCase().includes("email ids saved")
      );

      const showFullEmails = (
        message.content.text?.toLowerCase().includes("show full") ||
        message.content.text?.toLowerCase().includes("display full") ||
        message.content.text?.toLowerCase().includes("complete email") ||
        message.content.text?.toLowerCase().includes("full email")
      );

      if (!emails.length) {
        responseText = "📭 No new emails have been received in the last 24 hours.";
      } else if (isListingIds) {
        const emailIds = emails.map(e => normalizeEmailId(e.content.metadata?.emailId ?? "")).filter(id => id);
        responseText = emailIds.length > 0
          ? `📋 Available email UUIDs:\n${emailIds.map(id => `  • ${id}`).join("\n")}\n\n💡 Use 'reply to emailId: <uuid> message: <text>' to reply.`
          : "📭 No email UUIDs are currently stored.";
      } else {
        responseText = `📬 Here are your emails from the last 24 hours:\n\n💡 Reply using: 'reply to emailId: <uuid> message: <text>'\n💡 To generate a reply: 'reply to emailId: <uuid>'\n`;
        emails.forEach((email, index) => {
          responseText += formatEmailForDisplay(email, index, showFullEmails);
        });
      }

      if (options?.ragKnowledge) {
        responseText += `\n\n🧠 Relevant knowledge:\n${"─".repeat(40)}\n${options.ragKnowledge}`;
      }

      const response: Content = {
        text: responseText,
        source: "CHECK_EMAIL",
        user: runtime.character.id,
        thought: isListingIds
          ? "Listed available email UUIDs."
          : showFullEmails
            ? "Retrieved and displayed full emails."
            : "Retrieved emails with enhanced formatting for display.",
        actions: ["REPLY_EMAIL", "CHECK_EMAIL"],
        createdAt: Date.now(),
        metadata: {
          emails: emails.map(e => ({
            id: e.id,
            emailId: normalizeEmailId(e.content.metadata?.emailId ?? ""),
            originalEmailId: e.content.metadata?.originalEmailId ?? "",
            messageId: e.content.metadata?.messageId,
            from: e.content.metadata?.from?.[0]?.address,
            fromName: e.content.metadata?.from?.[0]?.name,
            subject: e.content.metadata?.subject,
            date: e.content.metadata?.date,
            body: enhancedCleanEmailBody(e.content.metadata?.body || e.content.text, true, e.content.metadata),
          })),
          ragKnowledge: state?.ragKnowledgeData?.map(item => item.id) || [],
          displayMode: showFullEmails ? "full" : "summary",
        },
      };

      const notificationMemory: Memory = {
        id: stringToUuid(`${Date.now()}${Math.random()}`),
        content: response,
        agentId: runtime.agentId,
        roomId: runtime.character.id,
        userId: runtime.character.id,
        createdAt: Date.now(),
      };

      await runtime.messageManager.createMemory(notificationMemory);
      elizaLogger.debug("[EMAIL-PLUGIN] CHECK_EMAIL action response stored", {
        memoryId: notificationMemory.id,
        emailCount: emails.length,
        displayMode: showFullEmails ? "full" : "summary",
        roomId,
      });

      if (callback) await callback(response);
      return true;
    } catch (error: any) {
      elizaLogger.error("[EMAIL-PLUGIN] CHECK_EMAIL action failed", {
        error: error.message,
        stack: error.stack,
        roomId: runtime.character.id,
      });
      const response: Content = {
        text: `❌ Sorry, I couldn't check emails. Please try again later.\n\n🧠 Relevant knowledge:\n${options?.ragKnowledge || "No relevant knowledge found."}`,
        thought: `Failed to check emails: ${error.message}`,
        source: "CHECK_EMAIL",
        user: runtime.character.id,
        createdAt: Date.now(),
      };
      const memory: Memory = {
        id: stringToUuid(`${Date.now()}${Math.random()}`),
        content: response,
        agentId: runtime.agentId,
        roomId: runtime.character.id,
        userId: runtime.character.id,
        createdAt: Date.now(),
      };
      await runtime.messageManager.createMemory(memory);
      elizaLogger.debug("[EMAIL-PLUGIN] Stored error memory", { memoryId: memory.id });
      if (callback) await callback(response);
      return false;
    }
  },

  examples: [
    [
      {
        user: "{{user1}}",
        content: { text: "check emails", action: "CHECK_EMAIL" },
      },
      {
        user: "{{agent}}",
        content: {
          text: "📬 Here are your emails from the last 24 hours:\n\n💡 Reply using: 'reply to emailId: <uuid> message: <text>'\n💡 To generate a reply: 'reply to emailId: <uuid>'",
          action: "CHECK_EMAIL",
          metadata: { emails: [] },
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: { text: "show full emails", action: "CHECK_EMAIL" },
      },
      {
        user: "{{agent}}",
        content: {
          text: "📬 Here are your complete emails from the last 24 hours:\n\n💡 Reply using: 'reply to emailId: <uuid> message: <text>'",
          action: "CHECK_EMAIL",
          metadata: { emails: [], displayMode: "full" },
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: { text: "any new emails?", action: "CHECK_EMAIL" },
      },
      {
        user: "{{agent}}",
        content: {
          text: "📬 Here are your emails from the last 24 hours:",
          action: "CHECK_EMAIL",
          metadata: { emails: [] },
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: { text: "check my inbox", action: "CHECK_EMAIL" },
      },
      {
        user: "{{agent}}",
        content: {
          text: "📭 No new emails have been received in the last 24 hours.",
          action: "CHECK_EMAIL",
          metadata: { emails: [] },
        },
      },
    ],
  ] as ActionExample[][]
};