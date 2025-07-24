/**
 * Integration tests for lessons service.
 * 
 * @description Tests service business logic with real database operations.
 * Uses actual LessonService and LessonRepository instances with real data.
 * Focuses on testing permissions, validation, and orchestration logic
 * that the service layer adds on top of the repository.
 * 
 * No mocking - all tests use real services and real database operations
 * following the project's real-data testing philosophy.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import prisma, { User } from '@teach-niche/database';
import { LessonService } from '../service';
import {
  LessonNotFoundError,
  LessonNotPublishedError,
  LessonPermissionDeniedError,
  LessonValidationError,
  InvalidLessonPriceError,
  LessonHasPurchasesError
} from '../errors';
import { UserSession } from '@teach-niche/types';

// Instantiate the real service
const lessonService = new LessonService();

// Test users and sessions
let instructorUser: User;
let otherInstructorUser: User;
let studentUser: User;
let adminUser: User;
let instructorSession: UserSession;
let otherInstructorSession: UserSession;
let studentSession: UserSession;
let adminSession: UserSession;

describe('LessonService Integration Tests', () => {
  beforeAll(async () => {
    // Create users with different roles
    [instructorUser, otherInstructorUser, studentUser, adminUser] = await Promise.all([
      prisma.user.create({
        data: {
          id: 'service-inst-1',
          firebaseUid: 'firebase-service-inst-1',
          email: 'inst1@service-test.com',
          name: 'Instructor One',
          role: 'INSTRUCTOR'
        }
      }),
      prisma.user.create({
        data: {
          id: 'service-inst-2',
          firebaseUid: 'firebase-service-inst-2',
          email: 'inst2@service-test.com',
          name: 'Instructor Two',
          role: 'INSTRUCTOR'
        }
      }),
      prisma.user.create({
        data: {
          id: 'service-student-1',
          firebaseUid: 'firebase-service-student-1',
          email: 'student1@service-test.com',
          name: 'Student One',
          role: 'STUDENT'
        }
      }),
      prisma.user.create({
        data: {
          id: 'service-admin-1',
          firebaseUid: 'firebase-service-admin-1',
          email: 'admin1@service-test.com',
          name: 'Admin One',
          role: 'ADMIN'
        }
      })
    ]);

    // Create corresponding user sessions
    instructorSession = {
      uid: instructorUser.id,
      role: instructorUser.role,
      email: instructorUser.email,
      name: instructorUser.name
    };
    otherInstructorSession = {
      uid: otherInstructorUser.id,
      role: otherInstructorUser.role,
      email: otherInstructorUser.email,
      name: otherInstructorUser.name
    };
    studentSession = {
      uid: studentUser.id,
      role: studentUser.role,
      email: studentUser.email,
      name: studentUser.name
    };
    adminSession = {
      uid: adminUser.id,
      role: adminUser.role,
      email: adminUser.email,
      name: adminUser.name
    };
  });

  afterAll(async () => {
    // Comprehensive cleanup
    const userIds = [instructorUser.id, otherInstructorUser.id, studentUser.id, adminUser.id];
    await prisma.purchase.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.review.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.lesson.deleteMany({ where: { instructorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean dependent data before each test
    const userIds = [instructorUser.id, otherInstructorUser.id, studentUser.id, adminUser.id];
    await prisma.purchase.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.review.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.lesson.deleteMany({ where: { instructorId: { in: userIds } } });
  });

  describe('createLesson', () => {
    const validLessonInput = {
      title: 'Service Test Lesson',
      description: 'A comprehensive lesson for testing service logic',
      price: 2999,
      category: 'intermediate'
    };

    test('should allow an instructor to create a lesson', async () => {
      const lesson = await lessonService.createLesson(validLessonInput, instructorSession);

      expect(lesson).toMatchObject({
        title: validLessonInput.title,
        description: validLessonInput.description,
        price: validLessonInput.price,
        category: validLessonInput.category,
        published: false,
        instructor: {
          id: instructorUser.id,
          name: instructorUser.name,
          email: instructorUser.email
        }
      });
      expect(lesson.id).toBeDefined();
      expect(lesson.createdAt).toBeInstanceOf(Date);
    });

    test('should throw LessonPermissionDeniedError for a non-instructor role', async () => {
      await expect(
        lessonService.createLesson(validLessonInput, studentSession)
      ).rejects.toThrow(LessonPermissionDeniedError);

      await expect(
        lessonService.createLesson(validLessonInput, adminSession)
      ).rejects.toThrow(LessonPermissionDeniedError);
    });

    test('should throw LessonValidationError for invalid title', async () => {
      // Empty title
      await expect(
        lessonService.createLesson({ ...validLessonInput, title: '' }, instructorSession)
      ).rejects.toThrow(LessonValidationError);

      // Title too long
      const longTitle = 'a'.repeat(201);
      await expect(
        lessonService.createLesson({ ...validLessonInput, title: longTitle }, instructorSession)
      ).rejects.toThrow(LessonValidationError);
    });

    test('should throw LessonValidationError for invalid description', async () => {
      const longDescription = 'a'.repeat(2001);
      await expect(
        lessonService.createLesson({ ...validLessonInput, description: longDescription }, instructorSession)
      ).rejects.toThrow(LessonValidationError);
    });

    test('should throw InvalidLessonPriceError for out-of-range price', async () => {
      // Price too low
      await expect(
        lessonService.createLesson({ ...validLessonInput, price: 50 }, instructorSession)
      ).rejects.toThrow(InvalidLessonPriceError);

      // Price too high
      await expect(
        lessonService.createLesson({ ...validLessonInput, price: 100000 }, instructorSession)
      ).rejects.toThrow(InvalidLessonPriceError);
    });
  });

  describe('updateLesson', () => {
    let testLesson: any;

    beforeEach(async () => {
      testLesson = await lessonService.createLesson({
        title: 'Lesson to Update',
        description: 'Original description',
        price: 1999,
        category: 'beginner'
      }, instructorSession);
    });

    test('should allow the owner to update their lesson', async () => {
      const updateData = {
        title: 'Updated Lesson Title',
        price: 2999,
        published: true
      };

      const updatedLesson = await lessonService.updateLesson(
        testLesson.id,
        updateData,
        instructorSession
      );

      expect(updatedLesson).toMatchObject({
        id: testLesson.id,
        title: updateData.title,
        description: 'Original description', // Should remain unchanged
        price: updateData.price,
        published: updateData.published
      });
      expect(updatedLesson.updatedAt.getTime()).toBeGreaterThan(testLesson.updatedAt.getTime());
    });

    test('should allow an admin to update any lesson', async () => {
      const updateData = { title: 'Admin Updated Title' };

      const updatedLesson = await lessonService.updateLesson(
        testLesson.id,
        updateData,
        adminSession
      );

      expect(updatedLesson.title).toBe('Admin Updated Title');
    });

    test('should throw LessonPermissionDeniedError if another instructor tries to update', async () => {
      const updateData = { title: 'Unauthorized Update' };

      await expect(
        lessonService.updateLesson(testLesson.id, updateData, otherInstructorSession)
      ).rejects.toThrow(LessonPermissionDeniedError);

      await expect(
        lessonService.updateLesson(testLesson.id, updateData, studentSession)
      ).rejects.toThrow(LessonPermissionDeniedError);
    });

    test('should throw LessonNotFoundError for a non-existent lesson', async () => {
      await expect(
        lessonService.updateLesson('non-existent-id', { title: 'Test' }, instructorSession)
      ).rejects.toThrow(LessonNotFoundError);
    });

    test('should throw InvalidLessonPriceError on invalid price update', async () => {
      await expect(
        lessonService.updateLesson(testLesson.id, { price: 50 }, instructorSession)
      ).rejects.toThrow(InvalidLessonPriceError);
    });
  });

  describe('getLessonById', () => {
    let publishedLesson: any;
    let unpublishedLesson: any;

    beforeEach(async () => {
      publishedLesson = await lessonService.createLesson({
        title: 'Published Lesson',
        description: 'This lesson is published',
        price: 1999,
        category: 'beginner'
      }, instructorSession);

      // Update to published
      publishedLesson = await lessonService.updateLesson(
        publishedLesson.id,
        { published: true },
        instructorSession
      );

      unpublishedLesson = await lessonService.createLesson({
        title: 'Unpublished Lesson',
        description: 'This lesson is not published',
        price: 2999,
        category: 'advanced'
      }, instructorSession);
    });

    test('should allow any user to get a published lesson', async () => {
      // Test with student session
      const lessonForStudent = await lessonService.getLessonById(publishedLesson.id, studentSession);
      expect(lessonForStudent.id).toBe(publishedLesson.id);
      expect(lessonForStudent.published).toBe(true);

      // Test with no session (guest)
      const lessonForGuest = await lessonService.getLessonById(publishedLesson.id);
      expect(lessonForGuest.id).toBe(publishedLesson.id);
      expect(lessonForGuest.published).toBe(true);
    });

    test('should allow the owner to get their unpublished lesson', async () => {
      const lesson = await lessonService.getLessonById(unpublishedLesson.id, instructorSession);

      expect(lesson.id).toBe(unpublishedLesson.id);
      expect(lesson.published).toBe(false);
    });

    test('should allow an admin to get an unpublished lesson', async () => {
      const lesson = await lessonService.getLessonById(unpublishedLesson.id, adminSession);

      expect(lesson.id).toBe(unpublishedLesson.id);
      expect(lesson.published).toBe(false);
    });

    test('should throw LessonNotPublishedError for unpublished lesson requested by others', async () => {
      await expect(
        lessonService.getLessonById(unpublishedLesson.id, studentSession)
      ).rejects.toThrow(LessonNotPublishedError);

      await expect(
        lessonService.getLessonById(unpublishedLesson.id, otherInstructorSession)
      ).rejects.toThrow(LessonNotPublishedError);

      await expect(
        lessonService.getLessonById(unpublishedLesson.id)
      ).rejects.toThrow(LessonNotPublishedError);
    });

    test('should return correct userContext for a purchased lesson', async () => {
      // Create a purchase for the published lesson
      await prisma.purchase.create({
        data: {
          id: 'test-purchase-service',
          userId: studentUser.id,
          lessonId: publishedLesson.id,
          amount: publishedLesson.price,
          platformFee: Math.floor(publishedLesson.price * 0.15),
          instructorEarnings: Math.floor(publishedLesson.price * 0.85),
          status: 'COMPLETED',
          stripePaymentIntentId: 'pi_service_test_123'
        }
      });

      const lesson = await lessonService.getLessonById(publishedLesson.id, studentSession);

      expect(lesson.userContext).toBeDefined();
      expect(lesson.userContext?.isPurchased).toBe(true);
      expect(lesson.userContext?.hasAccess).toBe(true);
    });

    test('should return correct userContext for a reviewed lesson', async () => {
      // Create purchase and review
      await prisma.purchase.create({
        data: {
          id: 'test-purchase-review',
          userId: studentUser.id,
          lessonId: publishedLesson.id,
          amount: publishedLesson.price,
          platformFee: Math.floor(publishedLesson.price * 0.15),
          instructorEarnings: Math.floor(publishedLesson.price * 0.85),
          status: 'COMPLETED',
          stripePaymentIntentId: 'pi_service_review_123'
        }
      });

      await prisma.review.create({
        data: {
          id: 'test-review-service',
          userId: studentUser.id,
          lessonId: publishedLesson.id,
          rating: 5,
          comment: 'Excellent lesson!'
        }
      });

      const lesson = await lessonService.getLessonById(publishedLesson.id, studentSession);

      expect(lesson.userContext?.isPurchased).toBe(true);
      expect(lesson.userContext?.userReview).toEqual({
        id: 'test-review-service',
        rating: 5,
        comment: 'Excellent lesson!'
      });
    });

    test('should throw LessonNotFoundError for non-existent lesson', async () => {
      await expect(
        lessonService.getLessonById('non-existent-id', studentSession)
      ).rejects.toThrow(LessonNotFoundError);
    });
  });

  describe('searchLessons', () => {
    beforeEach(async () => {
      // Create test lessons with different visibility
      await Promise.all([
        lessonService.createLesson({
          title: 'Published Beginner Lesson',
          description: 'Learn kendama basics',
          price: 1999,
          category: 'beginner'
        }, instructorSession).then(lesson => 
          lessonService.updateLesson(lesson.id, { published: true }, instructorSession)
        ),
        lessonService.createLesson({
          title: 'Published Advanced Lesson',
          description: 'Master advanced tricks',
          price: 4999,
          category: 'advanced'
        }, instructorSession).then(lesson => 
          lessonService.updateLesson(lesson.id, { published: true }, instructorSession)
        ),
        lessonService.createLesson({
          title: 'Unpublished Draft Lesson',
          description: 'Work in progress',
          price: 2999,
          category: 'intermediate'
        }, instructorSession) // Remains unpublished
      ]);
    });

    test('should only return published lessons for students/guests', async () => {
      // Test with student session
      const studentResults = await lessonService.searchLessons({}, {}, studentSession);
      expect(studentResults.lessons).toHaveLength(2);
      expect(studentResults.lessons.every(lesson => lesson.title.includes('Published'))).toBe(true);

      // Test with no session (guest)
      const guestResults = await lessonService.searchLessons({}, {});
      expect(guestResults.lessons).toHaveLength(2);

      // Test with explicit published: false filter - should be ignored for students
      const filteredResults = await lessonService.searchLessons({ published: false }, {}, studentSession);
      expect(filteredResults.lessons).toHaveLength(2); // Still gets published lessons
    });

    test('should allow an instructor to search for unpublished lessons', async () => {
      // Search for unpublished lessons
      const unpublishedResults = await lessonService.searchLessons(
        { published: false },
        {},
        instructorSession
      );
      expect(unpublishedResults.lessons).toHaveLength(1);
      expect(unpublishedResults.lessons[0].title).toBe('Unpublished Draft Lesson');

      // Search for all lessons (published and unpublished)
      const allResults = await lessonService.searchLessons({}, {}, instructorSession);
      expect(allResults.lessons).toHaveLength(3);
    });

    test('should return correct total count along with paginated results', async () => {
      const results = await lessonService.searchLessons(
        { limit: 1, offset: 0 },
        {},
        studentSession
      );

      expect(results.lessons).toHaveLength(1);
      expect(results.total).toBe(2); // Total published lessons
    });

    test('should filter by category', async () => {
      const beginnerResults = await lessonService.searchLessons(
        { category: 'beginner' },
        {},
        studentSession
      );

      expect(beginnerResults.lessons).toHaveLength(1);
      expect(beginnerResults.lessons[0].title).toBe('Published Beginner Lesson');
    });

    test('should filter by price range', async () => {
      const expensiveResults = await lessonService.searchLessons(
        { minPrice: 4000 },
        {},
        studentSession
      );

      expect(expensiveResults.lessons).toHaveLength(1);
      expect(expensiveResults.lessons[0].title).toBe('Published Advanced Lesson');
    });
  });

  describe('getLessonsByInstructor', () => {
    beforeEach(async () => {
      await Promise.all([
        lessonService.createLesson({
          title: 'Instructor Lesson 1',
          price: 1500,
        }, instructorSession).then(lesson => 
          lessonService.updateLesson(lesson.id, { published: true }, instructorSession)
        ),
        lessonService.createLesson({
          title: 'Instructor Lesson 2 (Draft)',
          price: 2500,
        }, instructorSession) // Remains unpublished
      ]);
    });

    test('should return only published lessons by default', async () => {
      const lessons = await lessonService.getLessonsByInstructor(
        instructorUser.id,
        false,
        studentSession
      );

      expect(lessons).toHaveLength(1);
      expect(lessons[0].published).toBe(true);
      expect(lessons[0].title).toBe('Instructor Lesson 1');
    });

    test('should allow instructor to see their own unpublished lessons', async () => {
      const lessons = await lessonService.getLessonsByInstructor(
        instructorUser.id,
        true,
        instructorSession
      );

      expect(lessons).toHaveLength(2);
      expect(lessons.some(l => !l.published)).toBe(true);
    });

    test('should allow admin to see unpublished lessons', async () => {
      const lessons = await lessonService.getLessonsByInstructor(
        instructorUser.id,
        true,
        adminSession
      );

      expect(lessons).toHaveLength(2);
    });

    test('should not show unpublished lessons to other instructors', async () => {
      const lessons = await lessonService.getLessonsByInstructor(
        instructorUser.id,
        true,
        otherInstructorSession
      );

      expect(lessons).toHaveLength(1);
      expect(lessons[0].published).toBe(true);
    });
  });

  describe('deleteLesson', () => {
    let lessonWithoutPurchases: any;
    let lessonWithPurchases: any;

    beforeEach(async () => {
      lessonWithoutPurchases = await lessonService.createLesson({
        title: 'Lesson Without Purchases',
        price: 1000,
      }, instructorSession);

      lessonWithPurchases = await lessonService.createLesson({
        title: 'Lesson With Purchases',
        price: 2000,
      }, instructorSession);

      // Create a purchase for the second lesson
      await prisma.purchase.create({
        data: {
          id: 'test-purchase-delete',
          userId: studentUser.id,
          lessonId: lessonWithPurchases.id,
          amount: lessonWithPurchases.price,
          platformFee: Math.floor(lessonWithPurchases.price * 0.15),
          instructorEarnings: Math.floor(lessonWithPurchases.price * 0.85),
          status: 'COMPLETED',
          stripePaymentIntentId: 'pi_delete_test_123'
        }
      });
    });

    test('should allow the owner to delete a lesson without purchases', async () => {
      const result = await lessonService.deleteLesson(lessonWithoutPurchases.id, instructorSession);

      expect(result).toBe(true);

      // Verify lesson is deleted
      await expect(
        lessonService.getLessonById(lessonWithoutPurchases.id, instructorSession)
      ).rejects.toThrow(LessonNotFoundError);
    });

    test('should allow an admin to delete any lesson without purchases', async () => {
      const result = await lessonService.deleteLesson(lessonWithoutPurchases.id, adminSession);

      expect(result).toBe(true);
    });

    test('should throw LessonPermissionDeniedError for non-owner', async () => {
      await expect(
        lessonService.deleteLesson(lessonWithoutPurchases.id, otherInstructorSession)
      ).rejects.toThrow(LessonPermissionDeniedError);

      await expect(
        lessonService.deleteLesson(lessonWithoutPurchases.id, studentSession)
      ).rejects.toThrow(LessonPermissionDeniedError);
    });

    test('should throw LessonHasPurchasesError if lesson has purchases', async () => {
      await expect(
        lessonService.deleteLesson(lessonWithPurchases.id, instructorSession)
      ).rejects.toThrow(LessonHasPurchasesError);

      // Even admin cannot delete lessons with purchases
      await expect(
        lessonService.deleteLesson(lessonWithPurchases.id, adminSession)
      ).rejects.toThrow(LessonHasPurchasesError);
    });

    test('should throw LessonNotFoundError for non-existent lesson', async () => {
      await expect(
        lessonService.deleteLesson('non-existent-id', instructorSession)
      ).rejects.toThrow(LessonNotFoundError);
    });
  });
});