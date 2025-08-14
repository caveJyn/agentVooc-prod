// /client/src/lib/sessionHelper.ts
import Session from "supertokens-web-js/recipe/session";
// import { apiClient } from "./api";
import { clearCookies } from "./clearCookies";

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
        clearCookies(true); // Clear cookies even if no session
        localStorage.clear();
        sessionStorage.clear();
        return;
      }

      // Attempt signout with retry
      let attempts = 0;
      const maxAttempts = 3;
      while (attempts < maxAttempts) {
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
      }

      // Clear all cookies and storage
      clearCookies(true);
      localStorage.clear();
      sessionStorage.clear();

      // Verify session is gone
      const sessionExists = await sessionHelper.doesSessionExist();
      if (sessionExists) {
        console.warn("[sessionHelper] Session still exists after signOut, forcing cleanup");
        await Session.signOut();
        clearCookies(true);
        localStorage.clear();
        sessionStorage.clear();
      }

      console.log("[sessionHelper] Signout complete, redirecting to /auth");
      window.location.href = `/auth?cb=${Date.now()}`;
    } catch (err) {
      console.error("[sessionHelper] signOut error:", err);
      throw err;
    }
  },
};