import { type Action, type IAgentRuntime, type Memory, type State, type Content, elizaLogger, type HandlerCallback, stringToUuid } from "@elizaos/core";
import { EmailService } from "../services/emailService";
import type { EmailPrompt, GeneratedEmailContent } from "../types";
import { EmailGenerationService } from "../services/emailGenerationService";

// Define the state interface
interface EmailState extends State {
    generatedEmail?: GeneratedEmailContent;
}

export const sendEmailAction: Action = {
    name: "send_email",
    description: "Send an email using the configured email service",
    similes: ["send email", "send the email", "deliver email"],
    examples: [
        [{ user: "user1", content: { text: "Please send this email to the team" } }],
        [{ user: "user1", content: { text: "Send the email to john@example.com" } }]
    ],
    suppressInitialMessage: true, // Ensure [message] response branch in DirectClient

    async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
        const content = message.content as Content;
        const text = content?.text?.toLowerCase() || '';

        // Strip Discord mention if present
        const cleanText = text.replace(/<@[0-9]+>\s*/, '').trim();

        // Check for send command
        const startsWithSend = /^(please\s+)?send(\s+an?)?\s+email/i.test(cleanText);
        const hasEmailAddress = /[\w.-]+@[\w.-]+\.\w+/.test(text); // Use original email regex

        elizaLogger.debug('Send validation:', {
            originalText: text,
            cleanText,
            startsWithSend,
            hasEmailAddress,
            userId: message.userId
        });

        return startsWithSend && hasEmailAddress;
    },

    async handler(
        runtime: IAgentRuntime,
        message: Memory,
        state?: EmailState,
        _options: { [key: string]: unknown } = {},
        callback?: HandlerCallback
    ): Promise<Memory[]> {
        try {
            elizaLogger.debug('Handler invoked for sendEmailAction', {
                messageId: message.id,
                userId: message.userId
            });

            // Initialize or update state
            let currentState = state;
            if (!currentState) {
                currentState = (await runtime.composeState(message)) as State;
            } else {
                currentState = await runtime.updateRecentMessageState(currentState);
            }

            elizaLogger.debug('Send handler started', {
                messageId: message.id,
                hasState: !!currentState,
                hasGeneratedEmail: !!currentState?.generatedEmail
            });

            // Get raw secrets string and validate early
            const secretsStr = runtime.getSetting('secrets');
            elizaLogger.debug('Got secrets configuration', {
                hasSecrets: !!secretsStr,
                keys: secretsStr ? Object.keys(typeof secretsStr === 'string' ? JSON.parse(secretsStr) : secretsStr) : []
            });

            if (!secretsStr) {
                const errorContent: Content = {
                    text: 'Email configuration not found. Please check your secrets settings.',
                    error: 'Missing secrets configuration'
                };
                if (callback) {
                    await callback(errorContent);
                }
                return [{
                    id: stringToUuid(`error-${Date.now()}`),
                    userId: message.userId,
                    agentId: runtime.agentId,
                    roomId: message.roomId,
                    createdAt: Date.now(),
                    content: errorContent
                }];
            }

            // Parse secrets string to object
            const secrets = typeof secretsStr === 'string' ? JSON.parse(secretsStr) : secretsStr;

            // Validate required secrets for Resend
            if (!secrets.RESEND_API_KEY) {
                const errorContent: Content = {
                    text: 'Resend API key not configured. Please add RESEND_API_KEY to your secrets.',
                    error: 'Missing RESEND_API_KEY'
                };
                if (callback) {
                    await callback(errorContent);
                }
                return [{
                    id: stringToUuid(`error-${Date.now()}`),
                    userId: message.userId,
                    agentId: runtime.agentId,
                    roomId: message.roomId,
                    createdAt: Date.now(),
                    content: errorContent
                }];
            }

            // Extract recipient email address (to)
            const toMatch = message.content.text.match(/[\w.-]+@[\w.-]+\.\w+/); // Use original email regex
            elizaLogger.debug('Extracted recipient email address', {
                hasMatch: !!toMatch,
                email: toMatch ? toMatch[0] : null
            });

            if (!toMatch) {
                const errorContent: Content = {
                    text: 'Please provide a valid recipient email address.',
                    error: 'Invalid email format'
                };
                if (callback) {
                    await callback(errorContent);
                }
                return [{
                    id: stringToUuid(`error-${Date.now()}`),
                    userId: message.userId,
                    agentId: runtime.agentId,
                    roomId: message.roomId,
                    createdAt: Date.now(),
                    content: errorContent
                }];
            }

            // Check if we have a generated email
            if (!currentState?.generatedEmail) {
                elizaLogger.debug('No email content found, generating from message...');
                
                // Parse subject, text, and html from message
                const subjectMatch = message.content.text.match(/subject:\s*['"]([^'"]+)['"]/i);
                const textMatch = message.content.text.match(/text:\s*['"]([^'"]+)['"]/i);
                const htmlMatch = message.content.text.match(/html:\s*['"]([^'"]+)['"]/i);

                if (!subjectMatch && !textMatch && !htmlMatch) {
                    const errorContent: Content = {
                        text: 'Please provide email content with subject, text, or html fields.',
                        error: 'Missing email content'
                    };
                    if (callback) {
                        await callback(errorContent);
                    }
                    return [{
                        id: stringToUuid(`error-${Date.now()}`),
                        userId: message.userId,
                        agentId: runtime.agentId,
                        roomId: message.roomId,
                        createdAt: Date.now(),
                        content: errorContent
                    }];
                }

                const emailService = new EmailGenerationService(runtime);
                const content = message.content as Content;

                const prompt: EmailPrompt = {
                    content: textMatch ? textMatch[1] : htmlMatch ? htmlMatch[1].replace(/<[^>]+>/g, '') : content.text,
                    tone: 'professional',
                    format: 'paragraph',
                    language: 'English'
                };

                let generatedEmail: GeneratedEmailContent;
                try {
                    generatedEmail = await emailService.generateEmail(prompt);
                    elizaLogger.debug('Generated email content:', { generatedEmail });
                } catch (error) {
                    elizaLogger.error('Failed to generate email, using fallback:', {
                        error: error instanceof Error ? error.message : String(error)
                    });
                    generatedEmail = {
                        subject: subjectMatch ? subjectMatch[1] : 'Email from agentVooc',
                        blocks: htmlMatch ? [{ type: 'paragraph', content: htmlMatch[1].replace(/<[^>]+>/g, '') }] :
                                textMatch ? [{ type: 'paragraph', content: textMatch[1] }] :
                                [{ type: 'paragraph', content: 'Default email content' }],
                        metadata: {
                            tone: 'professional',
                            intent: 'communication',
                            priority: 'medium'
                        }
                    };
                }

                currentState.generatedEmail = {
                    subject: subjectMatch ? subjectMatch[1] : generatedEmail.subject,
                    blocks: htmlMatch ? [{ type: 'paragraph', content: htmlMatch[1].replace(/<[^>]+>/g, '') }] :
                            textMatch ? [{ type: 'paragraph', content: textMatch[1] }] :
                            generatedEmail.blocks,
                    metadata: generatedEmail.metadata || {
                        tone: 'professional',
                        intent: 'communication',
                        priority: 'medium'
                    }
                };

                elizaLogger.debug('State before update:', { generatedEmail: currentState.generatedEmail });
                await runtime.updateRecentMessageState(currentState);
                elizaLogger.debug('State after update:', { generatedEmail: currentState.generatedEmail });
            }

            // Validate email content exists
            if (!currentState?.generatedEmail) {
                const errorContent: Content = {
                    text: 'Failed to generate email content. Please try again.',
                    error: 'No generated content'
                };
                if (callback) {
                    await callback(errorContent);
                }
                return [{
                    id: stringToUuid(`error-${Date.now()}`),
                    userId: message.userId,
                    agentId: runtime.agentId,
                    roomId: message.roomId,
                    createdAt: Date.now(),
                    content: errorContent
                }];
            }

            // Initialize EmailService with proper configuration
            const emailService = new EmailService({
                RESEND_API_KEY: secrets.RESEND_API_KEY,
                OWNER_EMAIL: 'onboarding@resend.dev'
            });

            // Map blocks to text and handle html
            const htmlMatch = message.content.text.match(/html:\s*['"]([^'"]+)['"]/i);
            const emailText = currentState.generatedEmail.blocks
                .map(block => block.content)
                .join('\n');

            // Build email options
            const fromEmail = 'onboarding@resend.dev';
            const emailOptions: any = {
                from: fromEmail,
                to: [toMatch[0]], // Adjusted to use toMatch[0] to match original regex
                subject: currentState.generatedEmail.subject || 'Email from agentVooc'
            };

            if (htmlMatch) {
                emailOptions.html = htmlMatch[1];
                elizaLogger.debug('Using HTML content for email');
            } else {
                emailOptions.text = emailText;
                elizaLogger.debug('Using plain text content for email');
            }

            elizaLogger.debug('Sending email', {
                to: toMatch[0],
                from: fromEmail,
                subject: emailOptions.subject,
                hasSubject: !!emailOptions.subject,
                blockCount: currentState.generatedEmail.blocks.length,
                hasHtml: !!htmlMatch,
                hasText: !htmlMatch,
                apiKeyConfigured: !!secrets.RESEND_API_KEY
            });

            try {
                const result = await emailService.sendEmail(currentState.generatedEmail, emailOptions);
                elizaLogger.debug('Email sent successfully', { result });

                const successContent: Content = {
                    text: `✅ Email sent successfully to ${toMatch[0]}!\n\nSubject: ${emailOptions.subject}\n${htmlMatch ? 'Content: HTML email' : `Content: ${emailText.substring(0, 100)}...`}`,
                    success: true,
                    source: 'send_email',
                    actions: ['REPLY'],
                    emailSent: {
                        to: toMatch[0],
                        subject: emailOptions.subject,
                        resendId: result.id,
                        provider: result.provider,
                        timestamp: new Date().toISOString()
                    }
                };

                const successMessage: Memory = {
                    id: stringToUuid(`success-${Date.now()}`),
                    userId: runtime.agentId, // Agent responds, so use agentId
                    agentId: runtime.agentId,
                    roomId: message.roomId,
                    createdAt: Date.now(),
                    content: successContent
                };

                if (callback) {
                    await callback(successContent);
                    elizaLogger.debug('[EMAIL-AUTOMATION] Callback invoked with success response', { successContent });
                }

                return [successMessage];

            } catch (error) {
                const errorText = error instanceof Error ? error.message : String(error);
                elizaLogger.error('Failed to send email via Resend:', {
                    errorMessage: errorText,
                    errorStack: error instanceof Error ? error.stack : undefined,
                    options: {
                        to: emailOptions.to,
                        subject: emailOptions.subject,
                        from: emailOptions.from
                    }
                });

                const errorContent: Content = {
                    text: `❌ Failed to send email: ${errorText}`,
                    error: 'Send failed',
                    source: 'send_email',
                    actions: ['REPLY'],
                    details: errorText
                };

                if (callback) {
                    await callback(errorContent);
                    elizaLogger.debug('[EMAIL-AUTOMATION] Callback invoked with error response', { errorContent });
                }

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
            elizaLogger.error('Failed to handle email action:', {
                errorMessage: errorText,
                errorStack: error instanceof Error ? error.stack : undefined
            });

            const errorContent: Content = {
                text: `❌ Failed to process email request: ${errorText}`,
                error: 'Processing failed',
                source: 'send_email',
                actions: ['REPLY'],
                details: errorText
            };

            if (callback) {
                await callback(errorContent);
                elizaLogger.debug('[EMAIL-AUTOMATION] Callback invoked with error response', { errorContent });
            }

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