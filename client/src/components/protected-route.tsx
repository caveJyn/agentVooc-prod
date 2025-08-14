// /client/src/components/protected-route.tsx
import { ReactNode } from "react";

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  // No authentication or subscription checks; allow access to all routes
  return <>{children}</>;
}