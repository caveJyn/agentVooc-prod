// client/src/routes/settings.tsx
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, BarChart3, TrendingUp, Calendar, DollarSign, Activity, Zap, Shield, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api";
import { doesSessionExist } from "supertokens-web-js/recipe/session";
import { useSubscriptionStatus } from "@/hooks/stripe-webhook";
import PageTitle from "@/components/page-title";
import PaymentSection from "@/components/payment-selection";
import { Item } from "@/types/index.ts";
import { toast } from "@/hooks/use-toast";

interface User {
  userId: string;
  userType: string;
  email: string;
  name: string;
  trialStartDate?: string;
  trialEndDate?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  responseCount: number;
  tokenCount: number;
  subscriptionStatus: string;
  activePlugins: string[];
  activePriceIds: string[];
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  hasUsedTrial: boolean;
  cancelAtPeriodEnd: boolean;
  isConnected: boolean;
}

interface AnalyticsMetric {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  color: string;
}

export default function Settings() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [selectedItems, setSelectedItems] = useState<Item[]>([]);
  const [selectedBaseItem, setSelectedBaseItem] = useState<Item | null>(null);

  useEffect(() => {
    async function initialize() {
      try {
        const sessionExists = await doesSessionExist();
        // console.log("[Settings] Session exists:", sessionExists);
        if (sessionExists) {
          const userData = await apiClient.getUser();
          // console.log("[Settings] Fetched user data:", userData);
          if (userData?.user) {
            setUser(userData.user);
          } else {
            setError("No user data returned.");
            console.error("[Settings] No user data returned");
          }
        } else {
          // console.log("[Settings] No session, redirecting to /auth");
          window.location.href = "/auth";
        }
      } catch (err: any) {
        setError("Failed to load user data: " + err.message);
        console.error("[Settings] Error loading user data:", err.message);
      }
    }
    initialize();
  }, []);

  const { data: subscriptionData, isLoading: isSubscriptionLoading } = useSubscriptionStatus(user?.userId);

  // Fetch all available items
  const allItemsQuery = useQuery({
    queryKey: ["all-items"],
    queryFn: async () => {
      const data = await apiClient.getItems();
      // console.log("[Settings] Fetched all items:", data.items);
      return data.items;
    },
    enabled: !!user?.userId,
  });

  // Filter items into base and plugins
  const baseItems = allItemsQuery.data?.filter(item => item.itemType === "base") || [];
  const pluginItems = allItemsQuery.data?.filter(item => item.itemType === "plugin") || [];

  const currentBaseItem = baseItems.find(item => subscriptionData?.activePriceIds?.includes(item.stripePriceId));
  const currentPluginItems = pluginItems.filter(item => subscriptionData?.activePlugins?.includes(item.pluginName));
  const availableBaseItems = baseItems.filter(item => item.id !== currentBaseItem?.id);
  const availablePluginItems = pluginItems.filter(item => {
    const isAvailable = !subscriptionData?.activePlugins?.includes(item.pluginName);
    return isAvailable;
  });

  // Calculate analytics metrics
  const calculateAnalytics = (): AnalyticsMetric[] => {
    if (!user || !subscriptionData) return [];

    const totalPrice = (subscriptionData as any).items?.reduce(
      (sum: number, item: any) => sum + (item.price || 0),
      0
    ) / 100 || 0;

    const trialDaysLeft = user.trialEndDate 
      ? Math.max(0, Math.ceil((new Date(user.trialEndDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

    const billingDaysLeft = user.currentPeriodEnd
      ? Math.max(0, Math.ceil((new Date(user.currentPeriodEnd).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

    const tokenEfficiency = user.responseCount > 0 ? (user.tokenCount / user.responseCount).toFixed(0) : 0;

    return [
      {
        label: "Monthly Spend",
        value: `$${totalPrice.toFixed(2)}`,
        icon: <DollarSign className="h-5 w-5" />,
        trend: user.subscriptionStatus === "trialing" ? "Trial Active" : "Active",
        color: "text-green-400"
      },
      {
        label: "API Responses",
        value: user.responseCount.toLocaleString(),
        icon: <Activity className="h-5 w-5" />,
        trend: user.responseCount > 100 ? "High Usage" : user.responseCount > 10 ? "Moderate" : "Low Usage",
        color: user.responseCount > 100 ? "text-orange-400" : "text-blue-400"
      },
      {
        label: "Tokens Consumed",
        value: user.tokenCount.toLocaleString(),
        icon: <Zap className="h-5 w-5" />,
        trend: `${tokenEfficiency} avg/response`,
        color: "text-purple-400"
      },
      {
        label: "Active Plugins",
        value: currentPluginItems.length,
        icon: <Shield className="h-5 w-5" />,
        trend: `${availablePluginItems.length} available`,
        color: "text-cyan-400"
      },
      {
        label: user.subscriptionStatus === "trialing" ? "Trial Days Left" : "Billing Days Left",
        value: user.subscriptionStatus === "trialing" ? trialDaysLeft : billingDaysLeft,
        icon: <Calendar className="h-5 w-5" />,
        trend: user.subscriptionStatus === "trialing" ? "Free Trial" : "Paid Plan",
        color: user.subscriptionStatus === "trialing" ? "text-yellow-400" : "text-green-400"
      },
      {
        label: "Account Status",
        value: user.subscriptionStatus === "trialing" ? "TRIAL" : "ACTIVE",
        icon: <TrendingUp className="h-5 w-5" />,
        trend: user.hasUsedTrial ? "Returning User" : "New User",
        color: user.subscriptionStatus === "trialing" ? "text-yellow-400" : "text-green-400"
      }
    ];
  };

  const analyticsMetrics = calculateAnalytics();

  const handleAddPlugin = async (pluginName: string) => {
    try {
      // console.log("[Settings] Adding plugin:", pluginName);
      await apiClient.addPlugin(pluginName);
      setError(null);
      // console.log("[Settings] Plugin added successfully, invalidating user query");
      await queryClient.invalidateQueries({ queryKey: ["user"] });
      window.location.reload();
    } catch (error: any) {
      setError("Failed to add plugin: " + error.message);
      console.error("[Settings] Failed to add plugin:", error.message);
    }
  };

  const handleRemovePlugin = async (pluginName: string) => {
  try {
    // console.log("[Settings] Removing plugin:", pluginName);
    await apiClient.removePlugin(pluginName);
    setError(null);
    toast({
      title: "Success",
      description: `Plugin "${pluginName}" removed successfully.`,
      variant: "default",
    });
    // console.log("[Settings] Plugin removed successfully, reloading page");
    window.location.reload();
  } catch (error: any) {
    const backendError = error.response?.data?.error || "Failed to remove plugin. One of the character is using the plugin";
    const errorMessage = backendError.includes("Cannot remove plugin") && backendError.includes("characters")
      ? "One of the character is using the plugin"
      : backendError;
    setError(errorMessage);
    toast({
      title: "Error",
      description: errorMessage,
      variant: "destructive",
    });
    console.error("[Settings] Failed to remove plugin:", errorMessage);
  }
};

  const handleUpdateBasePlan = async () => {
    if (selectedBaseItem) {
      try {
        // console.log("[Settings] Updating base plan to:", selectedBaseItem);
        await apiClient.updateBasePlan(selectedBaseItem.id);
        setError(null);
        // console.log("[Settings] Base plan updated successfully, reloading page");
        window.location.reload();
      } catch (error: any) {
        setError("Failed to update base plan: " + error.message);
        console.error("[Settings] Failed to update base plan:", error.message);
      }
    }
  };

  const handleCancelSubscription = async () => {
    if (
      window.confirm(
        "Are you sure you want to cancel your entire subscription, including the base plan and all plugins? This action cannot be undone."
      )
    ) {
      try {
        // console.log("[Settings] Cancelling subscription");
        const response = await apiClient.cancelSubscription();
        setError(null);
        // console.log("[Settings] Subscription cancellation response:", response);
        alert(`Subscription will cancel on ${new Date(response.periodEnd).toLocaleDateString()}.`);
        window.location.reload();
      } catch (error: any) {
        setError("Failed to cancel subscription: " + error.message);
        console.error("[Settings] Failed to cancel subscription:", error.message);
      }
    }
  };

  const handleManageSubscription = async () => {
    try {
      // console.log("[Settings] Creating portal session");
      const response = await apiClient.createPortalSession();
      // console.log("[Settings] Portal session created, redirecting to:", response.url);
      window.location.href = response.url;
    } catch (err: any) {
      setError("Failed to open subscription portal: " + err.message);
      console.error("[Settings] Failed to open subscription portal:", err.message);
    }
  };

  if (!user) {
    // console.log("[Settings] No user data, rendering loading state");
    return (
      <div className="flex items-center justify-center min-h-screen bg-agentvooc-secondary-bg">
        <Loader2 className="h-8 w-8 animate-spin text-agentvooc-accent" />
        <p className="ml-3 text-agentvooc-secondary">Analyzing user data...</p>
      </div>
    );
  }

  if (isSubscriptionLoading) {
    // console.log("[Settings] Subscription data loading, rendering loader");
    return (
      <div className="flex items-center justify-center min-h-screen bg-agentvooc-secondary-bg">
        <Loader2 className="h-8 w-8 animate-spin text-agentvooc-accent" />
        <p className="ml-3 text-agentvooc-secondary">Processing subscription analytics...</p>
      </div>
    );
  }

  if (!subscriptionData || subscriptionData.status === "none" || subscriptionData.status === "canceled") {
    // console.log("[Settings] No active subscription, rendering payment section");
    return (
      <div className="min-h-screen bg-agentvooc-secondary-bg p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <SettingsIcon className="h-8 w-8 text-agentvooc-accent" />
            <PageTitle title="Analytics & Subscription" />
          </div>
          <PaymentSection
            user={user}
            items={allItemsQuery.data || []}
            itemsQuery={allItemsQuery}
            selectedItems={selectedItems}
            setSelectedItems={setSelectedItems}
          />
        </div>
      </div>
    );
  }

  interface SubscriptionItem extends Item {
    price: number;
    stripePriceId: string;
    itemType: string;
    name: string;
    pluginName?: string;
  }

  interface SubscriptionData {
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string;
    isTrialActive: boolean;
    trialEndDate: string;
    activePriceIds: string[];
    activePlugins: string[];
    items: SubscriptionItem[];
  }

  const totalPrice: number = (subscriptionData as SubscriptionData).items.reduce(
    (sum: number, item: SubscriptionItem) => sum + (item.price || 0),
    0
  ) / 100;
  const isCancelPending = subscriptionData.cancelAtPeriodEnd;

  return (
    <div className="min-h-screen bg-agentvooc-secondary-bg p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <BarChart3 className="h-8 w-8 text-agentvooc-accent" />
          <PageTitle title="Analytics Dashboard" />
        </div>

        {error && (
          <Card className="mb-6 border-red-500 bg-red-500/10">
            <CardContent className="p-4">
              <div className="text-red-400 font-medium">{error}</div>
            </CardContent>
          </Card>
        )}

        {/* Analytics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {analyticsMetrics.map((metric, index) => (
            <Card key={index} className="bg-agentvooc-secondary-accent/50 border-agentvooc-accent/20 hover:border-agentvooc-accent/40 transition-all shadow-agentvooc-glow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-agentvooc-secondary">{metric.label}</CardTitle>
                  <div className={metric.color}>{metric.icon}</div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl font-bold text-agentvooc-primary mb-1">{metric.value}</div>
                <div className={`text-xs ${metric.color} font-medium`}>{metric.trend}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Current Subscription Analysis */}
        <Card className="mb-8 bg-agentvooc-secondary-accent/30 border-agentvooc-accent/30">
          <CardHeader>
            <CardTitle className="text-xl text-agentvooc-primary flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-agentvooc-accent" />
              Subscription Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Subscription Status */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-agentvooc-primary">Current Status</h3>
                {isCancelPending ? (
                  <div className="p-4 bg-red-500/20 border border-red-500/30 rounded-lg">
                    <p className="text-red-400 font-medium">⚠️ Cancellation Pending</p>
                    <p className="text-agentvooc-secondary text-sm mt-1">
                      Subscription ends: {user.currentPeriodEnd ? new Date(user.currentPeriodEnd).toLocaleDateString() : "N/A"}
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-green-500/20 border border-green-500/30 rounded-lg">
                    <p className="text-green-400 font-medium">
                      {user.subscriptionStatus === "trialing" ? "🎯 Free Trial Active" : "✅ Subscription Active"}
                    </p>
                    <p className="text-agentvooc-secondary text-sm mt-1">
                      {user.subscriptionStatus === "trialing"
                        ? `Trial period: ${user.trialStartDate ? new Date(user.trialStartDate).toLocaleDateString() : "N/A"} - ${user.trialEndDate ? new Date(user.trialEndDate).toLocaleDateString() : "N/A"}`
                        : `Billing cycle: ${user.currentPeriodStart ? new Date(user.currentPeriodStart).toLocaleDateString() : "N/A"} - ${user.currentPeriodEnd ? new Date(user.currentPeriodEnd).toLocaleDateString() : "N/A"}`}
                    </p>
                  </div>
                )}
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-agentvooc-secondary">Base Plan:</span>
                    <span className="text-agentvooc-primary font-medium">{currentBaseItem?.name || "None"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-agentvooc-secondary">Active Plugins:</span>
                    <span className="text-agentvooc-primary font-medium">{currentPluginItems.length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-agentvooc-secondary">Monthly Total:</span>
                    <span className="text-agentvooc-accent font-bold text-lg">${totalPrice.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Usage Analytics */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-agentvooc-primary">Usage Analytics</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-agentvooc-secondary-bg rounded-lg">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-blue-400" />
                      <span className="text-agentvooc-secondary">API Responses</span>
                    </div>
                    <span className="text-agentvooc-primary font-bold">{user.responseCount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-agentvooc-secondary-bg rounded-lg">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-purple-400" />
                      <span className="text-agentvooc-secondary">Tokens Processed</span>
                    </div>
                    <span className="text-agentvooc-primary font-bold">{user.tokenCount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-agentvooc-secondary-bg rounded-lg">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-green-400" />
                      <span className="text-agentvooc-secondary">Efficiency Ratio</span>
                    </div>
                    <span className="text-agentvooc-primary font-bold">
                      {user.responseCount > 0 ? (user.tokenCount / user.responseCount).toFixed(0) : 0} tokens/response
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Active Items */}
            <div className="mt-6 pt-6 border-t border-agentvooc-accent/20">
              <h4 className="text-lg font-semibold text-agentvooc-primary mb-4">Active Subscription Items</h4>
              <div className="space-y-2">
                {subscriptionData.items.map((item: SubscriptionItem) => (
                  <div key={item.stripePriceId} className="flex items-center justify-between p-3 bg-agentvooc-secondary-bg rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${item.itemType === "base" ? "bg-blue-400" : "bg-green-400"}`}></div>
                      <span className="text-agentvooc-primary font-medium">{item.name}</span>
                      <span className="text-xs px-2 py-1 bg-agentvooc-accent/20 text-agentvooc-accent rounded-full">
                        {item.itemType.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-agentvooc-secondary">${(item.price / 100).toFixed(2)}/mo</span>
                      {item.itemType === "plugin" && !isCancelPending && (
                        <Button
                          onClick={() => item.pluginName && handleRemovePlugin(item.pluginName)}
                          size="sm"
                          variant="destructive"
                          className="h-8 px-3 text-xs"
                          disabled={!item.pluginName}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Management Actions */}
        {!isCancelPending && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Update Base Plan */}
            <Card className="bg-agentvooc-secondary-accent/30 border-agentvooc-accent/30">
              <CardHeader>
                <CardTitle className="text-lg text-agentvooc-primary">Update Base Plan</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <select
                    value={selectedBaseItem?.id || ""}
                    onChange={(e) => {
                      const selected = availableBaseItems.find(item => item.id === e.target.value) || null;
                      setSelectedBaseItem(selected);
                    }}
                    className="w-full p-3 bg-agentvooc-secondary-bg border border-agentvooc-accent/30 rounded-lg text-agentvooc-primary focus:border-agentvooc-accent"
                  >
                    <option value="">Select a base plan</option>
                    {availableBaseItems.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name} - ${(item.price / 100).toFixed(2)}/mo
                      </option>
                    ))}
                  </select>
                  <Button 
                    onClick={handleUpdateBasePlan} 
                    className="w-full bg-agentvooc-accent hover:bg-agentvooc-accent/80 text-agentvooc-secondary-bg" 
                    disabled={!selectedBaseItem}
                  >
                    Update Base Plan
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Available Plugins */}
            <Card className="bg-agentvooc-secondary-accent/30 border-agentvooc-accent/30">
              <CardHeader>
                <CardTitle className="text-lg text-agentvooc-primary">Available Plugins</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {availablePluginItems.length > 0 ? (
                    availablePluginItems.map(item => (
                      <div key={item.id} className="flex items-center justify-between p-3 bg-agentvooc-secondary-bg rounded-lg">
                        <div>
                          <p className="text-agentvooc-primary font-medium">{item.name}</p>
                          <p className="text-agentvooc-secondary text-sm">${(item.price / 100).toFixed(2)}/month</p>
                        </div>
                        <Button
                          onClick={() => item.pluginName && handleAddPlugin(item.pluginName)}
                          size="sm"
                          className="bg-green-500 hover:bg-green-600 text-white"
                          disabled={!item.pluginName}
                        >
                          Add Plugin
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-agentvooc-secondary text-center py-4">No additional plugins available.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Button
            onClick={handleManageSubscription}
            className="bg-agentvooc-accent hover:bg-agentvooc-accent/80 text-agentvooc-secondary-bg"
          >
            Manage Billing Portal
          </Button>
          
          {!isCancelPending && (
            <Button
              onClick={handleCancelSubscription}
              variant="destructive"
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Cancel Entire Subscription
            </Button>
          )}
        </div>

        {/* Trial Auto-Continue Notice */}
        {!isCancelPending && user.subscriptionStatus === "trialing" && (
          <Card className="mt-6 bg-yellow-500/10 border-yellow-500/30">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-yellow-400 mt-0.5" />
                <div>
                  <p className="text-yellow-400 font-medium">Trial Auto-Continue Notice</p>
                  <p className="text-agentvooc-secondary text-sm mt-1">
                    After your free trial ends on {user.trialEndDate ? new Date(user.trialEndDate).toLocaleDateString() : "N/A"}, 
                    this subscription will continue automatically at ${totalPrice.toFixed(2)}/month.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}