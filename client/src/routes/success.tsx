// client/src/routes/success.tsx
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { doesSessionExist } from "supertokens-web-js/recipe/session";
import { apiClient } from "@/lib/api";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { Item } from "@/types/index.ts";

interface PaymentData {
  amount: number;
  currency: string;
  orderId: string;
  email: string;
  items: Array<{
    content_id: string;
    content_name: string;
    content_type: string;
    num_items: number;
    content_price: number;
    content_group_id?: string | null;
  }>;
}

export default function SuccessPage() {
  const [user, setUser] = useState<{
    userId: string;
    userType: string;
    email?: string;
    subscriptionStatus?: string;
  } | null>(null);
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const maxRetries = 10;
  const retryDelay = 2000; // 2 seconds
  const queryClient = useQueryClient();

  useEffect(() => {
    async function checkSessionAndFetchData() {
      if (!sessionId) {
        setError("Invalid payment session. Please try again or contact support.");
        return;
      }

      if (await doesSessionExist()) {
        try {
          // Fetch user data
          const userResponse = await apiClient.getUser();
          const userData = {
            userId: userResponse.user.userId,
            userType: userResponse.user.userType,
            email: userResponse.user.email,
            subscriptionStatus: userResponse.user.subscriptionStatus,
          };
          setUser(userData);

          // Get selected items from sessionStorage
          const selectedItemsJson = sessionStorage.getItem("selectedItems");
          const selectedItems: Item[] = selectedItemsJson ? JSON.parse(selectedItemsJson) : [];
          if (!selectedItems.length) {
            setError("No payment details found. Please try again or contact support.");
            return;
          }

          const totalAmount = selectedItems.reduce((sum, item) => sum + item.price, 0) / 100;

          setPaymentData({
            amount: totalAmount,
            currency: "USD", // Adjust if your backend provides currency
            orderId: sessionId || `order_${Date.now()}`,
            email: userData.email || "unknown",
            items: selectedItems.map((item) => ({
              content_id: item.id,
              content_name: item.name,
              content_type: item.itemType === "base" ? "subscription" : "plugin",
              num_items: 1,
              content_price: item.price / 100,
              content_group_id: item.itemType === "base" ? "base_subscription" : "plugin",
            })),
          });

          if (userData.subscriptionStatus === "active") {
            queryClient.invalidateQueries({ queryKey: ["subscription-status", userData.userId] });
            // Fire X purchase event
            window.twq?.("event", "tw-q5y7y-q5y7z", {
              value: totalAmount,
              currency: "USD",
              contents: selectedItems.map((item) => ({
                content_id: item.id,
                content_name: item.name,
                content_type: item.itemType === "base" ? "subscription" : "plugin",
                num_items: 1,
                content_price: item.price / 100,
                content_group_id: item.itemType === "base" ? "base_subscription" : "plugin",
              })),
              conversion_id: sessionId || `order_${Date.now()}`,
              email_address: userData.email || "unknown",
            });
            // Clear sessionStorage
            sessionStorage.removeItem("selectedItems");
          } else if (retryCount < maxRetries) {
            setTimeout(() => {
              setRetryCount(retryCount + 1);
            }, retryDelay);
          } else {
            setError("Subscription not activated. Please try again or contact support.");
          }
        } catch (err: any) {
          console.error("[SUCCESS_PAGE] Failed to fetch data:", err.message);
          setError("Failed to load data. Please log in again.");
          if (err.status === 401) {
            window.location.href = "/auth";
          }
        }
      } else {
        setError("No active session found. Please log in to continue.");
        window.location.href = "/auth";
      }
    }

    checkSessionAndFetchData();
  }, [retryCount, sessionId, queryClient]);

  if (error) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-screen">
        <Helmet>
          <title>Payment Error | agentVooc</title>
          <meta name="description" content="An error occurred during payment processing." />
        </Helmet>
        <h1 className="text-2xl font-semibold text-red-600 mb-4">Error</h1>
        <p className="text-gray-600 mb-6">{error}</p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Link to="/auth" className="text-blue-500">
            <Button variant="outline">Log In</Button>
          </Link>
          <Button
            onClick={() => {
              setRetryCount(0);
              setError(null);
            }}
          >
            Retry
          </Button>
          <a
            href="mailto:support@elizaos.com"
            className="text-blue-500 hover:underline flex items-center"
          >
            Contact Support
          </a>
        </div>
      </div>
    );
  }

  if (!user || !paymentData) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-screen">
        <Helmet>
          <title>Verifying Subscription | agentVooc</title>
          <meta name="description" content="Verifying your subscription with AgentVooc." />
        </Helmet>
        <h1 className="text-2xl font-semibold mb-4">Verifying Subscription...</h1>
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          <p className="text-gray-600">Please wait while we confirm your subscription...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col items-center justify-center min-h-screen">
      <Helmet>
        <title>Payment Success | agentVooc</title>
        <meta name="description" content="Thank you for your subscription with AgentVooc." />
      </Helmet>
      <h1 className="text-2xl font-semibold mb-4">Payment Successful</h1>
      <p className="text-gray-600 mb-2">
        Thank you for your subscription, {user.email || user.userId}!
      </p>
      <p className="text-gray-600 mb-6">
        Order ID: {paymentData.orderId} | Amount: ${paymentData.amount.toFixed(2)} {paymentData.currency}
      </p>
      <Link to="/home" className="text-blue-500">
        <Button>Return to Home</Button>
      </Link>
    </div>
  );
}
