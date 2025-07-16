import type { IAgentRuntime, RAGKnowledgeItem } from "@elizaos/core";
import { generateText, ModelClass, elizaLogger } from "@elizaos/core";
import { getEmailTemplate } from "@elizaos-plugins/plugin-shared-email-sanity";

interface EmailReplyOptions {
  runtime: IAgentRuntime;
  sender: string;
  subject: string;
  emailBody: string;
  emailId: string;
  context: RAGKnowledgeItem[];
}




export async function generateEmailReply({
  runtime,
  sender,
  subject,
  emailBody,
  emailId,
  context,
}: EmailReplyOptions): Promise<string> {
  try {
    const agentId = runtime.agentId;
    const template = await getEmailTemplate(agentId);
    const agentName = runtime.character.name;

    // Default template structure if none provided
    const emailTemplateStructure = template?.template || 'Dear {{sender}},\n\n{{body}}\n\n{{bestRegard}},\n{{agentName}}';
    const position = template?.position || '';
    const emailAddress = template?.emailAddress || '';
    const companyName = template?.companyName || '';
    const bestRegard = template?.bestRegard || 'Best regards';
    const instructions = template?.instructions || `
# Instructions:
- Generate only the body of the email reply, without greetings or signatures.
- Write a concise, professional, and context-aware reply to the email.
- Directly answer the question or topic raised in the Email Body using the provided Relevant Knowledge if applicable.
- If the Relevant Knowledge contains specific information (e.g., names, places, or facts) relevant to the Email Body, include it explicitly in the response.
- Keep the tone friendly and appropriate for an email response.
- Do not include sensitive information or fabricate details.
- Avoid using placeholders like [Your University/Institution Name]; use the knowledge provided or omit if no relevant knowledge exists.
- Return only the email body text, without greetings, signatures, or subject line.
`;

    const formattedKnowledge = context.length
      ? context
          .map(
            (item, index) =>
              `${index + 1}. ${item.content.text} (Source: ${item.content.metadata?.source || "unknown"})`
          )
          .join("\n")
      : "No relevant knowledge provided.";

    const prompt = `
# Task: Generate the body of a reply email for ${agentName}.
Character: ${agentName}
Sender: ${sender}
Subject: ${subject || "No subject"}
Email Body (Question to Answer): ${emailBody}
Email ID: ${emailId}

# Relevant Knowledge:
${formattedKnowledge}

${instructions}
`;

    const generatedBody = await generateText({
      runtime,
      context: prompt,
      modelClass: ModelClass.SMALL,
    });

    if (!generatedBody) {
      throw new Error("Generated reply body is empty");
    }

    // Replace placeholders in the template
    const emailTemplateText = emailTemplateStructure
      .replace('{{sender}}', sender.split("@")[0] || "Sender")
      .replace('{{body}}', generatedBody.trim())
      .replace('{{agentName}}', agentName)
      .replace('{{position}}', position)
      .replace('{{emailAddress}}', emailAddress)
      .replace('{{companyName}}', companyName)
      .replace('{{bestRegard}}', bestRegard);

    elizaLogger.debug("[EMAIL-PLUGIN] Generated email reply", { emailTemplateText, emailId });
    return emailTemplateText;
  } catch (error: any) {
    elizaLogger.error("[EMAIL-PLUGIN] Failed to generate email reply", { error: error.message, emailId });
    return `Dear ${sender.split("@")[0] || "Sender"},\n\nI'm unable to generate a detailed response at this time. Please provide more details or try again later.`;
  }
}