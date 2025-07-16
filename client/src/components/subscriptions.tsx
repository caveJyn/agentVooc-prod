import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { doesSessionExist } from "supertokens-web-js/recipe/session";
import { useEffect, useState } from "react";
import { toast } from "@/hooks/use-toast";

interface Item {
  id: string;
  name: string;
  description: string;
  price: number;
  itemType: string;
  pluginName?: string;
  features?: string[];
  isPopular?: boolean;
  trialInfo?: string;
  useCase?: string;
}

export default function Subscriptions() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [selectedBase, setSelectedBase] = useState<Item | null>(null);
  const [selectedPlugins, setSelectedPlugins] = useState<Item[]>([]);

  useEffect(() => {
    async function checkSession() {
      try {
        const sessionExists = await doesSessionExist();
        setIsAuthenticated(sessionExists);
      } catch (error) {
        console.error("[SUBSCRIPTIONS] Error checking session:", error);
        setIsAuthenticated(false);
      }
    }
    checkSession();
  }, []);

  const itemsQuery = useQuery({
    queryKey: ["subscriptionItems"],
    queryFn: async () => {
      const data = await apiClient.getItems();
      return data.items;
    },
  });

  const handleBaseSelect = (item: Item) => {
    setSelectedBase(item);
  };

  const handlePluginToggle = (item: Item) => {
    setSelectedPlugins((prev) =>
      prev.some((i) => i.id === item.id)
        ? prev.filter((i) => i.id !== item.id)
        : [...prev, item]
    );
  };

  const handleStartSubscription = () => {
    if (!selectedBase) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a base plan.",
        className: "bg-agentvooc-error text-agentvooc-error-foreground",
      });
      return;
    }
    const items = [selectedBase, ...selectedPlugins];
    if (isAuthenticated) {
      navigate("/payment", { state: { selectedItems: items } });
    } else {
      navigate("/auth/email", {
        state: { defaultIsSignUp: true, selectedItems: items },
      });
    }
  };

  if (isAuthenticated === null || itemsQuery.isLoading) {
    return (
      <section className="text-agentvooc-secondary flex items-center justify-center p-4" aria-label="Loading Subscriptions">
        <Loader2 className="mr-2 h-6 w-6 animate-spin text-agentvooc-accent" />
        <p>Loading subscriptions...</p>
      </section>
    );
  }

  if (itemsQuery.error) {
    return (
      <section className="p-4 text-agentvooc-secondary" aria-label="Error">
        <p>Error loading subscriptions: {(itemsQuery.error as Error).message}</p>
      </section>
    );
  }

  const baseItems = itemsQuery.data?.filter((item: Item) =>
    ["base", "subscription"].includes(item.itemType)
  ) || [];
  const pluginItems = itemsQuery.data?.filter((item: Item) => item.itemType === "plugin") || [];

  return (
    <section className="py-16 px-4 bg-agentvooc-primary-bg animate-fade-in" aria-label="Subscriptions">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-4xl font-bold mb-8 text-center text-agentvooc-primary">
          Choose Your Plan
        </h2>
        <div>
          <h3 className="text-2xl font-semibold mb-4 text-agentvooc-primary">
            Base Plans (Select One)
          </h3>
          {baseItems.length === 0 ? (
            <p className="text-center text-agentvooc-secondary">
              No base plans available at this time.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {baseItems.map((item: Item) => (
                <Card
                  key={item.id}
                  className={`flex flex-col bg-agentvooc-secondary-accent border-agentvooc-border transition-all relative hover:shadow-lg hover:scale-105 cursor-pointer ${
                    selectedBase?.id === item.id ? "border-agentvooc-accent shadow-agentvooc-glow" : ""
                  }`}
                  onClick={() => handleBaseSelect(item)}
                  aria-labelledby={`base-plan-${item.id}-title`}
                >
                  {item.isPopular && (
                    <div className="absolute top-0 right-0 bg-agentvooc-accent text-agentvooc-primary-bg px-3 py-1 rounded-bl-lg text-sm font-semibold">
                      Most Popular
                    </div>
                  )}
                  <CardHeader>
                    <CardTitle
                      id={`base-plan-${item.id}-title`}
                      className="text-xl text-agentvooc-primary"
                    >
                      {item.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-grow">
                    <p className="text-agentvooc-secondary mb-4">{item.description}</p>
                    <p className="text-lg font-semibold text-agentvooc-primary">
                      ${(item.price / 100).toFixed(2)}/month
                    </p>
                    {item.useCase && (
                      <p className="text-sm text-agentvooc-secondary mt-2 italic">
                        {item.useCase}
                      </p>
                    )}
                    {item.features && item.features.length > 0 && (
                      <ul className="mt-4 space-y-2 custom-bullets">
                        {item.features.map((feature, index) => (
                          <li
                            key={index}
                            className="flex items-center text-agentvooc-secondary text-sm"
                          >
                            <svg
                              className="w-4 h-4 mr-2 text-agentvooc-accent"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                            {feature}
                          </li>
                        ))}
                      </ul>
                    )}
                    {item.trialInfo && (
                      <p className="text-sm text-agentvooc-accent mt-4">
                        {item.trialInfo}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
        {selectedBase && (
          <div>
            <h3 className="text-2xl font-semibold mb-4 text-agentvooc-primary">
              Optional Plugins
            </h3>
            {pluginItems.length === 0 ? (
              <p className="text-center text-agentvooc-secondary">
                No plugins available at this time.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {pluginItems.map((item: Item) => (
                  <Card
                    key={item.id}
                    className={`flex flex-col bg-agentvooc-secondary-accent border-agentvooc-border transition-all relative hover:shadow-lg hover:scale-105 cursor-pointer ${
                      selectedPlugins.some((i) => i.id === item.id)
                        ? "border-agentvooc-accent shadow-agentvooc-glow"
                        : ""
                    }`}
                    onClick={() => handlePluginToggle(item)}
                    aria-labelledby={`plugin-${item.id}-title`}
                  >
                    <CardHeader>
                      <CardTitle
                        id={`plugin-${item.id}-title`}
                        className="text-xl text-agentvooc-primary"
                      >
                        {item.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-grow">
                      <p className="text-agentvooc-secondary mb-4">{item.description}</p>
                      <p className="text-lg font-semibold text-agentvooc-primary">
                        ${(item.price / 100).toFixed(2)}/month
                      </p>
                      {item.useCase && (
                        <p className="text-sm text-agentvooc-secondary mt-2 italic">
                          {item.useCase}
                        </p>
                      )}
                      {item.features && item.features.length > 0 && (
                        <ul className="mt-4 space-y-2 custom-bullets">
                          {item.features.map((feature, index) => (
                            <li
                              key={index}
                              className="flex items-center text-agentvooc-secondary text-sm"
                            >
                              <svg
                                className="w-4 h-4 mr-2 text-agentvooc-accent"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                              {feature}
                            </li>
                          ))}
                        </ul>
                      )}
                      {item.trialInfo && (
                        <p className="text-sm text-agentvooc-accent mt-4">
                          {item.trialInfo}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="text-center">
          <Button
            className="bg-agentvooc-button-bg text-agentvooc-accent hover:bg-agentvooc-button-bg-hover hover:text-agentvooc-accent-dark shadow-agentvooc-glow animate-glow-pulse rounded-full"
            onClick={handleStartSubscription}
            disabled={!selectedBase}
            aria-label="Proceed to checkout"
          >
            Proceed to Checkout
          </Button>
        </div>
      </div>
    </section>
  );
};