// client/src/components/app-sidebar.tsx
import { useQuery } from "@tanstack/react-query";
import info from "@/lib/info.json";
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

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState<string>("");

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

  const handleLogout = async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    try {
      // Update connection status to disconnected before logging out
      try {
        await apiClient.updateConnectionStatus({ isConnected: false });
      } catch (statusError) {
        console.warn(
          "Failed to update connection status during logout:",
          statusError
        );
      }

      // Proceed with logout
      await signOut();
      toast({
        title: "Success!",
        description: "Logged out successfully.",
      });
      navigate("/");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to log out. Please try again.";
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
    }
  };

  const handleEditAgent = (agentId: UUID) => {
    navigate(`/edit-character/${agentId}`);
  };

  return (
    <Sidebar className="bg-agentvooc-secondary-bg text-agentvooc-primary border-r border-agentvooc-border shadow-agentvooc-glow">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <NavLink to="/home" className="hover:bg-agentvooc-secondary-accent hover:text-agentvooc-accent transition-all">
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold text-agentvooc-primary">agentVooc</span>
                  <span className="text-agentvooc-secondary">v{info?.version}</span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarTrigger className="w-full justify-start text-agentvooc-primary hover:bg-agentvooc-secondary-accent hover:text-agentvooc-accent">
              <span>Toggle Sidebar</span>
            </SidebarTrigger>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavLink
                to="/create-character"
                className="bg-agentvooc-button-bg text-agentvooc-accent hover:bg-agentvooc-button-bg-hover hover:text-agentvooc-accent-dark shadow-agentvooc-glow rounded-full animate-glow-pulse"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create Character
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-agentvooc-primary">Agents</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarInput
                  placeholder="Search agents..."
                  value={searchQuery}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                  className="mx-2 bg-agentvooc-secondary-accent text-agentvooc-primary border-agentvooc-border focus:ring-agentvooc-accent"
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
                      className="hover:bg-agentvooc-secondary-accent hover:text-agentvooc-accent transition-all"
                    >
                      <NavLink to={`/chat/${agent.id}`}>
                        <User className="text-agentvooc-accent" />
                        <span>{agent.name}</span>
                      </NavLink>
                    </SidebarMenuButton>
                    <SidebarMenuAction
                       onClick={() => handleEditAgent(agent.id)}
                       showOnHover
                       className="hover:bg-agentvooc-accent hover:text-agentvooc-secondary-bg p-1"
                        >   
                       <Edit className="h-4 w-4" />
                    </SidebarMenuAction>
                    <SidebarMenuBadge className="bg-agentvooc-accent text-agentvooc-secondary-bg">.</SidebarMenuBadge>
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
                to="https://agentvooc.com/company/blogs/how-it-works"
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
                : userQuery.data?.user?.email || "No email available"}
            </p>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <Button
              onClick={handleLogout}
              variant="outline"
              className="w-full bg-agentvooc-button-bg text-agentvooc-accent hover:bg-agentvooc-button-bg-hover hover:text-agentvooc-accent-dark border-agentvooc-border"
            >
              Logout
            </Button>
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
          className="hover:bg-agentvooc-secondary-accent hover:text-agentvooc-accent"
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
          className="hover:bg-agentvooc-secondary-accent hover:text-agentvooc-accent"
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
