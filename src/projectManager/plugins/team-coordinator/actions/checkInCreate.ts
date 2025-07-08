import {
  type Action,
  ChannelType,
  type Content,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  ModelType,
  type State,
  type Service,
  composePromptFromState,
  createUniqueUuid,
  type UUID,
  getUserServerRole,
  getWorldSettings,
  logger,
  parseJSONObjectFromText,
} from '@elizaos/core';

interface DiscordComponentInteraction {
  customId: string;
  componentType: number;
  values?: string[];
  selections?: Record<string, string[]>;
}

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
  source?: string; // Add source field
}

interface CheckInSchedule {
  type: string;
  scheduleId: UUID;
  teamMemberUserName?: string;
  checkInType: string;
  channelId: string;
  frequency: 'DAILY' | 'WEEKLY' | 'BI-WEEKLY' | 'MONTHLY' | 'WEEKDAYS';
  checkInTime: string;
  source: string;
  createdAt: string;
  serverId: string;
}

// Required Discord configuration fields
const REQUIRED_DISCORD_FIELDS = [
  'PROJECT_MANAGER_DISCORD_APPLICATION_ID',
  'PROJECT_MANAGER_DISCORD_API_TOKEN',
];

/**
 * Validates the Discord configuration for a specific server.
 * @param {IAgentRuntime} runtime - The Agent runtime.
 * @param {string} serverId - The ID of the server to validate.
 * @returns {Promise<{ isValid: boolean; error?: string }>}
 */
async function validateDiscordConfig(
  runtime: IAgentRuntime,
  serverId: string
): Promise<{ isValid: boolean; error?: string }> {
  try {
    return { isValid: true };
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error validating Discord config:', err);
    return {
      isValid: false,
      error: 'Error validating Discord configuration',
    };
  }
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

    // Log what's in the service to see its structure
    logger.info(`Discord service structure: ${JSON.stringify(Object.keys(discordService))}`);

    // Check if client exists and is ready
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

export const recordCheckInAction: Action = {
  name: 'RECORD_CHECK_IN',
  description:
    'Processes and saves complete check-in configuration data when user explicitly provides all required details including check-in type, channel, frequency, and time. Only triggers when user says "Record check-in details" followed by specific configuration parameters.',
  similes: [],
  validate: async (runtime: IAgentRuntime, message: Memory, state: State | undefined): Promise<boolean> => {
    try {
      if (!state) return false;
      
      const userText = message.content.text as string;
      if (!userText) return false;

      // Only validate if the message explicitly contains "Record" and configuration details
      const hasRecordKeyword = userText.toLowerCase().includes('record');
      const hasConfigDetails = userText.toLowerCase().includes('check-in type') || 
                              userText.toLowerCase().includes('frequency') || 
                              userText.toLowerCase().includes('channel');

      if (!hasRecordKeyword || !hasConfigDetails) {
        logger.info('Message does not contain "record" keyword or configuration details');
        return false;
      }
      
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
      return true;
    } catch (error: unknown) {
      const err = error as Error;
      logger.error('Error in recordCheckInAction validation:', err);
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

      // Add a flag to prevent duplicate execution
      const executionKey = `record-check-in-${message.id}`;
      if (state.data[executionKey]) {
        logger.info('Action already executed for this message, skipping');
        return true;
      }
      state.data[executionKey] = true;
      
      // Get Discord client first
      logger.info('Attempting to get Discord client...');
      let discordService: DiscordService;

      try {
        discordService = await ensureDiscordClient(runtime);
        logger.info('Successfully retrieved Discord service with client');
      } catch (error: unknown) {
        const discordError = error as Error;
        logger.error(`Failed to get Discord client: ${discordError.message || 'Unknown error'}`);

        // Try to proceed anyway or handle gracefully
        await callback(
          {
            text: '❌ Unable to connect to Discord services. Please try again later or contact support.',
          },
          []
        );
        return false;
      }

      let textChannels: Array<{id: string; name: string; type: string}> = [];

      // Check if Discord connection is established
      logger.info('Checking Discord connection status...');

      // Get room and server ID
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

            // Define textChannels property if it doesn't exist
            textChannels = channels
              .filter((channel) => channel && channel.isTextBased?.() && !channel.isDMBased?.())
              .map((channel) => ({
                id: channel.id,
                name: channel.name,
                type: channel.type.toString(),
              }));

            logger.info(`Stored ${textChannels.length} text channels for forms`);
            logger.info('Text channels:', JSON.stringify(textChannels));
          } else {
            logger.error(`Could not find guild with ID ${serverId}`);
          }
        } catch (error: unknown) {
          const err = error as Error;
          logger.error('Error fetching Discord channels:', err);
          logger.debug('Error details:', err instanceof Error ? err.stack : String(err));
        }
      } else {
        logger.warn('Discord service or client is not available');
      }

      logger.info('Text channels variable:', textChannels);

      // Rest of your existing handler code...
      logger.info('=== RECORD-CHECK-IN HANDLER START ===');
      logger.info('Message content received:', JSON.stringify(message.content, null, 2));

      // Extract check-in details from user message
      logger.info('Extracting check-in details from user message');
      const userText = message.content.text as string;

      if (!userText) {
        logger.warn('No text content found in message');
        return false;
      }

      // Check if report channel config exists for this server
      logger.info('Checking for existing report channel configuration');
      const roomId = createUniqueUuid(runtime, 'report-channel-config');
      logger.info('Generated roomId:', roomId);

      // Add table name to getMemories call
      const memories = await runtime.getMemories({
        roomId: roomId,
        tableName: 'messages',
      });
      logger.info('Retrieved memories:', JSON.stringify(memories, null, 2));
      logger.debug('Raw memories object:', memories);

      logger.info('Looking for existing config with serverId:', serverId);
      const existingConfig = memories.find((memory) => {
        logger.info('Checking memory:', memory);
        const isReportConfig = memory.content.type === 'report-channel-config';

        return isReportConfig;
      });
      logger.info('Found existing config:', existingConfig);
      
      // Get message source
      const messageSource = message.content.source as string || room.source || 'unknown';

      const configPrompt = `Determine if the user is providing specific check-in configuration details.

Examples of configuration details:
- "Check-in Type: Daily Standup, Channel: general, Frequency: Daily, Time: 9:00 AM"
- "Record check-in details: Sprint check-in, weekly, 2 PM"
- Contains multiple configuration parameters

Return TRUE if the user is providing specific check-in configuration details.
Return FALSE if the user is asking general questions or needs guidance.

Analyze this text and respond with ONLY the word "true" or "false" (lowercase):
"${userText}"`;

      const parsedConfigResponse = await runtime.useModel(ModelType.TEXT_LARGE, {
        prompt: configPrompt,
        stopSequences: [],
      });

      logger.info('Configuration check response:', parsedConfigResponse);

      // Only proceed if user is providing actual configuration details
      if (parsedConfigResponse.trim().toLowerCase() === 'false') {
        logger.info('User is not providing configuration details, suggesting they use info action');
        
        await callback(
          {
            text: '📋 I can help you create a check-in schedule! However, I need specific configuration details to proceed.\n\n' +
                  'If you need guidance on how to set up check-ins, please ask me "How do I set up check-ins?" first.\n\n' +
                  'If you\'re ready to configure, please provide:\n' +
                  '• Check-in type (Daily Standup, Sprint Check-in, etc.)\n' +
                  '• Channel for check-ins\n' +
                  '• Frequency (Daily, Weekly, etc.)\n' +
                  '• Time (e.g., 9:00 AM UTC)\n\n' +
                  'Then say "Record check-in details" to save your configuration.',
            source: messageSource,
          },
          []
        );
        return true;
      }

      // Continue with parsing check-in details
      logger.info('User is providing check-in configuration, proceeding to parse');

      let checkInConfig: any;

      try {
        const prompt = `Extract the following fields from this check-in configuration text:
        
Return ONLY a valid JSON object with these exact keys:
{
  "channelForUpdates": "value",
  "checkInType": "value",
  "channelForCheckIns": "value", 
  "frequency": "value",
  "time": "value"
}

Note: 
- checkInType must be one of: STANDUP, SPRINT, MENTAL_HEALTH, PROJECT_STATUS, RETRO
- For channels, extract only the name (e.g., from #General (922791729709613101) extract "General")
- Convert AM/PM time to 24 hour format
        
Text to parse: "${userText}"`;

        const parsedResponse = await runtime.useModel(ModelType.TEXT_LARGE, {
          prompt,
          stopSequences: [],
        });

        checkInConfig = parseJSONObjectFromText(parsedResponse);
        logger.info('Successfully parsed check-in configuration:', checkInConfig);
      } catch (error: unknown) {
        const err = error as Error;
        logger.error('Failed to parse check-in configuration:', err);
        if (callback) {
          callback({
            text: 'Failed to parse check-in configuration. Please provide the information in the correct format.',
          });
        }
        return false;
      }

      // Get channel IDs from the parsed configuration
      logger.info('Finding channel IDs for the parsed configuration');

      // Find channel ID for updates based on channel name
      const updateChannelName = checkInConfig.channelForUpdates?.toLowerCase();
      const updateChannel = textChannels.find(
        (channel) => channel.name.toLowerCase() === updateChannelName
      );

      // Find channel ID for check-ins based on channel name
      const checkInChannelName = checkInConfig.channelForCheckIns?.toLowerCase();
      const checkInChannel = textChannels.find(
        (channel) => channel.name.toLowerCase() === checkInChannelName
      );

      logger.info(
        `Update channel found: ${updateChannel?.id || 'Not found'} for name: ${updateChannelName}`
      );
      logger.info(
        `Check-in channel found: ${checkInChannel?.id || 'Not found'} for name: ${checkInChannelName}`
      );

      // Update the config with the channel IDs
      checkInConfig.updateChannelId = updateChannel?.id || '';
      checkInConfig.checkInChannelId = checkInChannel?.id || '';

      logger.info('Updated check-in configuration with channel IDs:', checkInConfig);

      // TODO : after things are parsed now store the check in form for group
      // TODO : store the check in storage

      if (!existingConfig) {
        logger.info('No existing report channel config found, creating new one');
        try {
          // Extract source information
          const messageSource = message.content.source as string || room.source || 'unknown';

          logger.info(`Message source for report config: ${messageSource}`);

          const config: ReportChannelConfig = {
            serverId: serverId,
            // TODO : have to fetch server name
            serverName: 'Unknown Server', // Added default server name
            channelId: checkInConfig.updateChannelId || '',
            source: messageSource, // Add source
            createdAt: new Date().toISOString(),
          };

          logger.info('Creating new report channel config:', config);

          // First create the room to avoid foreign key constraint error
          logger.info(`Creating room with ID: ${roomId}`);
          try {
            await runtime.ensureRoomExists({
              id: roomId as UUID,
              name: 'Report Channel Configurations',
              source: 'team-coordinator',
              type: ChannelType.GROUP,
              worldId: runtime.agentId,
            });
            logger.info(`Successfully created room with ID: ${roomId}`);
          } catch (roomError: unknown) {
            const roomErrorInstance = roomError as Error;
            logger.error(`Failed to create room: ${roomErrorInstance.message}`);
            logger.error(`Room error stack: ${roomErrorInstance.stack}`);
            // Continue even if room creation fails - it might already exist
          }

          const memory = {
            id: createUniqueUuid(runtime, `report-channel-config-${serverId}`),
            entityId: runtime.agentId,
            agentId: runtime.agentId,
            content: {
              type: 'report-channel-config',
              config,
            },
            roomId: roomId,
            createdAt: Date.now(),
          };

          await runtime.createMemory(memory, 'messages');
          logger.info('Successfully stored new report channel config');
        } catch (configError: unknown) {
          const err = configError as Error;
          logger.error('Failed to store report channel config:', err);
          logger.error('Error stack:', err.stack || 'No stack trace');
        }
      }

      // Store check-in schedule
      try {
        logger.info('Storing check-in schedule:', checkInConfig);

        // Extract source information from the message or room
        const messageSource = message.content.source as string || room.source || 'unknown';

        logger.info(`Message source: ${messageSource}`);

        const schedule: CheckInSchedule = {
          type: 'team-member-checkin-schedule',
          scheduleId: createUniqueUuid(runtime, `schedule-${Date.now()}`),
          // teamMemberUserName: checkInConfig.userDisplayName,
          checkInType: checkInConfig.checkInType || 'STANDUP',
          channelId: checkInConfig.checkInChannelId || '',
          frequency: (checkInConfig.frequency || 'WEEKLY') as CheckInSchedule['frequency'],
          checkInTime: checkInConfig.time || '09:00',
          source: messageSource, // Add the source information
          createdAt: new Date().toISOString(),
          serverId: serverId,
        };

        const checkInRoomId = createUniqueUuid(runtime, 'check-in-schedules');

        // Use the same roomId as above to avoid foreign key constraint error
        logger.info(`Using existing room with ID: ${roomId} for check-in schedules`);

        // Ensure the room exists before storing the memory
        try {
          await runtime.ensureRoomExists({
            id: checkInRoomId as UUID,
            name: 'Check-in Schedules',
            source: 'team-coordinator',
            type: ChannelType.GROUP,
            worldId: runtime.agentId,
          });
          logger.info(`Successfully ensured room exists with ID: ${roomId}`);
        } catch (roomError: unknown) {
          const err = roomError as Error;
          logger.error(`Failed to ensure room exists: ${err.message || 'Unknown error'}`);
          logger.error(`Room error stack: ${err.stack || 'No stack trace'}`);
          // Continue even if room creation fails - it might already exist
        }

        const scheduleMemory = {
          id: createUniqueUuid(runtime, `checkin-schedule-${schedule.scheduleId}-${Date.now()}`),
          entityId: runtime.agentId,
          agentId: runtime.agentId,
          content: {
            type: 'team-member-checkin-schedule',
            schedule,
          },
          roomId: checkInRoomId, // Use the same roomId that was created earlier
          createdAt: Date.now(),
        };

        logger.info('Storing check-in schedule in memory:', scheduleMemory);
        await runtime.createMemory(scheduleMemory, 'messages');
        logger.info('Successfully stored check-in schedule in memory');
      } catch (scheduleError: unknown) {
        const err = scheduleError as Error;
        logger.error('Failed to store check-in schedule:', err);
        logger.error('Error stack:', err.stack || 'No stack trace');
      }
      // Send success message to the user
      logger.info('Sending success message to user');
      await callback(
        {
          text: '✅ Check-in schedule has been successfully created! Team members will be prompted according to your configured schedule.',
        },
        []
      );
      logger.info('Check-in setup message sent successfully');
      return true;
    } catch (error: unknown) {
      const err = error as Error;
      logger.error('=== CHECK-IN HANDLER ERROR ===');
      logger.error(`Error processing check-in schedule setup: ${err}`);
      logger.error(`Error stack: ${err.stack || 'No stack trace available'}`);
      return false;
    }
  },
  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Record check-in details\nCheck-in Type: Daily Standup\nChannel for Check-ins: standup-channel\nFrequency: Daily\nTime: 9 AM UTC',
        },
      },
      {
        name: '{{botName}}',
        content: {
          text: "✅ Check-in schedule has been successfully created! Team members will be prompted according to your configured schedule.",
          actions: ['RECORD_CHECK_IN'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Record check-in details\nCheck-in Type: Mental Health Check-in\nChannel for Check-ins: team-channel\nFrequency: Weekly\nTime: 2 PM UTC',
        },
      },
      {
        name: '{{botName}}',
        content: {
          text: "✅ Check-in schedule has been successfully created! Team members will be prompted according to your configured schedule.",
          actions: ['RECORD_CHECK_IN'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Record check-in details: Sprint check-in, channel: sprint-updates, frequency: weekly, time: 10:00 AM UTC',
        },
      },
      {
        name: '{{botName}}',
        content: {
          text: "✅ Check-in schedule has been successfully created! Team members will be prompted according to your configured schedule.",
          actions: ['RECORD_CHECK_IN'],
        },
      },
    ],
  ],
};
