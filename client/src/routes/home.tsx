// client/src/routes/home.tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Cog, Trash2, Edit, Book } from "lucide-react";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiClient } from "@/lib/api";
import { NavLink } from "react-router-dom";
import type { UUID } from "@elizaos/core";
import { formatAgentName } from "@/lib/utils";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { doesSessionExist } from "supertokens-web-js/recipe/session";
import { toast } from "@/hooks/use-toast";

interface User {
  userId: string;
  userType: string;
  email: string;
  name: string;
}

export default function Home() {
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    async function initialize() {
      // console.log("[HOME] Initializing Home component");
      try {
        const sessionExists = await doesSessionExist();
        // console.log("[HOME] Session exists:", sessionExists);
        if (sessionExists) {
          // console.log("[HOME] Fetching user data");
          const userData = await apiClient.getUser();
          // console.log("[HOME] Fetched user data:", userData);
          if (userData.user) {
            const userInfo: User = {
              userId: userData.user.userId,
              userType: userData.user.userType,
              email: userData.user.email,
              name: userData.user.name,
            };
            setUser(userInfo);
            // console.log("[HOME] User state updated:", userInfo);
          } else {
            console.warn("[HOME] No user data in response:", userData);
            setError("No user data returned. Please try logging in again.");
            setUser(null);
            if (window.location.pathname !== "/auth") {
              window.location.href = "/auth";
            }
          }
        } else {
          // console.log("[HOME] No session exists, proceeding as guest");
          setUser(null);
        }
      } catch (err: any) {
        console.error("[HOME] Error handling session or user data:", err);
        setError("Failed to load user data: " + (err.message || "Unknown error"));
        setUser(null);
      }
      // console.log("[HOME] User state after initialization:", user);
    }
    initialize();
  }, []);

  const agentsQuery = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      try {
        const data = await apiClient.getAgents();
        // console.log("[HOME] Raw agents data:", data);
        return data;
      } catch (err: any) {
        const errorMessage = err.message.includes("Unauthorized")
          ? "Please log in to view your characters."
          : err.message.includes("User not found")
          ? "Your account is not registered. Please sign up again."
          : "Failed to fetch your characters: " + (err.message || "Unknown error");
        setError(errorMessage);
        console.error("[HOME] Error fetching agents:", err.message, "Status:", err.status);
        if (err.message.includes("Unauthorized") && window.location.pathname !== "/auth") {
          window.location.href = "/auth";
        }
        throw err;
      }
    },
    enabled: !!user?.userId,
    refetchInterval: 30_000,
  });

  const deleteCharacterMutation = useMutation({
    mutationFn: (characterId: string) => apiClient.deleteCharacter(characterId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast({
        title: "Success",
        description: "Character deleted successfully.",
      });
    },
    onError: (error: any) => {
      console.error("[HOME] Error deleting character:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete character.",
      });
    },
  });

  const agents = agentsQuery?.data?.agents || [];

  const handleDeleteCharacter = (characterId: string, characterName: string) => {
    if (window.confirm(`Are you sure you want to delete the character "${characterName}"? This action cannot be undone.`)) {
      deleteCharacterMutation.mutate(characterId);
    }
  };

 try {
    if (!user) {
      return (
        <div className="p-4 flex items-center justify-center min-h-screen">
          <Loader2 className="h-6 w-6 animate-spin text-agentvooc-accent" />
          <p className="ml-2 text-agentvooc-secondary">Loading user data...</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4 h-full p-4 md:p-8 bg-agentvooc-primary-bg">
        <div className="flex items-center justify-between">
          <PageTitle title="Your AI Agents" />
        </div>

        {error && (
          <div className="bg-red-500 text-white p-2 rounded">{error}</div>
        )}
        {agentsQuery.isLoading && (
          <div className="text-agentvooc-secondary flex items-center">
            <Loader2 className="mr-2 h-4 w-4 animate-spin text-agentvooc-accent" />
            Loading your characters...
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {!agentsQuery.isLoading && !error && agents.length === 0 && (
            <div className="text-agentvooc-secondary col-span-full text-center">
              You haven't created any characters yet. Click "Create Character" in the sidebar to get started!
            </div>
          )}
          {agents.map((agent: { id: UUID; name: string; profile?: { image?: string } }) => (
            <Card
              key={agent.id}
              className="bg-agentvooc-secondary-accent border-agentvooc-accent/30 hover:border-agentvooc-accent transition-all shadow-agentvooc-glow overflow-hidden min-w-[200px]"
            >
              <CardHeader className="p-4">
                <CardTitle className="text-agentvooc-primary text-lg truncate">{agent?.name}</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="rounded-md bg-agentvooc-primary-bg aspect-square w-full grid place-items-center">
                  {agent.profile?.image ? (
                    <img
                      src={agent.profile.image}
                      alt={`${agent.name}'s profile`}
                      className="w-full h-full object-cover rounded-md"
                    />
                  ) : (
                    <div className="text-4xl md:text-6xl font-bold uppercase text-agentvooc-accent">
                      {formatAgentName(agent?.name)}
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter className="p-4">
                <div className="flex flex-col gap-2 w-full">
                  <NavLink to={`/chat/${agent.id}`} className="w-full">
                    <Button
                      variant="outline"
                      className="w-full border-agentvooc-accent/30 text-agentvooc-primary hover:bg-agentvooc-accent hover:text-agentvooc-primary-bg transition-colors text-sm py-2"
                    >
                      Chat
                    </Button>
                  </NavLink>
                  <div className="flex gap-2 justify-center">
                    <NavLink to={`/settings/${agent.id}`}>
                      <Button
                        size="icon"
                        variant="outline"
                        className="w-9 h-9 border-agentvooc-accent/30 text-agentvooc-primary hover:bg-agentvooc-accent hover:text-agentvooc-primary-bg transition-colors"
                        aria-label="Settings"
                      >
                        <Cog className="h-4 w-4" />
                      </Button>
                    </NavLink>
                    <NavLink to={`/knowledge/${agent.id}`}>
                      <Button
                        size="icon"
                        variant="outline"
                        className="w-9 h-9 border-agentvooc-accent/30 text-agentvooc-primary hover:bg-agentvooc-accent hover:text-agentvooc-primary-bg transition-colors"
                        aria-label="Knowledge"
                      >
                        <Book className="h-4 w-4" />
                      </Button>
                    </NavLink>
                    <NavLink to={`/edit-character/${agent.id}`}>
                      <Button
                        size="icon"
                        variant="outline"
                        className="w-9 h-9 border-agentvooc-accent/30 text-agentvooc-primary hover:bg-agentvooc-accent hover:text-agentvooc-primary-bg transition-colors"
                        aria-label="Edit Character"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </NavLink>
                    <Button
                      size="icon"
                      variant="destructive"
                      onClick={() => handleDeleteCharacter(agent.id, agent.name)}
                      className="w-9 h-9 bg-red-500 text-white hover:bg-red-600 transition-colors"
                      disabled={deleteCharacterMutation.isPending}
                      aria-label="Delete Character"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    );
  } catch (renderError: any) {
    console.error("[HOME] Render error in Home component:", renderError);
    return (
      <div className="p-4">
        <h1 className="text-agentvooc-primary">Error rendering page</h1>
        <p className="text-agentvooc-secondary">Check the console for details.</p>
      </div>
    );
  }
}