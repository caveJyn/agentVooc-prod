import Session from "supertokens-web-js/recipe/session";
import Passwordless from "supertokens-web-js/recipe/passwordless";
import ThirdParty from "supertokens-web-js/recipe/thirdparty";
import { appInfo } from "./appInfo";

export const frontendConfig = () => {

  interface SessionOverrideFunctions {
    getAccessTokenPayloadSecurely: (input: any) => Promise<any>;
  }

  interface SessionOverride {
    functions: (originalImplementation: any) => SessionOverrideFunctions;
  }

  interface SessionConfig {
    getTokenTransferMethod: () => string;
    override: SessionOverride;
  }

  interface FrontendConfig {
    appInfo: typeof appInfo;
    recipeList: Array<any>;
  }

  return {
    appInfo,
    recipeList: [
      Passwordless.init(),
      ThirdParty.init(),
      Session.init({
        getTokenTransferMethod: (): string => "header",
        override: {
          functions: (originalImplementation: any): SessionOverrideFunctions => ({
            ...originalImplementation,
            getAccessTokenPayloadSecurely: async function (input: any): Promise<any> {
              return originalImplementation.getAccessTokenPayloadSecurely(input);
            }
          })
        }
      } as SessionConfig),
    ],
  } as FrontendConfig;
};