import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useLocation } from "react-router-dom";
import { createCode, consumeCode, resendCode, clearLoginAttemptInfo, getLoginAttemptInfo } from "supertokens-web-js/recipe/passwordless";
// import { getAuthorisationURLWithQueryParamsAndSetState } from "supertokens-web-js/recipe/thirdparty";
import { apiClient } from "@/lib/api";
import { Helmet } from "react-helmet-async";

interface AuthFormProps {
  isPhantom?: boolean;
}

export default function AuthForm({ isPhantom = false }: AuthFormProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOtpSent, setIsOtpSent] = useState(false);

  useEffect(() => {
    async function checkInitialOtpSent() {
      const loginAttemptInfo = await getLoginAttemptInfo();
      if (loginAttemptInfo) {
        setIsOtpSent(true);
        setEmail((loginAttemptInfo as any).email || "");
      }
    }
    checkInitialOtpSent();
  }, []);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // console.log("[AUTH_FORM] Sending OTP for email:", email);
      const response = await createCode({ email });

      if (response.status === "SIGN_IN_UP_NOT_ALLOWED") {
        // console.log("[AUTH_FORM] Sign-in/up not allowed:", response.reason);
        // toast({
        //   variant: "destructive",
        //   title: "Error",
        //   description: response.reason,
        // });
      } else {
        setIsOtpSent(true);
        toast({
          title: "OTP Sent",
          description: "Please check your email for the OTP.",
        });
      }
    } catch (err: any) {
      // console.error("[AUTH_FORM] Error sending OTP:", err);
      toast({
        variant: "destructive",
        title: "Error",
        description: err.isSuperTokensGeneralError ? err.message : "Failed to send OTP. Please try again.",
      });
    } finally {
      setIsSubmitting(false); // Reset submitting state
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // console.log("[AUTH_FORM] Verifying OTP for email:", email);
      const response = await consumeCode({ userInputCode: otp });

      if (response.status === "OK") {
        await clearLoginAttemptInfo();
        toast({
          title: "Success!",
          description: response.createdNewRecipeUser ? "Sign up successful!" : "Sign in successful!",
        });

         // Track sign-up event for new users
        if (response.createdNewRecipeUser) {
          window.twq?.("event", "tw-q5y7y-signup", {
            value: 0, // No monetary value for sign-up
            currency: "USD",
            contents: [
              {
                content_id: "signup",
                content_name: "User Sign-Up",
                content_type: "signup",
                content_price: 0,
                num_items: 1,
                content_group_id: null,
              },
            ],
            conversion_id: `signup_${Date.now()}`,
            email_address: email,
          });
        }

        let redirectTo = "/home";
        if (response.createdNewRecipeUser) {
          // console.log("[AUTH_FORM] New user detected, checking subscription status");
          const userData = await apiClient.getUser();
          const subscriptionStatus = userData?.user?.subscriptionStatus;
          const isTrialActive = userData?.user?.trialEndDate && new Date(userData.user.trialEndDate) > new Date();
          const hasActiveSubscription = ["active", "trialing"].includes(subscriptionStatus) || isTrialActive;

          if (!hasActiveSubscription) {
            // console.log("[AUTH_FORM] No active subscription, redirecting to /settings");
            redirectTo = "/settings";
          } else {
            // console.log("[AUTH_FORM] Active subscription found, redirecting to /home");
          }
        } else if (location.state?.selectedItem) {
          redirectTo = "/payment";
        }

        // console.log("[AUTH_FORM] Redirecting to:", redirectTo);
        navigate(redirectTo, {
          state: { selectedItem: location.state?.selectedItem },
          replace: true,
        });
      } else {
        // console.log("[AUTH_FORM] OTP verification failed:", response.status);
        toast({
          variant: "destructive",
          title: "Error",
          description:
            response.status === "RESTART_FLOW_ERROR"
              ? "Session expired. Please request a new OTP."
              : response.status === "INCORRECT_USER_INPUT_CODE_ERROR"
              ? `Incorrect OTP. ${response.maximumCodeInputAttempts - response.failedCodeInputAttemptCount} attempts remaining.`
              : "Failed to verify OTP. Please try again.",
        });
        if (response.status === "RESTART_FLOW_ERROR") {
          await clearLoginAttemptInfo();
          setIsOtpSent(false);
          setOtp("");
        }
      }
    } catch (err: any) {
      // console.error("[AUTH_FORM] OTP verification error:", err);
      toast({
        variant: "destructive",
        title: "Error",
        description: err.isSuperTokensGeneralError ? err.message : "Failed to verify OTP. Please try again.",
      });
    } finally {
      setIsSubmitting(false); // Reset submitting state
    }
  };

  const handleResendOtp = async () => {
    setIsSubmitting(true);
    try {
      // console.log("[AUTH_FORM] Resending OTP for email:", email);
      const response = await resendCode();

      if (response.status === "RESTART_FLOW_ERROR") {
        await clearLoginAttemptInfo();
        setIsOtpSent(false);
        setOtp("");
        toast({
          variant: "destructive",
          title: "Error",
          description: "Session expired. Please request a new OTP.",
        });
        navigate("/auth/email");
      } else {
        toast({
          title: "OTP Resent",
          description: "Please check your email for the new OTP.",
        });
      }
    } catch (err: any) {
      // console.error("[AUTH_FORM] Error resending OTP:", err);
      toast({
        variant: "destructive",
        title: "Error",
        description: err.isSuperTokensGeneralError ? err.message : "Failed to resend OTP. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangeEmail = async () => {
    try {
      // console.log("[AUTH_FORM] Clearing login attempt to change email");
      await clearLoginAttemptInfo();
      setIsOtpSent(false);
      setEmail("");
      setOtp("");
      toast({
        title: "Success",
        description: "Please enter a new email address.",
      });
    } catch (err: any) {
      // console.error("[AUTH_FORM] Error clearing login attempt:", err);
      toast({
        variant: "destructive",
        title: "Error",
        description: err.isSuperTokensGeneralError ? err.message : "Failed to reset email. Please try again.",
      });
    }
  };

  // const handleGoogleSignIn = async () => {
  //   try {
  //     console.log("[AUTH_FORM] Initiating Google sign-in");
  //     const authUrl = await getAuthorisationURLWithQueryParamsAndSetState({
  //       thirdPartyId: "google",
  //       frontendRedirectURI: "http://localhost:5173/auth/callback/google",
  //     });
  //     window.location.assign(authUrl);
  //   } catch (err: any) {
  //     console.error("[AUTH_FORM] Google sign-in:", err);
  //     toast({
  //       variant: "destructive",
  //       title: "Error",
  //       description: err.isSuperTokensGeneralError ? err.message : "Failed to initiate Google login.",
  //     });
  //   }
  // };

  if (isPhantom) {
    return (
      <Card className="w-full max-w-md bg-agentvooc-secondary-accent border-agentvooc-accent/10 shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl text-agentvooc-primary">Phantom Wallet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-500 text-agentvooc-secondary">Phantom Wallet integration is coming soon!</p>
          <Button
            onClick={() => navigate("/auth")}
            className="w-full py-3 text-white rounded-full shadow-lg bg-agentvooc-button-bg text-agentvooc-accent hover:bg-agentvooc-accent hover:text-agentvooc-white shadow-agentvooc-glow"
          >
            Back to Sign-In Options
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md bg-agentvooc-secondary-accent border-agentvooc-accent/10 shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl text-agentvooc-primary font-bold">{isOtpSent ? "Verify OTP" : "Sign In / Sign Up"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Helmet>
          <title>{isOtpSent ? "Verify OTP | agentVooc" : "Sign In / Sign Up | agentVooc"}</title>
          <meta name="description" content="Sign in or sign up with your email to access AgentVooc." />
        </Helmet>
        {!isOtpSent ? (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-agentvooc-secondary">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-gray-100 dark:bg-agentvooc-primary-bg text-agentvooc-primary border border-agentvooc-accent/30 focus:ring-accent"
                placeholder="Enter your email address"
              />
            </div>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-agentvooc-button-bg text-white rounded-full shadow-lg text-agentvooc-accent hover:bg-agentvooc-accent hover:text-agentvooc-white shadow-agentvooc-glow"
            >
              {isSubmitting ? "Sending OTP..." : "Send OTP"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-agentvooc-secondary">Email: {email}</Label>
              <Label htmlFor="otp" className="text-agentvooc-secondary">Enter OTP</Label>
              <Input
                id="otp"
                name="otp"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                required
                className="bg-gray-100 dark:bg-agentvooc-primary-bg text-agentvooc-primary border-agentvooc-accent/30 focus:ring-accent"
                placeholder="Enter the OTP from your email"
              />
            </div>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-agentvooc-button-bg text-white rounded-full shadow-lg text-agentvooc-accent hover:bg-agentvooc-accent hover:text-agentvooc-white shadow-agentvooc-glow"
            >
              {isSubmitting ? "Verifying..." : "Verify OTP"}
            </Button>
            <div className="flex justify-between">
              <Button
                variant="link"
                onClick={handleResendOtp}
                disabled={isSubmitting}
                className="text-agentvooc-secondary hover:text-agentvooc-accent"
              >
                Resend OTP
              </Button>
              <Button
                variant="link"
                onClick={handleChangeEmail}
                disabled={isSubmitting}
                className="text-agentvooc-secondary hover:text-agentvooc-accent"
              >
                Change Email
              </Button>
            </div>
          </form>
        )}
        {/* <Button
          variant="outline"
          className="flex items-center w-full gap-2 mt-4 text-agentvooc-primary border-agentvooc-accent/30 hover:bg-agentvooc-accent hover:text-agentvooc-white"
          onClick={handleGoogleSignIn}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"
            />
          </svg>
          Sign in with Google
        </Button> */}
      </CardContent>
    </Card>
  );
}
