import { Button } from "@/components/ui/button";
import {
  ChatBubble,
  ChatBubbleMessage,
  ChatBubbleTimestamp,
} from "@/components/ui/chat/chat-bubble";
import { ChatInput } from "@/components/ui/chat/chat-input";
import { ChatMessageList } from "@/components/ui/chat/chat-message-list";
import { useTransition, animated, type AnimatedProps } from "@react-spring/web";
import { Paperclip, Send, X, Image as ImageIcon, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import type { Content, UUID } from "@elizaos/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { cn, moment } from "@/lib/utils";
import { Avatar, AvatarImage } from "./ui/avatar";
import CopyButton from "./copy-button";
import ChatTtsButton from "./ui/chat/chat-tts-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import AIWriter from "react-aiwriter";
import type { IAttachment } from "@/types";
import { AudioRecorder } from "./audio-recorder";
import { Badge } from "./ui/badge";

interface ImageItem {
  imageAssetId: string;
  imageUrl: string;
  caption: string;
  createdAt: string;
}

type EmailMetadata = {
  emailId: string;
  from?: string;
  fromName?: string;
  subject?: string;
  date?: string | Date;
  body?: string;
  originalEmailId?: string;
};

type ExtraContentFields = {
  user: string;
  createdAt: number;
  isLoading?: boolean;
  metadata?: {
    imageAssetId?: string;
    emails?: EmailMetadata[];
    emailId?: string;
    pendingReply?: any;
  };
};

// interface StarPosition {
//   top: string;
//   left: string;
//   width: string;
//   height: string;
//   animationDelay: string;
//   animationDuration: string;
// }

type ContentWithUser = Content & ExtraContentFields;

type AnimatedDivProps = AnimatedProps<{ style: React.CSSProperties }> & {
  children?: React.ReactNode;
  ref?: React.Ref<HTMLDivElement>;
};

export default function Page({ agentId }: { agentId: UUID }) {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [input, setInput] = useState("");
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // const [starPositions, setStarPositions] = useState<StarPosition[]>([]);

  const queryClient = useQueryClient();

  // Add this helper function near the top of your component
const processEmailContent = (content: string) => {
  if (!content) return content;
  
  // Break long URLs by inserting zero-width spaces
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/gi;
  
  return content.replace(urlRegex, (url) => {
    // Insert zero-width space after common URL delimiters
    return url
      .replace(/([/=&?])/g, '$1​') // Zero-width space after delimiters
      .replace(/([.-])/g, '$1​')   // Zero-width space after dots and dashes
      .replace(/(.{30})/g, '$1​'); // Zero-width space every 30 characters
  });
};


  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.max(textarea.scrollHeight, 48); // 48px = min-h-12
      textarea.style.height = `${newHeight}px`;
    }
  }, [input]);

  const {
    data: images = [],
    isLoading: isLoadingImages,
    error: imagesError,
  } = useQuery({
    queryKey: ["agent-images", agentId],
    queryFn: async () => {
      // console.log("Fetching agent images");
      try {
        const response = await apiClient.getKnowledge(agentId);
        const imageCollection = response.knowledge?.find(
          (k) => k.metadata?.type === "image-collection"
        );
        return (imageCollection?.metadata?.images || []) as ImageItem[];
      } catch (error) {
        console.error("Failed to fetch agent images:", error);
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const getMessageVariant = (role: string) =>
    role !== "user" ? "received" : "sent";

  const scrollToBottom = useCallback(() => {
    // console.log("scrollToBottom called");
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  const isAtBottom = true;
  const disableAutoScroll = useCallback(() => {
    // console.log("disableAutoScroll called (no-op)");
  }, []);

  const handleImageSelect = (imageAssetId: string) => {
    setSelectedImageId((prev) => {
      const newId = prev === imageAssetId ? null : imageAssetId;
      // console.log("Selected image ID:", newId);
      return newId;
    });
  };

  const handleEmailClick = (emailId: string) => {
    setInput(`generate a reply for this emailId: ${emailId}`);
    inputRef.current?.focus();
  };

  const handleConfirmReply = () => {
    setInput("confirm reply");
    formRef.current?.requestSubmit();
  };

  const handleEditReply = (emailId: string, replyContent: string) => {
    const newInput = `reply to this emailId: ${emailId} message: ${replyContent}`;
    setInput(newInput);
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const toggleEmailExpansion = (emailId: string) => {
    setExpandedEmails((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(emailId)) {
        newSet.delete(emailId);
      } else {
        newSet.add(emailId);
      }
      return newSet;
    });
  };

  useEffect(() => {
    // console.log("Initial mount, scrolling to bottom");
    scrollToBottom();
    inputRef.current?.focus();
  }, [scrollToBottom]);

  useEffect(() => {
    if (!isLoadingImages && images.length > 0) {
      // console.log("Images loaded, scrolling to bottom");
      scrollToBottom();
    }
  }, [isLoadingImages, images.length, scrollToBottom]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (e.nativeEvent.isComposing) return;
      handleSendMessage(e as unknown as React.FormEvent<HTMLFormElement>);
    }
  };

  const handleSendMessage = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input) return;

    const attachments: IAttachment[] | undefined = selectedFile
      ? [
          {
            url: URL.createObjectURL(selectedFile),
            contentType: selectedFile.type,
            title: selectedFile.name,
          },
        ]
      : undefined;

    const newMessages = [
      {
        text: input,
        user: "user",
        createdAt: Date.now(),
        attachments,
        metadata: selectedImageId ? { imageAssetId: selectedImageId } : undefined,
      },
      {
        text: "",
        user: "system",
        isLoading: true,
        createdAt: Date.now(),
      },
    ];

    queryClient.setQueryData(
      ["messages", agentId],
      (old: ContentWithUser[] = []) => {
        // console.log("Adding new messages:", newMessages);
        return [...old, ...newMessages];
      }
    );

    sendMessageMutation.mutate({
      message: input,
      selectedFile: selectedFile || null,
      selectedImageId,
    });

    setSelectedFile(null);
    setSelectedImageId(null);
    setInput("");
    formRef.current?.reset();
    scrollToBottom();
  };

  const sendMessageMutation = useMutation({
  mutationKey: ["send_message", agentId],
  mutationFn: ({
    message,
    selectedFile,
    selectedImageId,
  }: {
    message: string;
    selectedFile: File | null;
    selectedImageId: string | null;
  }) => {
    // console.log(`Sending message to: /api/${agentId}/message`);
    return apiClient.sendMessage(
      agentId,
      message,
      selectedFile,
      selectedImageId ? { imageAssetId: selectedImageId } : undefined
    );
  },
  onSuccess: (data: ContentWithUser[] | { message: string }) => {
    // console.log("Received response:", data);
    const newMessages = Array.isArray(data)
      ? data.map((msg) => ({
          ...msg,
          createdAt: msg.createdAt || Date.now(),
        }))
      : []; // Handle non-array response (e.g., { message: "Message processed" })
    queryClient.setQueryData(
      ["messages", agentId],
      (old: ContentWithUser[] = []) => {
        const updated = [
          ...old.filter((msg) => !msg.isLoading),
          ...newMessages,
        ];
        // console.log("Updated messages cache:", updated);
        return updated;
      }
    );
    scrollToBottom();
  },
  onError: (e: any) => {
    console.error("Send message error:", e);
    queryClient.setQueryData(
      ["messages", agentId],
      (old: ContentWithUser[] = []) => old.filter((msg) => !msg.isLoading)
    );
    toast({
      variant: "destructive",
      title: "Unable to send message",
      description: e.message.includes("Character not found or access denied")
        ? "This character does not exist or you don't have access."
        : e.message || "Failed to send message",
    });
  },
});

  const uploadAgentImageMutation = useMutation({
    mutationKey: ["upload_agent_image", agentId],
    mutationFn: (file: File) => {
      // console.log(`Uploading image to: /api/${agentId}/upload-agent-image`);
      return apiClient.uploadAgentImage(agentId, file);
    },
    onSuccess: (data: { message: string; url: string; sanityAssetId: string; caption: string }) => {
      // console.log("Image upload success:", data);
      const newMessage: ContentWithUser = {
        text: data.caption || "Image uploaded",
        user: "user",
        createdAt: Date.now(),
        attachments: [
          {
            id: data.sanityAssetId,
            source: "image-upload",
            description: data.caption,
            text: data.caption,
            url: data.url,
            contentType: "image/*",
            title: "Uploaded Image",
          },
        ],
      };
      queryClient.setQueryData(
        ["messages", agentId],
        (old: ContentWithUser[] = []) => {
          const updated = [...old, newMessage];
          // console.log("Updated messages with image:", updated);
          return updated;
        }
      );
      // console.log("Invalidating agent-images query");
      queryClient.invalidateQueries({ queryKey: ["agent-images", agentId] });
      toast({
        title: "Image uploaded",
        description: "Image added to agent's knowledge and chat.",
      });
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      scrollToBottom();
    },
    onError: (error: any) => {
      console.error("Upload agent image error:", error);
      toast({
        variant: "destructive",
        title: "Unable to upload image",
        description: error.message || "Failed to upload image",
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file?.type.startsWith("image/")) {
      setSelectedFile(file);
    }
  };

  const handleUploadAgentImage = () => {
    if (selectedFile) {
      uploadAgentImageMutation.mutate(selectedFile);
    } else {
      toast({
        variant: "default",
        title: "No image selected",
        description: "Please select an image to upload.",
      });
    }
  };

  const messages = queryClient.getQueryData<ContentWithUser[]>(["messages", agentId]) || [];

  // Fallback email body map for older messages
  const emailBodyMap = new Map<string, string>();
  messages.forEach((msg) => {
    if (msg.source === "CHECK_EMAIL" && !msg.metadata?.emails && msg.text) {
      const emailSections = msg.text.split(/\n\n(?=\d+\.\s+From:)/);
      emailSections.forEach((section: string) => {
        const emailIdMatch = section.match(/Email ID: ([^\n]+)/);
        const bodyMatch = section.match(/Body:([\s\S]*?)(?=\n\n|\n...and \d+ more email\(s\)|$)/);
        if (emailIdMatch && bodyMatch) {
          let body = bodyMatch[1].trim();
          // Minimal cleanup for older messages
          body = body
            .replace(/https?:\/\/[^\s<>\[\]]+/g, "")
            .replace(/\[image: [^\]]+\]/g, "")
            .replace(/[\u200B-\u200F\uFEFF]+/g, "")
            .replace(/\s*\n\s*/g, "\n")
            .replace(/\n{2,}/g, "\n\n")
            .trim();
          if (body) {
            emailBodyMap.set(emailIdMatch[1].trim(), body);
          }
        }
      });
    }
  });

  const transitions = useTransition(messages, {
    keys: (message) => `${message.createdAt}-${message.user}-${message.text}`,
    from: { opacity: 0, transform: "translateY(50px)" },
    enter: { opacity: 1, transform: "translateY(0px)" },
    leave: { opacity: 0, transform: "translateY(10px)" },
  });

  const CustomAnimatedDiv = animated.div as React.ComponentType<
    AnimatedDivProps & React.RefAttributes<HTMLDivElement>
  >;
  
  // Add useEffect for star positions
  // useEffect(() => {
  //   const positions = [...Array(20)].map(() => ({
  //     top: `${Math.random() * 100}%`,
  //     left: `${Math.random() * 100}%`,
  //     width: `${Math.random() * 4 + 2}px`,
  //     height: `${Math.random() * 4 + 2}px`,
  //     animationDelay: `${Math.random() * 5}s`,
  //     animationDuration: `${Math.random() * 3 + 2}s`,
  //   }));
  //   setStarPositions(positions);
  // }, []);
  // const defaultImage = "/images/chat-bg.jpg";

  // console.log("Chat render");
  // console.log("ChatMessageList props:", { scrollRef, isAtBottom, scrollToBottom, disableAutoScroll });
  // console.log("Images:", images);
  // console.log("Selected image ID:", selectedImageId);
  // console.log("Email body map:", Object.fromEntries(emailBodyMap));

  return (
    <div className="flex flex-col w-full h-[calc(100dvh)] p-6 bg-agentvooc-primary-bg">
      <div className="flex-1 overflow-y-auto h-[calc(100dvh-150px)]">
        {!isLoadingImages && images.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-medium text-agentvooc-secondary mb-2">Agent Images</h3>
            <div className="flex overflow-x-auto gap-2 pb-2">
              {images.map((image) => (
                <div
                  key={image.imageAssetId}
                  className={cn(
                    "relative rounded-lg border border-agentvooc-accent/30 p-1.5 cursor-pointer transition-all",
                    selectedImageId === image.imageAssetId
                      ? "border-agentvooc-accent ring-1 ring-agentvooc-accent"
                      : "hover:border-agentvooc-accent"
                  )}
                  onClick={() => handleImageSelect(image.imageAssetId)}
                >
                  <img
                    alt={image.caption || "Agent image"}
                    src={image.imageUrl}
                    className="w-20 h-20 object-cover rounded-lg"
                  />
                  {image.caption && (
                    <p className="text-xs text-agentvooc-secondary truncate max-w-[80px] mt-1">
                      {image.caption}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {isLoadingImages && (
          <div className="mb-4 flex items-center justify-center p-4">
            <p className="text-sm text-agentvooc-secondary">Loading agent images...</p>
          </div>
        )}
        {imagesError && (
          <div className="mb-4 p-2 border border-agentvooc-accent/20 bg-agentvooc-accent/10 rounded-lg">
            <p className="text-sm text-agentvooc-accent">Failed to load agent images</p>
          </div>
        )}
        <ChatMessageList
          scrollRef={scrollRef}
          isAtBottom={isAtBottom}
          scrollToBottom={scrollToBottom}
          disableAutoScroll={disableAutoScroll}
        >
          {transitions((style, message: ContentWithUser) => {
            const variant = getMessageVariant(message?.user);
            return (
              <CustomAnimatedDiv
                style={{
                  ...style,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  padding: "1rem",
                }}
              >
                <ChatBubble
                  variant={variant}
                  className="flex flex-row items-center gap-2 bg-agentvooc-secondary-accent border-agentvooc-accent/30 rounded-lg"
                >
                  {message?.user !== "user" ? (
                    <Avatar className="size-8 p-1 border border-agentvooc-accent/30 rounded-full select-none">
                      <AvatarImage src="/elizaos-icon.png" />
                    </Avatar>
                  ) : null}
                  <div className="flex flex-col w-full">
                    <ChatBubbleMessage isLoading={message?.isLoading}>
                      {/* Render text for user messages, non-CHECK_EMAIL messages, or CHECK_EMAIL with no emails */}
                      {message?.user === "user" ? (
                        message.text
                      ) : message.source === "CHECK_EMAIL" && (!message.metadata?.emails || message.metadata.emails.length === 0) ? (
                        <AIWriter>{message.text}</AIWriter>
                      ) : message.source !== "CHECK_EMAIL" ? (
                        <AIWriter>{message.text}</AIWriter>
                      ) : null}

{(message?.metadata?.emails ?? []).length > 0 && (
  <div className="mt-2 space-y-2 max-w-full">
    {/* Custom header for email list */}
    <div className="text-sm sm:text-base text-agentvooc-primary">
      <p>Here are your emails from the last 24 hours:</p>
      <p className="mt-1 text-xs sm:text-sm text-agentvooc-secondary">
        Reply using 'reply to emailId: &lt;id&gt; message: &lt;text&gt;'
      </p>
      <p className="text-xs sm:text-sm text-agentvooc-secondary">
        Or simply click on the email to autofill the chat box and hit send to generate a reply.
      </p>
    </div>
    
    <div className="space-y-3 mt-4">
      {message.metadata?.emails?.map((email: EmailMetadata, index: number) => {
        let body = email.body || emailBodyMap.get(email.emailId) || "No content";
        const isLongBody = body.length > 500;
        const isExpanded = expandedEmails.has(email.emailId);
        const rawDisplayBody = isLongBody && !isExpanded ? `${body.substring(0, 500)}...` : body;
        const displayBody = processEmailContent(rawDisplayBody);
        
        return (
          <div key={email.emailId} className="flex items-start gap-2 sm:gap-3 w-full max-w-full">
            {/* Email Number */}
            <div className="flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-agentvooc-accent/20 border border-agentvooc-accent/30 flex items-center justify-center text-xs sm:text-sm font-medium text-agentvooc-accent">
              {index + 1}
            </div>
            
            {/* Email Card */}
            <div
              className="flex-1 min-w-0 max-w-full border border-agentvooc-accent/30 rounded-lg p-2 sm:p-3 cursor-pointer hover:bg-agentvooc-accent/10 transition-colors overflow-hidden email-content"
              style={{ 
                wordBreak: 'break-all', 
                overflowWrap: 'break-word',
                maxWidth: '100%',
                width: '100%'
              }}
              onClick={() => handleEmailClick(email.emailId)}
            >
              {/* From field */}
              <div className="mb-2 overflow-hidden">
                <span className="text-sm sm:text-base font-medium">From:</span>
                <div className="ml-2 text-sm sm:text-base break-all overflow-wrap-anywhere overflow-hidden max-w-full">
                  {processEmailContent(email.fromName || email.from || "Unknown")}
                </div>
              </div>
              
              {/* Subject field */}
              <div className="mb-2 overflow-hidden">
                <span className="text-sm sm:text-base font-medium">Subject:</span>
                <div className="ml-2 text-sm sm:text-base break-all overflow-wrap-anywhere overflow-hidden max-w-full">
                  {processEmailContent(email.subject || "No subject")}
                </div>
              </div>
              
              {/* Date field */}
              <div className="mb-2">
                <span className="text-sm sm:text-base font-medium">Date:</span>
                <span className="ml-2 text-sm sm:text-base">
                  {email.date ? new Date(email.date).toLocaleString() : "Unknown"}
                </span>
              </div>
              
              {/* Body field */}
              <div className="mb-2 overflow-hidden">
                <span className="text-sm sm:text-base font-medium">Body:</span>
                <div 
                  className="ml-2 text-sm sm:text-base whitespace-pre-wrap break-all overflow-wrap-anywhere max-w-full overflow-hidden"
                  style={{ 
                    wordBreak: 'break-all',
                    overflowWrap: 'break-word',
                    maxWidth: '100%'
                  }}
                >
                  {displayBody}
                </div>
              </div>
              
              {/* Expand/Collapse button */}
              {isLongBody && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-xs sm:text-sm text-agentvooc-accent hover:bg-agentvooc-accent/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleEmailExpansion(email.emailId);
                  }}
                >
                  {isExpanded ? (
                    <>
                      Collapse <ChevronUp className="ml-1 size-3 sm:size-4" />
                    </>
                  ) : (
                    <>
                      Expand <ChevronDown className="ml-1 size-3 sm:size-4" />
                    </>
                  )}
                </Button>
              )}
              
              {/* Email ID field */}
              <div className="mt-3 pt-2 border-t border-agentvooc-accent/20 overflow-hidden">
                <span className="text-xs sm:text-sm font-medium text-agentvooc-accent">Email ID:</span>
                <div className="ml-2 text-xs sm:text-sm text-agentvooc-accent break-all font-mono bg-agentvooc-accent/10 px-2 py-1 rounded mt-1 max-w-full overflow-hidden">
                  {email.emailId}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
)}
                      {message?.metadata?.pendingReply && (
                        <div className="mt-2 flex gap-2">
                          <Button
                            onClick={handleConfirmReply}
                            className="bg-agentvooc-button-bg text-agentvooc-accent hover:bg-agentvooc-accent hover:text-agentvooc-primary-bg shadow-agentvooc-glow rounded-lg"
                          >
                            Confirm Reply
                          </Button>
                          <Button
                            onClick={() =>
                              handleEditReply(
                                message.metadata?.emailId || "",
                                message.metadata?.pendingReply?.body || message.text
                              )
                            }
                            className="bg-agentvooc-button-bg text-agentvooc-accent hover:bg-agentvooc-accent hover:text-agentvooc-primary-bg shadow-agentvooc-glow rounded-lg"
                          >
                            Modify Email
                          </Button>
                        </div>
                      )}
                      <div>
                        {message?.attachments?.map((attachment: IAttachment) => (
                          <div
                            className="flex flex-col gap-1 mt-2"
                            key={`${attachment.url}-${attachment.title}`}
                          >
                            <img
                              alt={attachment.title || "attachment"}
                              src={attachment.url}
                              width="100%"
                              height="100%"
                              className="w-64 rounded-lg"
                            />
                            <div className="flex items-center justify-between gap-4">
                              <span />
                              <span />
                            </div>
                          </div>
                        ))}
                      </div>
                      {message?.metadata?.imageAssetId && (
                        <div className="mt-2 text-xs text-agentvooc-secondary">
                          Referenced image: {
                            images.find(img => img.imageAssetId === message.metadata?.imageAssetId)?.caption || 
                            "Image"
                          }
                        </div>
                      )}
                    </ChatBubbleMessage>
                    <div className="flex items-center gap-4 justify-between w-full mt-1">
                      {message?.text && !message?.isLoading ? (
                        <div className="flex items-center gap-1">
                          <CopyButton text={message?.text} />
                          <ChatTtsButton agentId={agentId} text={message?.text} />
                        </div>
                      ) : null}
                      <div
                        className={cn([
                          message?.isLoading ? "mt-2" : "",
                          "flex items-center justify-between gap-4 select-none",
                        ])}
                      >
                        {message?.source ? (
                          <Badge variant="outline" className="border-agentvooc-accent/30 text-agentvooc-secondary">
                            {message.source}
                          </Badge>
                        ) : null}
                        {message?.action ? (
                          <Badge variant="outline" className="border-agentvooc-accent/30 text-agentvooc-secondary">
                            {message.action}
                          </Badge>
                        ) : null}
                        {message?.createdAt ? (
                          <ChatBubbleTimestamp
                            timestamp={moment(message?.createdAt).format("LT")}
                            className="text-agentvooc-secondary"
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                </ChatBubble>
              </CustomAnimatedDiv>
            );
          })}
        </ChatMessageList>
      </div>
      <div className="px-4 pb-4">
        <form
          ref={formRef}
          onSubmit={handleSendMessage}
          className="relative rounded-lg border border-agentvooc-accent/30 bg-agentvooc-secondary-accent shadow-agentvooc-glow"
        >
          {selectedFile ? (
            <div className="p-3 flex">
              <div className="relative rounded-lg border border-agentvooc-accent/30 p-2">
                <Button
                  onClick={() => setSelectedFile(null)}
                  className="absolute -right-2 -top-2 size-[22px] ring-2 ring-agentvooc-primary-bg"
                  variant="outline"
                  size="icon"
                >
                  <X className="text-agentvooc-accent" />
                </Button>
                <img
                  alt="Selected file"
                  src={URL.createObjectURL(selectedFile)}
                  height="100%"
                  width="100%"
                  className="aspect-square object-contain w-16 rounded-lg"
                />
              </div>
            </div>
          ) : null}
          <ChatInput
            ref={inputRef}
            onKeyDown={handleKeyDown}
            value={input}
            onChange={({ target }) => setInput(target.value)}
            placeholder={selectedImageId ? "Ask about the selected image..." : "Type your message here..."}
            className="min-h-12 max-h-96 resize-none rounded-lg bg-agentvooc-secondary-accent border-0 p-3 text-agentvooc-primary placeholder-agentvooc-secondary/50 focus-visible:ring-0 overflow-y-auto"
          />
          <div className="flex items-center p-3 pt-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.click();
                      }
                    }}
                    className="text-agentvooc-accent hover:bg-agentvooc-accent/10"
                  >
                    <Paperclip className="size-4" />
                    <span className="sr-only">Attach file</span>
                  </Button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    className="hidden"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="left" className="bg-agentvooc-secondary-accent text-agentvooc-primary border-agentvooc-accent/30">
                <p>Attach file</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleUploadAgentImage}
                  disabled={!selectedFile}
                  className="text-agentvooc-accent hover:bg-agentvooc-accent/10"
                >
                  <ImageIcon className="size-4" />
                  <span className="sr-only">Upload image to agent</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="bg-agentvooc-secondary-accent text-agentvooc-primary border-agentvooc-accent/30">
                <p>Upload image to agent</p>
              </TooltipContent>
            </Tooltip>
            <AudioRecorder
              agentId={agentId}
              onChange={(newInput: string) => setInput(newInput)}
            />
            <Button
              disabled={!input || sendMessageMutation.isPending}
              type="submit"
              size="sm"
              className="ml-auto gap-1.5 h-[30px] bg-agentvooc-button-bg text-agentvooc-accent hover:bg-agentvooc-accent hover:text-agentvooc-primary-bg shadow-agentvooc-glow rounded-lg"
            >
              {sendMessageMutation.isPending
                ? "..."
                : selectedImageId 
                  ? "Send with Image" 
                  : "Send Message"}
              <Send className="size-3.5" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}