import type { UUID, Character, Plugin } from "@elizaos/core";
import Session, { signOut }  from "supertokens-web-js/recipe/session";

// Base URL for API requests
// this routes trafic to the server(backend) localhost:3000
// These are API endpoints that are used by the client to communicate with the server
const BASE_URL  =
    import.meta.env.VITE_SERVER_BASE_URL ||
    `${import.meta.env.VITE_SERVER_URL}:${import.meta.env.VITE_SERVER_PORT}`;
// console.log(`[FETCHER] Using BASE_URL: ${BASE_URL}`);

const clearCookies = () => {
  console.log("[FETCHER] Cookies before clearing:", document.cookie);
  const cookies = document.cookie.split(";");
  const domains = [
    "agentvooc.com",
    ".agentvooc.com",
    window.location.hostname,
    `.${window.location.hostname}`,
  ];
  const stCookies = [
    "sAccessToken",
    "sRefreshToken",
    "sFrontToken",
    "st-last-access-token-update",
    "st-access-token",
    "st-refresh-token",
  ];
  for (const cookie of cookies) {
    const [name] = cookie.split("=").map((c) => c.trim());
    if (stCookies.includes(name)) {
      for (const domain of domains) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${domain};secure;samesite=none`;
      }
    }
  }
  console.log("[FETCHER] Cookies after clearing:", document.cookie);
};

// Rate limiter to prevent request flooding
const rateLimiter = new Map<string, number>();

// Circuit breaker to prevent infinite reload loops
const circuitBreaker = {
  failures: 0,
  lastFailure: 0,
  isOpen: false,
  openUntil: 0,
};

const CIRCUIT_BREAKER_THRESHOLD = 3; // Max failures before opening circuit
const CIRCUIT_BREAKER_TIMEOUT = 30000; // 30 seconds before retry

const fetcher = async ({
  url,
  method = "GET",
  body,
  headers = {},
}: {
  url: string;
  method?: "GET" | "POST" | "DELETE" | "PATCH";
  body?: object | FormData;
  headers?: HeadersInit;
}) => {
  // Check circuit breaker
  const now = Date.now();
  if (circuitBreaker.isOpen && now < circuitBreaker.openUntil) {
    console.warn(`[FETCHER] Circuit breaker OPEN - blocking requests until ${new Date(circuitBreaker.openUntil).toLocaleTimeString()}`);
    throw new Error("Circuit breaker open - too many auth failures");
  } else if (circuitBreaker.isOpen && now >= circuitBreaker.openUntil) {
    // Reset circuit breaker after timeout
    console.log(`[FETCHER] Circuit breaker RESET - attempting recovery`);
    circuitBreaker.isOpen = false;
    circuitBreaker.failures = 0;
  }

  // Rate limiting to prevent request flooding
  const rateLimitKey = `${method}:${url}`;
  const lastAttempt = rateLimiter.get(rateLimitKey) || 0;
  
  if (now - lastAttempt < 1000) { // 1 second cooldown per endpoint
    console.warn(`[FETCHER] Rate limited: ${rateLimitKey}, skipping request`);
    throw new Error("Rate limited - too many requests");
  }
  
  rateLimiter.set(rateLimitKey, now);
  // Prevent requests when already on auth page (except auth-related endpoints)
  if (
    window.location.pathname === "/auth" &&
    !url.startsWith("/api/auth") &&
    !url.startsWith("/api/user") &&
    !url.startsWith("/api/invoice")
  ) {
    console.log(`[FETCHER] Aborting fetch: Already on auth page for ${url}`);
    throw new Error("Already on auth page, aborting fetch");
  }

  const makeRequest = async (isRetry: boolean = false): Promise<any> => {
    const sessionExists = await Session.doesSessionExist();
    if (!isRetry) {
      console.log(`[FETCHER] Session exists: ${sessionExists}, URL: ${url}`);
    }

    // Check session for non-auth endpoints
    if (
      !sessionExists &&
      !url.startsWith("/api/auth") &&
      !url.startsWith("/api/user") &&
      !url.startsWith("/api/invoice")
    ) {
      if (!isRetry) console.warn(`[FETCHER] No session exists, aborting request to ${url}`);
      if (!isRetry) {
        await signOut();
        clearCookies();
        console.log(`[FETCHER] Forcing logout due to no session`);
        window.location.href = `/auth?cb=${Date.now()}`;
      }
      throw new Error("No active session");
    }

    // Get access token for header-based auth
    let accessToken: string | undefined;
    if (sessionExists) {
      try {
        accessToken = await Session.getAccessToken();
        if (!isRetry) {
          console.log(`[FETCHER] Access token retrieved: ${accessToken ? "present" : "missing"}`);
        }
        if (!accessToken && !url.startsWith("/api/auth") && !url.startsWith("/api/user") && !url.startsWith("/api/invoice")) {
          if (!isRetry) console.warn(`[FETCHER] No access token available, aborting request to ${url}`);
          if (!isRetry) {
            await signOut();
            localStorage.clear();
            sessionStorage.clear();
            clearCookies();
            console.log(`[FETCHER] Forcing logout due to missing access token`);
            window.location.href = `/auth?cb=${Date.now()}`;
          }
          throw new Error("No access token available");
        }
        const transferMethod = Session.getTokenTransferMethod();
        console.log(`[FETCHER] Token transfer method: ${transferMethod}`);
      } catch (error) {
        if (!isRetry) console.error(`[FETCHER] Failed to get access token:`, error);
        if (!isRetry) {
          await signOut();
          clearCookies();
          console.log(`[FETCHER] Forcing logout due to token retrieval failure`);
          window.location.href = `/auth?cb=${Date.now()}`;
        }
        throw new Error("Failed to retrieve access token");
      }
      const transferMethod = Session.getTokenTransferMethod();
        console.log(`[FETCHER] Token transfer method: ${transferMethod}`);
    }

    // Build headers with header-based auth enforcement
    const requestHeaders: HeadersInit = {
      Accept: "application/json",
      ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
      "st-auth-mode": "header", // ✅ enforce header-based auth (must be last to prevent override)
    };

    const options: RequestInit = {
      method,
      headers: requestHeaders,
      ...(body && (method === "POST" || method === "PATCH")
        ? { body: body instanceof FormData ? body : JSON.stringify(body) }
        : {}),
    };

    if (!isRetry) {
      console.log(`[FETCHER] Sending ${method} request to ${BASE_URL}${url}`, {
        headers: Object.keys(requestHeaders),
        hasAuthToken: !!accessToken,
        authMode: "header",
        body: body instanceof FormData ? "[FormData]" : body,
      });
    }

    const resp = await fetch(`${BASE_URL}${url}`, options);
    if (!isRetry) {
      console.log(`[FETCHER] Response status for ${url}: ${resp.status}, Headers:`, {
        cfCacheStatus: resp.headers.get("cf-cache-status"),
        contentType: resp.headers.get("Content-Type"),
      });
    }

    if (!resp.ok) {
      const errorText = await resp.text();
      if (!isRetry) {
        console.error(`[FETCHER] Fetch error for ${url}: ${errorText}, Status: ${resp.status}`);
      }

      let errorObj: any = { error: errorText };
      try {
        errorObj = JSON.parse(errorText);
      } catch {
        // Non-JSON response
      }

      // Handle refresh token scenario or general 401
      if (resp.status === 401 && !isRetry) {
        // Try to detect if this is a "try refresh token" scenario
        const isRefreshTokenScenario = errorObj.message === "try refresh token" || 
                                     errorObj.type === "TRY_REFRESH_TOKEN" ||
                                     errorText.includes("try refresh token");
        
        if (isRefreshTokenScenario) {
          console.log(`[FETCHER] Received TRY_REFRESH_TOKEN for ${url}`);
          throw new Error("TRY_REFRESH_TOKEN");
        } else {
          // Generic 401 - likely auth mode mismatch or expired session
          console.warn(`[FETCHER] 401 Unauthorized for ${url}, incrementing circuit breaker`);
          circuitBreaker.failures++;
          circuitBreaker.lastFailure = Date.now();
          
          if (circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
            circuitBreaker.isOpen = true;
            circuitBreaker.openUntil = Date.now() + CIRCUIT_BREAKER_TIMEOUT;
            console.error(`[FETCHER] Circuit breaker OPENED - too many 401s (${circuitBreaker.failures})`);
          }
          
          throw new Error("FORCE_LOGOUT");
        }
      }

      const error = new Error(errorObj.error || errorObj.message || "Request failed");
      (error as any).status = resp.status;
      throw error;
    }

    // Handle different response types
    if (resp.headers.get("Content-Type")?.includes("audio/mpeg")) {
      if (!isRetry) console.log(`[FETCHER] Response is audio/mpeg for ${url}, returning blob`);
      return await resp.blob();
    }

    if (resp.status === 204) {
      if (!isRetry) console.log(`[FETCHER] 204 No Content for ${url}, returning empty object`);
      return {};
    }

    const responseData = await resp.json();
    if (!isRetry) console.log(`[FETCHER] Response data for ${url}:`, responseData);
    return responseData;
  };

  try {
    return await makeRequest();
  } catch (error: any) {
    console.error(`[FETCHER] Error for ${url}:`, error);

    // Handle token refresh
    if (error.message === "TRY_REFRESH_TOKEN") {
      console.log(`[FETCHER] Attempting session refresh for ${url}`);
      try {
        const refreshed = await Session.attemptRefreshingSession();
        if (refreshed) {
          console.log(`[FETCHER] Session refresh successful, retrying request`);
          return await makeRequest(true);
        }
        console.warn(`[FETCHER] Session refresh failed, forcing logout`);
        await signOut();
        clearCookies();
        window.location.href = `/auth?cb=${Date.now()}`;
        throw new Error("Session expired, redirecting to login");
      } catch (refreshError) {
        console.error(`[FETCHER] Session refresh error:`, refreshError);
        await signOut();
        clearCookies();
        window.location.href = `/auth?cb=${Date.now()}`;
        throw new Error("Session expired, redirecting to login");
      }
    } else if (error.message === "FORCE_LOGOUT") {
      // Only redirect if circuit breaker allows it
      if (!circuitBreaker.isOpen) {
        console.warn(`[FETCHER] Forcing logout due to 401 for ${url}`);
        await signOut();
        clearCookies();
        window.location.href = `/auth?cb=${Date.now()}`;
      }
      throw new Error("Authentication failed, redirecting to login");
    } else if (error.message === "No active session" || error.message === "No access token available" || error.message === "Failed to retrieve access token") {
      console.warn(`[FETCHER] Request aborted: ${error.message} for ${url}`);
      throw error;
    }
    throw error;
  }
};
export interface User {
  _id: string;
  userId: string;
  lastClientId?: string;
  userType?: string;
  email?: string;
  name?: string;
  trialStartDate?: string;
  trialEndDate?: string;
  subscriptionStatus?: string;
  responseCount?: number;
  tokenCount?: number;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  activePlugins?: string[];
  activePriceIds?: string[];
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  hasUsedTrial?: boolean;
  cancelAtPeriodEnd?: boolean;
  isConnected?: boolean;
  interest: string;
  referralSource: string;
}

interface CharacterInput {
  id: UUID;
  name: string;
  username?: string;
  system?: string;
  bio?: string[];
  lore?: string[];
  messageExamples: { user: string; content: { text: string; action?: string } }[][];
  postExamples?: string[];
  topics?: string[];
  adjectives?: string[];
  style?: { all?: string[]; chat?: string[]; post?: string[] };
  modelProvider?: "OPENAI" | "OLLAMA" | "CUSTOM";
  plugins?: string[];
  settings?: {
    secrets?: { dynamic?: Array<{ key: string; value: string }> };
    voice?: { model?: string };
    ragKnowledge?: boolean;
     email?: {
      outgoing?: {
        service?: "smtp" | "gmail";
        host?: string;
        port?: number;
        secure?: boolean;
        user?: string;
        pass?: string;
      };
      incoming?: {
        service?: "imap";
        host?: string;
        port?: number;
        user?: string;
        pass?: string;
      };
    };
  };
  knowledge?: Array<any>;
  profile?: { image?: string }; // Added profile field
  enabled?: boolean;
}


interface ImageVariants {
  main: string;
  thumbnail: string;
  medium: string;
  raw?: string; // Optional raw URL for the image
}

interface LandingPage {
  title: string;
  slug: { current: string };
  heroSection: {
    title: string;
    subtitle: string;
    primaryCtaText: string;
    secondaryCtaText?: string;
    trustSignal?: string;
    backgroundImage?: ImageVariants;
    mascotModel?: { asset: { _id: string; url: string } };
  };
  featuresSection: {
    heading: string;
    features: Array<{
      title: string;
      description: string;
      icon?: ImageVariants;
    }>;
    ctaText: string;
  };
  benefitsSection: {
    heading: string;
    description: string;
    benefitsList: string[];
    image: ImageVariants;
  };
  testimonialsSection: {
    heading: string;
    testimonials: Array<{
      quote: string;
      author: string;
      role: string;
      image?: ImageVariants;
    }>;
    trustSignal: string;
    sectionImage?: ImageVariants;
  };
  ctaSection: {
    heading: string;
    description: string;
    ctaText: string;
    ctaUrl?: string;
  };
  footerSection: {
    tagline: string;
    companyLinks: Array<{ label: string; url: string }>;
    productLinks: Array<{ label: string; url: string }>;
    legalLinks: Array<{ label: string; url: string }>;
    socialLinks: Array<{
      platform: string;
      url: string;
    }>;
  };
  subFooterSection: {
    ctaText: string;
    ctaUrl: string;
    copyright: string;
  };
  _updatedAt?: string;
}

interface Item {
  id: string;
  name: string;
  description: string;
  price: number;
  itemType: string;
  features?: string[];
  isPopular?: boolean;
  trialInfo?: string;
  useCase?: string;
  source?: string; // Optional, since backend includes it
    pluginName?: string; // Added for plugin items
  stripePriceId?: string; // Added for base items
}



// Define shared Knowledge types
export interface ImageItem {
  imageAssetId: string;
  imageUrl: string;
  caption: string;
  createdAt: string;
}

export interface Knowledge {
  _id: string;
  id: string;
  name: string;
  text: string;
  agentId: string;
  metadata?: {
    source?: string;
    type?: string;
    images?: ImageItem[];
    [key: string]: any;
  };
  createdAt: string;
}

export interface KnowledgeResponse {
  knowledge: Knowledge[];
}


interface EmailTemplate {
  _id: string;
  agentId: string;
  position: string;
  emailAddress: string;
  companyName: string;
  instructions: string;
  bestRegard: string;
}

export interface LegalDocument {
  title: string;
  slug: string;
  lastUpdated: string;
  content?: Array<any>;
  mainImage?: string;
  mainImageAlt?: string;
}

export interface BlogPost {
  title: string;
  slug: string;
  content?: Array<any>;
  publishedAt: string;
  modifiedAt?: string;
  seoDescription: string;
  excerpt: string;
  mainImage?: string;
  mainImageAlt?: string;
  heroImage?: string;
  heroImageAlt?: string;
  galleryImages?: Array<{ url: string; alt: string }>;
  thumbnailImage?: string;
  mediumImage?: string;
  tags?: string[];
  adSlotHeader?: string | null;
  adSlotContent?: string | null;
  adSlotRightSide?: string | null;
  adSlotIndex?: string | null;
  relatedContent?: Array<{
    _type: "blogPost" | "pressPost" | "productPage";
    title: string;
    slug: string;
    mainImage?: string;
    mainImageAlt?: string;
    excerpt: string;
  }>;
}

export interface Docs {
  _id: string;
  title: string;
  slug: string;
  sortOrder?: number;
  excerpt: string;
  seoDescription: string;
  publishedAt: string;
  modifiedAt?: string | null;
  mainImage?: string;
  mainImageAlt?: string;
  heroImage?: string;
  heroImageAlt?: string;
  thumbnailImage?: string | null;
  mediumImage?: string | null;
  tags?: string[] | null;
  relatedContent?: Array<{
    _type: string;
    slug: string;
    title: string;
    mainImage?: string;
    mainImageAlt?: string;
    excerpt?: string;
    publishedAt: string;
  }>;
  content?: Array<
    | {
        _key: string;
        _type: "block";
        style?: string;
        children?: Array<{
          _key: string;
          _type: string;
          text?: string;
          marks?: string[];
        }>;
        markDefs?: Array<any>;
      }
    | {
        _key: string;
        _type: "image";
        asset?: {
          url: string;
        };
        alt?: string;
      }
  >;
  galleryImages?: Array<{
    url: string;
    alt?: string;
  }>;
}

export interface PressPost {
  title: string;
  slug: string;
  content?: Array<any>;
  publishedAt: string;
  modifiedAt?: string;
  seoDescription: string;
  excerpt: string;
  mainImage?: string;
  mainImageAlt?: string;
  heroImage?: string;
  heroImageAlt?: string;
  galleryImages?: Array<{ url: string; alt: string }>;
  thumbnailImage?: string;
  mediumImage?: string;
  tags?: string[];
  relatedContent?: Array<{
    _type: "blogPost" | "pressPost" | "productPage";
    title: string;
    slug: string;
    excerpt?: string;
    mainImage?: string;
    mainImageAlt?: string;
    publishedAt: string;
  }>;
}

export interface CompanyPage {
  title: string;
  slug: string;
  lastUpdated: string;
  content?: Array<any>;
  mainImage?: string;
  mainImageAlt?: string;
}


export interface ProductPage {
  title: string;
  slug: string;
  content?: Array<any>;
  publishedAt: string;
  modifiedAt?: string;
  seoDescription: string;
  excerpt: string;
  mainImage?: string;
  mainImageAlt?: string;
  heroImage?: string;
  heroImageAlt?: string;
  galleryImages?: Array<{ url: string; alt: string }>;
  thumbnailImage?: string;
  mediumImage?: string;
  tags?: string[];
  relatedContent?: Array<{
    _type: "blogPost" | "pressPost" | "productPage";
    title: string;
    slug: string;
    excerpt?: string;
    mainImage?: string;
    mainImageAlt?: string;
    publishedAt: string;
  }>;
}



interface Invoice {
  _id: string;
  stripeInvoiceId: string;
  status: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  createdAt: string;
  dueDate: string | null;
  invoiceUrl: string | null;
  invoicePdf: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  lineItems: Array<{
    _key: string;
    description: string;
    amount: number;
    currency: string;
    quantity: number;
    period: { start: string | null; end: string | null };
    productName: string;
  }>;
}

getUserStats: () => Promise<{ totalUsers: number; onlineUsers: number }>;

export const apiClient = {
  sendMessage: (
    agentId: string,
    message: string,
    selectedFile?: File | null,
    metadata?: { imageAssetId?: string }
  ) => {
    const formData = new FormData();
    formData.append("text", message);
    formData.append("user", "user");

    if (selectedFile) {
      formData.append("file", selectedFile);
    }
    if (metadata) {
      formData.append("metadata", JSON.stringify(metadata));
    }
    return fetcher({
      url: `/api/${agentId}/message`,
      method: "POST",
      body: formData,
    });
  },

  getAgents: () => {
    return fetcher({
      url: "/api/agents",
      method: "GET",
    });
  },

  getAgent: (agentId: string): Promise<{ id: UUID; character: Character }> =>
    fetcher({ url: `/api/agents/${agentId}` }),

  tts: (agentId: string, text: string) =>
    fetcher({
      url: `/api/${agentId}/tts`,
      method: "POST",
      body: {
        text,
      },
      headers: {
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
        "Transfer-Encoding": "chunked",
      },
    }),

  whisper: async (agentId: string, audioBlob: Blob) => {
    const formData = new FormData();
    formData.append("file", audioBlob, "recording.wav");
    return fetcher({
      url: `/${agentId}/whisper`,
      method: "POST",
      body: formData,
    });
  },

  createUser: async (user: User) => {
    try {
      const response = await fetcher({
        url: "/api/user",
        method: "POST",
        body: {
          _type: "User",
          name: user.name,
          email: user.email,
          interest: user.interest,
          referralSource: user.referralSource,
          userId: user.userId,
          createdAt: new Date().toISOString(),
          userType: user.userType || "email",
        },
      });
      return response.user;
    } catch (error: any) {
      throw new Error(error.message || "Failed to create or fetch user");
    }
  },

  getPlugins: (): Promise<{ plugins: Plugin[] }> => {
    return fetcher({
      url: "/api/plugins",
      method: "GET",
    });
  },

  async uploadCharacterProfileImage(characterId: UUID, formData: FormData) {
    return fetcher({
      url: `/api/characters/${characterId}/upload-profile-image`,
      method: "POST",
      body: formData,
    });
  },

  uploadAgentImage: (agentId: string, image: File, postTo?: string[]) => {
    const formData = new FormData();
    formData.append("image", image);
    if (postTo && postTo.length > 0) {
      formData.append("postTo", postTo.join(","));
    }
    return fetcher({
      url: `/api/${agentId}/upload-agent-image`,
      method: "POST",
      body: formData,
    });
  },

  getCharacters: () => {
    return fetcher({
      url: "/api/characters",
      method: "GET",
    });
  },

  getCharacter: (characterId: string): 
    Promise<{ 
      id: UUID; character: Character 
    }> =>
      fetcher({ url: `/api/characters/${characterId}` }),

  createCharacter: (character: CharacterInput) =>
    fetcher({
      url: "/api/characters",
      method: "POST",
      body: character,
    }),

  updateCharacter: (characterId: string, character: Partial<CharacterInput>) =>
    fetcher({
      url: `/api/characters/${characterId}`,
      method: "PATCH",
      body: character,
    }),

  getCharacterPresets: (): Promise<{ characterPresets: any[] }> => {
    return fetcher({
      url: "/api/character-presets",
      method: "GET",
    });
  },

  deleteCharacter: (characterId: string) =>
    fetcher({
      url: `/api/characters/${characterId}`,
      method: "DELETE",
    }),

  createCheckoutSession: (data: { userId: string; items: { id: string; name: string; description: string; price: number; itemType: string }[] }) => {
    return fetcher({
      url: "/api/checkout-session",
      method: "POST",
      body: data,
    });
  },

  getKnowledge: (agentId: string): Promise<KnowledgeResponse> =>
    fetcher({
      url: `/api/agents/${agentId}/knowledge`,
      method: "GET",
    }),
    
  createKnowledge: (agentId: string, knowledge: { name: string; text: string; metadata?: object }) =>
    fetcher({
      url: `/api/agents/${agentId}/knowledge`,
      method: "POST",
      body: knowledge,
    }),

  updateKnowledge: (agentId: string, knowledgeId: string, knowledge: { name?: string; text?: string; metadata?: object }) =>
    fetcher({
      url: `/api/agents/${agentId}/knowledge/${knowledgeId}`,
      method: "PATCH",
      body: knowledge,
    }),

  deleteKnowledge: (agentId: string, knowledgeId: string) =>
    fetcher({
      url: `/api/agents/${agentId}/knowledge/${knowledgeId}`,
      method: "DELETE",
    }),

  getUser: async () => {
    const exists = await Session.doesSessionExist();
    if (!exists) return { status: "skipped", reason: "No active session" };
    return fetcher({ url: "/api/user" });
  },


  getUserStats: () => {
    return fetcher({
      url: "/api/user-stats",
      method: "GET",
    });
  },
  
  getItems: ({ itemType }: { itemType?: string } = {}) => {
    let url = "/api/items";
    if (itemType && typeof itemType === "string" && itemType.trim() !== "") {
      url += `?itemType=${encodeURIComponent(itemType)}`;
    }
    return fetcher({
      url,
      method: "GET",
    }) as Promise<{ items: Item[] }>;
  },

  addPlugin: (pluginName: string) =>
    fetcher({
      url: "/api/subscription/add-plugin",
      method: "POST",
      body: { pluginName },
    }),

  removePlugin: (pluginName: string) =>
    fetcher({
      url: "/api/subscription/remove-plugin",
      method: "POST",
      body: { pluginName },
    }),

  updateBasePlan: (newBasePlanId: string) =>
    fetcher({
      url: "/api/subscription/update-base-plan",
      method: "POST",
      body: { newBasePlanId },
    }),

  getSubscriptionItems: ({ includeDetails }: { includeDetails?: boolean } = {}) => {
    return fetcher({
      url: `/api/subscription-items${includeDetails ? "?includeDetails=true" : ""}`,
      method: "GET",
    });
  },

  getSubscriptionStatus: () => {
    return fetcher({
      url: "/api/subscription-status",
      method: "GET",
    });
  },

  createPortalSession: () => {
    return fetcher({
      url: "/api/create-portal-session",
      method: "POST",
    });
  },

  cancelSubscription: () => {
    return fetcher({
      url: "/api/cancel-subscription",
      method: "POST",
    });
  },

  getLandingPage: (): Promise<{ landingPage: LandingPage }> => {
    return fetcher({
      url: "/api/landing-page",
      method: "GET",
    });
  },

  getEmailTemplate: (agentId: string) =>
    fetcher({
      url: `/api/agents/${agentId}/email-template`,
      method: "GET",
    }),

  updateEmailTemplate: (agentId: string, template: Partial<EmailTemplate>) =>
    fetcher({
      url: `/api/agents/${agentId}/email-template`,
      method: "PATCH",
      body: template,
    }),

  reconnectEmail: (characterId: string) =>
    fetcher({
        url: `/api/characters/${characterId}/email/reconnect`,
        method: "POST",
    }),

  updateConnectionStatus: async ({ isConnected, clientId }: { isConnected: boolean; clientId?: string }) => {
    console.log("[API_CLIENT] updateConnectionStatus called with:", { isConnected, clientId });
    try {
      const sessionExists = await Session.doesSessionExist();
      console.log("[API_CLIENT] Session exists for updateConnectionStatus:", sessionExists);
      if (!sessionExists) {
        console.warn("[API_CLIENT] No session exists, skipping updateConnectionStatus");
        return { status: "skipped", reason: "No active session" };
      }

      // Let fetcher handle token retrieval and headers
      const response = await fetcher({
        url: "/api/connection-status",
        method: "POST",
        body: { isConnected, clientId },
      });

      console.log("[API_CLIENT] updateConnectionStatus response:", response);
      return response;
    } catch (error: any) {
      console.error("[API_CLIENT] updateConnectionStatus error:", error);
      if (error.message === "No active session" || error.status === 401) {
        return { status: "skipped", reason: "No active session or unauthorized" };
      }
      throw new Error(error.message || "Failed to update connection status");
    }
  },

  getConnectionStatus: async () => {
    console.log("[API_CLIENT] Calling getConnectionStatus");
    try {
      const sessionExists = await Session.doesSessionExist();
      console.log("[API_CLIENT] Session exists for getConnectionStatus:", sessionExists);
      if (!sessionExists) {
        console.warn("[API_CLIENT] No session exists, skipping getConnectionStatus");
        return { status: "skipped", reason: "No active session" };
      }

      // Let fetcher handle token retrieval and headers
      const response = await fetcher({
        url: "/api/connection-status",
        method: "GET",
      });

      console.log("[API_CLIENT] getConnectionStatus response:", response);
      return response;
    } catch (error: any) {
      console.error("[API_CLIENT] getConnectionStatus error:", error);
      if (error.message === "No active session" || error.status === 401) {
        return { status: "skipped", reason: "No active session or unauthorized" };
      }
      throw new Error(error.message || "Failed to get connection status");
    }
  },

  getLegalDocuments: (): Promise<{ legalDocuments: LegalDocument[] }> => {
    return fetcher({
      url: "/api/legal-documents",
      method: "GET",
    });
  },

  getLegalDocumentBySlug: (slug: string): Promise<{ legalDocuments: LegalDocument }> => {
    return fetcher({
      url: `/api/legal-documents/${slug}`,
      method: "GET",
    });
  },

  getCompanyPages: (): Promise<{ companyPages: CompanyPage[] }> => {
    return fetcher({
      url: "/api/company-pages",
      method: "GET",
    });
  },

  getCompanyPageBySlug: (slug: string): Promise<{ companyPages: CompanyPage }> => {
    return fetcher({
      url: `/api/company-pages/${slug}`,
      method: "GET",
    });
  },

  getBlogPosts: (slug?: string): Promise<{ blogPosts: BlogPost | BlogPost[] }> => {
    return fetcher({
      url: slug ? `/api/blog-posts/${slug}` : "/api/blog-posts",
      method: "GET",
    });
  },

  getBlogPostBySlug: (slug: string): Promise<{ blogPosts: BlogPost }> => {
    return fetcher({
      url: `/api/blog-posts/${slug}`,
      method: "GET",
    });
  },

  getDocs: (slug?: string): Promise<{ docs: Docs | Docs[] }> => {
    return fetcher({
      url: slug ? `/api/docs/${slug}` : "/api/docs",
      method: "GET",
    });
  },

  getDocBySlug: (slug: string): Promise<{ docs: Docs }> => {
    return fetcher({
      url: `/api/docs/${slug}`,
      method: "GET",
    });
  },

  getPressPosts: (slug?: string): Promise<{ pressPosts: PressPost | PressPost[] }> => {
    return fetcher({
      url: slug ? `/api/press-posts/${slug}` : "/api/press-posts",
      method: "GET",
    });
  },

  getPressPostBySlug: (slug: string): Promise<{ pressPosts: PressPost }> => {
    return fetcher({
      url: `/api/press-posts/${slug}`,
      method: "GET",
    });
  },
  
  getProductPages: (slug?: string): Promise<{ productPages: ProductPage | ProductPage[] }> => {
    return fetcher({
      url: slug ? `/api/product-pages/${slug}` : "/api/product-pages",
      method: "GET",
    });
  },

  getProductPageBySlug: (slug: string): Promise<{ productPages: ProductPage }> => {
    return fetcher({
      url: `/api/product-pages/${slug}`,
      method: "GET",
    });
  },

  getInvoices: (): Promise<{ invoices: Invoice[]; subscriptionId: string | null }> => {
    console.log("[API_CLIENT] Calling getInvoices");
    return fetcher({
      url: "/api/invoices",
      method: "GET",
    }).then((response) => {
      console.log("[API_CLIENT] getInvoices response:", {
        invoiceCount: response.invoices.length,
        subscriptionId: response.subscriptionId,
        invoices: response.invoices.map((inv: Invoice) => ({
          stripeInvoiceId: inv.stripeInvoiceId,
          status: inv.status,
        })),
      });
      return response;
    });
  },

  getInvoiceBySessionId: async (sessionId: string) => {
    console.log("[API_CLIENT] Calling getInvoiceBySessionId", { sessionId });
    const sessionExists = await Session.doesSessionExist();
    console.log("[API_CLIENT] Session exists for getInvoiceBySessionId:", sessionExists);
    if (!sessionExists) {
      console.warn("[API_CLIENT] No session exists, skipping getInvoiceBySessionId");
      throw new Error("No active session");
    }

    // Use fetcher instead of direct fetch for consistency
    return fetcher({
      url: `/api/invoice?sessionId=${encodeURIComponent(sessionId)}`,
      method: "GET",
    });
  },
};
