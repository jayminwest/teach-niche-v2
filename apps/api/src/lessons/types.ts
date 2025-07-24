/**
 * Lessons domain types and interfaces.
 * 
 * @description Domain-specific types that define the public API of the lessons service.
 * These types are used between router, service, and repository layers within this domain.
 * They often compose or transform raw Prisma types into business-specific contracts.
 */

import { Lesson, User, Purchase, Review, Tag } from '@teach-niche/database';

// === Service Layer Input Types ===

/**
 * Input for creating a new lesson.
 * Maps from API input but adds domain validation rules.
 */
export interface CreateLessonInput {
  title: string;
  description?: string;
  price: number;
  category?: string;
  instructorId: string;
}

/**
 * Input for updating an existing lesson.
 * All fields optional for partial updates.
 */
export interface UpdateLessonInput {
  title?: string;
  description?: string;
  price?: number;
  category?: string;
  published?: boolean;
  thumbnailUrl?: string;
}

/**
 * Search and filtering parameters for lessons.
 */
export interface LessonSearchFilters {
  query?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  instructorId?: string;
  published?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Sorting options for lesson queries.
 */
export interface LessonSortOptions {
  field: 'createdAt' | 'price' | 'title' | 'purchaseCount' | 'averageRating';
  direction: 'asc' | 'desc';
}

// === Service Layer Output Types (DTOs) ===

/**
 * Lesson with instructor details for API responses.
 * Composes Lesson and User data with computed fields.
 */
export interface LessonWithInstructor {
  id: string;
  title: string;
  description: string | null;
  price: number;
  category: string | null;
  thumbnailUrl: string | null;
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
  instructor: {
    id: string;
    name: string | null;
    email: string;
  };
}

/**
 * Lesson with full statistics and metadata.
 * Used for detailed lesson views and instructor dashboards.
 */
export interface LessonWithStats extends LessonWithInstructor {
  stats: {
    purchaseCount: number;
    averageRating: number | null;
    reviewCount: number;
    totalRevenue: number;
  };
  tags: string[];
}

/**
 * Lesson with user-specific context.
 * Includes purchase and access information for authenticated users.
 */
export interface LessonWithUserContext extends LessonWithStats {
  userContext?: {
    isPurchased: boolean;
    hasAccess: boolean;
    userReview?: {
      id: string;
      rating: number;
      comment: string | null;
    };
  };
}

/**
 * Minimal lesson data for listings and references.
 */
export interface LessonSummary {
  id: string;
  title: string;
  price: number;
  thumbnailUrl: string | null;
  instructor: {
    id: string;
    name: string | null;
  };
  stats: {
    purchaseCount: number;
    averageRating: number | null;
  };
}

// === Repository Types ===

/**
 * Raw lesson data from database with related entities.
 * Used internally by repository methods.
 */
export type LessonWithRelations = Lesson & {
  instructor: User;
  purchases?: Purchase[];
  reviews?: (Review & { user: User })[];
  tags?: Tag[];
};

/**
 * Database query options for lesson retrieval.
 */
export interface LessonQueryOptions {
  includeInstructor?: boolean;
  includePurchases?: boolean;
  includeReviews?: boolean;
  includeTags?: boolean;
  includeUnpublished?: boolean;
}

/**
 * Lesson creation data for repository.
 */
export interface LessonCreateData {
  title: string;
  description?: string;
  price: number;
  category?: string;
  instructorId: string;
  published?: boolean;
  thumbnailUrl?: string;
}

/**
 * Lesson update data for repository.
 */
export interface LessonUpdateData {
  title?: string;
  description?: string;
  price?: number;
  category?: string;
  published?: boolean;
  thumbnailUrl?: string;
  updatedAt?: Date;
}