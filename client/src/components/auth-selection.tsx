import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardContent } from "./ui/card";

export default function AuthSelection() {
  const navigate = useNavigate();

  const handleEmailSignIn = () => {
    navigate("/auth/email");
  };

  const handlePhantomWallet = () => {
    navigate("/auth/phantom");
  };

  return (
  <Card className=" text-2xl font-bold shadow-lg">
    <CardHeader>
      <h2>Sign In to agentVooc</h2>
    </CardHeader>
    <CardContent className="space-y-4 py-4">
      <Button
        variant="default"
        size="lg"
        onClick={handleEmailSignIn}
      >
        Email Sign In
      </Button>
      <Button
        variant="default"
        size="lg"
        onClick={handlePhantomWallet}
      >
        Connect to Phantom Wallet
      </Button>
    </CardContent>
  </Card>
);
}