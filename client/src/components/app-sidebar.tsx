// client/src/components/app-sidebar.tsx
import { useQuery, useQueryClient } from "@tanstack/react-query";
// import info from "@/lib/info.json";
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
  useSidebar
} from "@/components/ui/sidebar";
import { apiClient } from "@/lib/api";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import type { UUID, Character } from "@elizaos/core";
import { Book, Cog, User, Edit, Plus, Mail } from "lucide-react";
import ConnectionStatus from "./connection-status";
import { signOut } from "supertokens-web-js/recipe/session";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { MouseEvent, useState } from "react";
import { Avatar, AvatarImage } from "./ui/avatar";

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState<string>("");
  const { setOpen, setOpenMobile, isMobile } = useSidebar();
   const queryClient = useQueryClient();
  // Fetch user data
  const userQuery = useQuery({
    queryKey: ["user"],
    queryFn: () => apiClient.getUser(),
    staleTime: 30 * 60 * 1000, // Cache for 30 minutes
    refetchInterval: false,
  });

  // Fetch all agents/characters
  const query = useQuery({
    queryKey: ["agents"],
    queryFn: () => apiClient.getAgents(),
    staleTime: 30 * 60 * 1000,
    refetchInterval: false,
  });

  const agents = query?.data?.agents || [];

  // Filter agents based on search query
  const filteredAgents = agents.filter((agent: { id: UUID; name: string }) =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Fetch character data for each filtered agent
  const characterQueries = useQuery({
    queryKey: ["characters", filteredAgents.map((a: { id: UUID }) => a.id)],
    queryFn: async () => {
      const results = await Promise.all(
        filteredAgents.map((agent: { id: UUID }) =>
          apiClient
            .getCharacter(agent.id)
            .then((data: { character: Character }) => ({
              agentId: agent.id,
              character: data.character,
            }))
            .catch((_error: Error) => {
              // console.error(
              //   `[AppSidebar] Error fetching character for agent ${agent.id}:`,
              //   error
              // );
              return { agentId: agent.id, character: null };
            })
        )
      );
      return Object.fromEntries(
        results.map((r) => [r.agentId, r.character])
      );
    },
    staleTime: 30 * 60 * 1000,
    enabled: filteredAgents.length > 0,
  });

  const clearCookies = () => {
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [name] = cookie.split("=").map((c) => c.trim());
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.${window.location.hostname}`;
  }
  console.log("[APP_SIDEBAR] Cookies cleared:", document.cookie);
};

const handleLogout = async (e: MouseEvent<HTMLButtonElement>) => {
  e.preventDefault();
  try {
    // Retry updateConnectionStatus up to 3 times
    let updateSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[APP_SIDEBAR] Attempt ${attempt} to update connection status`);
        await apiClient.updateConnectionStatus({ isConnected: false, clientId: "logout" });
        updateSuccess = true;
        break;
      } catch (error) {
        console.warn(`[APP_SIDEBAR] Attempt ${attempt} failed:`, error);
        if (attempt === 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500)); // Wait before retry
      }
    }

    if (!updateSuccess) {
      throw new Error("Failed to update connection status after retries");
    }

    // Revoke SuperTokens session
    await signOut();
    console.log("[APP_SIDEBAR] Session revoked via signOut");

    // Clear cookies
    clearCookies();

    // Clear local and session storage
    localStorage.clear();
    sessionStorage.clear();

    // Clear React Query cache
    queryClient.clear();

    // Notify user
    toast({
      title: "Success!",
      description: "Logged out successfully.",
    });

    // Force full page reload
    window.location.assign("/");
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to log out. Please try again.";
    toast({
      variant: "destructive",
      title: "Error",
      description: errorMessage,
    });
    console.error("[APP_SIDEBAR] Logout error:", err);

    // Fallback: Clear cookies and redirect
    clearCookies();
    localStorage.clear();
    sessionStorage.clear();
    queryClient.clear();
    window.location.assign("/");
  }
};


  const handleLogin = () => {
  navigate("/auth");
};

  const handleEditAgent = (agentId: UUID) => {
    navigate(`/edit-character/${agentId}`);
  };

  const handleCreateCharacter = () => {
    if (isMobile) {
      setOpenMobile(false); // Close sidebar on mobile
    } else {
      setOpen(false); // Close sidebar on desktop
    }
    navigate("/create-character"); // Navigate to create-character
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
                  <span className="font-semibold text-agentvooc-primary">agentVooc</span><span className="text-agentvooc-accent">.</span>
                  {/* <span className="text-agentvooc-secondary mt-1">v{info?.version}</span> */}
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem className="flex justify-end mr-2">
            <SidebarTrigger className="hover:bg-agentvooc-secondary-accent hover:text-agentvooc-accent">
            </SidebarTrigger>
          </SidebarMenuItem>
         
              <SidebarMenuItem>
            <Button
              variant="default"
              className="flex justify-start w-full"
              onClick={handleCreateCharacter} // Use handleCreateCharacter
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
                  className="mx-2  border-agentvooc-accent/50 focus:ring-agentvooc-accent"
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
                      className=" transition-all"
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
