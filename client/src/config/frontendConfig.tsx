import Session from "supertokens-web-js/recipe/session";
import Passwordless from "supertokens-web-js/recipe/passwordless";
import ThirdParty from "supertokens-web-js/recipe/thirdparty";
import { appInfo } from "./appInfo";

export const frontendConfig = () => {
  return {
    appInfo,
    recipeList: [
      Passwordless.init(),
      ThirdParty.init(),
      Session.init({
        tokenTransferMethod: "cookie",
        // Enable automatic session refresh
        sessionTokenBackendDomain: new URL(appInfo.apiDomain).hostname,
      }),
    ],
  };
};