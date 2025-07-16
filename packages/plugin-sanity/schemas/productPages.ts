export default {
  name: "productPage",
  title: "Product Page",
  type: "document",
  fields: [
    {
      name: "title",
      title: "Title",
      type: "string",
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: "slug",
      title: "Slug",
      type: "slug",
      options: {
        source: "title",
        maxLength: 96,
      },
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: "content",
      title: "Content",
      type: "array",
      of: [{ type: "block" }, { type: "image" }],
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: "lastUpdated",
      title: "Last Updated",
      type: "datetime",
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: "excerpt",
      title: "Excerpt",
      type: "string",
      description: "A short summary of the product page for previews and SEO",
      validation: (Rule: any) => Rule.required().max(160),
    },
    {
      name: "mainImage",
      title: "Main Image",
      type: "image",
      options: {
        hotspot: true,
      },
      description: "Featured image for social media and previews",
    },
  ],
};
