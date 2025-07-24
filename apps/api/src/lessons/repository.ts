/**
 * Lessons repository for database operations.
 * 
 * @description Handles all lesson-related database queries and mutations.
 * Supports optional transaction clients for cross-domain operations.
 * Works directly with Prisma types and provides transaction-safe methods
 * that can be orchestrated by other domains.
 */

import prisma, { Lesson, Prisma } from '@teach-niche/database';
import {
  LessonWithRelations,
  LessonQueryOptions,
  LessonCreateData,
  LessonUpdateData,
  LessonSearchFilters,
  LessonSortOptions
} from './types';

export class LessonRepository {
  /**
   * Find lesson by ID with optional related data.
   * 
   * @param lessonId - UUID of the lesson
   * @param options - Query options for including related data
   * @param tx - Optional transaction client for atomic operations
   * @returns Lesson with requested relations or null if not found
   * 
   * @example
   * ```typescript
   * const lesson = await repo.findById('lesson-123', {
   *   includeInstructor: true,
   *   includeStats: true
   * });
   * ```
   */
  async findById(
    lessonId: string,
    options: LessonQueryOptions = {},
    tx?: Prisma.TransactionClient
  ): Promise<LessonWithRelations | null> {
    const db = tx || prisma;
    
    return await db.lesson.findUnique({
      where: { id: lessonId },
      include: {
        instructor: options.includeInstructor || false,
        purchases: options.includePurchases ? {
          include: { user: true }
        } : false,
        reviews: options.includeReviews ? {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' }
        } : false,
        tags: options.includeTags || false
      }
    });
  }

  /**
   * Find multiple lessons by IDs.
   * 
   * @param lessonIds - Array of lesson UUIDs
   * @param options - Query options for including related data
   * @param tx - Optional transaction client
   * @returns Array of lessons with requested relations
   */
  async findByIds(
    lessonIds: string[],
    options: LessonQueryOptions = {},
    tx?: Prisma.TransactionClient
  ): Promise<LessonWithRelations[]> {
    const db = tx || prisma;
    
    return await db.lesson.findMany({
      where: { id: { in: lessonIds } },
      include: {
        instructor: options.includeInstructor || false,
        purchases: options.includePurchases || false,
        reviews: options.includeReviews || false,
        tags: options.includeTags || false
      }
    });
  }

  /**
   * Search lessons with filters and sorting.
   * 
   * @param filters - Search and filter criteria
   * @param sort - Sorting options
   * @param tx - Optional transaction client
   * @returns Array of matching lessons with instructor data
   */
  async searchLessons(
    filters: LessonSearchFilters = {},
    sort: LessonSortOptions = { field: 'createdAt', direction: 'desc' },
    tx?: Prisma.TransactionClient
  ): Promise<LessonWithRelations[]> {
    const db = tx || prisma;
    
    const where: Prisma.LessonWhereInput = {
      ...(filters.query && {
        OR: [
          { title: { contains: filters.query, mode: 'insensitive' } },
          { description: { contains: filters.query, mode: 'insensitive' } },
          { category: { contains: filters.query, mode: 'insensitive' } }
        ]
      }),
      ...(filters.category && { category: filters.category }),
      ...(filters.instructorId && { instructorId: filters.instructorId }),
      ...((filters.minPrice || filters.maxPrice) && {
        price: {
          ...(filters.minPrice && { gte: filters.minPrice }),
          ...(filters.maxPrice && { lte: filters.maxPrice })
        }
      }),
      ...(filters.published !== undefined && { published: filters.published })
    };

    const orderBy = this.buildOrderBy(sort);

    return await db.lesson.findMany({
      where,
      include: {
        instructor: { select: { id: true, name: true, email: true } },
        purchases: { select: { id: true, amount: true } },
        reviews: { select: { id: true, rating: true } }
      },
      orderBy,
      take: filters.limit || 20,
      skip: filters.offset || 0
    });
  }

  /**
   * Count lessons matching search filters.
   * 
   * @param filters - Search and filter criteria
   * @param tx - Optional transaction client
   * @returns Total count of matching lessons
   */
  async countLessons(
    filters: LessonSearchFilters = {},
    tx?: Prisma.TransactionClient
  ): Promise<number> {
    const db = tx || prisma;
    
    const where: Prisma.LessonWhereInput = {
      ...(filters.query && {
        OR: [
          { title: { contains: filters.query, mode: 'insensitive' } },
          { description: { contains: filters.query, mode: 'insensitive' } },
          { category: { contains: filters.query, mode: 'insensitive' } }
        ]
      }),
      ...(filters.category && { category: filters.category }),
      ...(filters.instructorId && { instructorId: filters.instructorId }),
      ...((filters.minPrice || filters.maxPrice) && {
        price: {
          ...(filters.minPrice && { gte: filters.minPrice }),
          ...(filters.maxPrice && { lte: filters.maxPrice })
        }
      }),
      ...(filters.published !== undefined && { published: filters.published })
    };

    return await db.lesson.count({ where });
  }

  /**
   * Find lessons by instructor ID.
   * 
   * @param instructorId - Firebase UID of the instructor
   * @param includeUnpublished - Whether to include unpublished lessons
   * @param tx - Optional transaction client
   * @returns Array of instructor's lessons
   */
  async findByInstructorId(
    instructorId: string,
    includeUnpublished: boolean = false,
    tx?: Prisma.TransactionClient
  ): Promise<LessonWithRelations[]> {
    const db = tx || prisma;
    
    return await db.lesson.findMany({
      where: {
        instructorId,
        ...(includeUnpublished ? {} : { published: true })
      },
      include: {
        instructor: { select: { id: true, name: true, email: true } },
        purchases: { select: { id: true, amount: true } },
        reviews: { select: { id: true, rating: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Create a new lesson.
   * 
   * @param data - Lesson creation data
   * @param tx - Optional transaction client for atomic operations
   * @returns Created lesson with instructor data
   * 
   * @throws {Error} When creation fails due to database constraints
   */
  async createLesson(
    data: LessonCreateData,
    tx?: Prisma.TransactionClient
  ): Promise<LessonWithRelations> {
    const db = tx || prisma;
    
    return await db.lesson.create({
      data: {
        title: data.title,
        description: data.description,
        price: data.price,
        category: data.category,
        instructorId: data.instructorId,
        published: data.published || false,
        thumbnailUrl: data.thumbnailUrl
      },
      include: {
        instructor: { select: { id: true, name: true, email: true } }
      }
    });
  }

  /**
   * Update an existing lesson.
   * 
   * @param lessonId - UUID of lesson to update
   * @param data - Partial lesson data to update
   * @param tx - Optional transaction client
   * @returns Updated lesson with instructor data
   * 
   * @throws {Error} When lesson doesn't exist or update fails
   */
  async updateLesson(
    lessonId: string,
    data: LessonUpdateData,
    tx?: Prisma.TransactionClient
  ): Promise<LessonWithRelations> {
    const db = tx || prisma;
    
    return await db.lesson.update({
      where: { id: lessonId },
      data: {
        ...data,
        updatedAt: new Date()
      },
      include: {
        instructor: { select: { id: true, name: true, email: true } }
      }
    });
  }

  /**
   * Delete a lesson by ID.
   * 
   * @param lessonId - UUID of lesson to delete
   * @param tx - Optional transaction client
   * @returns Deleted lesson data
   * 
   * @throws {Error} When lesson doesn't exist or has dependencies
   */
  async deleteLesson(
    lessonId: string,
    tx?: Prisma.TransactionClient
  ): Promise<Lesson> {
    const db = tx || prisma;
    
    return await db.lesson.delete({
      where: { id: lessonId }
    });
  }

  /**
   * Check if lesson exists by ID.
   * 
   * @param lessonId - UUID of lesson to check
   * @param tx - Optional transaction client
   * @returns True if lesson exists, false otherwise
   */
  async existsById(
    lessonId: string,
    tx?: Prisma.TransactionClient
  ): Promise<boolean> {
    const db = tx || prisma;
    
    const count = await db.lesson.count({
      where: { id: lessonId }
    });
    
    return count > 0;
  }

  /**
   * Check if instructor owns lesson.
   * 
   * @param lessonId - UUID of lesson
   * @param instructorId - Firebase UID of instructor
   * @param tx - Optional transaction client
   * @returns True if instructor owns lesson, false otherwise
   */
  async isLessonOwnedByInstructor(
    lessonId: string,
    instructorId: string,
    tx?: Prisma.TransactionClient
  ): Promise<boolean> {
    const db = tx || prisma;
    
    const count = await db.lesson.count({
      where: {
        id: lessonId,
        instructorId
      }
    });
    
    return count > 0;
  }

  /**
   * Get lesson statistics for analytics.
   * 
   * @param lessonId - UUID of lesson
   * @param tx - Optional transaction client
   * @returns Lesson statistics
   */
  async getLessonStats(
    lessonId: string,
    tx?: Prisma.TransactionClient
  ): Promise<{
    purchaseCount: number;
    totalRevenue: number;
    averageRating: number | null;
    reviewCount: number;
  }> {
    const db = tx || prisma;
    
    const [purchases, reviews] = await Promise.all([
      db.purchase.findMany({
        where: { lessonId, status: 'COMPLETED' },
        select: { amount: true }
      }),
      db.review.findMany({
        where: { lessonId },
        select: { rating: true }
      })
    ]);

    const purchaseCount = purchases.length;
    const totalRevenue = purchases.reduce((sum, p) => sum + p.amount, 0);
    const reviewCount = reviews.length;
    const averageRating = reviewCount > 0 
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount
      : null;

    return {
      purchaseCount,
      totalRevenue,
      averageRating,
      reviewCount
    };
  }

  /**
   * Build Prisma orderBy clause from sort options.
   * 
   * @private
   */
  private buildOrderBy(sort: LessonSortOptions): Prisma.LessonOrderByWithRelationInput {
    switch (sort.field) {
      case 'price':
        return { price: sort.direction };
      case 'title':
        return { title: sort.direction };
      case 'createdAt':
      default:
        return { createdAt: sort.direction };
    }
  }
}