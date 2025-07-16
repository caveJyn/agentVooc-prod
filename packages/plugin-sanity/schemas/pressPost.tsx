export default {
  name: "pressPost",
  title: "Press Post",
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
      name: "publishedAt",
      title: "Published At",
      type: "datetime",
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: "excerpt",
      title: "Excerpt",
      type: "string",
      description: "A short summary of the press release for previews and SEO",
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
    {
      name: "published",
      title: "Published",
      type: "boolean",
      initialValue: false,
    },
  ],
};