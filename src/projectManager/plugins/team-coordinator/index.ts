// biome-ignore lint/style/useImportType: <explanation>
import type { IAgentRuntime, Plugin } from '@elizaos/core';
// import { checkInFormatAction } from './actions/checkInFormatAction';
import { CheckInService } from './services/CheckInService';
import { logger } from '@elizaos/core';
import { listCheckInSchedules } from './actions/checkInList';
import { TeamUpdateTrackerService } from './services/updateTracker';
import { recordCheckInAction } from './actions/checkInCreate';
import { checkInInfoAction } from './actions/checkInInfo';
import { generateReport } from './actions/reportGenerate';
import { teamMemberUpdatesAction } from './actions/teamMemberUpdate';
import { addTeamMemberAction } from './actions/teamMemberAdd';
import { listTeamMembersAction } from './actions/teamMembersList';
import { updatesFormatAction } from './actions/updateFormat';
import { jimmySupportAction } from './actions/jimmySupport';
import { registerTasks } from './tasks';

/**
 * Plugin for team coordination functionality
 * Handles team member management, availability tracking, and check-ins
 */
export const teamCoordinatorPlugin: Plugin = {
  name: 'team-coordinator',
  description: 'Team Coordinator plugin for managing team activities',
  providers: [],
  actions: [
    // checkInFormatAction,
    jimmySupportAction,
    teamMemberUpdatesAction,
    listCheckInSchedules,
    generateReport,
    recordCheckInAction,
    checkInInfoAction,
    addTeamMemberAction,
    listTeamMembersAction,
    updatesFormatAction,
  ],
  init: async (config: Record<string, string>, runtime: IAgentRuntime) => {
    try {
      logger.info('Initializing Team Coordinator plugin...');

      // Services are now registered manually in projectManager init
      // No service registration here to avoid duplicates

      // Delay task registration to ensure adapter is ready
      logger.info('Scheduling team coordinator tasks registration...');
      
      // Use a retry mechanism to register tasks when adapter is ready
      const registerTasksWithRetry = async (retries = 10, delay = 2000) => {
        for (let i = 0; i < retries; i++) {
          try {
            // Check if both getTasks and adapter are available
            if (runtime.getTasks && typeof runtime.getTasks === 'function' && 
                runtime.adapter && runtime.createTask && typeof runtime.createTask === 'function') {
              logger.info('Runtime and adapters are ready, registering team coordinator tasks...');
              await registerTasks(runtime);
              logger.info('Team coordinator tasks registered successfully');
              return;
            } else {
              logger.info(`Runtime/adapters not ready yet, retrying in ${delay}ms... (attempt ${i + 1}/${retries})`);
              logger.debug(`Available methods: getTasks=${!!runtime.getTasks}, adapter=${!!runtime.adapter}, createTask=${!!runtime.createTask}`);
            }
          } catch (error) {
            logger.warn(`Failed to register tasks (attempt ${i + 1}/${retries}):`, error);
          }
          
          // Wait before next retry (increasing delay)
          await new Promise(resolve => setTimeout(resolve, delay));
          delay = Math.min(delay * 1.2, 5000); // Exponential backoff with max 5 seconds
        }
        
        logger.error('Failed to register team coordinator tasks after all retries - continuing without tasks');
      };

      // Start the retry process asynchronously
      registerTasksWithRetry().catch(error => {
        logger.error('Error in registerTasksWithRetry:', error);
      });

      logger.info('Team Coordinator plugin initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Team Coordinator plugin:', error);
      throw error;
    }
  },
  // Services are now registered manually in projectManager init
  services: [],
};
