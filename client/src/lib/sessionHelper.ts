// /client/src/lib/sessionHelper.ts
import Session from "supertokens-web-js/recipe/session";
import { apiClient } from "./api";
import { clearCookies } from "./clearCookies"; // Import the new clearCookies function

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

      // Attempt signout with retry
      let attempts = 0;
      const maxAttempts = 3;
      while (attempts < maxAttempts) {
        try {
          console.log(`[sessionHelper] Attempting signOut (attempt ${attempts + 1})`);
          await apiClient.signOut();
          console.log("[sessionHelper] Session signed out successfully");
          break;
        } catch (err) {
          attempts++;
          console.error(`[sessionHelper] signOut attempt ${attempts} failed:`, err);
          if (attempts === maxAttempts) {
            console.warn("[sessionHelper] Max signOut attempts reached");
            throw new Error("Failed to sign out after retries");
          }
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1-second delay between retries
        }
      }

      // Clear cookies using the shared utility
      clearCookies();

      // Verify session is gone
      const sessionExists = await sessionHelper.doesSessionExist();
      if (sessionExists) {
        console.warn("[sessionHelper] Session still exists after signOut");
      }
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

