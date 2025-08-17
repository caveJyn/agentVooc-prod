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
import { NavLink, useNavigate } from "react-router-dom"; // Add useNavigate
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
  const navigate = useNavigate(); // Add navigate for controlled redirects

  useEffect(() => {
    // Prevent running if already on /auth to avoid loops
    if (window.location.pathname === "/auth") {
      console.log("[HOME] Already on /auth, skipping initialization");
      return;
    }

    let isMounted = true;

    async function initialize() {
      console.log("[HOME] Initializing Home component");
      try {
        const sessionExists = await doesSessionExist();
        console.log("[HOME] Session exists:", sessionExists);

        if (!sessionExists) {
          console.log("[HOME] No session exists, redirecting to /auth");
          if (isMounted) {
            setUser(null);
            queryClient.clear();
            navigate("/auth", { replace: true });
          }
          return;
        }

        console.log("[HOME] Fetching user data");
        const userData = await apiClient.getUser();
        console.log("[HOME] Fetched user data:", userData);

        if (!isMounted) return;

        if (userData.user) {
          const userInfo: User = {
            userId: userData.user.userId,
            userType: userData.user.userType,
            email: userData.user.email,
            name: userData.user.name,
          };
          setUser(userInfo);
          console.log("[HOME] User state updated:", userInfo);
        } else {
          console.warn("[HOME] No user data in response:", userData);
          setError("No user data returned. Please try logging in again.");
          setUser(null);
          navigate("/auth", { replace: true });
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.error("[HOME] Error handling session or user data:", err);

        // Avoid redirect if the error is due to a failed session refresh
        if (err.message === "Session expired, please login again") {
          console.log("[HOME] Session expired, redirecting to /auth");
          setError("Session expired. Please log in again.");
          setUser(null);
          navigate("/auth", { replace: true });
        } else {
          setError("Failed to load user data: " + (err.message || "Unknown error"));
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to initialize session. Please try again.",
          });
        }
      }
    }

    initialize();

    return () => {
      isMounted = false; // Prevent state updates after unmount
    };
  }, [queryClient, navigate]);

  const agentsQuery = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      try {
        const data = await apiClient.getAgents();
        console.log("[HOME] Raw agents data:", data);
        return data;
      } catch (err: any) {
        console.error("[HOME] Error fetching agents:", err.message, "Status:", err.status);
        const errorMessage = err.message.includes("Unauthorized")
          ? "Please log in to view your characters."
          : err.message.includes("User not found")
          ? "Your account is not registered. Please sign up again."
          : "Failed to fetch your characters: " + (err.message || "Unknown error");
        setError(errorMessage);

        // Only redirect to /auth if not already there
        if (err.message.includes("Unauthorized") && window.location.pathname !== "/auth") {
          console.log("[HOME] Unauthorized, redirecting to /auth");
          navigate("/auth", { replace: true });
        }
        throw err;
      }
    },
    enabled: !!user?.userId,
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
    refetchInterval: false, // Disable auto-refetching
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
    // Replace the existing (!user) section in home.tsx with this enhanced version
if (!user) {
  return (
    <div className="flex flex-col gap-8 min-h-screen p-4 sm:p-6 md:p-8 bg-agentvooc-secondary-bg">
      {/* Hero Section */}
      <div className="text-center max-w-4xl mx-auto">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-agentvooc-primary mb-4">
          Your AI Workforce is Here
        </h1>
        <p className="text-lg sm:text-xl md:text-2xl text-agentvooc-secondary mb-6 leading-relaxed">
          Deploy intelligent AI agents that handle your Gmail, answer customer queries with your knowledge, and automate repetitive tasks—while you focus on what matters most.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <NavLink to="/auth">
            <Button
              size="lg"
              className="bg-agentvooc-accent text-agentvooc-secondary-bg hover:bg-agentvooc-accent/80 transition-colors px-8 py-4 text-lg font-semibold"
            >
              Start 7-Day Free Trial
            </Button>
          </NavLink>
          <div className="text-sm text-agentvooc-secondary">
            Cancel with 1 click • Setup in 5 minutes
          </div>
        </div>
      </div>

      {/* Value Proposition Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
        <Card className="border-agentvooc-accent/30 hover:border-agentvooc-accent transition-all shadow-agentvooc-glow p-6">
          <div className="text-center">
            <div className="bg-agentvooc-accent/10 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <span className="text-2xl">📧</span>
            </div>
            <h3 className="text-xl font-semibold text-agentvooc-primary mb-2">Gmail Automation</h3>
            <p className="text-agentvooc-secondary">
              Let Voltara check, categorize, and reply to emails intelligently. Wake up to an organized inbox and start drafting and sending in seconds.
            </p>
          </div>
        </Card>

        <Card className="border-agentvooc-accent/30 hover:border-agentvooc-accent transition-all shadow-agentvooc-glow p-6">
          <div className="text-center">
            <div className="bg-agentvooc-accent/10 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <span className="text-2xl">🧠</span>
            </div>
            <h3 className="text-xl font-semibold text-agentvooc-primary mb-2">Smart Knowledge Base</h3>
            <p className="text-agentvooc-secondary">
              Upload your text-based knowledge to create AI agents that answer questions with your specific knowledge—perfect for customer support and internal queries.
            </p>
          </div>
        </Card>

        <Card className="border-agentvooc-accent/30 hover:border-agentvooc-accent transition-all shadow-agentvooc-glow p-6">
          <div className="text-center">
            <div className="bg-agentvooc-accent/10 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <span className="text-2xl">⚡</span>
            </div>
            <h3 className="text-xl font-semibold text-agentvooc-primary mb-2">Custom AI Agents</h3>
            <p className="text-agentvooc-secondary">
              Build personalized AI characters with unique personalities and expertise tailored to your specific business needs and workflows.
            </p>
          </div>
        </Card>
      </div>

      {/* Demo Agent Showcase */}
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-agentvooc-primary mb-4">
            See What's Possible
          </h2>
          <p className="text-lg text-agentvooc-secondary">
            Real examples of AI agents you can deploy today
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Voltara-Email Showcase */}
          <Card className="border-agentvooc-accent/30 hover:border-agentvooc-accent transition-all shadow-agentvooc-glow overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-agentvooc-accent/10 to-agentvooc-accent/5 p-6">
              <CardTitle className="text-xl text-agentvooc-primary">Voltara</CardTitle>
              <p className="text-agentvooc-secondary">Your Gmail automation specialist</p>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-center justify-center bg-agentvooc-secondary-bg rounded-lg h-32 mb-4">
                <div className="text-5xl font-bold text-agentvooc-accent">V</div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center text-sm text-agentvooc-secondary">
                  <span className="text-green-500 mr-2">✓</span>
                  Automatically checks and organizes your inbox
                </div>
                <div className="flex items-center text-sm text-agentvooc-secondary">
                  <span className="text-green-500 mr-2">✓</span>
                  Drafts intelligent replies in your writing style
                </div>
                <div className="flex items-center text-sm text-agentvooc-secondary">
                  <span className="text-green-500 mr-2">✓</span>
                  Generates Replies 
                </div>
                <div className="flex items-center text-sm text-agentvooc-secondary">
                  <span className="text-green-500 mr-2">✓</span>
                  Works 24/7 to keep your inbox under control
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Custom Knowledge Agent */}
          <Card className="border-agentvooc-accent/30 hover:border-agentvooc-accent transition-all shadow-agentvooc-glow overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-agentvooc-accent/10 to-agentvooc-accent/5 p-6">
              <CardTitle className="text-xl text-agentvooc-primary">Knowledge Assistant</CardTitle>
              <p className="text-agentvooc-secondary">Your company's smart knowledge base</p>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-center justify-center bg-agentvooc-secondary-bg rounded-lg h-32 mb-4">
                <div className="text-5xl font-bold text-agentvooc-accent">KA</div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center text-sm text-agentvooc-secondary">
                  <span className="text-green-500 mr-2">✓</span>
                  Upload text based knowledge bases
                </div>
                <div className="flex items-center text-sm text-agentvooc-secondary">
                  <span className="text-green-500 mr-2">✓</span>
                  Answer customer questions with your data
                </div>
                <div className="flex items-center text-sm text-agentvooc-secondary">
                  <span className="text-green-500 mr-2">✓</span>
                  Provide accurate, contextual responses
                </div>
                <div className="flex items-center text-sm text-agentvooc-secondary">
                  <span className="text-green-500 mr-2">✓</span>
                  Scale your expertise across teams
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Social Proof & Use Cases */}
      <div className="bg-agentvooc-accent/5 rounded-xl p-6 sm:p-8 max-w-6xl mx-auto">
        <h3 className="text-2xl font-bold text-agentvooc-primary text-center mb-6">
          Perfect for Growing Teams
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-3xl mb-2">👩‍💼</div>
            <h4 className="font-semibold text-agentvooc-primary mb-1">Entrepreneurs</h4>
            <p className="text-sm text-agentvooc-secondary">Automate customer support while you focus on growth</p>
          </div>
          <div className="text-center">
            <div className="text-3xl mb-2">🏢</div>
            <h4 className="font-semibold text-agentvooc-primary mb-1">Small Businesses</h4>
            <p className="text-sm text-agentvooc-secondary">Handle more customers without hiring more staff</p>
          </div>
          <div className="text-center">
            <div className="text-3xl mb-2">🛠️</div>
            <h4 className="font-semibold text-agentvooc-primary mb-1">Service Providers</h4>
            <p className="text-sm text-agentvooc-secondary">Respond to inquiries faster and more consistently</p>
          </div>
          <div className="text-center">
            <div className="text-3xl mb-2">📚</div>
            <h4 className="font-semibold text-agentvooc-primary mb-1">Consultants</h4>
            <p className="text-sm text-agentvooc-secondary">Share expertise through AI-powered interactions</p>
          </div>
        </div>
      </div>

      {/* Pricing Highlight */}
      <div className="text-center max-w-4xl mx-auto">
        <h3 className="text-2xl font-bold text-agentvooc-primary mb-4">
          Start Free, Scale When Ready
        </h3>
        <div className="bg-white/10 backdrop-blur rounded-xl p-6 border border-agentvooc-accent/30">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-left">
              <div className="text-3xl font-bold text-agentvooc-accent mb-1">7 Days Free</div>
              <div className="text-sm text-agentvooc-secondary mt-1">Cancel anytime • No setup fees</div>
            </div>
            <div className="flex flex-col gap-2">
              <NavLink to="/auth" className="w-full">
                <Button
                  size="lg"
                  className="bg-agentvooc-accent text-agentvooc-secondary-bg hover:bg-agentvooc-accent/80 transition-colors px-8 py-3 font-semibold w-full"
                >
                  Get Started Free
                </Button>
              </NavLink>
              <div className="text-xs text-agentvooc-secondary text-center">
                Join the revolution of automating with AI
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Final CTA */}
      <div className="text-center">
        <p className="text-agentvooc-secondary mb-4">
          Ready to transform how you handle emails and customer interactions?
        </p>
        <NavLink to="/auth">
          <Button
            size="lg"
            variant="outline"
            className="border-agentvooc-accent text-agentvooc-primary hover:bg-agentvooc-accent hover:text-agentvooc-secondary-bg transition-colors px-8 py-3"
          >
            Start Your Free Trial →
          </Button>
        </NavLink>
      </div>
    </div>
  );
}

    return (
      <div className="flex flex-col gap-4 min-h-screen  p-4 md:p-8 bg-agentvooc-secondary-bg">
        <div className="flex items-center justify-between">
          <PageTitle title="Your AI Agents" />
        </div>

        {error && (
          <div className="bg-red-500 text-white p-2 rounded">{error}</div>
        )}
        {agentsQuery.isLoading && (
          <div className="text-agentvooc-secondary flex items-center">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
              className="border-agentvooc-accent/30 hover:border-agentvooc-accent transition-all shadow-agentvooc-glow overflow-hidden min-w-[200px]"
            >
              <CardHeader className="p-4">
                <CardTitle className="text-lg truncate">{agent?.name}</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="rounded-md bg-agentvooc-secondary-bg aspect-square w-full grid place-items-center">
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
                      variant="default"                    >
                      Chat
                    </Button>
                  </NavLink>
                  <div className="flex gap-2 justify-center">
                    <NavLink to={`/settings/${agent.id}`}>
                      <Button
                        size="icon"
                        variant="outline"
                        className="w-9 h-9 border-agentvooc-accent/30 text-agentvooc-primary hover:bg-agentvooc-accent hover:text-agentvooc-secondary-bg transition-colors"
                        aria-label="Settings"
                      >
                        <Cog className="h-4 w-4" />
                      </Button>
                    </NavLink>
                    <NavLink to={`/knowledge/${agent.id}`}>
                      <Button
                        size="icon"
                        variant="outline"
                        className="w-9 h-9 border-agentvooc-accent/30 text-agentvooc-primary hover:bg-agentvooc-accent hover:text-agentvooc-secondary-bg transition-colors"
                        aria-label="Knowledge"
                      >
                        <Book className="h-4 w-4" />
                      </Button>
                    </NavLink>
                    <NavLink to={`/edit-character/${agent.id}`}>
                      <Button
                        size="icon"
                        variant="outline"
                        className="w-9 h-9 border-agentvooc-accent/30 text-agentvooc-primary hover:bg-agentvooc-accent hover:text-agentvooc-secondary-bg transition-colors"
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