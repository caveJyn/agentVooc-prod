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
                const userId = response.user.id;
                const email = response.user.emails?.[0];
                const name = "Unknown User"; // Name not collected in OTP flow

                elizaLogger.debug(`User signed in/up: userId=${userId}, email=${email}`);

                try {
                  const existingUser = await sanityClient.fetch(
                    `*[_type == "User" && userId == $userId][0]`,
                    { userId }
                  );
                  if (!existingUser) {
                    if (!email) {
                      elizaLogger.error(`No email provided for userId=${userId}, cannot create User`);
                    } else {
                      const User = await sanityClient.create({
                        _type: "User",
                        name,
                        email,
                        interest: "agentVooc",
                        referralSource: "email-otp",
                        userId,
                        createdAt: new Date().toISOString(),
                        userType: "email",
                      });
                      elizaLogger.debug(`Created User: userId=${userId}, email=${User._id}`);
                    }
                  } else {
                    elizaLogger.debug(`User already exists for userId=${userId}, email=${existingUser.email}`);
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
                const userId = response.user.id;
                const email = response.user.emails?.[0] || `no-email-${userId}@example.com`;
                const name =
                  input.thirdPartyId === "google"
                    ? response.rawUserInfoFromProvider?.fromUserInfoAPI?.name || "Google User"
                    : "Unknown User";

                elizaLogger.debug(`Third-party signInUp: userId=${userId}, email=${email}, name=${name}`);

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
                    elizaLogger.debug(`Created User: userId=${userId}, email=${email}, _id=${User._id}`);
                  } else {
                    elizaLogger.debug(`User already exists for userId=${userId}, email=${existingUser.email}`);
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
  cookieSameSite: "lax",
  sessionExpiredStatusCode: 401,
  // Override functions for logging
  override: {
    functions: (originalImplementation) => ({
      ...originalImplementation,
      createNewSession: async function (input) {
        elizaLogger.debug(`Creating new session for user: ${input.userId}`);
        return await originalImplementation.createNewSession(input);
      },
      getSession: async function (input) {
        try {
          const result = await originalImplementation.getSession(input);
          elizaLogger.debug(`Session retrieved successfully for user: ${result.getUserId()}`);
          return result;
        } catch (error: any) {
          if (error.type === "TRY_REFRESH_TOKEN") {
            elizaLogger.debug("Session refresh token required");
          } else if (error.type === "UNAUTHORISED") {
            elizaLogger.warn("Unauthorized session access attempt");
          } else {
            elizaLogger.error("Session error:", error);
          }
          throw error;
        }
      },
      refreshSession: async function (input) {
        try {
          elizaLogger.debug("Refreshing session");
          const result = await originalImplementation.refreshSession(input);
          elizaLogger.debug(`Session refreshed successfully for user: ${result.getUserId()}`);
          return result;
        } catch (error: any) {
          elizaLogger.error("Session refresh error:", error);
          throw error;
        }
      },
    }),
  },
}),
      Dashboard.init({
        admins: ["agentvooc@gmail.com"],
        override: {
          apis: (originalImplementation) => {
            elizaLogger.debug("Dashboard recipe initialized");
            return originalImplementation;
          },
        },
      }),
    ],
  };
}
