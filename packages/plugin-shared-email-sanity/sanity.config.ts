import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'

export default defineConfig({
  name: 'default',
  title: 'elizaOS',

  projectId: 'xivkf6c4',
  dataset: 'production',

  plugins: [structureTool(), visionTool()],

  schema: {
      },
})
