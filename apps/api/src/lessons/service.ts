/**
 * Lessons service for business logic and orchestration.
 * 
 * @description Handles all lesson-related business operations including:
 * - Lesson CRUD with permission validation
 * - Search and filtering with user context
 * - Statistics calculation and caching
 * - Cross-domain orchestration for complex operations
 * 
 * This service transforms repository data into domain DTOs and enforces
 * business rules while maintaining transaction safety.
 */

import { logger } from '../shared/monitoring';
import { LessonRepository } from './repository';
import {
  CreateLessonInput,
  UpdateLessonInput,
  LessonSearchFilters,
  LessonSortOptions,
  LessonWithInstructor,
  LessonWithStats,
  LessonWithUserContext,
  LessonSummary
} from './types';
import {
  LessonNotFoundError,
  LessonNotPublishedError,
  LessonPermissionDeniedError,
  LessonValidationError,
  InvalidLessonPriceError,
  LessonHasPurchasesError
} from './errors';
import { UserSession } from '@teach-niche/types';
import prisma, { Prisma } from '@teach-niche/database';

export class LessonService {
  private repository: LessonRepository;

  constructor(repository = new LessonRepository()) {
    this.repository = repository;
  }

  /**
   * Create a new lesson with validation and permission checks.
   * 
   * @param input - Lesson creation data
   * @param instructorSession - Authenticated instructor session
   * @returns Created lesson with instructor details
   * 
   * @throws {LessonValidationError} When input validation fails
   * @throws {InvalidLessonPriceError} When price is out of valid range
   * 
   * @example
   * ```typescript
   * const lesson = await service.createLesson({
   *   title: 'Advanced Kendama Tricks',
   *   description: 'Learn complex kendama moves',
   *   price: 2999,
   *   category: 'advanced'
   * }, instructorSession);
   * ```
   */
  async createLesson(
    input: CreateLessonInput,
    instructorSession: UserSession
  ): Promise<LessonWithInstructor> {
    this.validateLessonInput(input);
    
    // Only instructors can create lessons
    if (instructorSession.role !== 'INSTRUCTOR') {
      throw new LessonPermissionDeniedError('create', instructorSession.uid);
    }

    logger.info('lesson.create.started', {
      instructorId: instructorSession.uid,
      title: input.title,
      price: input.price
    });

    const lessonData = {
      ...input,
      instructorId: instructorSession.uid
    };

    const rawLesson = await this.repository.createLesson(lessonData);
    const lesson = this.transformToLessonWithInstructor(rawLesson);

    logger.info('lesson.create.completed', {
      lessonId: lesson.id,
      instructorId: instructorSession.uid,
      title: lesson.title
    });

    return lesson;
  }

  /**
   * Update an existing lesson with permission validation.
   * 
   * @param lessonId - UUID of lesson to update
   * @param input - Partial lesson data to update
   * @param userSession - Authenticated user session
   * @returns Updated lesson with instructor details
   * 
   * @throws {LessonNotFoundError} When lesson doesn't exist
   * @throws {LessonPermissionDeniedError} When user lacks permission
   */
  async updateLesson(
    lessonId: string,
    input: UpdateLessonInput,
    userSession: UserSession
  ): Promise<LessonWithInstructor> {
    const existingLesson = await this.repository.findById(lessonId, {
      includeInstructor: true
    });

    if (!existingLesson) {
      throw new LessonNotFoundError(lessonId);
    }

    // Only lesson owner or admin can update
    if (existingLesson.instructorId !== userSession.uid && userSession.role !== 'ADMIN') {
      throw new LessonPermissionDeniedError(lessonId, userSession.uid);
    }

    // Validate updates
    if (input.price !== undefined) {
      this.validatePrice(input.price);
    }

    logger.info('lesson.update.started', {
      lessonId,
      userId: userSession.uid,
      updates: Object.keys(input)
    });

    const rawLesson = await this.repository.updateLesson(lessonId, input);
    const lesson = this.transformToLessonWithInstructor(rawLesson);

    logger.info('lesson.update.completed', {
      lessonId,
      userId: userSession.uid
    });

    return lesson;
  }

  /**
   * Get lesson by ID with user context.
   * 
   * @param lessonId - UUID of lesson to retrieve
   * @param userSession - Optional authenticated user session
   * @returns Lesson with stats and user context
   * 
   * @throws {LessonNotFoundError} When lesson doesn't exist
   * @throws {LessonNotPublishedError} When lesson is unpublished and not owned
   */
  async getLessonById(
    lessonId: string,
    userSession?: UserSession
  ): Promise<LessonWithUserContext> {
    const rawLesson = await this.repository.findById(lessonId, {
      includeInstructor: true,
      includePurchases: true,
      includeReviews: true,
      includeTags: true
    });

    if (!rawLesson) {
      throw new LessonNotFoundError(lessonId);
    }

    // Check if user can access unpublished lesson
    if (!rawLesson.published) {
      const canAccess = userSession && (
        rawLesson.instructorId === userSession.uid || 
        userSession.role === 'ADMIN'
      );
      
      if (!canAccess) {
        throw new LessonNotPublishedError(lessonId);
      }
    }

    const stats = await this.repository.getLessonStats(lessonId);
    const lesson = this.transformToLessonWithStats(rawLesson, stats);

    // Add user context if authenticated
    if (userSession) {
      const userContext = await this.buildUserContext(lessonId, userSession);
      return { ...lesson, userContext };
    }

    return lesson;
  }

  /**
   * Search lessons with filters and user context.
   * 
   * @param filters - Search and filter criteria
   * @param sort - Sorting options
   * @param userSession - Optional authenticated user session
   * @returns Array of lessons with stats
   */
  async searchLessons(
    filters: LessonSearchFilters = {},
    sort: LessonSortOptions = { field: 'createdAt', direction: 'desc' },
    userSession?: UserSession
  ): Promise<{ lessons: LessonSummary[]; total: number }> {
    // Non-instructors can only see published lessons
    const searchFilters = {
      ...filters,
      published: userSession?.role === 'INSTRUCTOR' ? filters.published : true
    };

    logger.info('lesson.search.started', {
      filters: searchFilters,
      sort,
      userId: userSession?.uid
    });

    const [rawLessons, total] = await Promise.all([
      this.repository.searchLessons(searchFilters, sort),
      this.repository.countLessons(searchFilters)
    ]);

    const lessons = rawLessons.map(this.transformToLessonSummary);

    logger.info('lesson.search.completed', {
      resultCount: lessons.length,
      total,
      userId: userSession?.uid
    });

    return { lessons, total };
  }

  /**
   * Get lessons by instructor with statistics.
   * 
   * @param instructorId - Firebase UID of instructor
   * @param includeUnpublished - Whether to include unpublished lessons
   * @param userSession - Optional user session for permission check
   * @returns Array of instructor's lessons with stats
   */
  async getLessonsByInstructor(
    instructorId: string,
    includeUnpublished: boolean = false,
    userSession?: UserSession
  ): Promise<LessonWithStats[]> {
    // Only instructor themselves or admin can see unpublished
    const canSeeUnpublished = includeUnpublished && userSession && (
      userSession.uid === instructorId || userSession.role === 'ADMIN'
    );

    const rawLessons = await this.repository.findByInstructorId(
      instructorId,
      canSeeUnpublished || false
    );

    const lessonsWithStats = await Promise.all(
      rawLessons.map(async (rawLesson) => {
        const stats = await this.repository.getLessonStats(rawLesson.id);
        return this.transformToLessonWithStats(rawLesson, stats);
      })
    );

    return lessonsWithStats;
  }

  /**
   * Delete a lesson with safety checks.
   * 
   * @param lessonId - UUID of lesson to delete
   * @param userSession - Authenticated user session
   * @returns True if deletion successful
   * 
   * @throws {LessonNotFoundError} When lesson doesn't exist
   * @throws {LessonPermissionDeniedError} When user lacks permission
   * @throws {LessonHasPurchasesError} When lesson has purchases
   */
  async deleteLesson(
    lessonId: string,
    userSession: UserSession
  ): Promise<boolean> {
    const existingLesson = await this.repository.findById(lessonId, {
      includeInstructor: true,
      includePurchases: true
    });

    if (!existingLesson) {
      throw new LessonNotFoundError(lessonId);
    }

    // Only lesson owner or admin can delete
    if (existingLesson.instructorId !== userSession.uid && userSession.role !== 'ADMIN') {
      throw new LessonPermissionDeniedError(lessonId, userSession.uid);
    }

    // Cannot delete lessons with purchases
    const purchaseCount = existingLesson.purchases?.length || 0;
    if (purchaseCount > 0) {
      throw new LessonHasPurchasesError(lessonId, purchaseCount);
    }

    logger.info('lesson.delete.started', {
      lessonId,
      userId: userSession.uid
    });

    await this.repository.deleteLesson(lessonId);

    logger.info('lesson.delete.completed', {
      lessonId,
      userId: userSession.uid
    });

    return true;
  }

  // === Private Helper Methods ===

  /**
   * Validate lesson input data.
   * 
   * @private
   */
  private validateLessonInput(input: CreateLessonInput): void {
    if (!input.title || input.title.trim().length === 0) {
      throw new LessonValidationError('title', 'Title is required');
    }

    if (input.title.length > 200) {
      throw new LessonValidationError('title', 'Title must be 200 characters or less');
    }

    if (input.description && input.description.length > 2000) {
      throw new LessonValidationError('description', 'Description must be 2000 characters or less');
    }

    this.validatePrice(input.price);
  }

  /**
   * Validate lesson price.
   * 
   * @private
   */
  private validatePrice(price: number): void {
    if (price < 100 || price > 99999) {
      throw new InvalidLessonPriceError(price);
    }
  }

  /**
   * Build user context for authenticated requests.
   * 
   * @private
   */
  private async buildUserContext(
    lessonId: string,
    userSession: UserSession
  ): Promise<{
    isPurchased: boolean;
    hasAccess: boolean;
    userReview?: { id: string; rating: number; comment: string | null };
  }> {
    const [purchase, review] = await Promise.all([
      prisma.purchase.findUnique({
        where: {
          userId_lessonId: {
            userId: userSession.uid,
            lessonId
          }
        }
      }),
      prisma.review.findUnique({
        where: {
          userId_lessonId: {
            userId: userSession.uid,
            lessonId
          }
        }
      })
    ]);

    const isPurchased = !!purchase && purchase.status === 'COMPLETED';
    const hasAccess = isPurchased;

    return {
      isPurchased,
      hasAccess,
      userReview: review ? {
        id: review.id,
        rating: review.rating,
        comment: review.comment
      } : undefined
    };
  }

  /**
   * Transform raw lesson data to LessonWithInstructor DTO.
   * 
   * @private
   */
  private transformToLessonWithInstructor(rawLesson: any): LessonWithInstructor {
    return {
      id: rawLesson.id,
      title: rawLesson.title,
      description: rawLesson.description,
      price: rawLesson.price,
      category: rawLesson.category,
      thumbnailUrl: rawLesson.thumbnailUrl,
      published: rawLesson.published,
      createdAt: rawLesson.createdAt,
      updatedAt: rawLesson.updatedAt,
      instructor: {
        id: rawLesson.instructor.id,
        name: rawLesson.instructor.name,
        email: rawLesson.instructor.email
      }
    };
  }

  /**
   * Transform raw lesson data to LessonWithStats DTO.
   * 
   * @private
   */
  private transformToLessonWithStats(rawLesson: any, stats: any): LessonWithStats {
    const base = this.transformToLessonWithInstructor(rawLesson);
    
    return {
      ...base,
      stats: {
        purchaseCount: stats.purchaseCount,
        averageRating: stats.averageRating,
        reviewCount: stats.reviewCount,
        totalRevenue: stats.totalRevenue
      },
      tags: rawLesson.tags?.map((tag: any) => tag.name) || []
    };
  }

  /**
   * Transform raw lesson data to LessonSummary DTO.
   * 
   * @private
   */
  private transformToLessonSummary(rawLesson: any): LessonSummary {
    const purchaseCount = rawLesson.purchases?.length || 0;
    const reviews = rawLesson.reviews || [];
    const averageRating = reviews.length > 0
      ? reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length
      : null;

    return {
      id: rawLesson.id,
      title: rawLesson.title,
      price: rawLesson.price,
      thumbnailUrl: rawLesson.thumbnailUrl,
      instructor: {
        id: rawLesson.instructor.id,
        name: rawLesson.instructor.name
      },
      stats: {
        purchaseCount,
        averageRating
      }
    };
  }
}