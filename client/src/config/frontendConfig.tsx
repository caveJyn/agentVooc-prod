import Session from "supertokens-web-js/recipe/session";
import Passwordless from "supertokens-web-js/recipe/passwordless";
import ThirdParty from "supertokens-web-js/recipe/thirdparty";
import { appInfo } from "./appInfo";

const clearCookies = () => {
  console.log("[FRONTEND_CONFIG] Cookies before clearing:", document.cookie);
  const cookies = document.cookie.split(";");
  const domains = ["agentvooc.com", ".agentvooc.com", window.location.hostname, `.${window.location.hostname}`];
  const stCookies = [
    "sAccessToken",
    "sRefreshToken",
    "sFrontToken",
    "st-last-access-token-update",
    "st-access-token",
    "st-refresh-token",
  ];
  for (const cookie of cookies) {
    const [name] = cookie.split("=").map((c) => c.trim());
    if (stCookies.includes(name)) {
      for (const domain of domains) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${domain};secure;samesite=none`;
      }
    }
  }
  console.log("[FRONTEND_CONFIG] Cookies after clearing:", document.cookie);
};

// Run cleanup on init
clearCookies();

export const frontendConfig = () => {
  return {
    appInfo,
    recipeList: [
      Passwordless.init(),
      ThirdParty.init(),
      Session.init({
        tokenTransferMethod: "header",
        // Enable automatic session refresh
        sessionTokenBackendDomain: "agentvooc.com",
        sessionTokenFrontendDomain: "agentvooc.com"
      }),
    ],
  };
};