import {
  type Action,
  ChannelType,
  type Content,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  type Service,
  createUniqueUuid,
  type UUID,
  getUserServerRole,
  logger,
} from '@elizaos/core';

interface DiscordService extends Service {
  client?: {
    guilds: {
      cache: {
        get: (id: string) => any;
      };
    };
  };
}

interface ReportChannelConfig {
  serverId?: string;
  serverName?: string;
  channelId: string;
  createdAt: string;
  source?: string;
}

/**
 * Ensures a Discord client exists and is ready
 * @param {IAgentRuntime} runtime - The Agent runtime
 * @returns {Promise<DiscordService>} The Discord client
 */
async function ensureDiscordClient(runtime: IAgentRuntime): Promise<DiscordService> {
  logger.info('Ensuring Discord client is available');

  try {
    const discordService = runtime.getService('discord') as DiscordService;
    logger.info(`Discord service found: ${!!discordService}`);

    if (!discordService) {
      logger.error('Discord service not found in runtime');
      throw new Error('Discord service not found');
    }

    logger.info(`Discord service structure: ${JSON.stringify(Object.keys(discordService))}`);

    logger.info(`Discord client exists: ${!!discordService?.client}`);
    if (!discordService?.client) {
      logger.error('Discord client not initialized in service');
      throw new Error('Discord client not initialized');
    }

    logger.info('Discord client successfully validated');
    return discordService;
  } catch (error: unknown) {
    const err = error as Error;
    logger.error(`Error ensuring Discord client: ${err.message || 'Unknown error'}`);
    logger.error(`Error stack: ${err.stack || 'No stack trace available'}`);
    throw error;
  }
}

export const checkInInfoAction: Action = {
  name: 'CHECK_IN_INFO',
  description:
    'Provides information, guidance, and knowledge about setting up team check-in schedules. This action handles questions and requests for information about check-ins, not actual configuration.',
  similes: [
    'CHECK_IN_HELP',
    'CHECKIN_HELP',
    'CHECK_IN_GUIDE',
    'CHECKIN_GUIDE',
    'CHECK_IN_INFORMATION',
    'CHECKIN_INFORMATION',
    'SETUP_CHECKIN_HELP',
    'SETUP_CHECK_IN_HELP',
    'HOW_TO_CHECKIN',
    'HOW_TO_CHECK_IN',
    'CHECKIN_TUTORIAL',
    'CHECK_IN_TUTORIAL',
    'EXPLAIN_CHECKIN',
    'EXPLAIN_CHECK_IN',
    'LEARN_CHECKIN',
    'LEARN_CHECK_IN',
  ],
  validate: async (runtime: IAgentRuntime, message: Memory, state: State | undefined): Promise<boolean> => {
    try {
      if (!state) return false;
      
      const room = state.data.room ?? (await runtime.getRoom(message.roomId));
      if (!room) {
        logger.error('No room found for message');
        return false;
      }

      const serverId = room.serverId;
      if (!serverId) {
        logger.error('No server ID found for room');
        return false;
      }

      // Check if user is an admin
      const userRole = await getUserServerRole(runtime, message.entityId, serverId);
      logger.info(`User role: ${userRole}`);

      state.data.isAdmin = true;
      
      const userText = message.content.text as string;
      if (!userText) return false;

      // Check if this is an informational request about check-ins
      const informationalKeywords = [
        'how', 'what', 'can you', 'help', 'explain', 'guide', 'tutorial',
        'learn', 'information', 'about', 'setup', 'create', '?'
      ];

      const checkInKeywords = [
        'check-in', 'checkin', 'check in', 'schedule', 'standup', 'team meeting'
      ];

      const hasInformationalKeywords = informationalKeywords.some(keyword => 
        userText.toLowerCase().includes(keyword)
      );

      const hasCheckInKeywords = checkInKeywords.some(keyword => 
        userText.toLowerCase().includes(keyword)
      );

      // Only validate if it's both informational and about check-ins
      return hasInformationalKeywords && hasCheckInKeywords;
    } catch (error: unknown) {
      const err = error as Error;
      logger.error('Error in checkInInfoAction validation:', err);
      return false;
    }
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: Record<string, unknown> = {},
    callback?: HandlerCallback
  ): Promise<boolean> => {
    try {
      if (!state) return false;
      if (!callback) {
        logger.warn('No callback function provided');
        return false;
      }

      logger.info('=== CHECK-IN INFO HANDLER START ===');
      
      // Get Discord client first
      logger.info('Attempting to get Discord client...');
      let discordService: DiscordService;

      try {
        discordService = await ensureDiscordClient(runtime);
        logger.info('Successfully retrieved Discord service with client');
      } catch (error: unknown) {
        const discordError = error as Error;
        logger.error(`Failed to get Discord client: ${discordError.message || 'Unknown error'}`);

        // Provide basic info without Discord channel data
        await callback(
          {
            text: '❌ Unable to connect to Discord services, but I can still help!\n\n' +
                  '📚 **Team Check-in Schedule Guide**\n\n' +
                  'I can help you set up automated check-ins for your team! Here\'s how it works:\n\n' +
                  '🎯 **Available Check-in Types:**\n' +
                  '• **Daily Standup** - Quick daily updates on progress, blockers, and plans\n' +
                  '• **Sprint Check-in** - Weekly or bi-weekly sprint progress reviews\n' +
                  '• **Mental Health Check-in** - Regular wellness checks for team members\n' +
                  '• **Project Status Update** - Detailed project milestone and deliverable updates\n' +
                  '• **Team Retrospective** - Periodic reflection on team processes and improvements\n\n' +
                  '⏰ **Frequency Options:**\n' +
                  '• Weekdays only (Monday-Friday)\n' +
                  '• Daily (including weekends)\n' +
                  '• Weekly (same day each week)\n' +
                  '• Bi-weekly (every two weeks)\n' +
                  '• Monthly (same date each month)\n\n' +
                  '💡 **Pro Tip:** All times are in UTC timezone, so plan accordingly for your team\'s location.',
          },
          []
        );
        return false;
      }

      let textChannels: Array<{id: string; name: string; type: string}> = [];

      const room = state.data?.room ?? (await runtime.getRoom(message.roomId));
      if (!room) {
        logger.error('No room found for the message');
        return false;
      }

      const serverId = room.serverId;
      if (!serverId) {
        logger.error('No server ID found for room');
        return false;
      }

      logger.info(`Using server ID: ${serverId}`);

      // Fetch all channels from the server
      if (discordService?.client) {
        try {
          logger.info(`Fetching all channels from Discord server with ID: ${serverId}`);
          const guild = discordService?.client.guilds.cache.get(serverId);

          if (guild) {
            const channels = await guild.channels.fetch();
            logger.info(`Found ${channels.size} channels in server ${guild.name}`);

            textChannels = channels
              .filter((channel) => channel && channel.isTextBased?.() && !channel.isDMBased?.())
              .map((channel) => ({
                id: channel.id,
                name: channel.name,
                type: channel.type.toString(),
              }));

            logger.info(`Stored ${textChannels.length} text channels for info display`);
          } else {
            logger.error(`Could not find guild with ID ${serverId}`);
          }
        } catch (error: unknown) {
          const err = error as Error;
          logger.error('Error fetching Discord channels:', err);
        }
      }

      const messageSource = message.content.source as string || room.source || 'unknown';

      // Check if report channel config exists for this server
      logger.info('Checking for existing report channel configuration');
      const roomId = createUniqueUuid(runtime, 'report-channel-config');
      logger.info('Generated roomId:', roomId);

      const memories = await runtime.getMemories({
        roomId: roomId,
        tableName: 'messages',
      });
      logger.info('Retrieved memories:', JSON.stringify(memories, null, 2));

      const existingConfig = memories.find((memory) => {
        const isReportConfig = memory.content.type === 'report-channel-config';
        return isReportConfig;
      });
      logger.info('Found existing config:', existingConfig);

      if (!existingConfig) {
        // First ask for the report channel configuration
        logger.info('Asking user for report channel configuration');

        const channelsList = textChannels
          .map((channel) => `- #${channel.name} (${channel.id})`)
          .join('\n');

        logger.debug(`Generated channels list with ${textChannels.length} channels`);
        await callback(
          {
            text:
              `Let's set up check-ins for your team members! 📅\n\n` +
              `First, I need to know where to send the check-in updates when team members respond.\n\n` +
              `**Available channels:**\n${channelsList}\n\n` +
              `1️⃣ **Channel for Updates:** Which channel from the list above should the updates be posted once collected from users?\n\n` +
              `2️⃣ **Check-in Type:** Choose one of the following:\n` +
              `   • Daily Standup\n` +
              `   • Sprint Check-in\n` +
              `   • Mental Health Check-in\n` +
              `   • Project Status Update\n` +
              `   • Team Retrospective\n\n` +
              `3️⃣ **Channel for Check-ins:** Which channel should team members be checked in from?\n\n` +
              `4️⃣ **Frequency:** How often should check-ins occur?\n` +
              `   • Weekdays\n` +
              `   • Daily\n` +
              `   • Weekly\n` +
              `   • Bi-weekly\n` +
              `   • Monthly\n` +
              `5️⃣ **Time:** What time should check-ins happen? (e.g., 9:00 AM UTC) - Please note all times will be in UTC timezone` +
              `Please remember to type "Record Check-in details" when you're finished to save your configuration.`,
            source: messageSource,
          },
          []
        );
      } else {
        // Ask for check-in schedule details
        logger.info('Asking user for check-in schedule details');
        logger.debug(`Using existing config: ${JSON.stringify(existingConfig)}`);

        const channelsList = textChannels
          .map((channel) => `- #${channel.name} (${channel.id})`)
          .join('\n');

        logger.debug(
          `Generated channels list with ${textChannels.length} channels for existing config`
        );

        await callback(
          {
            text:
              `Let's set up your team check-in schedule! 📅\n\n` +
              `Please provide the following information (you can answer all at once or one by one):\n\n` +
              `1️⃣ **Check-in Type:** Choose one of the following:\n` +
              `   • Daily Standup\n` +
              `   • Sprint Check-in\n` +
              `   • Mental Health Check-in\n` +
              `   • Project Status Update\n` +
              `   • Team Retrospective\n\n` +
              `2️⃣ **Channel for Check-ins:** Which channel should team members be checked in from?\n\n` +
              `**Available channels:**\n${channelsList}\n\n` +
              `3️⃣ **Frequency:** How often should check-ins occur?\n` +
              `   • Weekdays\n` +
              `   • Daily\n` +
              `   • Weekly\n` +
              `   • Bi-weekly\n` +
              `   • Monthly\n` +
              `   • Custom\n\n` +
              `4️⃣ **Time:** What time should check-ins happen? (e.g., 9:00 AM UTC)` +
              `Please remember to type "Record Check-in details" when you're finished to save your configuration.`,
            source: messageSource,
          },
          []
        );
      }

      logger.info('Check-in information provided successfully');
      return true;
    } catch (error: unknown) {
      const err = error as Error;
      logger.error('=== CHECK-IN INFO HANDLER ERROR ===');
      logger.error(`Error providing check-in information: ${err}`);
      logger.error(`Error stack: ${err.stack || 'No stack trace available'}`);
      return false;
    }
  },
  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'How do I set up check-ins for my team?',
        },
      },
      {
        name: '{{botName}}',
        content: {
          text: "I'll explain how to set up team check-ins and walk you through the process.",
          actions: ['CHECK_IN_INFO'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Can you help me understand check-in schedules?',
        },
      },
      {
        name: '{{botName}}',
        content: {
          text: "I'll provide you with comprehensive information about team check-in schedules.",
          actions: ['CHECK_IN_INFO'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'What types of check-ins are available?',
        },
      },
      {
        name: '{{botName}}',
        content: {
          text: "Let me explain the different types of check-ins you can set up for your team.",
          actions: ['CHECK_IN_INFO'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Explain how team check-ins work',
        },
      },
      {
        name: '{{botName}}',
        content: {
          text: "I'll give you a complete guide on how team check-ins function.",
          actions: ['CHECK_IN_INFO'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'lets setup a checkin schedule?',
        },
      },
      {
        name: '{{botName}}',
        content: {
          text: "I'll explain the check-in setup process and guide you through it.",
          actions: ['CHECK_IN_INFO'],
        },
      },
    ],
  ],
};