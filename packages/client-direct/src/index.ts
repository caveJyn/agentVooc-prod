import {
    composeContext,
    elizaLogger,
    generateCaption,
    generateImage,
    generateMessageResponse,
    generateObject,
    getEmbeddingZeroVector,
    messageCompletionFooter,
    ModelClass,
    settings,
    stringToUuid,
    type AgentRuntime,
    type Client,
    type Content,
    type IAgentRuntime,
    type Media,
    type Memory,
    type Plugin,
} from "@elizaos/core";
import bodyParser from "body-parser";
import cors from "cors";
import express, { type Request as ExpressRequest } from "express";
import * as fs from "fs";
import multer from "multer";
import OpenAI from "openai";
import * as path from "path";
import { z } from "zod";
import { createApiRouter } from "./api.ts";
import { createVerifiableLogApiRouter } from "./verifiable-log-api.ts";
import "./superTokens.ts"; // Ensure SuperTokens is initialized
import { middleware, errorHandler } from "supertokens-node/framework/express";
import { backendConfig } from "./config/backendConfig";
import ThirdParty from "supertokens-node/recipe/thirdparty"; // Import the thirdparty recipe
import supertokens from "supertokens-node";
import Session from "supertokens-node/recipe/session";
import { sanityClient, urlFor } from "@elizaos-plugins/plugin-sanity";

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(process.cwd(), "data", "uploads");
        // Create the directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${uniqueSuffix}-${file.originalname}`);
    },
});

// some people have more memory than disk.io
const upload = multer({ storage /*: multer.memoryStorage() */ });

export const messageHandlerTemplate =
    // {{goals}}
    // "# Action Examples" is already included
    `{{actionExamples}}
(Action examples are for reference only. Do not use the information from them in your response.)

# Knowledge
You MUST always use the updated knowledge, even if it is not mentioned in the context.
You prioritize the following knowledge when generating a response. If new knowledge is added and/or updated, it takes precedence over your context. If the knowledge you queried in your semantic search is not available in your {{context}}, then use the following knowledge which is available to you: 
{{knowledge}}


# Task: Generate dialog and actions for the character {{agentName}}.
About {{agentName}}:
{{bio}}
{{lore}}

{{providers}}

{{attachments}}

# Capabilities
Note that {{agentName}} is capable of reading/seeing/hearing various forms of media, including images, videos, audio, plaintext and PDFs. Recent attachments have been included above under the "Attachments" section.

# Instructions: Write the next message for {{agentName}}.

## Addressing the User
- Use {{userName}} to address the user if provided (e.g., "Hello, {{userName}}!").
- If {{userName}} is not available, use a friendly term like "friend" (e.g., "Hello, friend!").
- Do NOT use placeholders like "{{user}}" or "User..." in responses; they are for example purposes only.


{{messageDirections}}

{{recentMessages}}

## Handling User ID Queries
If the user's message contains phrases like "what's my user id", "user id", "my user id", or "complete user id", respond with the user's ID is private {{userId}}. Do NOT interpret these as email-related commands. Example response:
"Your user ID is private."

# Available Actions
The following actions are currently available to you:
{{actions}}

- You MUST only suggest or perform actions from the above list. Do NOT suggest or mention any actions that are not listed, such as posting tweets if the Twitter plugin is not available.
- For any user request to check emails (e.g., "check my inbox," "check emails," "new emails"), always execute the CHECK_EMAIL action to fetch and display the latest emails. Do not respond with "I've already checked your emails" or similar messages unless explicitly instructed.
- If the user asks to generate a reply for this emailId: <id>, use the REPLY_EMAIL action with the provided email ID to generate a response.
- For any user request to "confirm reply", you always perform the REPLY_EMAIL action to send the reply. Never use the IGNORE action for this.

# Instructions: Write the next message for {{agentName}}.
` + messageCompletionFooter;

export const hyperfiHandlerTemplate = `{{actionExamples}}
(Action examples are for reference only. Do not use the information from them in your response.)

# Knowledge
{{knowledge}}

# Task: Generate dialog and actions for the character {{agentName}}.
About {{agentName}}:
{{bio}}
{{lore}}

{{providers}}

{{attachments}}

# Capabilities
Note that {{agentName}} is capable of reading/seeing/hearing various forms of media, including images, videos, audio, plaintext and PDFs. Recent attachments have been included above under the "Attachments" section.

{{messageDirections}}

{{recentMessages}}

{{actions}}

# Instructions: Write the next message for {{agentName}}.

Response format should be formatted in a JSON block like this:
\`\`\`json
{ "lookAt": "{{nearby}}" or null, "emote": "{{emotes}}" or null, "say": "string" or null, "actions": (array of strings) or null }
\`\`\`
`;







export class DirectClient {
    public app: express.Application;
    private agents: Map<string, IAgentRuntime>; // container management
    private server: any; // Store server instance
    public startAgent: Function; // Store startAgent functor
    public loadCharacterTryPath: Function; // Store loadCharacterTryPath functor
    public jsonToCharacter: Function; // Store jsonToCharacter functor

    constructor() {
        elizaLogger.log("DirectClient constructor");
        this.app = express();
        this.agents = new Map();

this.app.set('trust proxy', 1);
        // Define allowed origins
const allowedOrigins = [
    process.env.WEBSITE_DOMAIN,
    process.env.ST_SERVER_BASE_URL,
    "https://agentvooc.com", // Explicitly include the primary domain
].filter(Boolean); // Remove undefined/null values
elizaLogger.debug(`[CORS] Allowed origins: ${allowedOrigins.join(", ")}`);

// Reusable CORS configuration
const corsOptions = {
    origin: (origin, callback) => {
        elizaLogger.debug(`[CORS] Request origin: ${origin || "none"}`);
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            elizaLogger.warn(`[CORS] Blocked request from origin: ${origin}`);
            callback(new Error(`CORS policy: Origin ${origin} not allowed`));
        }
    },
    credentials: true,
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        ...supertokens.getAllCORSHeaders(),
    ],
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    exposedHeaders: ["Content-Range"], // Optional: Expose headers if needed
};

     // Apply CORS globally
        this.app.use(cors(corsOptions));


       

          
         // Debug middleware
        this.app.use((req, res, next) => {
            elizaLogger.debug(`Incoming request: ${req.method} ${req.url}, Cookies:`, req.cookies);
            const originalJson = res.json;
            res.json = function (body) {
                elizaLogger.debug(`Response for ${req.method} ${req.url}:`, JSON.stringify(body));
                elizaLogger.debug(`CORS headers for ${req.method} ${req.url}:`, {
                    "Access-Control-Allow-Origin": res.get("Access-Control-Allow-Origin"),
                    "Access-Control-Allow-Credentials": res.get("Access-Control-Allow-Credentials"),
                    "Access-Control-Allow-Headers": res.get("Access-Control-Allow-Headers"),
                    "Set-Cookie": res.get("Set-Cookie"),
                });
                return originalJson.call(this, body);
            };
            next();
        });
          
 /// Webhook middleware
        this.app.use('/api/webhook', bodyParser.raw({ type: 'application/json' }), (req, res, next) => {
            elizaLogger.debug('[INDEX] Webhook middleware', {
                path: req.path,
                originalUrl: req.originalUrl,
                isBuffer: Buffer.isBuffer(req.body),
                bodyType: typeof req.body,
            });
            next();
        });


        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({ extended: true }));


 
           // Add SuperTokens middleware before other routes
   this.app.use(middleware());

        // Serve both uploads and generated images
        this.app.use(
            "/media/uploads",
            express.static(path.join(process.cwd(), "/data/uploads"))
        );
        this.app.use(
            "/media/generated",
            express.static(path.join(process.cwd(), "/generatedImages"))
        );

   // Mount API routers under /api
   const apiRouter = createApiRouter(this.agents, this);
   this.app.use("/api", apiRouter);

        const apiLogRouter = createVerifiableLogApiRouter(this.agents);
        this.app.use(apiLogRouter);

        // Define an interface that extends the Express Request interface
        interface CustomRequest extends ExpressRequest {
            file?: Express.Multer.File;
        }

        // Update the route handler to use CustomRequest instead of express.Request
        this.app.post(
            "/:agentId/whisper",
            upload.single("file"),
            async (req: CustomRequest, res: express.Response) => {
                const audioFile = req.file; // Access the uploaded file using req.file
                const agentId = req.params.agentId;

                if (!audioFile) {
                    res.status(400).send("No audio file provided");
                    return;
                }

                let runtime = this.agents.get(agentId);
                const apiKey = runtime.getSetting("OPENAI_API_KEY");

                // if runtime is null, look for runtime with the same name
                if (!runtime) {
                    runtime = Array.from(this.agents.values()).find(
                        (a) =>
                            a.character.name.toLowerCase() ===
                            agentId.toLowerCase()
                    );
                }

                if (!runtime) {
                    res.status(404).send("Agent not found");
                    return;
                }

                const openai = new OpenAI({
                    apiKey,
                });

                const transcription = await openai.audio.transcriptions.create({
                    file: fs.createReadStream(audioFile.path),
                    model: "whisper-1",
                });

                res.json(transcription);
            }
        );
// packages/client-direct/src/api.ts
async function getUserLimits(user) {
  const now = new Date();
  if (user.subscriptionStatus === "active") {
    const activePriceId = user.activePriceIds[0];
    const plan = await sanityClient.fetch(
      `*[_type == "Item" && stripePriceId == $activePriceId][0]`,
      { activePriceId }
    );
    return {
      maxResponses: plan.maxResponsesPerMonth,
      maxTokens: plan.maxTokensPerMonth,
    };
  } else if (
    user.subscriptionStatus === "trialing" &&
    now >= new Date(user.trialStartDate) &&
    now <= new Date(user.trialEndDate)
  ) {
    // Use Basic plan limits during trial
    const basicPlan = await sanityClient.fetch(
      `*[_type == "Item" && name == "Basic Plan"][0]`,
      {}
    );
    return {
      maxResponses: basicPlan.maxResponsesPerMonth,
      maxTokens: basicPlan.maxTokensPerMonth,
    };
  } else {
    return { maxResponses: 0, maxTokens: 0 };
  }
}

this.app.post(
  "/api/:agentId/message",
  
  upload.single("file"),
  async (req: express.Request, res: express.Response) => {
    try {
      let userId: string;
      try {
        const session = await Session.getSession(req, res, { sessionRequired: true });
        userId = session.getUserId();
        elizaLogger.debug("[MESSAGE] Session validated, userId:", userId);
      } catch (sessionError) {
        elizaLogger.error("[MESSAGE] Session validation failed:", {
          message: sessionError.message,
          stack: sessionError.stack,
        });
        return res.status(401).json({ error: "Unauthorized: Invalid or missing session" });
      }

      const agentId = req.params.agentId;
      elizaLogger.debug("[MESSAGE] Processing message for agentId:", agentId);

      // Changed back to 'User' to match original
      const User = await sanityClient.fetch(
        `*[_type == "User" && userId == $userId][0]`,
        { userId }
      );
      if (!User) {
        elizaLogger.warn("[MESSAGE] No User found for userId:", userId);
        return res.status(404).json({ error: "User not found in Sanity" });
      }

      // Usage limit checks - keeping this from the updated version
      const limits = await getUserLimits(User);
      if (limits.maxResponses === 0 && limits.maxTokens === 0) {
        elizaLogger.warn("[MESSAGE] No active subscription or trial for userId:", userId);
        return res.status(403).json({ error: "No active subscription or trial" });
      }
      
      const now = new Date();
      if (now > new Date(User.currentPeriodEnd)) {
        elizaLogger.warn("[MESSAGE] Billing period ended for userId:", userId);
        return res.status(403).json({ error: "Billing period ended; awaiting renewal" });
      }
      
      if (User.responseCount >= limits.maxResponses || User.tokenCount >= limits.maxTokens) {
        elizaLogger.warn("[MESSAGE] Usage limit exceeded for userId:", userId, {
          responseCount: User.responseCount,
          tokenCount: User.tokenCount,
          maxResponses: limits.maxResponses,
          maxTokens: limits.maxTokens,
        });
        return res.status(403).json({ error: "Usage limit exceeded" });
      }

      const character = await sanityClient.fetch(
        `*[_type == "character" && id == $agentId && createdBy._ref == $userRef][0]`,
        { agentId, userRef: User._id }
      );
      if (!character) {
        elizaLogger.warn("[MESSAGE] Character not found for agentId:", agentId, "userRef:", User._id);
        return res.status(403).json({ error: "Character not found or access denied" });
      }
      elizaLogger.debug("[MESSAGE] Character fetched:", { id: character.id, name: character.name });

      const roomId = stringToUuid(req.body.roomId ?? "default-room-" + agentId);
      const userIdParam = stringToUuid(userId ?? req.body.userId ?? "default-user-" + agentId);

      let runtime = this.agents.get(agentId);
      if (!runtime) {
        runtime = Array.from(this.agents.values()).find(
          (a) => a.character.name.toLowerCase() === agentId.toLowerCase()
        );
      }
      if (!runtime) {
        elizaLogger.error("[MESSAGE] Agent runtime not found for agentId:", agentId);
        return res.status(404).json({ error: "Agent not found" });
      }
      elizaLogger.debug("[MESSAGE] Agent runtime found:", { agentId: runtime.agentId, name: runtime.character.name });

      // Validate runtime settings
      const openaiApiKey = runtime.getSetting("OPENAI_API_KEY");
      if (!openaiApiKey) {
        elizaLogger.error("[MESSAGE] Missing OPENAI_API_KEY for agentId:", agentId);
        return res.status(500).json({ error: "Agent configuration error: Missing OPENAI_API_KEY" });
      }

      await runtime.ensureConnection(
        userIdParam,
        roomId,
        req.body.userName,
        req.body.name,
        "direct"
      );
      elizaLogger.debug("[MESSAGE] Connection ensured for userId:", userIdParam, "roomId:", roomId);

      const text = req.body.text;
      if (!text) {
        elizaLogger.debug("[MESSAGE] No text provided for agentId:", agentId);
        return res.json([]);
      }

      const messageId = stringToUuid(Date.now().toString());

      const attachments: Media[] = [];
      if (req.file) {
        const filePath = path.join(process.cwd(), "data", "uploads", req.file.filename);
        attachments.push({
          id: Date.now().toString(),
          url: filePath,
          title: req.file.originalname,
          source: "direct",
          description: `Uploaded file: ${req.file.originalname}`,
          text: "",
          contentType: req.file.mimetype,
        });
      }

      // Handle image reference
      let imageDescription = "";
      const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : {};
      if (metadata.imageAssetId) {
        const knowledgeDoc = await sanityClient.fetch(
          `*[_type == "knowledge" && agentId == $agentId && metadata.type == "image-collection"][0]`,
          { agentId }
        );
        if (knowledgeDoc?.metadata?.images) {
          const image = knowledgeDoc.metadata.images.find(
            (img: any) => img.imageAssetId === metadata.imageAssetId
          );
          if (image) {
            try {
              const captionResult = await generateCaption({ imageUrl: image.imageUrl }, runtime);
              imageDescription = typeof captionResult === "string" ? captionResult : captionResult.description || image.caption;
              elizaLogger.debug("[MESSAGE] Generated image description:", imageDescription);
            } catch (visionError) {
              elizaLogger.warn("[MESSAGE] Failed to describe image:", {
                message: visionError.message,
                stack: visionError.stack,
              });
              imageDescription = image.caption || "Unable to describe the image.";
            }
          }
        }
      }

      const content: Content = {
        text: imageDescription ? `${text}\nImage description: ${imageDescription}` : text,
        attachments,
        source: "direct",
        inReplyTo: undefined,
        metadata,
      };

      const userMessage = {
        content,
        userId: userIdParam,
        roomId,
        agentId: runtime.agentId,
      };

      const memory: Memory = {
        id: stringToUuid(messageId + "-" + userIdParam),
        ...userMessage,
        agentId: runtime.agentId,
        userId: userIdParam,
        roomId,
        content,
        createdAt: Date.now(),
      };

      await runtime.messageManager.addEmbeddingToMemory(memory);
      await runtime.messageManager.createMemory(memory);
      elizaLogger.debug("[MESSAGE] User message memory created:", { memoryId: memory.id });

      // Validate character fields before composing state
      const characterFields = [
        { field: runtime.character.bio, name: "bio" },
        { field: runtime.character.lore, name: "lore" },
        { field: runtime.character.messageExamples, name: "messageExamples" },
        { field: runtime.character.postExamples, name: "postExamples" },
        { field: runtime.character.topics, name: "topics" },
        { field: runtime.character.adjectives, name: "adjectives" },
        { field: runtime.character.style?.all, name: "style.all" },
        { field: runtime.character.style?.chat, name: "style.chat" },
        { field: runtime.character.style?.post, name: "style.post" },
      ];
      for (const { field, name } of characterFields) {
        if (!Array.isArray(field)) {
          elizaLogger.error(`[MESSAGE] Invalid ${name} for agentId: ${agentId}, expected array, got:`, field);
          return res.status(500).json({ error: `Invalid character data: ${name} is not an array` });
        }
      }

      let state;
      try {
        state = await runtime.composeState(userMessage, {
          agentName: runtime.character.name,
          userId,
          userName: req.body.userName || req.body.name || "User",
        });
        elizaLogger.debug("[MESSAGE] State composed for agent:", runtime.character.name);
      } catch (stateError) {
        elizaLogger.error("[MESSAGE] Failed to compose state for agentId:", agentId, {
          message: stateError.message,
          stack: stateError.stack,
        });
        return res.status(500).json({ error: "Failed to compose agent state", details: stateError.message });
      }

      const context = composeContext({
        state,
        template: messageHandlerTemplate,
      });

      // Use original generateMessageResponse but track tokens for billing
      let response;
      let tokensUsed = 0;
      
      try {
        // Use the original generateMessageResponse function
        response = await generateMessageResponse({
          runtime: runtime,
          context,
          modelClass: ModelClass.LARGE,
        });
        
        // Extract token usage from the response if available
        // This depends on how your generateMessageResponse function returns token info
        // You may need to modify generateMessageResponse to return token usage
        if (response && response.tokensUsed) {
          tokensUsed = response.tokensUsed;
        } else {
          // Fallback: estimate tokens (rough approximation)
          const estimatedTokens = Math.ceil((context.length + (response?.text?.length || 0)) / 4);
          tokensUsed = estimatedTokens;
          elizaLogger.debug("[MESSAGE] Estimated tokens used:", tokensUsed);
        }
        
        elizaLogger.debug("[MESSAGE] Response generated with token tracking:", {
          tokensUsed,
          responseText: response?.text
        });
      } catch (genError) {
        elizaLogger.error("[MESSAGE] generateMessageResponse failed:", {
          message: genError.message,
          stack: genError.stack,
        });
        throw new Error(`Failed to generate response: ${genError.message}`);
      }

      if (!response) {
        elizaLogger.error("[MESSAGE] No response from generateMessageResponse for agentId:", agentId);
        return res.status(500).json({ error: "No response from generateMessageResponse" });
      }
      elizaLogger.debug("[MESSAGE] Response generated:", response);

      // Update usage counts - keeping this from the updated version
      const responseCount = User.responseCount + 1;
      const tokenCount = User.tokenCount + tokensUsed;
      try {
        await sanityClient
          .patch(User._id)
          .set({ responseCount, tokenCount })
          .commit();
        elizaLogger.debug("[MESSAGE] Usage updated for userId:", userId, {
          responseCount,
          tokenCount,
        });
      } catch (updateError) {
        elizaLogger.error("[MESSAGE] Failed to update usage counts:", {
          message: updateError.message,
          stack: updateError.stack,
        });
        return res.status(500).json({ error: "Failed to update usage counts" });
      }

      const responseMessage: Memory = {
        id: stringToUuid(messageId + "-" + runtime.agentId),
        ...userMessage,
        userId: runtime.agentId,
        content: response,
        embedding: getEmbeddingZeroVector(),
        createdAt: Date.now(),
      };

      await runtime.messageManager.createMemory(responseMessage);
      elizaLogger.debug("[MESSAGE] Response memory created:", { memoryId: responseMessage.id });

      state = await runtime.updateRecentMessageState(state);

      const messages: Content[] = [];

      await runtime.processActions(
        memory,
        [responseMessage],
        state,
        async (newMessages) => {
          if (newMessages) {
            if (Array.isArray(newMessages)) {
              messages.push(...newMessages);
            } else {
              messages.push(newMessages);
            }
            elizaLogger.debug("[MESSAGE] Actions processed, new messages:", newMessages);
          }
          return [memory];
        }
      );

      await runtime.evaluate(memory, state);
      elizaLogger.debug("[MESSAGE] Message evaluated");

      const action = runtime.actions.find((a) => a.name === response.action);
      const shouldSuppressInitialMessage = action?.suppressInitialMessage;

      // Always return messages from processActions if available
      if (messages.length > 0) {
        res.json(messages);
        elizaLogger.debug("[MESSAGE] Response sent with messages:", messages);
      } else if (!shouldSuppressInitialMessage) {
        res.json([response]);
        elizaLogger.debug("[MESSAGE] Response sent with initial response:", response);
      } else {
        res.json([]);
        elizaLogger.debug("[MESSAGE] No messages to send, returning empty array");
      }
    } catch (error) {
      elizaLogger.error("[MESSAGE] Error in /message endpoint:", {
        message: error.message,
        stack: error.stack,
        agentId: req.params.agentId,
        userId: req.body.userId || "unknown",
        roomId: req.body.roomId || "unknown",
        text: req.body.text || "none",
      });
      res.status(500).json({ error: "Internal server error", details: error.message });
    }
  }
);
        this.app.post(
            "/agents/:agentIdOrName/hyperfi/v1",
            async (req: express.Request, res: express.Response) => {
                // get runtime
                const agentId = req.params.agentIdOrName;
                let runtime = this.agents.get(agentId);
                // if runtime is null, look for runtime with the same name
                if (!runtime) {
                    runtime = Array.from(this.agents.values()).find(
                        (a) =>
                            a.character.name.toLowerCase() ===
                            agentId.toLowerCase()
                    );
                }
                if (!runtime) {
                    res.status(404).send("Agent not found");
                    return;
                }

                // can we be in more than one hyperfi world at once
                // but you may want the same context is multiple worlds
                // this is more like an instanceId
                const roomId = stringToUuid(req.body.roomId ?? "hyperfi");

                const body = req.body;

                // hyperfi specific parameters
                let nearby = [];
                let availableEmotes = [];

                if (body.nearby) {
                    nearby = body.nearby;
                }
                if (body.messages) {
                    // loop on the messages and record the memories
                    // might want to do this in parallel
                    for (const msg of body.messages) {
                        const parts = msg.split(/:\s*/);
                        const mUserId = stringToUuid(parts[0]);
                        await runtime.ensureConnection(
                            mUserId,
                            roomId, // where
                            parts[0], // username
                            parts[0], // userScreeName?
                            "hyperfi"
                        );
                        const content: Content = {
                            text: parts[1] || "",
                            attachments: [],
                            source: "hyperfi",
                            inReplyTo: undefined,
                        };
                        const memory: Memory = {
                            id: stringToUuid(msg),
                            agentId: runtime.agentId,
                            userId: mUserId,
                            roomId,
                            content,
                        };
                        await runtime.messageManager.createMemory(memory);
                    }
                }
                if (body.availableEmotes) {
                    availableEmotes = body.availableEmotes;
                }

                const content: Content = {
                    // we need to compose who's near and what emotes are available
                    text: JSON.stringify(req.body),
                    attachments: [],
                    source: "hyperfi",
                    inReplyTo: undefined,
                };

                const userId = stringToUuid("hyperfi");
                const userMessage = {
                    content,
                    userId,
                    roomId,
                    agentId: runtime.agentId,
                };

                const state = await runtime.composeState(userMessage, {
                    agentName: runtime.character.name,
                });

                let template = hyperfiHandlerTemplate;
                template = template.replace(
                    "{{emotes}}",
                    availableEmotes.join("|")
                );
                template = template.replace("{{nearby}}", nearby.join("|"));
                const context = composeContext({
                    state,
                    template,
                });

                function createHyperfiOutSchema(
                    nearby: string[],
                    availableEmotes: string[]
                ) {
                    const lookAtSchema =
                        nearby.length > 1
                            ? z
                                  .union(
                                      nearby.map((item) => z.literal(item)) as [
                                          z.ZodLiteral<string>,
                                          z.ZodLiteral<string>,
                                          ...z.ZodLiteral<string>[],
                                      ]
                                  )
                                  .nullable()
                            : nearby.length === 1
                              ? z.literal(nearby[0]).nullable()
                              : z.null(); // Fallback for empty array

                    const emoteSchema =
                        availableEmotes.length > 1
                            ? z
                                  .union(
                                      availableEmotes.map((item) =>
                                          z.literal(item)
                                      ) as [
                                          z.ZodLiteral<string>,
                                          z.ZodLiteral<string>,
                                          ...z.ZodLiteral<string>[],
                                      ]
                                  )
                                  .nullable()
                            : availableEmotes.length === 1
                              ? z.literal(availableEmotes[0]).nullable()
                              : z.null(); // Fallback for empty array

                    return z.object({
                        lookAt: lookAtSchema,
                        emote: emoteSchema,
                        say: z.string().nullable(),
                        actions: z.array(z.string()).nullable(),
                    });
                }

                // Define the schema for the expected output
                const hyperfiOutSchema = createHyperfiOutSchema(
                    nearby,
                    availableEmotes
                );

                // Call LLM
                const response = await generateObject({
                    runtime,
                    context,
                    modelClass: ModelClass.SMALL, // 1s processing time on openai small
                    schema: hyperfiOutSchema,
                });

                if (!response) {
                    res.status(500).send(
                        "No response from generateMessageResponse"
                    );
                    return;
                }

                let hfOut;
                try {
                    hfOut = hyperfiOutSchema.parse(response.object);
                } catch {
                    elizaLogger.error(
                        "cant serialize response",
                        response.object
                    );
                    res.status(500).send("Error in LLM response, try again");
                    return;
                }

                // do this in the background
                new Promise((resolve) => {
                    const contentObj: Content = {
                        text: hfOut.say,
                    };

                    if (hfOut.lookAt !== null || hfOut.emote !== null) {
                        contentObj.text += ". Then I ";
                        if (hfOut.lookAt !== null) {
                            contentObj.text += "looked at " + hfOut.lookAt;
                            if (hfOut.emote !== null) {
                                contentObj.text += " and ";
                            }
                        }
                        if (hfOut.emote !== null) {
                            contentObj.text = "emoted " + hfOut.emote;
                        }
                    }

                    if (hfOut.actions !== null) {
                        // content can only do one action
                        contentObj.action = hfOut.actions[0];
                    }

                    // save response to memory
                    const responseMessage = {
                        ...userMessage,
                        userId: runtime.agentId,
                        content: contentObj,
                    };

                    runtime.messageManager
                        .createMemory(responseMessage)
                        .then(() => {
                            const messageId = stringToUuid(
                                Date.now().toString()
                            );
                            const memory: Memory = {
                                id: messageId,
                                agentId: runtime.agentId,
                                userId,
                                roomId,
                                content,
                                createdAt: Date.now(),
                            };

                            // run evaluators (generally can be done in parallel with processActions)
                            // can an evaluator modify memory? it could but currently doesn't
                            runtime.evaluate(memory, state).then(() => {
                                // only need to call if responseMessage.content.action is set
                                if (contentObj.action) {
                                    // pass memory (query) to any actions to call
                                    runtime.processActions(
                                        memory,
                                        [responseMessage],
                                        state,
                                        async (_newMessages) => {
                                            // FIXME: this is supposed override what the LLM said/decided
                                            // but the promise doesn't make this possible
                                            //message = newMessages;
                                            return [memory];
                                        }
                                    ); // 0.674s
                                }
                                resolve(true);
                            });
                        });
                });
                res.json({ response: hfOut });
            }
        );


this.app.post(
  "/api/characters/:characterId/upload-profile-image",
   
  upload.single("image"),
  async (req, res) => {
    try {
      // Validate session
      const session = await Session.getSession(req, res, { sessionRequired: true });
      const userId = session.getUserId();
      elizaLogger.debug(`[CLIENT-DIRECT] Session validated for userId: ${userId}`);
      elizaLogger.debug("[CLIENT-DIRECT] Request received, cookies:", req.cookies);      
      if (!userId) {
        elizaLogger.warn("[CLIENT-DIRECT] No user ID found in session");
        return res.status(401).json({ error: "[CLIENT-DIRECT] Unauthorized: No user ID found in session" });
      }

      // Validate characterId
      const { characterId } = req.params;
      if (!stringToUuid(characterId)) {
        elizaLogger.warn(`[CLIENT-DIRECT] Invalid characterId: ${characterId}`);
              elizaLogger.debug("[CLIENT-DIRECT] File received:", req.file);
        return res.status(400).json({ error: "[CLIENT-DIRECT] Invalid character ID" });
      }

      // Validate file
      const file = req.file;
      if (!file) {
        elizaLogger.warn("[CLIENT-DIRECT] No image provided in request");
        return res.status(400).json({ error: "[CLIENT-DIRECT] No image provided" });
      }

      // Validate file type
      const allowedMimeTypes = ["image/jpeg", "image/png", "image/gif"];
      if (!allowedMimeTypes.includes(file.mimetype)) {
        await fs.promises.unlink(file.path).catch((err) => {
          elizaLogger.error("[CLIENT-DIRECT] Failed to delete invalid file:", err);
        });
        elizaLogger.warn(`[CLIENT-DIRECT] Invalid file type: ${file.mimetype}`);
        return res.status(400).json({ error: "Invalid file type. Only JPEG, PNG, and GIF are allowed." });
      }

      // Verify user owns the character
      const character = await sanityClient.fetch(
        `*[_type == "character" && id == $characterId && createdBy->userId == $userId][0]`,
        { characterId, userId }
      );
      if (!character) {
        await fs.promises.unlink(file.path).catch((err) => {
          elizaLogger.error("[CLIENT-DIRECT] Failed to delete file for unauthorized character:", err);
        });
        elizaLogger.warn(`[CLIENT-DIRECT] Character not found or access denied for characterId: ${characterId}`);
        return res.status(403).json({ error: "[CLIENT-DIRECT] Character not found or access denied" });
      }

      // Upload image to Sanity
      let imageAsset;
      try {
        const fileBuffer = await fs.promises.readFile(file.path);
        imageAsset = await sanityClient.assets.upload("image", fileBuffer, {
          filename: file.originalname,
        });
        elizaLogger.debug(`[CLIENT-DIRECT] Image uploaded to Sanity: ${imageAsset._id}, URL: ${urlFor(imageAsset).url()}`);
      } catch (sanityError) {
        await fs.promises.unlink(file.path).catch((err) => {
          elizaLogger.error("[CLIENT-DIRECT] Failed to delete file on Sanity error:", err);
        });
        elizaLogger.error(`[CLIENT-DIRECT] Failed to upload image to Sanity: ${sanityError.message}`);
        return res.status(500).json({ error: "[CLIENT-DIRECT] Failed to upload image to Sanity", details: sanityError.message });
      }

      // Update character’s profile.image in Sanity
      try {
        await sanityClient
          .patch(character._id)
          .set({
            profile: {
              image: {
                _type: "image",
                asset: {
                  _ref: imageAsset._id,
                  _type: "reference",
                },
              },
            },
          })
          .commit();
        elizaLogger.debug(`[CLIENT-DIRECT] Updated character ${characterId} with profile image: ${imageAsset._id}`);
      } catch (patchError) {
        await fs.promises.unlink(file.path).catch((err) => {
          elizaLogger.error("[CLIENT-DIRECT] Failed to delete file on patch error:", err);
        });
        elizaLogger.error(`[CLIENT-DIRECT] Failed to update character profile: ${patchError.message}`);
        return res.status(500).json({ error: "[CLIENT-DIRECT] Failed to update character profile", details: patchError.message });
      }

      // Clean up local file
      await fs.promises.unlink(file.path).catch((err) => {
        elizaLogger.error("[CLIENT-DIRECT] Failed to delete local file:", err);
      });

      // Prepare response
      const imageUrl = urlFor(imageAsset).url();
      res.json({
        message: "Profile image uploaded successfully",
        url: imageUrl,
        sanityAssetId: imageAsset._id,
      });

      elizaLogger.debug(`[CLIENT-DIRECT] Profile image uploaded for character ${characterId} by user ${userId}, URL: ${imageUrl}`);
    } catch (error) {
              elizaLogger.error("[CLIENT-DIRECT] Upload error:", error);
      if (req.file) {
        await fs.promises.unlink(req.file.path).catch((err) => {
          elizaLogger.error("[CLIENT-DIRECT] Failed to delete file on error:", err);
        });
      }
      elizaLogger.error("[CLIENT-DIRECT] Error uploading profile image:", error);
      res.status(500).json({ error: "[CLIENT-DIRECT] Failed to upload profile image", details: error.message });
    }
  }
);




this.app.post(
  "/api/:agentId/upload-agent-image",
  
  middleware(),
  upload.single("image"),
  async (req, res) => {
    try {
      // Validate session
      const session = await Session.getSession(req, res, { sessionRequired: true });
      const userId = session.getUserId();
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized: No user ID found in session" });
      }

      const agentId = req.params.agentId;
      if (!stringToUuid(agentId)) {
        return res.status(400).json({ error: "Invalid agent ID" });
      }

      // Validate file
      if (!req.file) {
        return res.status(400).json({ error: "No image provided" });
      }

      // Validate file type
      const allowedMimeTypes = ["image/jpeg", "image/png", "image/gif"];
      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        await fs.promises.unlink(req.file.path).catch((err) => {
          elizaLogger.error("Failed to delete invalid file:", err);
        });
        return res.status(400).json({ error: "Invalid file type. Only JPEG, PNG, and GIF are allowed." });
      }

      // Find the agent
      let runtime = this.agents.get(agentId);
      if (!runtime) {
        runtime = Array.from(this.agents.values()).find(
          (a) => a.character.name.toLowerCase() === agentId.toLowerCase()
        );
      }
      if (!runtime) {
        await fs.promises.unlink(req.file.path).catch((err) => {
          elizaLogger.error("Failed to delete file for missing agent:", err);
        });
        return res.status(404).json({ error: "Agent not found" });
      }

      // Verify user access to the character
      const character = await sanityClient.fetch(
        `*[_type == "character" && id == $agentId && createdBy->userId == $userId][0]`,
        { agentId, userId }
      );
      if (!character) {
        await fs.promises.unlink(req.file.path).catch((err) => {
          elizaLogger.error("Failed to delete file for missing character:", err);
        });
        return res.status(403).json({ error: "Character not found or access denied" });
      }

      // Upload image to Sanity
      let imageAsset;
      try {
        const fileBuffer = await fs.promises.readFile(req.file.path);
        imageAsset = await sanityClient.assets.upload("image", fileBuffer, {
          filename: req.file.originalname,
        });
        elizaLogger.debug(`[CLIENT-DIRECT] Image uploaded to Sanity: ${imageAsset._id}`);
      } catch (sanityError) {
        await fs.promises.unlink(req.file.path).catch((err) => {
          elizaLogger.error("Failed to delete file on Sanity error:", err);
        });
        elizaLogger.error(`[CLIENT-DIRECT] Failed to upload image to Sanity: ${sanityError.message}`);
        return res.status(500).json({ error: "Failed to upload image to Sanity" });
      }

      // Clean up local file
      await fs.promises.unlink(req.file.path).catch((err) => {
        elizaLogger.error("Failed to delete local file:", err);
      });

      // Generate caption
      let caption = "";
      try {
        const captionResult = await generateCaption({ imageUrl: urlFor(imageAsset).url() }, runtime);
        caption = typeof captionResult === "string" ? captionResult : captionResult.description || `Uploaded image: ${req.file.originalname}`;
        elizaLogger.debug(`[CLIENT-DIRECT] Generated caption: ${caption}`);
      } catch (captionError) {
        elizaLogger.warn(`[CLIENT-DIRECT] Failed to generate caption: ${captionError.message}`);
        caption = `Uploaded image: ${req.file.originalname}`;
      }

      // Store image in agent's knowledge document
      try {
        // Check for existing knowledge document
        let knowledgeDoc = await sanityClient.fetch(
          `*[_type == "knowledge" && agentId == $agentId && metadata.type == "image-collection"][0]`,
          { agentId }
        );

        const imageEntry = {
          imageAssetId: imageAsset._id,
          imageUrl: urlFor(imageAsset).url(),
          caption,
          createdAt: new Date().toISOString(),
        };

        if (!knowledgeDoc) {
          // Create new knowledge document
          const knowledgeId = stringToUuid(`image-collection-${agentId}`);
          const knowledgeName = `Image Collection for Agent ${agentId}`;
          knowledgeDoc = await sanityClient.create({
            _type: "knowledge",
            id: knowledgeId,
            name: knowledgeName,
            agentId,
            text: "Image collection for agent",
            metadata: {
              source: "image-upload",
              type: "image-collection",
              images: [imageEntry],
            },
            createdAt: new Date().toISOString(),
          });
          elizaLogger.debug(`[CLIENT-DIRECT] Created new image collection knowledge for agent ${agentId}: ${knowledgeDoc._id}`);
        } else {
          // Append to existing knowledge document
          await sanityClient
            .patch(knowledgeDoc._id)
            .setIfMissing({ 'metadata.images': [] })
            .append('metadata.images', [imageEntry])
            .commit();
          elizaLogger.debug(`[CLIENT-DIRECT] Appended image to knowledge for agent ${agentId}: ${knowledgeDoc._id}`);
        }
      } catch (knowledgeError) {
        elizaLogger.error(`[CLIENT-DIRECT] Failed to store image in knowledge: ${knowledgeError.message}`, {
          stack: knowledgeError.stack,
          agentId,
          caption,
        });
        return res.status(500).json({ error: "Failed to store image knowledge", details: knowledgeError.message });
      }

      // Respond
      res.json({
        message: "Agent image uploaded successfully",
        url: urlFor(imageAsset).url(),
        sanityAssetId: imageAsset._id,
        caption,
      });

      elizaLogger.debug(`[CLIENT-DIRECT] Agent image processed for agent ${agentId} by user ${userId}`);
    } catch (error) {
      if (req.file) {
        await fs.promises.unlink(req.file.path).catch((err) => {
          elizaLogger.error("Failed to delete file on error:", err);
        });
      }
      elizaLogger.error("[CLIENT-DIRECT] Error uploading agent image:", error);
      res.status(500).json({ error: "Failed to upload agent image", details: error.message });
    }
  }
);

        this.app.post(
            "/:agentId/image",
            async (req: express.Request, res: express.Response) => {
                const agentId = req.params.agentId;
                const agent = this.agents.get(agentId);
                if (!agent) {
                    res.status(404).send("Agent not found");
                    return;
                }

                const images = await generateImage({ ...req.body }, agent);
                const imagesRes: { image: string; caption: string }[] = [];
                if (images.data && images.data.length > 0) {
                    for (let i = 0; i < images.data.length; i++) {
                        const caption = await generateCaption(
                            { imageUrl: images.data[i] },
                            agent
                        );
                        imagesRes.push({
                            image: images.data[i],
                            caption: caption.title,
                        });
                    }
                }
                res.json({ images: imagesRes });
            }
        );

        this.app.post(
            "/fine-tune",
            async (req: express.Request, res: express.Response) => {
                try {
                    const response = await fetch(
                        "https://api.bageldb.ai/api/v1/asset",
                        {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "X-API-KEY": `${process.env.BAGEL_API_KEY}`,
                            },
                            body: JSON.stringify(req.body),
                        }
                    );

                    const data = await response.json();
                    res.json(data);
                } catch (error) {
                    res.status(500).json({
                        error: "Please create an account at bakery.bagel.net and get an API key. Then set the BAGEL_API_KEY environment variable.",
                        details: error.message,
                    });
                }
            }
        );
        this.app.get(
            "/fine-tune/:assetId",
            async (req: express.Request, res: express.Response) => {
                const assetId = req.params.assetId;

                const ROOT_DIR = path.join(process.cwd(), "downloads");
                const downloadDir = path.resolve(ROOT_DIR, assetId);

                if (!downloadDir.startsWith(ROOT_DIR)) {
                    res.status(403).json({
                        error: "Invalid assetId. Access denied.",
                    });
                    return;
                }
                elizaLogger.log("Download directory:", downloadDir);

                try {
                    elizaLogger.log("Creating directory...");
                    await fs.promises.mkdir(downloadDir, { recursive: true });

                    elizaLogger.log("Fetching file...");
                    const fileResponse = await fetch(
                        `https://api.bageldb.ai/api/v1/asset/${assetId}/download`,
                        {
                            headers: {
                                "X-API-KEY": `${process.env.BAGEL_API_KEY}`,
                            },
                        }
                    );

                    if (!fileResponse.ok) {
                        throw new Error(
                            `API responded with status ${fileResponse.status}: ${await fileResponse.text()}`
                        );
                    }

                    elizaLogger.log("Response headers:", fileResponse.headers);

                    const fileName =
                        fileResponse.headers
                            .get("content-disposition")
                            ?.split("filename=")[1]
                            ?.replace(/"/g, /* " */ "") || "default_name.txt";

                    elizaLogger.log("Saving as:", fileName);

                    const arrayBuffer = await fileResponse.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);

                    const filePath = path.join(downloadDir, fileName);
                    elizaLogger.log("Full file path:", filePath);

                    await fs.promises.writeFile(filePath, new Uint8Array(buffer));

                    // Verify file was written
                    const stats = await fs.promises.stat(filePath);
                    elizaLogger.log(
                        "File written successfully. Size:",
                        stats.size,
                        "bytes"
                    );

                    res.json({
                        success: true,
                        message: "Single file downloaded successfully",
                        downloadPath: downloadDir,
                        fileCount: 1,
                        fileName: fileName,
                        fileSize: stats.size,
                    });
                } catch (error) {
                    elizaLogger.error("Detailed error:", error);
                    res.status(500).json({
                        error: "Failed to download files from BagelDB",
                        details: error.message,
                        stack: error.stack,
                    });
                }
            }
        );

        this.app.post("/:agentId/speak", async (req, res) => {
            const agentId = req.params.agentId;
            const roomId = stringToUuid(
                req.body.roomId ?? "default-room-" + agentId
            );
            const userId = stringToUuid(req.body.userId ?? "user");
            const text = req.body.text;

            if (!text) {
                res.status(400).send("No text provided");
                return;
            }

            let runtime = this.agents.get(agentId);

            // if runtime is null, look for runtime with the same name
            if (!runtime) {
                runtime = Array.from(this.agents.values()).find(
                    (a) =>
                        a.character.name.toLowerCase() === agentId.toLowerCase()
                );
            }

            if (!runtime) {
                res.status(404).send("Agent not found");
                return;
            }

            try {
                // Process message through agent (same as /message endpoint)
                await runtime.ensureConnection(
                    userId,
                    roomId,
                    req.body.userName,
                    req.body.name,
                    "direct"
                );

                const messageId = stringToUuid(Date.now().toString());

                const content: Content = {
                    text,
                    attachments: [],
                    source: "direct",
                    inReplyTo: undefined,
                };

                const userMessage = {
                    content,
                    userId,
                    roomId,
                    agentId: runtime.agentId,
                };

                const memory: Memory = {
                    id: messageId,
                    agentId: runtime.agentId,
                    userId,
                    roomId,
                    content,
                    createdAt: Date.now(),
                };

                await runtime.messageManager.createMemory(memory);

                const state = await runtime.composeState(userMessage, {
                    agentName: runtime.character.name,
                });

                const context = composeContext({
                    state,
                    template: messageHandlerTemplate,
                });

                const response = await generateMessageResponse({
                    runtime: runtime,
                    context,
                    modelClass: ModelClass.LARGE,
                });

                // save response to memory
                const responseMessage = {
                    ...userMessage,
                    userId: runtime.agentId,
                    content: response,
                };

                await runtime.messageManager.createMemory(responseMessage);

                if (!response) {
                    res.status(500).send(
                        "No response from generateMessageResponse"
                    );
                    return;
                }

                await runtime.evaluate(memory, state);

                const _result = await runtime.processActions(
                    memory,
                    [responseMessage],
                    state,
                    async () => {
                        return [memory];
                    }
                );

                // Get the text to convert to speech
                const textToSpeak = response.text;

                // Convert to speech using ElevenLabs
                const elevenLabsApiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`;
                const apiKey = process.env.ELEVENLABS_XI_API_KEY;

                if (!apiKey) {
                    throw new Error("ELEVENLABS_XI_API_KEY not configured");
                }

                const speechResponse = await fetch(elevenLabsApiUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "xi-api-key": apiKey,
                    },
                    body: JSON.stringify({
                        text: textToSpeak,
                        model_id:
                            process.env.ELEVENLABS_MODEL_ID ||
                            "eleven_multilingual_v2",
                        voice_settings: {
                            stability: Number.parseFloat(
                                process.env.ELEVENLABS_VOICE_STABILITY || "0.5"
                            ),
                            similarity_boost: Number.parseFloat(
                                process.env.ELEVENLABS_VOICE_SIMILARITY_BOOST ||
                                    "0.9"
                            ),
                            style: Number.parseFloat(
                                process.env.ELEVENLABS_VOICE_STYLE || "0.66"
                            ),
                            use_speaker_boost:
                                process.env
                                    .ELEVENLABS_VOICE_USE_SPEAKER_BOOST ===
                                "true",
                        },
                    }),
                });

                if (!speechResponse.ok) {
                    throw new Error(
                        `ElevenLabs API error: ${speechResponse.statusText}`
                    );
                }

                const audioBuffer = await speechResponse.arrayBuffer();

                // Set appropriate headers for audio streaming
                res.set({
                    "Content-Type": "audio/mpeg",
                    "Transfer-Encoding": "chunked",
                });

                res.send(Buffer.from(audioBuffer));
            } catch (error) {
                elizaLogger.error(
                    "Error processing message or generating speech:",
                    error
                );
                res.status(500).json({
                    error: "Error processing message or generating speech",
                    details: error.message,
                });
            }
        });

        this.app.post("/:agentId/tts", async (req, res) => {
            const text = req.body.text;

            if (!text) {
                res.status(400).send("No text provided");
                return;
            }

            try {
                // Convert to speech using ElevenLabs
                const elevenLabsApiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`;
                const apiKey = process.env.ELEVENLABS_XI_API_KEY;

                if (!apiKey) {
                    throw new Error("ELEVENLABS_XI_API_KEY not configured");
                }

                const speechResponse = await fetch(elevenLabsApiUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "xi-api-key": apiKey,
                    },
                    body: JSON.stringify({
                        text,
                        model_id:
                            process.env.ELEVENLABS_MODEL_ID ||
                            "eleven_multilingual_v2",
                        voice_settings: {
                            stability: Number.parseFloat(
                                process.env.ELEVENLABS_VOICE_STABILITY || "0.5"
                            ),
                            similarity_boost: Number.parseFloat(
                                process.env.ELEVENLABS_VOICE_SIMILARITY_BOOST ||
                                    "0.9"
                            ),
                            style: Number.parseFloat(
                                process.env.ELEVENLABS_VOICE_STYLE || "0.66"
                            ),
                            use_speaker_boost:
                                process.env
                                    .ELEVENLABS_VOICE_USE_SPEAKER_BOOST ===
                                "true",
                        },
                    }),
                });

                if (!speechResponse.ok) {
                    throw new Error(
                        `ElevenLabs API error: ${speechResponse.statusText}`
                    );
                }

                const audioBuffer = await speechResponse.arrayBuffer();

                res.set({
                    "Content-Type": "audio/mpeg",
                    "Transfer-Encoding": "chunked",
                });

                res.send(Buffer.from(audioBuffer));
            } catch (error) {
                elizaLogger.error(
                    "Error processing message or generating speech:",
                    error
                );
                res.status(500).json({
                    error: "Error processing message or generating speech",
                    details: error.message,
                });
            }
        });
   // Add SuperTokens error handler
   this.app.use(errorHandler());

   // Handle unmatched routes
   this.app.use((req, res) => {
       res.status(404).json({ error: `Cannot ${req.method} ${req.url}` });
   });

   // Custom error handler
   this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
       elizaLogger.error("Error:", err);
       res.status(500).json({
           error: "Internal server error",
           details: err.message,
       });
   });
}

    // agent/src/index.ts:startAgent calls this
    public registerAgent(runtime: IAgentRuntime) {
        // register any plugin endpoints?
        // but once and only once
        this.agents.set(runtime.agentId, runtime);
    }

    public unregisterAgent(runtime: IAgentRuntime) {
        this.agents.delete(runtime.agentId);
    }

    public start(port: number) {
        this.server = this.app.listen(port, () => {
            elizaLogger.success(
                `REST API bound to 0.0.0.0:${port}. If running locally, access it at http://localhost:${port}.`
            );
        });

        // Handle graceful shutdown
        const gracefulShutdown = () => {
            elizaLogger.log("Received shutdown signal, closing server...");
            this.server.close(() => {
                elizaLogger.success("Server closed successfully");
                process.exit(0);
            });

            // Force close after 5 seconds if server hasn't closed
            setTimeout(() => {
                elizaLogger.error(
                    "Could not close connections in time, forcefully shutting down"
                );
                process.exit(1);
            }, 5000);
        };

        // Handle different shutdown signals
        process.on("SIGTERM", gracefulShutdown);
        process.on("SIGINT", gracefulShutdown);
    }

    public async stop() {
        if (this.server) {
            this.server.close(() => {
                elizaLogger.success("Server stopped");
            });
        }
    }
}

export const DirectClientInterface: Client = {
    name: 'direct',
    config: {},
    start: async (_runtime: IAgentRuntime) => {
        elizaLogger.log("DirectClientInterface start");
        const client = new DirectClient();
        const serverPort = Number.parseInt(settings.SERVER_PORT || "3000");
        client.start(serverPort);
        return client;
    },
    // stop: async (_runtime: IAgentRuntime, client?: Client) => {
    //     if (client instanceof DirectClient) {
    //         client.stop();
    //     }
    // },
};

const directPlugin: Plugin = {
    name: "direct",
    description: "Direct client",
    clients: [DirectClientInterface],
};
export default directPlugin;


export { decryptValue, encryptValue, computeHash } from './utils/cryptoUtils';