/**
 * Lessons routes for HTTP handling and API endpoints.
 * 
 * @description Handles all lesson-related HTTP endpoints including:
 * - CRUD operations with proper authentication
 * - Search and filtering with pagination
 * - Instructor-specific lesson management
 * - Health and metrics endpoints for monitoring
 */

import { Router } from 'express';
import { requireAuth, requireRole, AuthRequest } from '../auth/middleware';
import { LessonService } from './service';
import {
  validateCreateLessonRequest,
  validateUpdateLessonRequest,
  validateLessonSearchRequest,
  validateLessonIdParam,
  validateInstructorIdParam
} from './validators';
import { logger } from '../shared/monitoring';
import { ApiResponse, PaginatedResponse, LessonApiResponse, UserSession } from '@teach-niche/types';

const router = Router();
const lessonService = new LessonService();

// === Health and Monitoring Endpoints ===

/**
 * Health check endpoint for lessons service.
 * 
 * @route GET /api/lessons/health
 * @access Public
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'lessons',
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || '1.0.0'
  });
});

/**
 * Service information endpoint.
 * 
 * @route GET /api/lessons/info
 * @access Public
 */
router.get('/info', (req, res) => {
  res.json({
    service: 'lessons',
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV,
    features: ['crud', 'search', 'instructor-management', 'statistics']
  });
});

/**
 * Metrics endpoint for monitoring.
 * 
 * @route GET /api/lessons/metrics
 * @access Public
 */
router.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(`
# HELP lessons_total Total number of lessons created
# TYPE lessons_total counter
lessons_total 0

# HELP lessons_searches_total Total lesson search requests
# TYPE lessons_searches_total counter
lessons_searches_total 0

# HELP lessons_errors_total Total lesson operation errors
# TYPE lessons_errors_total counter
lessons_errors_total 0
  `);
});

// === Public Lesson Endpoints ===

/**
 * Search and list lessons with filters.
 * 
 * @route GET /api/lessons
 * @access Public (published lessons only)
 * @query {string} [q] - Search query
 * @query {string} [category] - Filter by category
 * @query {number} [minPrice] - Minimum price filter
 * @query {number} [maxPrice] - Maximum price filter
 * @query {string} [instructorId] - Filter by instructor
 * @query {number} [page=1] - Page number
 * @query {number} [pageSize=20] - Items per page
 * @query {string} [sortBy=created] - Sort field
 * @query {string} [sortOrder=desc] - Sort direction
 */
router.get('/', validateLessonSearchRequest, async (req: AuthRequest, res, next) => {
  try {
    const {
      q: query,
      category,
      minPrice,
      maxPrice,
      instructorId,
      published,
      page = 1,
      pageSize = 20,
      sortBy = 'created',
      sortOrder = 'desc'
    } = req.query as any;

    const filters = {
      query,
      category,
      minPrice,
      maxPrice,
      instructorId,
      published,
      limit: pageSize,
      offset: (page - 1) * pageSize
    };

    const sortOptions = {
      field: sortBy === 'created' ? 'createdAt' : sortBy,
      direction: sortOrder
    };

    const result = await lessonService.searchLessons(
      filters,
      sortOptions,
      req.user
    );

    const response: ApiResponse<PaginatedResponse<any>> = {
      data: {
        items: result.lessons,
        total: result.total,
        page,
        pageSize,
        hasMore: (page * pageSize) < result.total
      },
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Get lesson by ID with user context.
 * 
 * @route GET /api/lessons/:id
 * @access Public (published) / Private (unpublished, owner only)
 */
router.get('/:id', validateLessonIdParam, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    
    const lesson = await lessonService.getLessonById(id, req.user);
    
    // Transform to API response format
    const apiLesson: LessonApiResponse = {
      id: lesson.id,
      title: lesson.title,
      description: lesson.description,
      price: lesson.price,
      category: lesson.category,
      thumbnailUrl: lesson.thumbnailUrl,
      published: lesson.published,
      createdAt: lesson.createdAt.toISOString(),
      updatedAt: lesson.updatedAt.toISOString(),
      instructor: lesson.instructor,
      stats: {
        purchaseCount: lesson.stats.purchaseCount,
        averageRating: lesson.stats.averageRating,
        reviewCount: lesson.stats.reviewCount
      },
      isPurchased: lesson.userContext?.isPurchased,
      hasAccess: lesson.userContext?.hasAccess
    };

    const response: ApiResponse<LessonApiResponse> = {
      data: apiLesson,
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// === Instructor-Only Endpoints ===

/**
 * Create a new lesson.
 * 
 * @route POST /api/lessons
 * @access Private (instructors only)
 */
router.post(
  '/',
  requireAuth,
  requireRole(['INSTRUCTOR']),
  validateCreateLessonRequest,
  async (req: AuthRequest, res, next) => {
    try {
      const lessonInput = {
        ...req.body,
        instructorId: req.user!.uid
      };

      const lesson = await lessonService.createLesson(lessonInput, req.user!);

      const apiLesson: LessonApiResponse = {
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        price: lesson.price,
        category: lesson.category,
        thumbnailUrl: lesson.thumbnailUrl,
        published: lesson.published,
        createdAt: lesson.createdAt.toISOString(),
        updatedAt: lesson.updatedAt.toISOString(),
        instructor: lesson.instructor,
        stats: {
          purchaseCount: 0,
          averageRating: null,
          reviewCount: 0
        }
      };

      const response: ApiResponse<LessonApiResponse> = {
        data: apiLesson,
        message: 'Lesson created successfully',
        timestamp: new Date().toISOString()
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Update an existing lesson.
 * 
 * @route PUT /api/lessons/:id
 * @access Private (lesson owner or admin)
 */
router.put(
  '/:id',
  requireAuth,
  validateUpdateLessonRequest,
  async (req: AuthRequest, res, next) => {
    try {
      const { id } = req.params;
      
      const lesson = await lessonService.updateLesson(id, req.body, req.user!);

      const apiLesson: LessonApiResponse = {
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        price: lesson.price,
        category: lesson.category,
        thumbnailUrl: lesson.thumbnailUrl,
        published: lesson.published,
        createdAt: lesson.createdAt.toISOString(),
        updatedAt: lesson.updatedAt.toISOString(),
        instructor: lesson.instructor,
        stats: {
          purchaseCount: 0, // Would need to fetch if required
          averageRating: null,
          reviewCount: 0
        }
      };

      const response: ApiResponse<LessonApiResponse> = {
        data: apiLesson,
        message: 'Lesson updated successfully',
        timestamp: new Date().toISOString()
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Delete a lesson.
 * 
 * @route DELETE /api/lessons/:id
 * @access Private (lesson owner or admin)
 */
router.delete(
  '/:id',
  requireAuth,
  validateLessonIdParam,
  async (req: AuthRequest, res, next) => {
    try {
      const { id } = req.params;
      
      await lessonService.deleteLesson(id, req.user!);

      const response: ApiResponse<{ deleted: boolean }> = {
        data: { deleted: true },
        message: 'Lesson deleted successfully',
        timestamp: new Date().toISOString()
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// === Instructor Management Endpoints ===

/**
 * Get lessons by instructor ID.
 * 
 * @route GET /api/lessons/instructor/:instructorId
 * @access Public (published only) / Private (all lessons for owner)
 */
router.get(
  '/instructor/:instructorId',
  validateInstructorIdParam,
  async (req: AuthRequest, res, next) => {
    try {
      const { instructorId } = req.params;
      const { includeUnpublished } = req.query;
      
      const lessons = await lessonService.getLessonsByInstructor(
        instructorId,
        includeUnpublished === 'true',
        req.user
      );

      const apiLessons: LessonApiResponse[] = lessons.map(lesson => ({
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        price: lesson.price,
        category: lesson.category,
        thumbnailUrl: lesson.thumbnailUrl,
        published: lesson.published,
        createdAt: lesson.createdAt.toISOString(),
        updatedAt: lesson.updatedAt.toISOString(),
        instructor: lesson.instructor,
        stats: {
          purchaseCount: lesson.stats.purchaseCount,
          averageRating: lesson.stats.averageRating,
          reviewCount: lesson.stats.reviewCount
        }
      }));

      const response: ApiResponse<LessonApiResponse[]> = {
        data: apiLessons,
        timestamp: new Date().toISOString()
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Get instructor's own lessons (all including unpublished).
 * 
 * @route GET /api/lessons/my
 * @access Private (instructors only)
 */
router.get(
  '/my',
  requireAuth,
  requireRole(['INSTRUCTOR']),
  async (req: AuthRequest, res, next) => {
    try {
      const lessons = await lessonService.getLessonsByInstructor(
        req.user!.uid,
        true, // Include unpublished
        req.user
      );

      const apiLessons: LessonApiResponse[] = lessons.map(lesson => ({
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        price: lesson.price,
        category: lesson.category,
        thumbnailUrl: lesson.thumbnailUrl,
        published: lesson.published,
        createdAt: lesson.createdAt.toISOString(),
        updatedAt: lesson.updatedAt.toISOString(),
        instructor: lesson.instructor,
        stats: {
          purchaseCount: lesson.stats.purchaseCount,
          averageRating: lesson.stats.averageRating,
          reviewCount: lesson.stats.reviewCount
        }
      }));

      const response: ApiResponse<LessonApiResponse[]> = {
        data: apiLessons,
        timestamp: new Date().toISOString()
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

export { router as lessonRouter };