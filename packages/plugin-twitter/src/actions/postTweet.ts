import {
  type Action,
  type ActionExample,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  logger,
} from '@elizaos/core';
import { TwitterPostClient } from '../post';

export default {
  name: 'POST_TWEET',
  similes: [
    'POST_TWEET',
    'TWEET',
    'SHARE_TWEET',
    'SEND_TWEET',
    'PUBLISH_TWEET',
  ],
  validate: async (runtime: IAgentRuntime, message: Memory, _state: State) => {
    logger.debug('[POST_TWEET] Validating action with message:', message?.content?.text);
    if (message?.content?.text) {
      const text = message.content.text.toLowerCase();
      return (
        text.includes('post a tweet') ||
        text.includes('share a tweet') ||
        text.includes('send a tweet') ||
        text.includes('tweet something')
      );
    }
    return true; // Allow autonomous triggering
  },
  description: 'Posts a tweet to Twitter using AI-generated content.',
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: any,
    callback: HandlerCallback,
    responses?: Memory[] // Make responses optional
  ): Promise<boolean> => {
    logger.debug('[POST_TWEET] Handler invoked with message:', message?.content?.text);

    if (!state) {
      logger.error('[POST_TWEET] State is not available');
      await callback({
        text: 'Error: State is not available',
        source: 'twitter',
      });
      return false;
    }

    // Handle responses if provided
    if (responses && Array.isArray(responses)) {
      logger.debug('[POST_TWEET] Processing responses:', responses.length);
      for (const response of responses) {
        await callback(response.content);
      }
    } else {
      logger.debug('[POST_TWEET] No responses provided');
    }

    // Get Twitter service
    const service = runtime.getService('twitter') as any;
    if (!service) {
      logger.error('[POST_TWEET] Twitter service not found');
      await callback({
        text: 'Error: Twitter service not found',
        source: 'twitter',
      });
      throw new Error('Twitter service not found');
    }

    // Get Twitter client and post client
    const manager = service.getClient(runtime.agentId, runtime.agentId);
    const postClient = manager.postClient as TwitterPostClient;

    if (!postClient) {
      logger.error('[POST_TWEET] Post client not found in Twitter service');
      await callback({
        text: 'Error: Post client not found',
        source: 'twitter',
      });
      return false;
    }

    try {
      // Generate tweet content
      let prompt = 'Generate a short, engaging tweet (up to 280 characters) about a random interesting topic.';
      if (message?.content?.text) {
        prompt = `Generate a short tweet (up to 280 characters) based on the request: "${message.content.text}"`;
      }
      logger.debug('[POST_TWEET] Generating content with prompt:', prompt);

      const content = await runtime.generateText({
        prompt,
        model: 'large', // Matches log: Selected model: gpt-4o
      });

      if (!content || content.length > 280) {
        logger.warn('[POST_TWEET] Invalid tweet content:', content);
        await callback({
          text: 'Couldn’t generate a valid tweet.',
          source: 'twitter',
        });
        return false;
      }

      // Post the tweet using postToTwitter
      const tweet = await (postClient as any).postToTwitter(content); // Typecast to access private method
      if (!tweet) {
        logger.warn('[POST_TWEET] Failed to post tweet');
        await callback({
          text: 'Failed to post the tweet.',
          source: 'twitter',
        });
        return false;
      }

      const tweetId = tweet.rest_id || tweet.id_str || tweet.legacy?.id_str;
      logger.info(`[POST_TWEET] Successfully posted tweet: ${tweetId}`);
      await callback({
        text: `Posted a tweet: ${content}`,
        source: 'twitter',
      });

      // Save tweet as a memory
      await runtime.messageManager.createMemory({
        id: tweetId,
        content: {
          text: content,
          source: 'twitter',
          tweet: {
            id: tweetId,
            text: content,
            username: manager.client.state.TWITTER_USERNAME,
          },
        },
        userId: runtime.agentId,
        roomId: message?.roomId || runtime.agentId,
      });

      return true;
    } catch (error) {
      logger.error('[POST_TWEET] Error posting tweet:', error);
      await callback({
        text: 'An error occurred while posting the tweet.',
        source: 'twitter',
      });
      return false;
    }
  },
  examples: [
    [
      {
        user: '{{user1}}',
        content: {
          text: 'Hey, can you post a tweet about AI advancements?',
        },
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Sure, I’ll post a tweet about AI advancements!',
          actions: ['POST_TWEET'],
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: {
          text: 'Tweet something interesting!',
        },
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Posting a tweet now!',
          actions: ['POST_TWEET'],
        },
      },
    ],
  ] as ActionExample[][],
} as Action;