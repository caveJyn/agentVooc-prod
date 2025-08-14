// client/src/components/app-sidebar.tsx
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarTrigger,
  SidebarInput,
  SidebarMenuAction,
  SidebarMenuBadge,
  useSidebar,
} from "@/components/ui/sidebar";
import { apiClient } from "@/lib/api";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import type { UUID, Character } from "@elizaos/core";
import { Book, Cog, User, Edit, Plus, Mail } from "lucide-react";
import ConnectionStatus from "./connection-status";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { MouseEvent, useEffect, useState } from "react";
import { Avatar, AvatarImage } from "./ui/avatar";
import { sessionHelper } from "@/lib/sessionHelper";

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState<string>("");
  const { setOpen, setOpenMobile, isMobile } = useSidebar();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Check session on mount and redirect to /auth if no session
  useEffect(() => {
    const checkSession = async () => {
      const exists = await sessionHelper.doesSessionExist();
      console.log("[APP_SIDEBAR] Session exists:", exists);
      if (!exists && window.location.pathname !== "/auth") {
        console.log("[APP_SIDEBAR] No session found, clearing cache and redirecting to /auth");
        queryClient.clear();
        queryClient.setQueryData(["user"], null);
        setSearchQuery("");
        navigate(`/auth?cb=${Date.now()}`, { replace: true });
      }
    };
    checkSession();
  }, [navigate, queryClient]);

  // Fetch user data
  const userQuery = useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      const data = await apiClient.getUser();
      console.log("[APP_SIDEBAR] User data fetched:", data);
      return data;
    },
    staleTime: 0, // No caching to ensure fresh data
    refetchOnMount: "always",
    refetchInterval: false,
    enabled: window.location.pathname !== "/auth", // Avoid fetching on /auth
  });

  // Fetch all agents/characters
  const query = useQuery({
    queryKey: ["agents", userQuery.data?.user?.userId], // Scope to userId
    queryFn: async () => {
      const data = await apiClient.getAgents();
      console.log("[APP_SIDEBAR] Agents fetched:", data);
      return data;
    },
    staleTime: 0, // No caching to ensure fresh data
    refetchOnMount: "always",
    refetchInterval: false,
    enabled: !!userQuery.data?.user?.userId, // Only fetch if user exists
  });

  // Filter agents based on search query
  const filteredAgents = (query?.data?.agents || []).filter((agent: { id: UUID; name: string }) =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Fetch character data for each filtered agent
  const characterQueries = useQuery({
    queryKey: ["characters", filteredAgents.map((a: { id: UUID }) => a.id), userQuery.data?.user?.userId],
    queryFn: async () => {
      const results = await Promise.all(
        filteredAgents.map((agent: { id: UUID }) =>
          apiClient
            .getCharacter(agent.id)
            .then((data: { character: Character }) => ({
              agentId: agent.id,
              character: data.character,
            }))
            .catch((error: Error) => {
              console.error(`[APP_SIDEBAR] Error fetching character for agent ${agent.id}:`, error);
              return { agentId: agent.id, character: null };
            })
        )
      );
      return Object.fromEntries(
        results.map((r) => [r.agentId, r.character])
      );
    },
    staleTime: 5 * 60 * 1000, // Reduced to 5 minutes for character data
    enabled: filteredAgents.length > 0 && !!userQuery.data?.user?.userId,
  });

  const handleLogout = async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const cacheBust = `?cb=${Date.now()}`;

    try {
      console.log("[APP_SIDEBAR] Starting logout process");

      // Cancel & clear all queries
      await queryClient.cancelQueries();
      queryClient.invalidateQueries();
      queryClient.clear();
      queryClient.setQueryData(["user"], null);
      queryClient.setQueryData(["agents"], null);
      queryClient.setQueryData(["characters"], null);

      // Sign out session
      const sessionExists = await sessionHelper.doesSessionExist();
      if (sessionExists) {
        console.log("[APP_SIDEBAR] Signing out session");
        await sessionHelper.signOut();
        console.log("[APP_SIDEBAR] Sign out complete");
      } else {
        console.log("[APP_SIDEBAR] No session to sign out");
      }

      // Clear client-side storage
      localStorage.clear();
      sessionStorage.clear();
      setSearchQuery("");

      // Show success toast
      toast({ title: "Success", description: "Logged out successfully." });

      // Force full page reload to clear state
      console.log("[APP_SIDEBAR] Redirecting to /auth");
      window.location.href = `/auth${cacheBust}`;
    } catch (err) {
      console.error("[APP_SIDEBAR] Logout error:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to log out.";

      // Clear storage and query cache on error
      localStorage.clear();
      sessionStorage.clear();
      queryClient.clear();
      queryClient.setQueryData(["user"], null);
      queryClient.setQueryData(["agents"], null);
      queryClient.setQueryData(["characters"], null);
      setSearchQuery("");

      toast({ variant: "destructive", title: "Error", description: errorMessage });

      navigate(`/auth${cacheBust}`, { replace: true });
      if (isMobile) setOpenMobile(false);
      else setOpen(false);

      // Ensure redirect
      setTimeout(() => {
        if (window.location.pathname !== "/auth") {
          console.log("[APP_SIDEBAR] Forcing redirect to /auth");
          window.location.href = `/auth${cacheBust}`;
        }
      }, 100);
    }
  };

  const handleLogin = () => {
    queryClient.clear(); // Clear cache on login navigation
    setSearchQuery("");
    navigate(`/auth?cb=${Date.now()}`);
  };

  const handleEditAgent = (agentId: UUID) => {
    navigate(`/edit-character/${agentId}`);
  };

  const handleCreateCharacter = () => {
    if (isMobile) {
      setOpenMobile(false);
    } else {
      setOpen(false);
    }
    navigate("/create-character");
  };

  return (
    <Sidebar className="bg-agentvooc-secondary-bg text-agentvooc-primary border-r border-agentvooc-border shadow-agentvooc-glow">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <NavLink to="/home" className="hover:bg-agentvooc-secondary-accent hover:text-agentvooc-accent transition-all">
                <div className="flex items-center gap-0.5 leading-none">
                  <Avatar className="size-8 p-1 border rounded-full select-none">
                    <AvatarImage src="/aV-logo.png" />
                  </Avatar>
                  <span className="font-semibold text-agentvooc-primary">agentVooc</span>
                  <span className="text-agentvooc-accent">.</span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem className="flex justify-end mr-2">
            <SidebarTrigger className="hover:bg-agentvooc-secondary-accent hover:text-agentvooc-accent" />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <Button
              variant="default"
              className="flex justify-start w-full"
              onClick={handleCreateCharacter}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Character
            </Button>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Agents</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem className="mr-2">
                <SidebarInput
                  placeholder="Search agents..."
                  value={searchQuery}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                  className="mx-2 border-agentvooc-accent/50 focus:ring-agentvooc-accent"
                />
              </SidebarMenuItem>
              {query?.isPending || characterQueries.isPending ? (
                <>
                  {Array.from({ length: 5 }).map((_, index) => (
                    <SidebarMenuItem key={`skeleton-${index}`}>
                      <SidebarMenuSkeleton showIcon />
                    </SidebarMenuItem>
                  ))}
                </>
              ) : filteredAgents.length === 0 ? (
                <SidebarMenuItem>
                  <p className="text-sm text-agentvooc-secondary px-2">
                    No agents found
                  </p>
                </SidebarMenuItem>
              ) : (
                filteredAgents.map((agent: { id: UUID; name: string }) => (
                  <SidebarMenuItem key={agent.id} className="group">
                    <SidebarMenuButton
                      asChild
                      isActive={location.pathname.includes(agent.id)}
                      tooltip={`Chat with ${agent.name}`}
                      className="transition-all"
                    >
                      <NavLink to={`/chat/${agent.id}`}>
                        <User className="" />
                        <span>{agent.name}</span>
                      </NavLink>
                    </SidebarMenuButton>
                    <SidebarMenuAction
                      onClick={() => handleEditAgent(agent.id)}
                      showOnHover
                      className="p-1 text-agentvooc-accent"
                    >
                      <Edit className="h-4 w-4" />
                    </SidebarMenuAction>
                    <SidebarMenuBadge>.</SidebarMenuBadge>
                    <KnowledgeVaultLink
                      agentId={agent.id}
                      agentName={agent.name}
                      character={characterQueries.data?.[agent.id]}
                      isCharacterPending={characterQueries.isPending}
                    />
                    <EmailVaultLink
                      agentId={agent.id}
                      agentName={agent.name}
                      character={characterQueries.data?.[agent.id]}
                      isCharacterPending={characterQueries.isPending}
                    />
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavLink
                to="https://elizaos.github.io/eliza/docs/intro/"
                target="_blank"
                className="hover:bg-agentvooc-secondary-accent hover:text-agentvooc-accent"
              >
                <Book className="text-agentvooc-accent" />
                <span>agentVooc OS-Fork of ElizaOS</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavLink
                to="https://agentvooc.com/company/blog/how-it-works"
                className="hover:bg-agentvooc-secondary-accent hover:text-agentvooc-accent"
              >
                <Cog className="text-agentvooc-accent" />
                <span>How it works</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavLink
                to="/settings"
                className="hover:bg-agentvooc-secondary-accent hover:text-agentvooc-accent"
              >
                <Cog className="text-agentvooc-accent" />
                <span>Settings</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <p className="text-sm text-agentvooc-secondary px-2">
              {userQuery.isLoading
                ? "Loading..."
                : userQuery.data?.user?.email || "No User Logged In"}
            </p>
          </SidebarMenuItem>
          <SidebarMenuItem>
            {userQuery.data?.user ? (
              <Button
                onClick={handleLogout}
                variant="default"
                className=""
              >
                Logout
              </Button>
            ) : (
              <Button
                onClick={handleLogin}
                variant="default"
                className=""
              >
                Log In
              </Button>
            )}
          </SidebarMenuItem>
          <SidebarMenuItem>
            <ConnectionStatus />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function KnowledgeVaultLink({
  agentId,
  agentName,
  character,
  isCharacterPending,
}: {
  agentId: UUID;
  agentName: string;
  character: Character | null;
  isCharacterPending: boolean;
}) {
  const location = useLocation();

  if (isCharacterPending || !character) {
    return null;
  }

  if (!character.settings?.ragKnowledge) {
    return null;
  }

  return (
    <SidebarMenu className="ml-4">
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={location.pathname === `/knowledge/${agentId}`}
          tooltip={`Knowledge Vault for ${agentName}`}
        >
          <NavLink to={`/knowledge/${agentId}`}>
            <Book className="text-agentvooc-accent" />
            <span>Knowledge Vault</span>
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function EmailVaultLink({
  agentId,
  agentName,
  character,
  isCharacterPending,
}: {
  agentId: UUID;
  agentName: string;
  character: Character | null;
  isCharacterPending: boolean;
}) {
  const location = useLocation();

  if (isCharacterPending || !character) {
    return null;
  }

  if (!character.plugins?.map((p: any) => typeof p === "string" ? p : p.name).includes("email")) {
    return null;
  }

  return (
    <SidebarMenu className="ml-4">
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={location.pathname === `/email-vault/${agentId}`}
          tooltip={`Email Vault for ${agentName}`}
        >
          <NavLink to={`/email-vault/${agentId}`}>
            <Mail className="text-agentvooc-accent" />
            <span>Email Vault</span>
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}