// /client/src/components/protected-route.tsx
import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { doesSessionExist, getUserId, signOut, attemptRefreshingSession } from "supertokens-web-js/recipe/session";
import { useSubscriptionStatus } from "@/hooks/stripe-webhook";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const location = useLocation();
  const { data: subscriptionData, isLoading: isSubscriptionLoading } = useSubscriptionStatus(userId);

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    async function validateSession() {
      try {
        console.log("[PROTECTED_ROUTE] Validating session");
        const sessionExists = await doesSessionExist();
        console.log("[PROTECTED_ROUTE] Session exists:", sessionExists);

        if (sessionExists) {
          try {
            // Attempt to refresh token to validate session
            const refreshSuccess = await attemptRefreshingSession();
            console.log("[PROTECTED_ROUTE] Token refresh success:", refreshSuccess);
            if (refreshSuccess) {
              const id = await getUserId();
              setUserId(id);
              setIsAuthenticated(true);
              console.log("[PROTECTED_ROUTE] Session validated, userId:", id);
            } else {
              throw new Error("Session refresh failed");
            }
          } catch (refreshErr) {
            console.warn("[PROTECTED_ROUTE] Session refresh error:", refreshErr);
            throw refreshErr;
          }
        } else {
          throw new Error("No session exists");
        }
      } catch (err) {
        console.error("[PROTECTED_ROUTE] Session validation error:", err);
        setIsAuthenticated(false);
        setUserId(undefined);
        await signOut();
        localStorage.clear();
        sessionStorage.clear();
        console.log("[PROTECTED_ROUTE] Session invalid, cleaned up");
      }
    }

    // Initial session check
    validateSession();

    // Periodic session check (every 15 seconds to catch deletions quickly)
    intervalId = setInterval(validateSession, 15 * 1000);

    // Cleanup interval on unmount
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  if (isAuthenticated === null || isSubscriptionLoading) {
    return (
      <div className="text-agentvooc-secondary flex items-center justify-center min-h-screen">
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    const cacheBust = `?cb=${Date.now()}`;
    console.log("[PROTECTED_ROUTE] Redirecting to /auth with cache-bust:", cacheBust);
    return <Navigate to={`/auth${cacheBust}`} replace />;
  }

  // Allow access to /settings and /payment regardless of subscription status
  if (location.pathname === "/settings" || location.pathname === "/payment") {
    return <>{children}</>;
  }

  // Check subscription status
  const hasActiveSubscription =
    subscriptionData?.isTrialActive || ["active", "trialing"].includes(subscriptionData?.status);

  if (!hasActiveSubscription) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-screen text-agentvooc-primary">
        <h1 className="text-3xl font-bold mb-4">Subscribe to Unlock Dashboard</h1>
        <p className="mb-4 text-agentvooc-secondary">
          You need an active subscription to access this feature.
        </p>
        <Navigate to="/settings" replace />
      </div>
    );
  }

  return <>{children}</>;
}