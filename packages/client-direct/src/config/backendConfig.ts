import { TypeInput as InputType } from "supertokens-node/lib/build/types";
import Session from "supertokens-node/recipe/session";
import Passwordless from "supertokens-node/recipe/passwordless";
import ThirdParty from "supertokens-node/recipe/thirdparty";
import Dashboard from "supertokens-node/recipe/dashboard";
import { sanityClient } from "@elizaos-plugins/plugin-sanity";
import { elizaLogger } from "@elizaos/core";
import { Response } from "express";

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
        cookieSameSite: "strict",
        sessionExpiredStatusCode: 401,
        cookieDomain: "agentvooc.com",
        useDynamicAccessTokenSigningKey: false,
        antiCsrf: "NONE",
        getTokenTransferMethod: () => "header",
        override: {
          functions: (originalImplementation) => ({
            ...originalImplementation,
            createNewSession: async function (input) {
              elizaLogger.debug(`Creating new session for user: ${input.userId}`);
              const session = await originalImplementation.createNewSession(input);
              elizaLogger.debug(`Session created: userId=${input.userId}, sessionHandle=${session.getHandle()}`);
              return session;
            },
            getSession: async function (input) {
        try {
          // Log the entire userContext to inspect its structure
    elizaLogger.debug("userContext contents:", JSON.stringify(input.userContext, null, 2));
          // Access request from userContext or ensure proper context is passed
          const request = input.userContext?._default?.request;
          const authHeader = request?.headers?.get("authorization") || "none";
          const cookies = request?.headers?.get("cookie") || "none";
          elizaLogger.debug(`Getting session for request`, {
            hasAuthorizationHeader: !!authHeader && authHeader !== "none",
            cookies,
            authorization: authHeader,
          });
          const session = await originalImplementation.getSession(input);
          if (session) {
            elizaLogger.debug(`Session retrieved: userId=${session.getUserId()}, sessionHandle=${session.getHandle()}`);
          } else {
            elizaLogger.debug(`No session retrieved`);
          }
          return session;
        } catch (error: any) {
          const request = input.userContext?._default?.request;
          const authHeader = request?.headers?.get("authorization") || "none";
          const cookies = request?.headers?.get("cookie") || "none";
          elizaLogger.warn(`Session retrieval failed`, {
            errorMessage: error.message,
            cookies,
            authorization: authHeader,
          });
          throw error;
        }
      },
            revokeSession: async function (input) {
              elizaLogger.debug(`Revoking session: ${input.sessionHandle}`);
              const session = await Session.getSessionInformation(input.sessionHandle);
              const userId = session?.userId || "unknown";
              const result = await originalImplementation.revokeSession(input);
              elizaLogger.debug(`Session revoked: userId=${userId}`);
              return result;
            },
          }),
          apis: (originalImplementation) => ({
            ...originalImplementation,
            signOutPOST: async (input) => {
              elizaLogger.debug("signOutPOST response object:", {
    resType: typeof input.options.res,
    resMethods: Object.keys(input.options.res || {}),
  });
              const request = input.userContext?.req as any;
              const authHeader = request?.headers?.authorization || "none";
              elizaLogger.debug("signOutPOST called", {
                sessionExists: !!input.session,
                userId: input.session?.getUserId() || "unknown",
                cookies: request?.headers?.cookie || "none",
                authorization: authHeader,
              });

              let userId: string | undefined;
              if (input.session) {
                userId = input.session.getUserId();
                try {
                  await Session.revokeAllSessionsForUser(userId);
                  elizaLogger.debug(`Revoked all sessions for userId: ${userId}`);
                } catch (error) {
                  elizaLogger.error(`Failed to revoke sessions for userId: ${userId}`, error);
                }
              }

              // Rely on SuperTokens to clear cookies (st-access-token, st-refresh-token, sFrontToken)
              return await originalImplementation.signOutPOST(input);
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