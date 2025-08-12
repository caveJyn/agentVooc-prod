// /client/src/components/protected-route.tsx
import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { doesSessionExist, getUserId } from "supertokens-web-js/recipe/session";
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
    async function fetchUserId() {
      const sessionExists = await doesSessionExist();
      setIsAuthenticated(sessionExists);
      if (sessionExists) {
        const id = await getUserId();
        setUserId(id);
      } else {
        setUserId(undefined);
      }
    }
    fetchUserId();
  }, []);

  useEffect(() => {
    async function checkSession() {
      const sessionExists = await doesSessionExist();
      setIsAuthenticated(sessionExists);
    }
    checkSession();
  }, []);

  if (isAuthenticated === null || isSubscriptionLoading) {
    return (
      <div className="text-agentvooc-secondary flex items-center justify-center min-h-screen">
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
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