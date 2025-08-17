export default {
  name: "User",
  title: "Waitlist User",
  type: "document",
  fields: [
        {
      name: "email",
      title: "Email",
      type: "string",
    },
    {
      name: "name",
      title: "Name",
      type: "string",
    },
    {
      name: "userId",
      title: "SuperTokens User ID",
      type: "string",
      validation: (Rule) => Rule.required(),
    },
    {
      name: "lastClientId",
      type: "string",
      title: "Last Client ID",
    },
    {
      name: "interest",
      title: "Interest",
      type: "string",
      description: "What interests the user about elizaOS",
    },
    {
      name: "referralSource",
      title: "Referral Source",
      type: "string",
      description: "How the user heard about elizaOS",
    },
    {
      name: "createdAt",
      title: "Created At",
      type: "datetime",
      options: {
        dateFormat: "YYYY-MM-DD",
        timeFormat: "HH:mm:ss",
      },
      validation: (Rule) => Rule.required(),
    },
    {
      name: "userType",
      title: "User Type",
      type: "string",
      options: {
        list: [
          { title: "Email", value: "email" },
          { title: "Crypto", value: "crypto" },
        ],
      },
      validation: (Rule) => Rule.required(),
      description: "Type of user authentication: 'email' or 'crypto'",
    },
    {
      name: "stripeCustomerId",
      title: "Stripe Customer ID",
      type: "string",
    },
    {
      name: "stripeSubscriptionId",
      title: "Stripe Subscription ID",
      type: "string",
      description: "Subscription ID from Stripe",
    },
    {
      name: "subscriptionStatus",
      title: "Subscription Status",
      type: "string",
      options: {
        list: ["none", "active", "trialing", "canceled", "past_due", "incomplete"],
      },
    },
    {
      name: "trialStartDate",
      title: "Trial Start Date",
      type: "datetime",
    },
    {
      name: "trialEndDate",
      title: "Trial End Date",
      type: "datetime",
    },
    {
      name: "cancelAtPeriodEnd",
      title: "Cancel at Period End",
      type: "boolean",
    },
    {
      name: "activePriceIds",
      title: "Active Price IDs",
      type: "array",
      of: [{ type: "string" }],
      description: "List of active Stripe price IDs associated with the user's subscription (e.g., ['price_123']).",
      validation: (Rule) =>
        Rule.custom((value) => {
          if (!value) return true; // Allow empty array
          return value.every((id) => id.startsWith("price_"))
            ? true
            : "All price IDs must start with 'price_'";
        }),
    },
    {
      name: 'hasUsedTrial',
      title: 'Has Used Trial',
      type: 'boolean',
      description: 'Indicates whether the user has already used their free trial',
    },
     {
      name: "responseCount",
      title: "Response Count",
      type: "number",
      description: "Number of responses used in the current billing period",
      initialValue: 0,
    },
    {
      name: "tokenCount",
      title: "Token Count",
      type: "number",
      description: "Number of tokens used in the current billing period",
      initialValue: 0,
    },
    {
      name: "currentPeriodStart",
      title: "Current Period Start",
      type: "datetime",
      description: "Start of the current billing period",
    },
    {
      name: "currentPeriodEnd",
      title: "Current Period End",
      type: "datetime",
      description: "End of the current billing period",
    },
    {
      name: "activePlugins",
      title: "Active Plugins",
      type: "array",
      of: [{ type: "string" }],
      description: "List of active plugin names the user has subscribed to",
    },
    {
      name: "isConnected",
      title: "Is Connected",
      type: "boolean",
      description: "Indicates if the user has an active connection to the system",
      initialValue: true,
      validation: (Rule) => Rule.required(),
    }
  ],
  preview: {
    select: {
      title: "email", // Use the email field as the document title
      subtitle: "userId", // Optional: Use name as subtitle
      status: "isConnected"
    },
  },
};