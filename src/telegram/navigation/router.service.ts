import { Injectable, Logger } from '@nestjs/common';
import { MainMenuHandler } from './main-menu.handler.js';
import { LatestCourseHandler } from './latest-course.handler.js';
import { CoursesHandler } from './courses.handler.js';
import { CategoriesHandler } from './categories.handler.js';
import { AccountHandler } from './account.handler.js';
import { HelpHandler } from './help.handler.js';
import { ContentDeliveryHandler } from '../content/content-delivery.handler.js';

export interface NavigationResponse {
  text: string;
  replyMarkup?: any;
  mediaType?: 'VIDEO' | 'AUDIO' | 'TEXT';
  mediaUrl?: string;
  title?: string;
}

@Injectable()
export class RouterService {
  private readonly logger = new Logger(RouterService.name);

  constructor(
    private mainMenuHandler: MainMenuHandler,
    private latestCourseHandler: LatestCourseHandler,
    private coursesHandler: CoursesHandler,
    private categoriesHandler: CategoriesHandler,
    private accountHandler: AccountHandler,
    private helpHandler: HelpHandler,
    private contentDeliveryHandler: ContentDeliveryHandler
  ) {}

  async handleRoute(route: string, studentId: string): Promise<NavigationResponse> {
    if (route === 'nav:main' || route === '/start') {
      return this.mainMenuHandler.handle(studentId);
    }
    
    if (route.startsWith('nav:latest')) {
      return this.latestCourseHandler.handle(route, studentId);
    }
    
    if (route.startsWith('nav:courses')) {
      return this.coursesHandler.handle(route, studentId);
    }

    if (route.startsWith('nav:categories')) {
      return this.categoriesHandler.handle(route, studentId);
    }

    if (route.startsWith('nav:account')) {
      return this.accountHandler.handle(route, studentId);
    }

    if (route.startsWith('nav:help')) {
      return this.helpHandler.handle(route, studentId);
    }

    if (route.startsWith('content:')) {
      return this.contentDeliveryHandler.handle(route, studentId);
    }

    // Fallback to main menu
    return this.mainMenuHandler.handle(studentId);
  }
}
