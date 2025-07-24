/**
 * Lessons domain error classes.
 * 
 * @description Standardized errors for lesson operations with consistent
 * HTTP status code mapping and domain-specific context preservation.
 * All errors extend the base AppError class for uniform handling.
 */

import { AppError } from '@teach-niche/utils';

/**
 * Thrown when a lesson cannot be found by ID.
 */
export class LessonNotFoundError extends AppError {
  constructor(lessonId: string) {
    super(
      404,
      `Lesson with ID ${lessonId} not found`,
      'LESSON_NOT_FOUND'
    );
  }
}

/**
 * Thrown when a user tries to access an unpublished lesson they don't own.
 */
export class LessonNotPublishedError extends AppError {
  constructor(lessonId: string) {
    super(
      403,
      `Lesson ${lessonId} is not published and cannot be accessed`,
      'LESSON_NOT_PUBLISHED'
    );
  }
}

/**
 * Thrown when a user tries to modify a lesson they don't own.
 */
export class LessonPermissionDeniedError extends AppError {
  constructor(lessonId: string, userId: string) {
    super(
      403,
      `User ${userId} does not have permission to modify lesson ${lessonId}`,
      'LESSON_PERMISSION_DENIED'
    );
  }
}

/**
 * Thrown when lesson creation fails validation rules.
 */
export class LessonValidationError extends AppError {
  constructor(field: string, message: string) {
    super(
      400,
      `Lesson validation failed for field '${field}': ${message}`,
      'LESSON_VALIDATION_ERROR'
    );
  }
}

/**
 * Thrown when lesson title conflicts with existing lesson by same instructor.
 */
export class LessonTitleConflictError extends AppError {
  constructor(title: string, instructorId: string) {
    super(
      409,
      `Instructor ${instructorId} already has a lesson titled '${title}'`,
      'LESSON_TITLE_CONFLICT'
    );
  }
}

/**
 * Thrown when trying to delete a lesson that has purchases.
 */
export class LessonHasPurchasesError extends AppError {
  constructor(lessonId: string, purchaseCount: number) {
    super(
      409,
      `Cannot delete lesson ${lessonId} because it has ${purchaseCount} purchases`,
      'LESSON_HAS_PURCHASES'
    );
  }
}

/**
 * Thrown when lesson price is invalid.
 */
export class InvalidLessonPriceError extends AppError {
  constructor(price: number) {
    super(
      400,
      `Invalid lesson price: ${price}. Price must be between $1.00 and $999.99`,
      'INVALID_LESSON_PRICE'
    );
  }
}