import { replyEmailAction } from "./actions/replyEmailAction";
import { sendEmailAction } from "./actions/sendEmailAction";
import { EmailAutomationService } from "./services/emailAutomationService";

const emailAutomationPlugin = {
    name: "emailautomation",
    description: "AI-powered email automation plugin for agentVooc",
    services: [new EmailAutomationService() as any],
    actions:[] ,
    clients: [],
    evaluators: [],
    providers: [],
};

export default emailAutomationPlugin;
