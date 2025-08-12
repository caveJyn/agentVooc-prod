// client/src/components/connection-status.tsx
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useState, useEffect, Component, ErrorInfo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { Activity } from "lucide-react";
import Session from "supertokens-web-js/recipe/session";
import { Query } from "@tanstack/react-query";

// Define the expected response type for getConnectionStatus
interface ConnectionStatusResponse {
  isConnected: boolean;
  userId?: string;
  clientId?: string;
  timestamp?: string;
  status?: "skipped";
  reason?: string;
}

// Error Boundary Component
class ConnectionStatusErrorBoundary extends Component<React.PropsWithChildren<{}>> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ConnectionStatus ErrorBoundary]", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center gap-2 px-4 py-2">
          <div className="h-2.5 w-2.5 rounded-full bg-red-600" />
          <span className="text-xs text-red-600">Error: Failed to load status</span>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ConnectionStatus() {
  const [queryTime, setQueryTime] = useState<number | null>(null);
  const [lastConnected, setLastConnected] = useState<boolean>(true);
  const [lastStatusUpdate, setLastStatusUpdate] = useState<boolean | null>(null);
  const queryClient = useQueryClient();

  // Mutation to update connection status in the backend
  const updateConnectionStatus = useMutation<
    ConnectionStatusResponse | { status: "skipped"; reason: string },
    Error,
    boolean
  >({
    mutationFn: async (isConnected: boolean) => {
      const sessionExists = await Session.doesSessionExist();
      console.log("[ConnectionStatus] Session exists for updateConnectionStatus:", sessionExists);
      if (!sessionExists) {
        console.warn("[ConnectionStatus] No session, skipping updateConnectionStatus");
        return { status: "skipped", reason: "No active session" };
      }
      return apiClient.updateConnectionStatus({ isConnected });
    },
    onSuccess: (response) => {
      console.log("[ConnectionStatus] Backend status updated:", response);
    },
    onError: (error) => {
      console.error("[ConnectionStatus] Failed to update connection status:", error);
    },
  });

  // Query to check connection status
  const query = useQuery<ConnectionStatusResponse | { status: "skipped"; reason: string }, Error>({
    queryKey: ["status"],
    queryFn: async () => {
      const sessionExists = await Session.doesSessionExist();
      console.log("[ConnectionStatus] Session exists for status query:", sessionExists);
      if (!sessionExists) {
        console.warn("[ConnectionStatus] No session, skipping status query");
        throw new Error("No active session");
      }
      const start = performance.now();
      const data = await apiClient.getConnectionStatus();
      const end = performance.now();
      setQueryTime(end - start);
      return data;
    },
    refetchInterval: (query: Query<ConnectionStatusResponse | { status: "skipped"; reason: string }, Error>) => {
      const sessionExists = Session.doesSessionExistSync();
      return sessionExists && !query.state.error ? 30_000 : false;
    },
    retry: 3,
    retryDelay: 1000,
    refetchOnWindowFocus: (query: Query<ConnectionStatusResponse | { status: "skipped"; reason: string }, Error>) => {
      const sessionExists = Session.doesSessionExistSync();
      return sessionExists && !query.state.error;
    },
    enabled: false, // Start disabled, enable via useEffect
  });

  // Enable query only when session exists
  useEffect(() => {
    let isMounted = true;
    const checkSession = async () => {
      const sessionExists = await Session.doesSessionExist();
      if (isMounted && sessionExists) {
        console.log("[ConnectionStatus] Enabling status query");
        queryClient.invalidateQueries({ queryKey: ["status"] });
      } else if (isMounted) {
        console.log("[ConnectionStatus] No session, cancelling status query");
        queryClient.cancelQueries({ queryKey: ["status"] });
        queryClient.removeQueries({ queryKey: ["status"] });
        setLastConnected(false); // Reset connection status on no session
      }
    };
    checkSession();

    // Poll session status to catch logout or session expiration
    const intervalId = setInterval(checkSession, 5000); // Check every 5 seconds
    return () => {
      isMounted = false;
      clearInterval(intervalId);
      queryClient.cancelQueries({ queryKey: ["status"] });
      queryClient.removeQueries({ queryKey: ["status"] });
    };
  }, [queryClient]);

  // Update connection state based on query status
  useEffect(() => {
    if (query.isSuccess && query.data && "isConnected" in query.data) {
      setLastConnected(query.data.isConnected);
      console.log("[ConnectionStatus] Connection status updated from query:", query.data.isConnected);
    } else if (query.isError) {
      setLastConnected(false);
      console.error("[ConnectionStatus] Failed to fetch connection status:", query.error);
    }
  }, [query.isSuccess, query.isError, query.data]);

  // Sync connection status to backend when it changes
  useEffect(() => {
    const currentStatus = query.isSuccess && !query.isError && query.data && "isConnected" in query.data ? query.data.isConnected : false;
    if (lastStatusUpdate !== currentStatus && currentStatus !== undefined) {
      setLastStatusUpdate(currentStatus);
      updateConnectionStatus.mutate(currentStatus, {
        onSuccess: (response) => {
          console.log("[ConnectionStatus] Backend status updated:", { currentStatus, response });
        },
        onError: (error) => {
          console.error("[ConnectionStatus] Backend status update failed:", error);
        },
      });
    }
  }, [query.isSuccess, query.isError, query.data, updateConnectionStatus]);

  const isLoading = query.isRefetching || query.isPending;
  const connected = lastConnected;
  const displayStatus = isLoading && queryTime === null ? "Connecting..." : connected ? "Connected" : "Disconnected";

  return (
    <ConnectionStatusErrorBoundary>
      <div className="flex items-center gap-2 px-4 py-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 select-none transition-all duration-200">
              <div
                className={cn([
                  "h-2.5 w-2.5 rounded-full",
                  displayStatus === "Connecting..." ? "bg-muted-foreground" : connected ? "bg-green-600" : "bg-red-600",
                ])}
              />
              <span
                className={cn([
                  "text-xs",
                  displayStatus === "Connecting..." ? "text-muted-foreground" : connected ? "text-green-600" : "text-red-600",
                ])}
              >
                {displayStatus}
              </span>
            </div>
          </TooltipTrigger>
          {connected ? (
            <TooltipContent side="top">
              <div className="flex items-center gap-1">
                <Activity className="size-4" />
                <span>{queryTime?.toFixed(2)} ms</span>
              </div>
            </TooltipContent>
          ) : null}
        </Tooltip>
      </div>
    </ConnectionStatusErrorBoundary>
  );
}