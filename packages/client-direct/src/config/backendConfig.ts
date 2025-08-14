import { TypeInput as InputType } from "supertokens-node/lib/build/types";
import Session from "supertokens-node/recipe/session";
import Passwordless from "supertokens-node/recipe/passwordless";
import ThirdParty from "supertokens-node/recipe/thirdparty";
import Dashboard from "supertokens-node/recipe/dashboard";
import { sanityClient } from "@elizaos-plugins/plugin-sanity";
import { elizaLogger } from "@elizaos/core";

export function backendConfig(): InputType {
  return {
    framework: "express",
    supertokens: {
      connectionURI: process.env.SUPERTOKENS_CONNECTION_URI,
      apiKey: process.env.SUPERTOKENS_API_KEY || "",
    },
    appInfo: {
      appName: "agentVooc",
      apiDomain: process.env.ST_SERVER_BASE_URL,
      websiteDomain: process.env.ST_WEBSITE_DOMAIN,
      apiBasePath: "/api/auth",
      websiteBasePath: "/auth",
    },
    recipeList: [
      Passwordless.init({
        contactMethod: "EMAIL",
        flowType: "USER_INPUT_CODE",
        emailDelivery: {
          override: (originalImplementation) => ({
            ...originalImplementation,
            sendEmail: async (input) => {
              elizaLogger.debug(`Sending OTP email to ${input.email}`);
              await originalImplementation.sendEmail({
                ...input,
                urlWithLinkCode: input.urlWithLinkCode?.replace(
                  /^https?:\/\/[^/]+\/auth\/verify/,
                  `${process.env.ST_WEBSITE_DOMAIN}/auth/verify`
                ),
              });
              elizaLogger.debug(`OTP email sent successfully to ${input.email}`);
            },
          }),
        },
        override: {
          apis: (originalImplementation) => ({
            ...originalImplementation,
            consumeCodePOST: async (input) => {
              const response = await originalImplementation.consumeCodePOST(input);
              if (response.status === "OK") {
                const { id: userId, emails } = response.user;
                const email = emails?.[0];
                elizaLogger.debug(`User signed in/up: userId=${userId}, email=${email}`);

                try {
                  const existingUser = await sanityClient.fetch(
                    `*[_type == "User" && userId == $userId][0]`,
                    { userId }
                  );
                  if (!existingUser && email) {
                    const User = await sanityClient.create({
                      _type: "User",
                      name: "Unknown User",
                      email,
                      interest: "agentVooc",
                      referralSource: "email-otp",
                      userId,
                      createdAt: new Date().toISOString(),
                      userType: "email",
                    });
                    elizaLogger.debug(`Created User: userId=${userId}, _id=${User._id}`);
                  }
                } catch (error) {
                  elizaLogger.error(`Failed to create User for userId=${userId}:`, error);
                }
              } else {
                elizaLogger.warn(`OTP consume failed: status=${response.status}`);
              }
              return response;
            },
          }),
        },
      }),
      ThirdParty.init({
        signInAndUpFeature: {
          providers: [
            {
              config: {
                thirdPartyId: "google",
                clients: [
                  {
                    clientId: process.env.GOOGLE_CLIENT_ID || "",
                    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
                    scope: [
                      "https://www.googleapis.com/auth/userinfo.email",
                      "https://www.googleapis.com/auth/userinfo.profile",
                    ],
                  },
                ],
              },
            },
          ],
        },
        override: {
          functions: (originalImplementation) => ({
            ...originalImplementation,
            signInUp: async function (input) {
              const response = await originalImplementation.signInUp(input);
              if (response.status === "OK") {
                const { id: userId, emails } = response.user;
                const email = emails?.[0] || `no-email-${userId}@example.com`;
                const name =
                  input.thirdPartyId === "google"
                    ? response.rawUserInfoFromProvider?.fromUserInfoAPI?.name || "Google User"
                    : "Unknown User";

                elizaLogger.debug(`Third-party signInUp: userId=${userId}, email=${email}`);

                try {
                  const existingUser = await sanityClient.fetch(
                    `*[_type == "User" && userId == $userId][0]`,
                    { userId }
                  );
                  if (!existingUser) {
                    const User = await sanityClient.create({
                      _type: "User",
                      name,
                      email,
                      interest: "agentVooc",
                      referralSource: input.thirdPartyId,
                      userId,
                      createdAt: new Date().toISOString(),
                      userType: "email",
                    });
                    elizaLogger.debug(`Created User: _id=${User._id}`);
                  }
                } catch (error) {
                  elizaLogger.error(`Failed to create User for userId=${userId}:`, error);
                }
              } else {
                elizaLogger.warn(`Third-party signInUp failed: status=${response.status}`);
              }
              return response;
            },
          }),
        },
      }),
      Session.init({
        cookieSecure: true,
        antiCsrf: "NONE",
        getTokenTransferMethod: (input) => {
    const authMode = input.req.getHeaderValue("st-auth-mode");
    elizaLogger.debug("[SESSION] Token transfer method check:", {
      authMode,
      hasAuthHeader: !!input.req.getHeaderValue("authorization"),
      forCreateNewSession: input.forCreateNewSession,
    });
    return authMode === "header" ? "header" : "cookie";  // Changed default to "cookie"
  },
        useDynamicAccessTokenSigningKey: false,
        // Remove the custom getSession override - let SuperTokens handle it automatically
        // The override was causing the issue by manually extracting tokens
      }),
      Dashboard.init({
        admins: ["agentvooc@gmail.com"],
      }),
    ],
  };
}