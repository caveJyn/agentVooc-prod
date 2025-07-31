import type { UUID, Character, Plugin } from "@elizaos/core";
import Session from "supertokens-web-js/recipe/session";

// Base URL for API requests
// this routes trafic to the server(backend) localhost:3000
// These are API endpoints that are used by the client to communicate with the server
const BASE_URL  =
    import.meta.env.VITE_SERVER_BASE_URL ||
    `${import.meta.env.VITE_SERVER_URL}:${import.meta.env.VITE_SERVER_PORT}`;
// console.log(`[FETCHER] Using BASE_URL: ${BASE_URL}`);

const fetcher = async ({
  url,
  method,
  body,
  headers,
}: {
  url: string;
  method?: "GET" | "POST" | "DELETE" | "PATCH";
  body?: object | FormData;
  headers?: HeadersInit;
}) => {
  // Prevent redirect loop if already on /auth, except for auth-related endpoints
  if (
    window.location.pathname === "/auth" &&
    !url.startsWith("/api/auth") &&
    !url.startsWith("/api/user")
  ) {
    // console.log(`[FETCHER] Aborting fetch: Already on auth page for ${url}`);
    throw new Error("Already on auth page, aborting fetch");
  }

  const makeRequest = async (): Promise<any> => {
    const options: RequestInit = {
      method: method ?? "GET",
      headers: headers
        ? headers
        : {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
      credentials: "include", // Required for SuperTokens to send session cookies
    };

    if (method === "POST" || method === "PATCH") {
      if (body instanceof FormData) {
        if (options.headers && typeof options.headers === "object") {
          options.headers = Object.fromEntries(
            Object.entries(options.headers as Record<string, string>).filter(
              ([key]) => key !== "Content-Type"
            )
          );
        }
        options.body = body;
        // console.log(`[FETCHER] Preparing ${method} request with FormData body for ${url}`);
      } else {
        options.body = JSON.stringify(body);
        // console.log(`[FETCHER] Preparing ${method} request with JSON body for ${url}:`, body);
      }
    }

    // console.log(`[FETCHER] Sending request to ${BASE_URL}${url} with method: ${method}`);
    // console.log(`[FETCHER] Fetching ${BASE_URL}${url} with headers:`, options.headers);

    const resp = await fetch(`${BASE_URL}${url}`, options);
    // console.log(`[FETCHER] Response status for ${url}: ${resp.status}`);
    // console.log(`[FETCHER] Response headers for ${url}:`, 
    //   {
    //   "access-control-allow-origin": resp.headers.get("access-control-allow-origin"),
    //   "access-control-allow-credentials": resp.headers.get("access-control-allow-credentials"),
    // });

    const contentType = resp.headers.get("Content-Type");
    if (contentType?.includes("audio/mpeg")) {
      // console.log(`[FETCHER] Response is audio/mpeg for ${url}, returning blob`);
      return await resp.blob();
    }

    if (!resp.ok) {
      const errorText = await resp.text();
      // console.error(`[FETCHER] Fetch error for ${url}:`, errorText, "Status:", resp.status);
      
      let errorMessage = "An error occurred.";
      let errorObj: any = {};
      
      try {
        errorObj = JSON.parse(errorText);
        errorMessage = errorObj.error || errorObj.message || errorText;
        // console.log(`[FETCHER] Parsed error for ${url}:`, errorMessage);
      } catch {
        errorMessage = errorText || "Unknown error";
        // console.log(`[FETCHER] Failed to parse error response for ${url}:`, errorText);
      }

      // Check if this is a SuperTokens session refresh error
      if (resp.status === 401 && errorObj.message === "try refresh token") {
        // console.log(`[FETCHER] Session refresh needed for ${url}`);
        throw new Error("TRY_REFRESH_TOKEN");
      }

      const error = new Error(errorMessage);
      (error as any).status = resp.status;
      // console.log(`[FETCHER] Throwing error for ${url}:`, errorMessage);
      throw error;
    }

    // Handle 204 No Content responses
    if (resp.status === 204) {
      // console.log(`[FETCHER] 204 No Content for ${url}, returning empty object`);
      return {};
    }

    // console.log(`[FETCHER] Parsing response as JSON for ${url}`);
    const responseData = await resp.json();
    // console.log(`[FETCHER] Response data for ${url}:`, responseData);
    return responseData;
  };

  try {
    return await makeRequest();
  } catch (error: any) {
    // console.error(`[FETCHER] Error for ${url}:`, error);
    
    // Handle SuperTokens session refresh
    if (error.message === "TRY_REFRESH_TOKEN") {
      // console.log(`[FETCHER] Attempting session refresh for ${url}`);
      
      try {
        // Attempt to refresh the session
        const refreshed = await Session.attemptRefreshingSession();
        
        if (refreshed) {
          // console.log(`[FETCHER] Session refreshed successfully, retrying ${url}`);
          // Retry the original request with the new session
          return await makeRequest();
        } else {
          // console.log(`[FETCHER] Session refresh failed, redirecting to auth for ${url}`);
          // Session refresh failed, redirect to auth
          window.location.href = "/auth";
          throw new Error("Session expired, please login again");
        }
      } catch (refreshError) {
        // console.error(`[FETCHER] Session refresh error for ${url}:`, refreshError);
        // Session refresh failed, redirect to auth
        window.location.href = "/auth";
        throw new Error("Session expired, please login again");
      }
    }
    
    throw error;
  }
};

export interface User {
  _id: string;
  userId: string;
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
    // console.log("[API_CLIENT] Calling getAgents");
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
      return response.user; // Updated to match response format
    } catch (error: any) {
      // console.error("Error in createUser:", error);
      throw new Error(error.message || "Failed to create or fetch user");
    }
  },
    getPlugins: (): Promise<{ plugins: Plugin[] }> => {
    // console.log("[API_CLIENT] Calling getPlugins");
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
  // console.log("[API_CLIENT] Calling getCharacters");
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
    // lib/api.ts
getCharacterPresets: (): Promise<{ characterPresets: any[] }> => {
  // console.log("[API_CLIENT] Calling getCharacterPresets");
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
      // console.log("[API_CLIENT] Calling createCheckoutSession with data:", data);
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
  getUser: () => {
    // console.log("[API_CLIENT] Calling getUser");
    return fetcher({
      url: "/api/user",
      method: "GET",
    });
  },
  getItems: ({ itemType }: { itemType?: string } = {}) => {
  // console.log("[API_CLIENT] Calling getItems", { itemType });
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
    // console.log("[API_CLIENT] Calling getSubscriptionItems", { includeDetails });
    return fetcher({
      url: `/api/subscription-items${includeDetails ? "?includeDetails=true" : ""}`,
      method: "GET",
    });
  },
  getSubscriptionStatus: () => {
    // console.log("[API_CLIENT] Calling getSubscriptionStatus");
    return fetcher({
      url: "/api/subscription-status",
      method: "GET",
    });
  },
  createPortalSession: () => {
    // console.log("[API_CLIENT] Calling createPortalSession");
    return fetcher({
      url: "/api/create-portal-session",
      method: "POST",
    });
  },
  cancelSubscription: () => {
    // console.log("[API_CLIENT] Calling cancelSubscription");
    return fetcher({
      url: "/api/cancel-subscription",
      method: "POST",
    });
  },
  getLandingPage: (): Promise<{ landingPage: LandingPage }> => {
    // console.log("[API_CLIENT] Calling getLandingPage");
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

    updateConnectionStatus: (data: { isConnected: boolean }) =>
    fetcher({
      url: "/api/connection-status",
      method: "POST",
      body: data,
    }),

  getConnectionStatus: () =>
    fetcher({
      url: "/api/connection-status",
      method: "GET",
    }),

    getLegalDocuments: (): Promise<{ legalDocuments: LegalDocument[] }> => {
    // console.log("[API_CLIENT] Calling getLegalDocuments");
    return fetcher({
      url: "/api/legal-documents",
      method: "GET",
    });
  },

  getLegalDocumentBySlug: (slug: string): Promise<{ legalDocuments: LegalDocument }> => {
    // console.log("[API_CLIENT] Calling getLegalDocumentBySlug", { slug });
    return fetcher({
      url: `/api/legal-documents/${slug}`,
      method: "GET",
    });
  },
  getCompanyPages: (): Promise<{ companyPages: CompanyPage[] }> => {
    // console.log("[API_CLIENT] Calling getCompanyPages");
    return fetcher({
      url: "/api/company-pages",
      method: "GET",
    });
  },

  getCompanyPageBySlug: (slug: string): Promise<{ companyPages: CompanyPage }> => {
    // console.log("[API_CLIENT] Calling getCompanyPageBySlug", { slug });
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
    const response = await fetch(`/api/invoice?sessionId=${encodeURIComponent(sessionId)}`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to fetch invoice');
    return response.json();
  },
};
