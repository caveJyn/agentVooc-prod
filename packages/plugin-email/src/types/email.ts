import type { Service, UUID } from "@elizaos/core";
import type { EmailContent } from "mail-notifier";

interface EmailAttachment {
    filename: string;
    path: string;
    cid?: string;
}

export interface SendEmailOptions {
    from?: string;
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    attachments?: EmailAttachment[];
    cc?: string | string[];
    bcc?: string | string[];
    replyTo?: string;
        inReplyTo?: string; // Added: For email threading (message ID to reply to)
    references?: string | string[]; // Added: For email threading (references to previous messages)
        headers?: Record<string, string>; // Optional headers for threading and custom use
          threadId?: string; // Added to support threading

    }

export interface EmailResponse {
    success: boolean;
    messageId?: string;
    response?: string;
    error?: string;
    accepted?: string[]; // Added: Email addresses accepted by the SMTP server
    rejected?: string[]; // Added: Email addresses rejected by the SMTP serve
    
}


export interface IEmailService extends Service {
    send(options: SendEmailOptions): Promise<EmailResponse>;
    receive(callback: (mail: EmailContent) => void): void;
}

export interface ExtendedEmailContent extends EmailContent {
  messageId?: string;
  references?: string[];
  threadId?: string;
  emailUUID: UUID; // Unique identifier for the email in the system
}