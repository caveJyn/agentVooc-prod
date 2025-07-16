import { type Plugin } from "@elizaos/core";
import { EmailClientInterface } from "./clients/emailClient";
import { sendEmailAction } from "./actions/sendEmail";
import { emailProvider } from "./providers/emailProvider";
import { replyEmailAction } from "./actions/replyEmail";
import { checkEmailAction } from "./actions/checkEmail";


export const emailPlugin: Plugin = {
  name: "email",
  description: "Email plugin for agentVooc",
  clients: [EmailClientInterface,],
  actions: [sendEmailAction, replyEmailAction, checkEmailAction,  ],
  providers: [emailProvider],
  evaluators: [],
  services: [],
};

export { EmailClient } from "./clients/emailClient";
export * from "./types";
export * from "./utils/emailListener";

export default emailPlugin;