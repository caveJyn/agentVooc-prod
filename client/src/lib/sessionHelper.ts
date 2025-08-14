// client/src/lib/sessionHelper.ts
import Session from "supertokens-web-js/recipe/session";

export const sessionHelper = {
  /**
   * Check if a session exists (header-based)
   */
  doesSessionExist: async (): Promise<boolean> => {
    try {
      console.log("[sessionHelper] Checking session existence, cookies:", document.cookie);
      const exists = await Session.doesSessionExist();
      console.log("[sessionHelper] doesSessionExist result:", exists);
      if (exists) {
        const accessToken = await Session.getAccessToken();
        console.log("[sessionHelper] Access token present:", !!accessToken);
      }
      return exists;
    } catch (err) {
      console.error("[sessionHelper] doesSessionExist error:", err);
      return false;
    }
  },

  /**
   * Get the current session and access token payload
   */
  getSession: async (): Promise<{
    accessTokenPayload: any;
    accessToken: string;
  } | null> => {
    try {
      const exists = await Session.doesSessionExist();
      if (!exists) {
        console.log("[sessionHelper] No session found");
        return null;
      }

      const accessToken = await Session.getAccessToken();
      const accessTokenPayload = await Session.getAccessTokenPayloadSecurely();

      return { accessToken, accessTokenPayload };
    } catch (err) {
      console.error("[sessionHelper] getSession error:", err);
      return null;
    }
  },

  /**
   * Sign out the current session
   */
  signOut: async (): Promise<void> => {
    try {
      const exists = await sessionHelper.doesSessionExist();
      if (!exists) {
        console.log("[sessionHelper] No session exists, skipping signOut");
        return;
      }

      await Session.signOut({
        config: {
          headers: {
            "st-auth-mode": "cookie",
          },
        },
      });

      console.log("[sessionHelper] Session signed out successfully");

      // Explicitly clear cookies client-side as a fallback
      const domains = [
        "agentvooc.com",
        ".agentvooc.com",
        window.location.hostname,
        `.${window.location.hostname}`,
        "",
      ];
      const paths = ["/", "/api", "/api/auth"];
      const stCookies = [
        "sAccessToken",
        "sRefreshToken",
        "sFrontToken",
        "st-last-access-token-update",
        "st-access-token",
        "st-refresh-token",
      ];

      console.log("[sessionHelper] Cookies before clearing:", document.cookie);
      for (const cookieName of stCookies) {
        for (const domain of domains) {
          for (const path of paths) {
            document.cookie = `${cookieName}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=${path};${domain ? `domain=${domain};` : ""}Secure;SameSite=Strict`;
            document.cookie = `${cookieName}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=${path};${domain ? `domain=${domain};` : ""}Secure;SameSite=None`;
          }
        }
      }
      console.log("[sessionHelper] Cookies after clearing:", document.cookie);
    } catch (err) {
      console.error("[sessionHelper] signOut error:", err);
      throw err;
    }
  },
};


// If you ever need the current access token (for API requests via headers):
// const session = await sessionHelper.getSession();
// if (session) {
//   const token = session.accessToken;
//   // use token in Authorization header
// }

