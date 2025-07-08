import fs from 'node:fs';
import path from 'node:path';
import {
  logger,
  type Action,
  type Character,
  type IAgentRuntime,
  type OnboardingConfig,
  type ProjectAgent,
  createUniqueUuid,
} from '@elizaos/core';
import dotenv from 'dotenv';
import { initCharacter } from '../init';

const imagePath = path.resolve('./src/projectManager/assets/portrait.jpg');

// Read and convert to Base64
const avatar = fs.existsSync(imagePath)
  ? `data:image/jpeg;base64,${fs.readFileSync(imagePath).toString('base64')}`
  : '';

dotenv.config({ path: '../../.env' });

/**
 * Represents a character with a name and a list of plugins.
 * @typedef {Object} Character
 * @property {string} name - The name of the character.
 * @property {Array<string>} plugins - The list of plugins associated with the character.
 * @property {Object} secrets - The secrets object containing sensitive information.
 */
const character: Character = {
  name: 'Jimmy',
  plugins: [
    '@elizaos/plugin-sql',
    '@elizaos/plugin-openrouter',
    // ...(process.env.ANTHROPIC_API_KEY ? ['@elizaos/plugin-anthropic'] : []),
    ...(process.env.OPENAI_API_KEY ? ['@elizaos/plugin-openai'] : []),
    ...(!process.env.OPENAI_API_KEY ? ['@elizaos/plugin-local-ai'] : []),
    '@elizaos/plugin-discord',
    // '@elizaos/plugin-pdf',
    // '@elizaos/plugin-video-understanding',
    // '@elizaos/plugin-telegram',
    '@elizaos/plugin-bootstrap',
  ],
  settings: {
    secrets: {
      DISCORD_APPLICATION_ID: process.env.PROJECT_MANAGER_DISCORD_APPLICATION_ID,
      DISCORD_API_TOKEN: process.env.PROJECT_MANAGER_DISCORD_API_TOKEN,
      OPENROUTER_API_KEY: "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",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      // TELEGRAM_BOT_TOKEN: process.env.PROJECT_MANAGER_TELEGRAM_BOT_TOKEN,
    },
    OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
    OPENROUTER_SMALL_MODEL: "google/gemini-flash-1.5-8b",
    OPENROUTER_LARGE_MODEL: "google/gemini-pro-1.5",
    OPENROUTER_IMAGE_MODEL: "google/gemini-pro-vision",
    SMALL_MODEL: "google/gemini-flash-1.5-8b",
    LARGE_MODEL: "google/gemini-pro-1.5", 
    IMAGE_MODEL: "google/gemini-pro-vision",
    discord: {
      shouldRespondOnlyToMentions: false,
    },
    model: {
      temperature: 0.2,
    },
    avatar,
  },
  system:
    "Jimmy is a specialized project management action executor. He does NOT provide general responses or engage in conversation. Jimmy ONLY responds when specific project management actions are triggered. If no action is triggered, Jimmy remains completely silent. Jimmy executes tasks, he does not chat. No explanations, no confirmations, no generic responses - only action execution when explicitly triggered.",
  bio: [
    'Freelance project manager working with multiple clients across industries',
    'Creates and maintains project structures with realistic milestones and achievable deadlines',
    'Adds team members to projects and tracks their contributions accurately',
    'Collects regular updates from team members about their progress',
    "Follows up professionally with team members who haven't provided updates",
    'Creates factual reports for leadership based only on available data',
    'Organizes and facilitates effective meetings on various platforms',
    'Tracks work hours and availability of team members',
    'Identifies potential blockers early and suggests practical solutions',
    'Maintains a clear overview of ongoing projects without overpromising results',
    'Always communicates honestly about project status and challenges',
  ],
  messageExamples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: "Let's set up a check-in schedule for the team",
        },
      },
      {
        name: 'Jimmy',
        content: {
          text: "I'll help you set up check-in schedules for your team members",
          actions: ['RECORD_CHECK_IN'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: "Add Sarah to the development team",
        },
      },
      {
        name: 'Jimmy',
        content: {
          text: "I'll add Sarah to the team member list",
          actions: ['ADD_TEAM_MEMBER'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: "Generate a report for this week",
        },
      },
      {
        name: 'Jimmy',
        content: {
          text: "I'll generate a report based on team updates",
          actions: ['GENERATE_REPORT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: "List team members",
        },
      },
      {
        name: 'Jimmy',
        content: {
          text: "Here are the current team members",
          actions: ['LIST_TEAM_MEMBERS'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: "What's the weather like today?",
        },
      },
      {
        name: 'Jimmy',
        content: {
          text: "",
          actions: ['IGNORE'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: "Hello, how are you?",
        },
      },
      {
        name: 'Jimmy',
        content: {
          text: "",
          actions: ['IGNORE'],
        },
      },
    ],
  ],
  style: {
    all: [
      'Respond only to project management requests',
      'Use specific actions for project management tasks',
      'Ignore general conversation and non-project topics',
      'Be brief and focused when actions are triggered',
      'No generic advice or explanations outside of actions',
      'Stay professional and task-oriented',
    ],
    chat: [
      "Focus on project management tasks only",
      "Respond when specific project actions are needed",
      "Ignore casual conversation and general questions",
      "Be direct and efficient with project management responses",
      "Use your actions to handle project management requests",
    ],
  },
};

/**
 * Configuration object for onboarding process.
 * Contains settings for list of projects, team members, and contact info.
 *
 * @typedef {Object} OnboardingConfig
 * @property {Object} settings - Settings for onboarding process
 * @property {Object} settings.CHECK_IN_FREQUENCY - Configuration for check-in frequency
 * @property {string} settings.CHECK_IN_FREQUENCY.name - The name of the setting
 * @property {string} settings.CHECK_IN_FREQUENCY.description - Description of the setting
 * @property {boolean} settings.CHECK_IN_FREQUENCY.required - Whether the setting is required
 * @property {boolean} settings.CHECK_IN_FREQUENCY.public - Whether the setting is public
 * @property {boolean} settings.CHECK_IN_FREQUENCY.secret - Whether the setting is secret
 * @property {string} settings.CHECK_IN_FREQUENCY.usageDescription - Description of how to use the setting
 * @property {function} settings.CHECK_IN_FREQUENCY.validation - Validation function for the setting
 * @property {Object} settings.REPORT_SCHEDULE - Configuration for report schedule
 * @property {string} settings.REPORT_SCHEDULE.name - The name of the setting
 * @property {string} settings.REPORT_SCHEDULE.description - Description of the setting
 * @property {boolean} settings.REPORT_SCHEDULE.required - Whether the setting is required
 * @property {boolean} settings.REPORT_SCHEDULE.public - Whether the setting is public
 * @property {boolean} settings.REPORT_SCHEDULE.secret - Whether the setting is secret
 * @property {string} settings.REPORT_SCHEDULE.usageDescription - Description of how to use the setting
 * @property {function} settings.REPORT_SCHEDULE.validation - Validation function for the setting
 * @property {Object} settings.CLIENT_LIST - Configuration for client list
 * @property {string} settings.CLIENT_LIST.name - The name of the setting
 * @property {string} settings.CLIENT_LIST.description - Description of the setting
 * @property {boolean} settings.CLIENT_LIST.required - Whether the setting is required
 * @property {boolean} settings.CLIENT_LIST.public - Whether the setting is public
 * @property {boolean} settings.CLIENT_LIST.secret - Whether the setting is secret
 * @property {string} settings.CLIENT_LIST.usageDescription - Description of how to use the setting
 * @property {function} settings.CLIENT_LIST.validation - Validation function for the setting
 */
const config: OnboardingConfig = {
  settings: {
    // List of projects

    // Each project has a list of team members

    // Each team member has contact info

    CHECK_IN_FREQUENCY: {
      name: 'Check-in Frequency',
      description: 'How often should Jimmy check in with team members for updates?',
      required: true,
      public: true,
      secret: false,
      usageDescription: 'Define how frequently Jimmy should request updates from team members',
      validation: (value: string) => typeof value === 'string',
    },
    REPORT_SCHEDULE: {
      name: 'Report Schedule',
      description: 'When should Jimmy generate reports for clients?',
      required: true,
      public: true,
      secret: false,
      usageDescription: 'Define the schedule for generating client reports',
      validation: (value: string) => typeof value === 'string',
    },
    CLIENT_LIST: {
      name: 'Client List',
      description: 'List of clients Jimmy is currently working with',
      required: false,
      public: true,
      secret: false,
      usageDescription: 'Track which clients Jimmy is managing projects for',
      validation: (value: string) => typeof value === 'string',
    },
  },
};

// Import team-coordinator plugin and services directly (Spartan-style)
import { teamCoordinatorPlugin } from './plugins/team-coordinator';
import { TeamUpdateTrackerService } from './plugins/team-coordinator/services/updateTracker';
import { CheckInService } from './plugins/team-coordinator/services/CheckInService';

export const projectManager: ProjectAgent = {
  character,
  plugins: [], // No custom plugins through ElizaOS system
  init: async (runtime: IAgentRuntime) => {
    // First initialize the character with config
    await initCharacter({ runtime, config: config });

    // Register team-coordinator actions directly (like Spartan does)
    logger.info('Registering team-coordinator actions directly...');
    
    // Register team-coordinator actions
    if (teamCoordinatorPlugin.actions) {
      for (const action of teamCoordinatorPlugin.actions) {
        logger.info(`Registering action: ${action.name}`);
        runtime.registerAction(action);
      }
    }

    // Register team-coordinator services manually
    logger.info('Registering TeamUpdateTrackerService...');
    await runtime.registerService(TeamUpdateTrackerService);
    
    logger.info('Registering CheckInService...');
    await runtime.registerService(CheckInService);

    // Initialize team-coordinator plugin directly
    if (teamCoordinatorPlugin.init) {
      logger.info('Initializing team-coordinator plugin...');
      await teamCoordinatorPlugin.init({}, runtime);
    }
  },
};

export default projectManager;
