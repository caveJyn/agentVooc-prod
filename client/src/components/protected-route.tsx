// client/src/components/ProtectedRoute.tsx
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { doesSessionExist } from "supertokens-web-js/recipe/session";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [_isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkSession() {
      const exists = await doesSessionExist();
      setIsAuthenticated(exists);

      // Allow access to /home for unauthenticated users (preview mode)
      if (!exists && location.pathname !== "/home") {
        navigate("/auth", { replace: true });
      }
    }
    checkSession();
  }, [navigate, location.pathname]);

  // Pass isAuthenticated to children via context or props if needed
  return children;
}