import {
  type Action,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  logger,
} from '@elizaos/core';

export const jimmySupportAction: Action = {
  name: 'JIMMY_SUPPORT',
  description:
    'Provides comprehensive overview of Jimmy\'s capabilities and available actions. Shows what Jimmy can help with for project management and team coordination.',
  similes: [
    'JIMMY_SUPPORT',
    'JIMMY_HELP',
    'HELP',
    'SUPPORT',
    'WHAT_CAN_YOU_DO',
    'CAPABILITIES',
    'FEATURES',
    'COMMANDS',
    'ACTIONS',
    'HOW_CAN_YOU_HELP',
    'WHAT_CAN_JIMMY_DO',
    'JIMMY_CAPABILITIES',
    'JIMMY_FEATURES',
    'JIMMY_COMMANDS',
    'JIMMY_ACTIONS',
    'HELP_ME',
    'ASSIST',
    'GUIDE',
    'WHAT_ARE_YOUR_FUNCTIONS',
    'WHAT_DO_YOU_SUPPORT',
    'AVAILABLE_ACTIONS',
    'AVAILABLE_FEATURES',
    'AVAILABLE_COMMANDS',
  ],
  validate: async (runtime: IAgentRuntime, message: Memory, state: State | undefined): Promise<boolean> => {
    try {
      if (!state) return false;
      
      const userText = message.content.text as string;
      if (!userText) return false;

      // Check if user is asking for help, support, or what Jimmy can do
      const supportKeywords = [
        'help', 'support', 'what can you do', 'what can jimmy do', 'capabilities', 
        'features', 'commands', 'actions', 'how can you help', 'assist', 'guide',
        'what are your functions', 'what do you support', 'available'
      ];

      const hasHelpKeyword = supportKeywords.some(keyword => 
        userText.toLowerCase().includes(keyword)
      );

      // Also check for question patterns that indicate need for help
      const questionPatterns = [
        'how', 'what', 'can you', 'do you', 'are you able', 'help me'
      ];

      const hasQuestionPattern = questionPatterns.some(pattern => 
        userText.toLowerCase().includes(pattern)
      );

      return hasHelpKeyword || hasQuestionPattern;
    } catch (error: unknown) {
      const err = error as Error;
      logger.error('Error in jimmySupportAction validation:', err);
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

      logger.info('=== JIMMY SUPPORT HANDLER START ===');

      const messageSource = message.content.source as string || 'unknown';

      const supportMessage = `👋 **Hello! I'm Jimmy, your Project Manager assistant!**

I'm here to help you manage your team and projects efficiently. Here's what I can do for you:

## 🔧 **Team Management**
**• Add Team Members** - Register team members with their contact info and update formats
   *Example: "Add Sarah to DevRel section with Discord @sarah and update format: What did you accomplish, What's next, Any blockers"*

**• List Team Members** - View all registered team members organized by section
   *Example: "Show me all team members" or "List team members"*

## 📅 **Check-in Scheduling**
**• Set Up Check-ins** - Create automated check-in schedules for your team
   *Example: "How do I set up check-ins?" (I'll guide you through the process)*

**• Record Check-in Details** - Save specific check-in configurations
   *Example: "Record check-in details: Daily Standup, #general channel, Daily, 9 AM UTC"*

**• List Check-in Schedules** - View all configured check-in schedules
   *Example: "List all check-in schedules" or "Show check-in schedules"*

## 📊 **Updates & Reporting**
**• Record Team Updates** - Capture individual team member progress updates
   *Example: "Record update for Sarah: Completed API integration, Working on documentation tomorrow, No blockers"*

**• Generate Reports** - Create comprehensive team progress reports with AI analysis
   *Example: "Generate daily standup report" or "Show team progress"*

**• View Update Format** - See the specific update format for any team member
   *Example: "What's my update format?" or "Show update format"*

## 🎯 **Available Check-in Types**
- **Daily Standup** - Quick daily progress updates
- **Sprint Check-in** - Weekly/bi-weekly sprint reviews  
- **Mental Health Check-in** - Team wellness checks
- **Project Status Update** - Detailed project milestone updates
- **Team Retrospective** - Process improvement discussions

## 💡 **Getting Started**
1. **First time?** Ask me "How do I set up check-ins?" and I'll walk you through the process
2. **Add your team** with "Add team members" and provide their details
3. **Set up schedules** for different types of check-ins
4. **Generate reports** anytime to see team progress

## 📝 **Tips for Best Results**
- Be specific with your requests
- Include team member names when recording updates
- Use clear section names when organizing team members
- All times are in UTC timezone for consistency

**Ready to get started?** Just tell me what you'd like to do, and I'll help you manage your team more effectively! 🚀

*Need help with something specific? Just ask! I'm designed to handle all your project management needs.*`;

      await callback(
        {
          text: supportMessage,
          source: messageSource,
        },
        []
      );

      logger.info('Jimmy support information provided successfully');
      return true;
    } catch (error: unknown) {
      const err = error as Error;
      logger.error('=== JIMMY SUPPORT HANDLER ERROR ===');
      logger.error(`Error providing support information: ${err}`);
      logger.error(`Error stack: ${err.stack || 'No stack trace available'}`);
      return false;
    }
  },
  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'What can you do?',
        },
      },
      {
        name: '{{botName}}',
        content: {
          text: "I'll show you all my capabilities and how I can help you with project management.",
          actions: ['JIMMY_SUPPORT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Help me',
        },
      },
      {
        name: '{{botName}}',
        content: {
          text: "I'll provide you with a comprehensive overview of how I can assist you.",
          actions: ['JIMMY_SUPPORT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'What are your capabilities?',
        },
      },
      {
        name: '{{botName}}',
        content: {
          text: "Let me show you all the features and capabilities I have to help manage your team.",
          actions: ['JIMMY_SUPPORT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'How can you help me?',
        },
      },
      {
        name: '{{botName}}',
        content: {
          text: "I'll explain all the ways I can assist you with project management and team coordination.",
          actions: ['JIMMY_SUPPORT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'What can Jimmy do?',
        },
      },
      {
        name: '{{botName}}',
        content: {
          text: "I'll provide you with a complete overview of Jimmy's features and capabilities.",
          actions: ['JIMMY_SUPPORT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Show me available actions',
        },
      },
      {
        name: '{{botName}}',
        content: {
          text: "I'll show you all the actions and features available to help you manage your team.",
          actions: ['JIMMY_SUPPORT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'I need help',
        },
      },
      {
        name: '{{botName}}',
        content: {
          text: "I'm here to help! Let me show you everything I can do for you.",
          actions: ['JIMMY_SUPPORT'],
        },
      },
    ],
  ],
};