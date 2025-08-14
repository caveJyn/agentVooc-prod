// client/src/lib/sessionHelper.ts
import Session from "supertokens-web-js/recipe/session";

export const sessionHelper = {
  /**
   * Check if a session exists (header-based)
   */
  doesSessionExist: async (): Promise<boolean> => {
    try {
      return await Session.doesSessionExist();
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
      const exists = await Session.doesSessionExist();
      if (!exists) {
        console.log("[sessionHelper] No session exists, skipping signOut");
        return;
      }

      await Session.signOut({
        config: {
          headers: {
            "st-auth-mode": "cookie", // ✅ enforce header-based mode
          },
        },
      });

      console.log("[sessionHelper] Session signed out successfully");
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

