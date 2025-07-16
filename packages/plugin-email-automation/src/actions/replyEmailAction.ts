import { type Action, type IAgentRuntime, type Memory, type State, type Content, elizaLogger, type HandlerCallback, stringToUuid } from "@elizaos/core";
import { EmailService } from "../services/emailService";
import type { EmailPrompt, GeneratedEmailContent, EmailBlock } from "../types";
import { EmailGenerationService } from "../services/emailGenerationService";

interface EmailState extends State {
    generatedReply?: GeneratedEmailContent;
}

interface EmailMetadata {
    from?: { address: string; name?: string }[];
    subject?: string;
    date?: string | Date;
    emailId?: string;
    messageId?: string;
    references?: string[];
    threadId?: string;
    collection?: string;
}

interface EmailMemory extends Memory {
    content: {
        text: string;
        metadata?: EmailMetadata;
    };
}

export const replyEmailAction: Action = {
    name: "reply_email",
    description: "Reply to an email using the configured email service",
    similes: ["reply to email", "respond to email", "answer email"],
    examples: [
        [{ user: "user1", content: { text: "Please reply to the email from john@example.com with: Thanks!" } }],
        [{ user: "user1", content: { text: "Reply to emailId: 'CAGzg+1gCHX...' with text: 'Thanks!'" } }]
    ],
    suppressInitialMessage: true,

    async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
        const content = message.content as Content;
        const text = content?.text?.toLowerCase() || '';
        const cleanText = text.replace(/<@[0-9]+>\s*/, '').trim();
        const startsWithReply = /^(please\s+)?(reply|respond|answer)(\s+to)?\s+email/i.test(cleanText);
        const hasEmailAddress = /[\w.-]+@[\w.-]+\.\w+/.test(text);
        const hasEmailId = /emailId:\s*['"]([^'"]+)['"]/i.test(text);

        elizaLogger.debug('Reply validation:', {
            originalText: text,
            cleanText,
            startsWithReply,
            hasEmailAddress,
            hasEmailId,
            userId: message.userId
        });

        return startsWithReply && (hasEmailAddress || hasEmailId);
    },

async handler(
  runtime: IAgentRuntime,
  message: Memory,
  state?: EmailState,
  _options: { [key: string]: unknown } = {},
  callback?: HandlerCallback
): Promise<Memory[]> {
  try {
    elizaLogger.debug('Handler invoked for replyEmailAction', {
      messageId: message.id,
      userId: message.userId
    });

    let currentState = state;
    if (!currentState) {
      currentState = (await runtime.composeState(message)) as State;
    } else {
      currentState = await runtime.updateRecentMessageState(currentState);
    }

    const secretsStr = runtime.getSetting('secrets');
    if (!secretsStr) {
      const errorContent: Content = {
        text: 'Email configuration not found. Please check your secrets settings.',
        error: 'Missing secrets configuration'
      };
      if (callback) await callback(errorContent);
      return [{
        id: stringToUuid(`error-${Date.now()}`),
        userId: message.userId,
        agentId: runtime.agentId,
        roomId: message.roomId,
        createdAt: Date.now(),
        content: errorContent
      }];
    }

    const secrets = typeof secretsStr === 'string' ? JSON.parse(secretsStr) : secretsStr;
    if (!secrets.RESEND_API_KEY) {
      const errorContent: Content = {
        text: 'Resend API key not configured. Please add RESEND_API_KEY to your secrets.',
        error: 'Missing RESEND_API_KEY'
      };
      if (callback) await callback(errorContent);
      return [{
        id: stringToUuid(`error-${Date.now()}`),
        userId: message.userId,
        agentId: runtime.agentId,
        roomId: message.roomId,
        createdAt: Date.now(),
        content: errorContent
      }];
    }

    // Extract recipient email or emailId
    const toMatch = message.content.text.match(/[\w.-]+@[\w.-]+\.\w+/);
    const emailIdMatch = message.content.text.match(/emailId:\s*['"]([^'"]+)['"]/i);

    if (!toMatch && !emailIdMatch) {
      const errorContent: Content = {
        text: 'Please provide a valid recipient email address or emailId.',
        error: 'Invalid email format'
      };
      if (callback) await callback(errorContent);
      return [{
        id: stringToUuid(`error-${Date.now()}`),
        userId: message.userId,
        agentId: runtime.agentId,
        roomId: message.roomId,
        createdAt: Date.now(),
        content: errorContent
      }];
    }

    // Find original email
    const memories = await runtime.messageManager.getMemories({
      roomId: message.roomId,
      count: 50
    }) as Memory[];

    const emailMemories = memories.filter((m): m is EmailMemory => {
      const metadata = m.content.metadata as EmailMetadata | undefined;
      return !!metadata?.collection && metadata.collection === "emails";
    });

    const originalEmail = emailMemories.find(m =>
      (emailIdMatch && m.content.metadata?.emailId === emailIdMatch[1]) ||
      (toMatch && m.content.metadata?.from?.[0]?.address === toMatch[0])
    );

    if (!originalEmail) {
      const errorContent: Content = {
        text: `No email found${toMatch ? ` from ${toMatch[0]}` : ''}${emailIdMatch ? ` with emailId ${emailIdMatch[1]}` : ''} to reply to.`,
        error: 'No original email'
      };
      if (callback) await callback(errorContent);
      return [{
        id: stringToUuid(`error-${Date.now()}`),
        userId: message.userId,
        agentId: runtime.agentId,
        roomId: message.roomId,
        createdAt: Date.now(),
        content: errorContent
      }];
    }

    // Extract threading headers
    const messageId = originalEmail.content.metadata?.messageId || originalEmail.content.metadata?.emailId;
    const references = originalEmail.content.metadata?.references || [];
    const subject = originalEmail.content.metadata?.subject || 'No Subject';
    const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

    if (!messageId) {
      elizaLogger.warn('No Message-ID found, reply may not thread correctly', {
        emailId: originalEmail.content.metadata?.emailId
      });
    }

    // Generate reply content
    if (!currentState?.generatedReply) {
      elizaLogger.debug('No reply content found, generating from message...');
      const textMatch = message.content.text.match(/text:\s*['"]([\s\S]*?)['"](?=\s*(?:html:|$))/i);
      const htmlMatch = message.content.text.match(/html:\s*['"]([^'"]+)['"]/i);

      let generatedReply: GeneratedEmailContent;
      if (textMatch) {
        const paragraphs = textMatch[1].split(/\r?\n\r?\n/).filter(p => p.trim());
        const blocks: EmailBlock[] = paragraphs.map((p, index) => ({
          type: (index === paragraphs.length - 1 && p.match(/^(best regards|sincerely|cheers)/i) ? 'signature' : 'paragraph') as 'paragraph' | 'signature',
          content: p.trim(),
          metadata: {}
        }));
        generatedReply = {
          subject: replySubject,
          blocks,
          metadata: {
            tone: 'professional',
            intent: 'communication',
            priority: 'high'
          }
        };
      } else {
        const emailService = new EmailGenerationService(runtime);
        const prompt: EmailPrompt = {
          content: htmlMatch ? htmlMatch[1].replace(/<[^>]+>/g, '') : message.content.text,
          tone: 'professional',
          format: 'paragraph',
          language: 'English'
        };

        try {
          generatedReply = await emailService.generateEmail(prompt);
          generatedReply.subject = replySubject;
          generatedReply.metadata.priority = 'high';
        } catch (error) {
          elizaLogger.error('Failed to generate reply, using fallback:', {
            error: error instanceof Error ? error.message : String(error)
          });
          const fallbackText = htmlMatch ? htmlMatch[1].replace(/<[^>]+>/g, '') : message.content.text;
          const paragraphs = fallbackText.split(/\r?\n\r?\n/).filter(p => p.trim());
          const blocks: EmailBlock[] = paragraphs.map((p, index) => ({
            type: (index === paragraphs.length - 1 && p.match(/^(best regards|sincerely|cheers)/i) ? 'signature' : 'paragraph') as 'paragraph' | 'signature',
            content: p.trim(),
            metadata: {}
          }));
          generatedReply = {
            subject: replySubject,
            blocks,
            metadata: {
              tone: 'professional',
              intent: 'communication',
              priority: 'high'
            }
          };
        }
      }

      currentState.generatedReply = generatedReply;
      await runtime.updateRecentMessageState(currentState);
    }

    if (!currentState?.generatedReply) {
      const errorContent: Content = {
        text: 'Failed to generate reply content. Please try again.',
        error: 'No generated content'
      };
      if (callback) await callback(errorContent);
      return [{
        id: stringToUuid(`error-${Date.now()}`),
        userId: message.userId,
        agentId: runtime.agentId,
        roomId: message.roomId,
        createdAt: Date.now(),
        content: errorContent
      }];
    }

    const emailService = new EmailService({
      RESEND_API_KEY: secrets.RESEND_API_KEY,
      OWNER_EMAIL: 'onboarding@resend.dev'
    });

    const htmlMatch = message.content.text.match(/html:\s*['"]([^'"]+)['"]/i);
    const emailText = currentState.generatedReply.blocks
      .map(block => block.content)
      .join('\n\n');

    const fromEmail = 'onboarding@resend.dev';
    const emailOptions: any = {
      from: fromEmail,
      to: [toMatch ? toMatch[0] : originalEmail.content.metadata?.from?.[0]?.address],
      subject: currentState.generatedReply.subject,
    };

    if (messageId) {
      emailOptions.headers = {
        'In-Reply-To': messageId,
        'References': [...references, messageId].join(' ')
      };
    }

    if (htmlMatch) {
      emailOptions.html = htmlMatch[1];
      elizaLogger.debug('Using HTML content for reply');
    } else {
      emailOptions.text = emailText;
      elizaLogger.debug('Using plain text content for reply');
    }

    elizaLogger.debug('Sending reply email', {
      to: emailOptions.to[0],
      from: fromEmail,
      subject: emailOptions.subject,
      inReplyTo: messageId,
      references: emailOptions.headers?.References,
      blockCount: currentState.generatedReply.blocks.length,
      hasHtml: !!htmlMatch
    });

    try {
      const result = await emailService.sendEmail(currentState.generatedReply, emailOptions);
      elizaLogger.debug('Reply sent successfully', { result });

      const successContent: Content = {
        text: `✅ Reply sent successfully to ${emailOptions.to[0]}!\n\nSubject: ${emailOptions.subject}\n${htmlMatch ? 'Content: HTML email' : `Content: ${emailText.substring(0, 100)}...`}`,
        success: true,
        source: 'reply_email',
        actions: ['REPLY'],
        emailSent: {
          to: emailOptions.to[0],
          subject: emailOptions.subject,
          resendId: result.id,
          provider: result.provider,
          timestamp: new Date().toISOString()
        }
      };

      const successMessage: Memory = {
        id: stringToUuid(`success-${Date.now()}`),
        userId: runtime.agentId,
        agentId: runtime.agentId,
        roomId: message.roomId,
        createdAt: Date.now(),
        content: successContent
      };

      if (callback) await callback(successContent);
      return [successMessage];

    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      elizaLogger.error('Failed to send reply via Resend:', { errorText });
      const errorContent: Content = {
        text: `❌ Failed to send reply: ${errorText}`,
        error: 'Send failed',
        source: 'reply_email',
        actions: ['REPLY'],
        details: errorText
      };

      if (callback) await callback(errorContent);
      return [{
        id: stringToUuid(`error-${Date.now()}`),
        userId: runtime.agentId,
        agentId: runtime.agentId,
        roomId: message.roomId,
        createdAt: Date.now(),
        content: errorContent
      }];
    }

  } catch (error) {
    const errorText = error instanceof Error ? error.message : String(error);
    elizaLogger.error('Failed to handle reply action:', { errorText });
    const errorContent: Content = {
      text: `❌ Failed to process reply request: ${errorText}`,
      error: 'Processing failed',
      source: 'reply_email',
      actions: ['REPLY'],
      details: errorText
    };

    if (callback) await callback(errorContent);
    return [{
      id: stringToUuid(`error-${Date.now()}`),
      userId: runtime.agentId,
      agentId: runtime.agentId,
      roomId: message.roomId,
      createdAt: Date.now(),
      content: errorContent
    }];
  }
}
};