/**
 * Lesson request validators using Zod schemas.
 * 
 * @description Validates all lesson-related API inputs with comprehensive
 * error messages and type coercion. Ensures data integrity before it
 * reaches the service layer and provides clear validation feedback.
 */

import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { AppError } from '@teach-niche/utils';

// === Schema Definitions ===

const createLessonSchema = z.object({
  body: z.object({
    title: z.string()
      .min(1, 'Title is required')
      .max(200, 'Title must be 200 characters or less')
      .trim(),
    description: z.string()
      .max(2000, 'Description must be 2000 characters or less')
      .optional()
      .transform(val => val?.trim() || undefined),
    price: z.number()
      .int('Price must be an integer (cents)')
      .min(100, 'Price must be at least $1.00')
      .max(99999, 'Price must be at most $999.99'),
    category: z.string()
      .max(50, 'Category must be 50 characters or less')
      .optional()
      .transform(val => val?.trim() || undefined)
  })
});

const updateLessonSchema = z.object({
  body: z.object({
    title: z.string()
      .min(1, 'Title cannot be empty')
      .max(200, 'Title must be 200 characters or less')
      .trim()
      .optional(),
    description: z.string()
      .max(2000, 'Description must be 2000 characters or less')
      .optional()
      .transform(val => val?.trim() || undefined),
    price: z.number()
      .int('Price must be an integer (cents)')
      .min(100, 'Price must be at least $1.00')
      .max(99999, 'Price must be at most $999.99')
      .optional(),
    category: z.string()
      .max(50, 'Category must be 50 characters or less')
      .optional()
      .transform(val => val?.trim() || undefined),
    published: z.boolean()
      .optional(),
    thumbnailUrl: z.string()
      .url('Thumbnail URL must be a valid URL')
      .optional()
      .transform(val => val?.trim() || undefined)
  }).refine(
    data => Object.keys(data).length > 0,
    { message: 'At least one field must be provided for update' }
  )
});

const lessonSearchSchema = z.object({
  query: z.object({
    q: z.string().optional().transform(val => val?.trim()),
    category: z.string().optional().transform(val => val?.trim()),
    minPrice: z.string()
      .optional()
      .transform(val => val ? parseInt(val, 10) : undefined)
      .refine(val => val === undefined || (val >= 100 && val <= 99999), 
        'minPrice must be between 100 and 99999'),
    maxPrice: z.string()
      .optional()
      .transform(val => val ? parseInt(val, 10) : undefined)
      .refine(val => val === undefined || (val >= 100 && val <= 99999),
        'maxPrice must be between 100 and 99999'),
    instructorId: z.string().uuid('Invalid instructor ID').optional(),
    published: z.string()
      .optional()
      .transform(val => {
        if (val === 'true') return true;
        if (val === 'false') return false;
        return undefined;
      }),
    page: z.string()
      .optional()
      .transform(val => val ? parseInt(val, 10) : 1)
      .refine(val => val >= 1, 'Page must be 1 or greater'),
    pageSize: z.string()
      .optional()
      .transform(val => val ? parseInt(val, 10) : 20)
      .refine(val => val >= 1 && val <= 100, 'Page size must be between 1 and 100'),
    sortBy: z.enum(['created', 'price', 'rating', 'purchases']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc')
  })
});

const lessonIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid lesson ID format')
  })
});

// === Validation Middleware Functions ===

/**
 * Validates lesson creation request.
 * 
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Next middleware function
 * 
 * @throws {AppError} When validation fails with detailed error messages
 */
export function validateCreateLessonRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const result = createLessonSchema.parse(req);
    req.body = result.body;
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      throw new AppError(
        400,
        `Validation error: ${firstError.message}`,
        'LESSON_VALIDATION_ERROR'
      );
    }
    throw error;
  }
}

/**
 * Validates lesson update request.
 * 
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Next middleware function
 * 
 * @throws {AppError} When validation fails
 */
export function validateUpdateLessonRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const combined = {
      ...lessonIdParamSchema.parse(req),
      ...updateLessonSchema.parse(req)
    };
    req.params = combined.params;
    req.body = combined.body;
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      throw new AppError(
        400,
        `Validation error: ${firstError.message}`,
        'LESSON_VALIDATION_ERROR'
      );
    }
    throw error;
  }
}

/**
 * Validates lesson search request.
 * 
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Next middleware function
 * 
 * @throws {AppError} When validation fails
 */
export function validateLessonSearchRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const result = lessonSearchSchema.parse(req);
    req.query = result.query as any;
    
    // Additional validation for price range
    if (req.query.minPrice && req.query.maxPrice && 
        req.query.minPrice > req.query.maxPrice) {
      throw new AppError(
        400,
        'minPrice cannot be greater than maxPrice',
        'LESSON_VALIDATION_ERROR'
      );
    }
    
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      throw new AppError(
        400,
        `Validation error: ${firstError.message}`,
        'LESSON_VALIDATION_ERROR'
      );
    }
    throw error;
  }
}

/**
 * Validates lesson ID parameter.
 * 
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Next middleware function
 * 
 * @throws {AppError} When lesson ID is invalid
 */
export function validateLessonIdParam(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const result = lessonIdParamSchema.parse(req);
    req.params = result.params;
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError(
        400,
        'Invalid lesson ID format',
        'LESSON_VALIDATION_ERROR'
      );
    }
    throw error;
  }
}

/**
 * Validates instructor ID parameter.
 * 
 * @param req - Express request object
 * @param res - Response object
 * @param next - Next middleware function
 * 
 * @throws {AppError} When instructor ID is invalid
 */
export function validateInstructorIdParam(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const schema = z.object({
      params: z.object({
        instructorId: z.string().uuid('Invalid instructor ID format')
      })
    });
    
    const result = schema.parse(req);
    req.params = result.params;
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError(
        400,
        'Invalid instructor ID format',
        'LESSON_VALIDATION_ERROR'
      );
    }
    throw error;
  }
}