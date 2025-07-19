import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { signInAndUp } from "supertokens-web-js/recipe/thirdparty";
import { doesSessionExist } from "supertokens-web-js/recipe/session";
import { consumeCode, clearLoginAttemptInfo } from "supertokens-web-js/recipe/passwordless";
import AuthForm from "@/components/auth-form";
import AuthSelection from "@/components/auth-selection";
import Navbar from "@/components/navbar";
import { apiClient } from "@/lib/api";
import { Helmet } from "react-helmet-async";

interface StarPosition {
  top: string;
  left: string;
  width: string;
  height: string;
  animationDelay: string;
  animationDuration: string;
}

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(true);
  const [starPositions, setStarPositions] = useState<StarPosition[]>([]);

  const defaultImage = "/images/auth-bg.jpg"; // Placeholder image URL

  useEffect(() => {
    const positions = [...Array(20)].map(() => ({
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      width: `${Math.random() * 4 + 2}px`,
      height: `${Math.random() * 4 + 2}px`,
      animationDelay: `${Math.random() * 5}s`,
      animationDuration: `${Math.random() * 3 + 2}s`,
    }));
    setStarPositions(positions);

    async function handleAuth() {
      try {
        if (location.pathname === "/auth/callback/google") {
          const response = await signInAndUp();

          if (response.status === "OK") {
            toast({
              title: "Success",
              description: response.createdNewRecipeUser ? "Signed up with Google!" : "Signed in with Google!",
            });

            let redirectTo = "/home";
            if (response.createdNewRecipeUser) {
              const userData = await apiClient.getUser();
              const subscriptionStatus = userData?.user?.subscriptionStatus;
              const isTrialActive = userData?.user?.trialEndDate && new Date(userData.user.trialEndDate) > new Date();
              const hasActiveSubscription = ["active", "trialing"].includes(subscriptionStatus) || isTrialActive;

              if (!hasActiveSubscription) {
                redirectTo = "/settings";
              }
            } else if (location.state?.selectedItem) {
              redirectTo = "/payment";
            }

            navigate(redirectTo, {
              state: { selectedItem: location.state?.selectedItem },
              replace: true,
            });
          } else {
            console.error("[AUTH] Google sign-in/up failed:", response);
            toast({
              variant: "destructive",
              title: "Error",
              description:
                response.status === "SIGN_IN_UP_NOT_ALLOWED"
                  ? response.reason
                  : response.status === "NO_EMAIL_GIVEN_BY_PROVIDER"
                  ? "No email provided by Google. Please use another login method."
                  : "Failed to process Google signup.",
            });
            navigate("/auth", { replace: true });
          }
          return;
        }

        if (location.pathname === "/auth/verify") {
          try {
            const response = await consumeCode();
            if (response.status === "OK") {
              await clearLoginAttemptInfo();
              toast({
                title: "Success",
                description: response.createdNewRecipeUser ? "Signed up successfully!" : "Signed in successfully!",
              });

              let redirectTo = "/home";
              if (response.createdNewRecipeUser) {
                const userData = await apiClient.getUser();
                const subscriptionStatus = userData?.user?.subscriptionStatus;
                const isTrialActive = userData?.user?.trialEndDate && new Date(userData.user.trialEndDate) > new Date();
                const hasActiveSubscription = ["active", "trialing"].includes(subscriptionStatus) || isTrialActive;

                if (!hasActiveSubscription) {
                  redirectTo = "/settings";
                }
              } else if (location.state?.selectedItem) {
                redirectTo = "/payment";
              }

              navigate(redirectTo, {
                state: { selectedItem: location.state?.selectedItem },
                replace: true,
              });
            } else {
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
              await clearLoginAttemptInfo();
              navigate("/auth/email", { replace: true });
            }
          } catch (err: any) {
            console.error("[AUTH] OTP verification error:", err);
            toast({
              variant: "destructive",
              title: "Error",
              description: err.isSuperTokensGeneralError ? err.message : "Failed to verify OTP.",
            });
            await clearLoginAttemptInfo();
            navigate("/auth/email", { replace: true });
          }
          return;
        }

        const sessionExists = await doesSessionExist();

        if (sessionExists && location.pathname !== "/auth/callback/google" && location.pathname !== "/auth/verify") {
          const redirectTo = location.state?.selectedItem ? "/payment" : "/home";
          navigate(redirectTo, {
            state: { selectedItem: location.state?.selectedItem },
            replace: true,
          });
        } else {
          setIsProcessing(false);
        }
      } catch (err: any) {
        console.error("[AUTH] Error during auth handling:", err);
        toast({
          variant: "destructive",
          title: "Error",
          description: err.isSuperTokensGeneralError ? err.message : "Authentication failed.",
        });
        navigate("/auth", { replace: true });
      }
    }

    handleAuth();
  }, [navigate, location.pathname, location.state, toast]);

  if (isProcessing) {
    return (
      <div className="text-agentvooc-secondary flex items-center justify-center min-h-screen bg-gradient-to-br from-agentvooc-secondary-bg to-agentvooc-primary-bg">
        Loading...
      </div>
    );
  }

  if (location.pathname === "/auth/email") {
    return (
      <section
        className="min-h-screen relative overflow-hidden"
        style={
          { backgroundImage: `url(${defaultImage})`, backgroundSize: "cover", backgroundPosition: "center" }
        }
      >
        <Helmet>
          <title>Email Sign In | agentVooc</title>
          <meta name="description" content="Sign in or sign up with your email to access AgentVooc." />
        </Helmet>
        <Navbar />
        <div className="absolute inset-0 bg-gradient-to-br from-agentvooc-secondary-bg via-agentvooc-primary-bg to-agentvooc-secondary-accent">
          <div className="absolute inset-0 bg-black/60" />
        </div>
        <div className="absolute -top-40 -right-32 opacity-5 pointer-events-none z-0">
          <div className="w-96 h-96 bg-agentvooc-accent rounded-full blur-3xl animate-pulse" />
        </div>
        <div className="absolute inset-0 pointer-events-none z-5">
          {starPositions.map((position, index) => (
            <div
              key={index}
              className="absolute bg-agentvooc-stars rounded-full animate-star-sequence"
              style={{
                width: position.width,
                height: position.height,
                top: position.top,
                left: position.left,
                animationDelay: position.animationDelay,
                animationDuration: position.animationDuration,
              }}
            />
          ))}
        </div>        
        <section className="flex flex-col items-center justify-center text-center py-20 relative z-10">
          <h1 className="text-5xl font-bold mb-4">Email Sign In</h1>
          <p className="text-xl max-w-2xl mb-6 text-agentvooc-secondary">
            Sign in or sign up with your email to access AgentVooc.
          </p>
          <div className="absolute inset-0 opacity-20 flex items-center justify-center mt-64">
            <div className="w-64 h-64 bg-agentvooc-secondary rounded-full shadow-agentvooc-glow absolute " />
          </div>
        </section>
        <div className="relative z-10 flex justify-center py-20">
          <AuthForm />
        </div>
      </section>
    );
  }


  <section className="flex flex-col items-center justify-center text-center py-20 relative z-10">
          <h1 className="text-5xl font-bold mb-4">Email Sign In</h1>
          <p className="text-xl max-w-2xl mb-6 text-agentvooc-secondary">
            Sign in or sign up with your email to access AgentVooc.
          </p>
          <div className="absolute inset-0 opacity-20 flex items-center justify-center mt-64">
            <div className="w-64 h-64 bg-agentvooc-secondary rounded-full shadow-agentvooc-glow absolute " />
          </div>
        </section>

  if (location.pathname === "/auth/phantom") {
    return (
      <section
        className="min-h-screen relative overflow-hidden"
        style={
          { backgroundImage: `url(${defaultImage})`, backgroundSize: "cover", backgroundPosition: "center" }
        }
      >
        <Helmet>
          <title>Phantom Wallet | agentVooc</title>
          <meta name="description" content="Connect your Phantom Wallet to sign in to AgentVooc." />
        </Helmet>
        <Navbar />
        <div className="absolute inset-0 bg-gradient-to-br from-agentvooc-secondary-bg via-agentvooc-primary-bg to-agentvooc-secondary-accent">
          <div className="absolute inset-0 bg-black/60" />
        </div>
        <div className="absolute -top-40 -right-32 opacity-5 pointer-events-none z-0">
          <div className="w-96 h-96 bg-agentvooc-accent rounded-full blur-3xl animate-pulse" />
        </div>
        <div className="absolute inset-0 pointer-events-none z-5">
          {starPositions.map((position, index) => (
            <div
              key={index}
              className="absolute bg-agentvooc-stars rounded-full animate-star-sequence"
              style={{
                width: position.width,
                height: position.height,
                top: position.top,
                left: position.left,
                animationDelay: position.animationDelay,
                animationDuration: position.animationDuration,
              }}
            />
          ))}
        </div>
        <section className="flex flex-col items-center justify-center text-center py-20 relative z-10">
          <h1 className="text-5xl font-bold mb-4">Connect Phantom Wallet</h1>
          <p className="text-xl max-w-2xl mb-6 text-agentvooc-secondary">
            Connect your Phantom Wallet to sign in to AgentVooc.
          </p>
          <div className="absolute inset-0 opacity-20 flex items-center justify-center mt-64">
            <div className="w-64 h-64 bg-agentvooc-secondary rounded-full shadow-agentvooc-glow absolute " />
          </div>
        </section>
        <div className="relative z-10 flex justify-center py-20">
          <AuthForm isPhantom={true} />
        </div>
      </section>
    );
  }

  return (
    <section
      className="min-h-screen relative overflow-hidden"
      style={
        { backgroundImage: `url(${defaultImage})`, backgroundSize: "cover", backgroundPosition: "center" }
      }
    >
      <Helmet>
        <title>agentVooc | Auth</title>
        <meta name="description" content="Sign in or sign up to experience intelligent automation with AgentVooc." />
      </Helmet>
      <Navbar />
      <div className="absolute inset-0 bg-gradient-to-br from-agentvooc-secondary-bg via-agentvooc-primary-bg to-agentvooc-secondary-accent">
        <div className="absolute inset-0 bg-black/60" />
      </div>
      <div className="absolute -top-40 -right-32 opacity-5 pointer-events-none z-0">
        <div className="w-96 h-96 bg-agentvooc-accent rounded-full blur-3xl animate-pulse" />
      </div>
      <div className="absolute inset-0 pointer-events-none z-5">
        {starPositions.map((position, index) => (
          <div
            key={index}
            className="absolute bg-agentvooc-stars rounded-full animate-star-sequence"
            style={{
              width: position.width,
              height: position.height,
              top: position.top,
              left: position.left,
              animationDelay: position.animationDelay,
              animationDuration: position.animationDuration,
            }}
          />
        ))}
      </div>
      <div className="relative z-10 flex flex-col items-center justify-center text-center py-20">
        <h1 className="text-5xl font-bold mb-4 text-white">Welcome to AgentVooc</h1>
        <p className="text-xl max-w-2xl mb-6 text-agentvooc-secondary">
          Discover the future of AI agent services with AgentVooc. Sign in or sign up to experience intelligent automation.
        </p>
      </div>
      <div className="relative z-10 flex justify-center py-12">
        <AuthSelection />
      </div>
    </section>
  );
}