/**
 * Integration tests for lessons repository.
 * 
 * @description Tests repository methods with real database operations.
 * Uses test database for isolation and maintains data integrity across tests.
 * Verifies transaction support and complex query scenarios.
 * 
 * Test structure follows real-data philosophy - creates actual test users
 * and lessons to ensure authentic behavior matching production scenarios.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import prisma, { User } from '@teach-niche/database';
import { LessonRepository } from '../repository';

const repository = new LessonRepository();

// Test data
let testInstructor: User;
let testStudent: User;

describe('LessonRepository Integration Tests', () => {
  beforeAll(async () => {
    // Create test users
    testInstructor = await prisma.user.create({
      data: {
        id: 'test-instructor-id',
        firebaseUid: 'firebase-instructor-id',
        email: 'instructor@test.com',
        name: 'Test Instructor',
        role: 'INSTRUCTOR'
      }
    });

    testStudent = await prisma.user.create({
      data: {
        id: 'test-student-id',
        firebaseUid: 'firebase-student-id',
        email: 'student@test.com',
        name: 'Test Student',
        role: 'STUDENT'
      }
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.lesson.deleteMany({
      where: { instructorId: testInstructor.id }
    });
    await prisma.user.deleteMany({
      where: { id: { in: [testInstructor.id, testStudent.id] } }
    });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up lessons before each test
    await prisma.lesson.deleteMany({
      where: { instructorId: testInstructor.id }
    });
  });

  describe('createLesson', () => {
    test('creates lesson with valid data', async () => {
      const lessonData = {
        title: 'Test Lesson',
        description: 'A test lesson description',
        price: 2999,
        category: 'beginner',
        instructorId: testInstructor.id
      };

      const lesson = await repository.createLesson(lessonData);

      expect(lesson).toMatchObject({
        title: 'Test Lesson',
        description: 'A test lesson description',
        price: 2999,
        category: 'beginner',
        instructorId: testInstructor.id,
        published: false
      });
      expect(lesson.id).toBeDefined();
      expect(lesson.createdAt).toBeInstanceOf(Date);
      expect(lesson.instructor).toMatchObject({
        id: testInstructor.id,
        name: testInstructor.name,
        email: testInstructor.email
      });
    });

    test('creates lesson with published flag', async () => {
      const lessonData = {
        title: 'Published Lesson',
        description: 'A published lesson',
        price: 1999,
        instructorId: testInstructor.id,
        published: true
      };

      const lesson = await repository.createLesson(lessonData);

      expect(lesson.published).toBe(true);
    });

    test('supports transaction client', async () => {
      const lessonData = {
        title: 'Transaction Test Lesson',
        description: 'Testing transaction support',
        price: 1500,
        instructorId: testInstructor.id
      };

      await prisma.$transaction(async (tx) => {
        const lesson = await repository.createLesson(lessonData, tx);
        expect(lesson.title).toBe('Transaction Test Lesson');
        
        // Verify lesson exists within transaction
        const found = await repository.findById(lesson.id, {}, tx);
        expect(found).toBeTruthy();
      });
    });
  });

  describe('findById', () => {
    test('finds lesson by ID with basic data', async () => {
      const created = await repository.createLesson({
        title: 'Find Test Lesson',
        price: 1000,
        instructorId: testInstructor.id
      });

      const found = await repository.findById(created.id);

      expect(found).toMatchObject({
        id: created.id,
        title: 'Find Test Lesson',
        price: 1000,
        instructorId: testInstructor.id
      });
    });

    test('finds lesson with instructor included', async () => {
      const created = await repository.createLesson({
        title: 'Instructor Test Lesson',
        price: 1200,
        instructorId: testInstructor.id
      });

      const found = await repository.findById(created.id, {
        includeInstructor: true
      });

      expect(found?.instructor).toMatchObject({
        id: testInstructor.id,
        name: testInstructor.name,
        email: testInstructor.email
      });
    });

    test('returns null for non-existent lesson', async () => {
      const found = await repository.findById('non-existent-id');
      expect(found).toBeNull();
    });

    test('supports transaction client', async () => {
      const created = await repository.createLesson({
        title: 'Transaction Find Test',
        price: 800,
        instructorId: testInstructor.id
      });

      await prisma.$transaction(async (tx) => {
        const found = await repository.findById(created.id, {}, tx);
        expect(found?.title).toBe('Transaction Find Test');
      });
    });
  });

  describe('updateLesson', () => {
    test('updates lesson with valid data', async () => {
      const created = await repository.createLesson({
        title: 'Original Title',
        description: 'Original description',
        price: 1500,
        instructorId: testInstructor.id
      });

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = await repository.updateLesson(created.id, {
        title: 'Updated Title',
        price: 2000,
        published: true
      });

      expect(updated).toMatchObject({
        id: created.id,
        title: 'Updated Title',
        description: 'Original description', // Unchanged
        price: 2000,
        published: true,
        instructorId: testInstructor.id
      });
      expect(updated.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
    });

    test('throws error for non-existent lesson', async () => {
      await expect(
        repository.updateLesson('non-existent-id', { title: 'New Title' })
      ).rejects.toThrow();
    });
  });

  describe('deleteLesson', () => {
    test('deletes lesson by ID', async () => {
      const created = await repository.createLesson({
        title: 'To Be Deleted',
        price: 1000,
        instructorId: testInstructor.id
      });

      await repository.deleteLesson(created.id);

      const found = await repository.findById(created.id);
      expect(found).toBeNull();
    });

    test('throws error for non-existent lesson', async () => {
      await expect(
        repository.deleteLesson('non-existent-id')
      ).rejects.toThrow();
    });
  });

  describe('searchLessons', () => {
    beforeEach(async () => {
      // Create test lessons for search
      await Promise.all([
        repository.createLesson({
          title: 'Beginner Kendama Basics',
          description: 'Learn the fundamentals of kendama',
          price: 1999,
          category: 'beginner',
          instructorId: testInstructor.id,
          published: true
        }),
        repository.createLesson({
          title: 'Advanced Kendama Tricks',
          description: 'Master complex kendama techniques',
          price: 4999,
          category: 'advanced',
          instructorId: testInstructor.id,
          published: true
        }),
        repository.createLesson({
          title: 'Unpublished Draft',
          description: 'This is not published',
          price: 2999,
          category: 'intermediate',
          instructorId: testInstructor.id,
          published: false
        })
      ]);
    });

    test('searches lessons by title', async () => {
      const results = await repository.searchLessons({
        query: 'Advanced'
      });

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Advanced Kendama Tricks');
    });

    test('searches lessons by category', async () => {
      const results = await repository.searchLessons({
        category: 'beginner'
      });

      expect(results).toHaveLength(1);
      expect(results[0].category).toBe('beginner');
    });

    test('filters by price range', async () => {
      const results = await repository.searchLessons({
        minPrice: 2000,
        maxPrice: 5000,
        published: true  // Only return published lessons
      });

      expect(results).toHaveLength(1);
      expect(results[0].price).toBe(4999);
    });

    test('filters by published status', async () => {
      const publishedResults = await repository.searchLessons({
        published: true
      });
      expect(publishedResults).toHaveLength(2);

      const unpublishedResults = await repository.searchLessons({
        published: false
      });
      expect(unpublishedResults).toHaveLength(1);
      expect(unpublishedResults[0].title).toBe('Unpublished Draft');
    });

    test('filters by instructor ID', async () => {
      const results = await repository.searchLessons({
        instructorId: testInstructor.id
      });

      expect(results).toHaveLength(3); // All test lessons
    });

    test('supports pagination', async () => {
      const results = await repository.searchLessons({
        limit: 2,
        offset: 1
      });

      expect(results).toHaveLength(2);
    });

    test('supports sorting', async () => {
      const priceAscResults = await repository.searchLessons(
        {},
        { field: 'price', direction: 'asc' }
      );

      expect(priceAscResults[0].price).toBeLessThanOrEqual(priceAscResults[1].price);
    });
  });

  describe('countLessons', () => {
    beforeEach(async () => {
      await Promise.all([
        repository.createLesson({
          title: 'Count Test 1',
          price: 1000,
          category: 'beginner',
          instructorId: testInstructor.id,
          published: true
        }),
        repository.createLesson({
          title: 'Count Test 2',
          price: 2000,
          category: 'advanced',
          instructorId: testInstructor.id,
          published: false
        })
      ]);
    });

    test('counts all lessons', async () => {
      const count = await repository.countLessons();
      expect(count).toBe(2);
    });

    test('counts with filters', async () => {
      const publishedCount = await repository.countLessons({
        published: true
      });
      expect(publishedCount).toBe(1);

      const categoryCount = await repository.countLessons({
        category: 'beginner'
      });
      expect(categoryCount).toBe(1);
    });
  });

  describe('findByInstructorId', () => {
    beforeEach(async () => {
      await Promise.all([
        repository.createLesson({
          title: 'Instructor Lesson 1',
          price: 1500,
          instructorId: testInstructor.id,
          published: true
        }),
        repository.createLesson({
          title: 'Instructor Lesson 2',
          price: 2500,
          instructorId: testInstructor.id,
          published: false
        })
      ]);
    });

    test('finds published lessons by instructor', async () => {
      const lessons = await repository.findByInstructorId(testInstructor.id, false);
      
      expect(lessons).toHaveLength(1);
      expect(lessons[0].published).toBe(true);
    });

    test('finds all lessons by instructor including unpublished', async () => {
      const lessons = await repository.findByInstructorId(testInstructor.id, true);
      
      expect(lessons).toHaveLength(2);
      expect(lessons.some(l => l.published === false)).toBe(true);
    });

    test('returns empty array for non-existent instructor', async () => {
      const lessons = await repository.findByInstructorId('non-existent-instructor');
      expect(lessons).toHaveLength(0);
    });
  });

  describe('existsById', () => {
    test('returns true for existing lesson', async () => {
      const created = await repository.createLesson({
        title: 'Exists Test',
        price: 1000,
        instructorId: testInstructor.id
      });

      const exists = await repository.existsById(created.id);
      expect(exists).toBe(true);
    });

    test('returns false for non-existent lesson', async () => {
      const exists = await repository.existsById('non-existent-id');
      expect(exists).toBe(false);
    });
  });

  describe('isLessonOwnedByInstructor', () => {
    test('returns true for lesson owned by instructor', async () => {
      const created = await repository.createLesson({
        title: 'Ownership Test',
        price: 1000,
        instructorId: testInstructor.id
      });

      const isOwned = await repository.isLessonOwnedByInstructor(
        created.id,
        testInstructor.id
      );
      expect(isOwned).toBe(true);
    });

    test('returns false for lesson not owned by instructor', async () => {
      const created = await repository.createLesson({
        title: 'Not Owned Test',
        price: 1000,
        instructorId: testInstructor.id
      });

      const isOwned = await repository.isLessonOwnedByInstructor(
        created.id,
        'different-instructor-id'
      );
      expect(isOwned).toBe(false);
    });
  });

  describe('getLessonStats', () => {
    test('calculates stats for lesson with no activity', async () => {
      const created = await repository.createLesson({
        title: 'Stats Test',
        price: 2000,
        instructorId: testInstructor.id
      });

      const stats = await repository.getLessonStats(created.id);

      expect(stats).toEqual({
        purchaseCount: 0,
        totalRevenue: 0,
        averageRating: null,
        reviewCount: 0
      });
    });

    test('calculates stats with purchases and reviews', async () => {
      const created = await repository.createLesson({
        title: 'Stats with Activity',
        price: 2000,
        instructorId: testInstructor.id,
        published: true
      });

      // Create test purchase
      await prisma.purchase.create({
        data: {
          id: 'test-purchase-id',
          userId: testStudent.id,
          lessonId: created.id,
          amount: 2000,
          platformFee: 300, // 15% of 2000
          instructorEarnings: 1700, // 85% of 2000
          status: 'COMPLETED',
          stripePaymentIntentId: 'pi_test_123'
        }
      });

      // Create test review
      await prisma.review.create({
        data: {
          id: 'test-review-id',
          userId: testStudent.id,
          lessonId: created.id,
          rating: 4,
          comment: 'Great lesson!'
        }
      });

      const stats = await repository.getLessonStats(created.id);

      expect(stats).toEqual({
        purchaseCount: 1,
        totalRevenue: 2000,
        averageRating: 4,
        reviewCount: 1
      });

      // Clean up
      await prisma.review.delete({ where: { id: 'test-review-id' } });
      await prisma.purchase.delete({ where: { id: 'test-purchase-id' } });
    });
  });
});