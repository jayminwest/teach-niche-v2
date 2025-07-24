/**
 * Integration tests for lessons router.
 * 
 * @description Tests full HTTP flow end-to-end with real Express server,
 * real middleware, real services, and real database operations.
 * Verifies API contracts, HTTP status codes, response formats,
 * authentication, and error handling.
 * 
 * No mocking - all tests use real HTTP requests against real endpoints
 * following the project's real-data testing philosophy.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import prisma, { User } from '@teach-niche/database';
import { lessonRouter } from '../router';
import { ApiResponse, LessonApiResponse, PaginatedResponse } from '@teach-niche/types';

// Create test Express app
const app = express();
app.use(express.json());

// Test auth middleware that extracts user info from headers
const testAuthMiddleware = (req: any, res: any, next: any) => {
  // Extract user info from test headers
  const userId = req.headers['x-test-user-id'] as string;
  const userRole = req.headers['x-test-user-role'] as string;
  const userEmail = req.headers['x-test-user-email'] as string;
  const userName = req.headers['x-test-user-name'] as string;

  if (userId) {
    req.user = {
      uid: userId,
      role: userRole,
      email: userEmail,
      name: userName
    };
  }
  next();
};

// Apply middleware and router to test app
app.use('/api/lessons', testAuthMiddleware, lessonRouter);

// Test users
let instructorUser: User;
let otherInstructorUser: User;
let studentUser: User;
let adminUser: User;

describe('LessonRouter Integration Tests', () => {
  beforeAll(async () => {
    // Create test users
    [instructorUser, otherInstructorUser, studentUser, adminUser] = await Promise.all([
      prisma.user.create({
        data: {
          id: 'router-inst-1',
          firebaseUid: 'firebase-router-inst-1',
          email: 'inst1@router-test.com',
          name: 'Router Instructor One',
          role: 'INSTRUCTOR'
        }
      }),
      prisma.user.create({
        data: {
          id: 'router-inst-2',
          firebaseUid: 'firebase-router-inst-2',
          email: 'inst2@router-test.com',
          name: 'Router Instructor Two',
          role: 'INSTRUCTOR'
        }
      }),
      prisma.user.create({
        data: {
          id: 'router-student-1',
          firebaseUid: 'firebase-router-student-1',
          email: 'student1@router-test.com',
          name: 'Router Student One',
          role: 'STUDENT'
        }
      }),
      prisma.user.create({
        data: {
          id: 'router-admin-1',
          firebaseUid: 'firebase-router-admin-1',
          email: 'admin1@router-test.com',
          name: 'Router Admin One',
          role: 'ADMIN'
        }
      })
    ]);
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

  describe('Health and Monitoring Endpoints', () => {
    test('GET /health should return service health', async () => {
      const response = await request(app)
        .get('/api/lessons/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        service: 'lessons',
        timestamp: expect.any(String),
        version: expect.any(String)
      });
    });

    test('GET /info should return service information', async () => {
      const response = await request(app)
        .get('/api/lessons/info')
        .expect(200);

      expect(response.body).toMatchObject({
        service: 'lessons',
        version: expect.any(String),
        environment: expect.any(String),
        features: expect.arrayContaining(['crud', 'search', 'instructor-management', 'statistics'])
      });
    });

    test('GET /metrics should return Prometheus metrics', async () => {
      const response = await request(app)
        .get('/api/lessons/metrics')
        .expect(200);

      expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(response.text).toContain('lessons_total');
      expect(response.text).toContain('lessons_searches_total');
    });
  });

  describe('POST /api/lessons (Create Lesson)', () => {
    const validLessonData = {
      title: 'Router Test Lesson',
      description: 'A lesson created via HTTP API',
      price: 2999,
      category: 'intermediate'
    };

    test('should create lesson for authenticated instructor', async () => {
      const response = await request(app)
        .post('/api/lessons')
        .set('x-test-user-id', instructorUser.id)
        .set('x-test-user-role', instructorUser.role)
        .set('x-test-user-email', instructorUser.email)
        .set('x-test-user-name', instructorUser.name)
        .send(validLessonData)
        .expect(201);

      const body: ApiResponse<LessonApiResponse> = response.body;
      expect(body.data).toMatchObject({
        title: validLessonData.title,
        description: validLessonData.description,
        price: validLessonData.price,
        category: validLessonData.category,
        published: false,
        instructor: {
          id: instructorUser.id,
          name: instructorUser.name,
          email: instructorUser.email
        },
        stats: {
          purchaseCount: 0,
          averageRating: null,
          reviewCount: 0
        }
      });
      expect(body.message).toBe('Lesson created successfully');
      expect(body.timestamp).toBeDefined();
    });

    test('should return 401 for unauthenticated request', async () => {
      await request(app)
        .post('/api/lessons')
        .send(validLessonData)
        .expect(401);
    });

    test('should return 403 for non-instructor', async () => {
      await request(app)
        .post('/api/lessons')
        .set('x-test-user-id', studentUser.id)
        .set('x-test-user-role', studentUser.role)
        .send(validLessonData)
        .expect(403);
    });

    test('should return 400 for invalid data', async () => {
      await request(app)
        .post('/api/lessons')
        .set('x-test-user-id', instructorUser.id)
        .set('x-test-user-role', instructorUser.role)
        .send({ ...validLessonData, title: '' })
        .expect(400);
    });
  });

  describe('GET /api/lessons (Search Lessons)', () => {
    beforeEach(async () => {
      // Create test lessons
      const lesson1 = await prisma.lesson.create({
        data: {
          title: 'Published Beginner Lesson',
          description: 'Learn kendama basics',
          price: 1999,
          category: 'beginner',
          published: true,
          instructorId: instructorUser.id
        }
      });

      const lesson2 = await prisma.lesson.create({
        data: {
          title: 'Published Advanced Lesson',
          description: 'Master advanced tricks',
          price: 4999,
          category: 'advanced',
          published: true,
          instructorId: instructorUser.id
        }
      });

      await prisma.lesson.create({
        data: {
          title: 'Unpublished Draft',
          description: 'Work in progress',
          price: 2999,
          category: 'intermediate',
          published: false,
          instructorId: instructorUser.id
        }
      });
    });

    test('should return published lessons for public access', async () => {
      const response = await request(app)
        .get('/api/lessons')
        .expect(200);

      const body: ApiResponse<PaginatedResponse<any>> = response.body;
      expect(body.data.items).toHaveLength(2);
      expect(body.data.total).toBe(2);
      expect(body.data.page).toBe(1);
      expect(body.data.pageSize).toBe(20);
      expect(body.data.hasMore).toBe(false);
    });

    test('should support search query parameter', async () => {
      const response = await request(app)
        .get('/api/lessons?q=advanced')
        .expect(200);

      const body: ApiResponse<PaginatedResponse<any>> = response.body;
      expect(body.data.items).toHaveLength(1);
      expect(body.data.items[0].title).toBe('Published Advanced Lesson');
    });

    test('should support category filter', async () => {
      const response = await request(app)
        .get('/api/lessons?category=beginner')
        .expect(200);

      const body: ApiResponse<PaginatedResponse<any>> = response.body;
      expect(body.data.items).toHaveLength(1);
      expect(body.data.items[0].title).toBe('Published Beginner Lesson');
    });

    test('should support price range filters', async () => {
      const response = await request(app)
        .get('/api/lessons?minPrice=4000')
        .expect(200);

      const body: ApiResponse<PaginatedResponse<any>> = response.body;
      expect(body.data.items).toHaveLength(1);
      expect(body.data.items[0].title).toBe('Published Advanced Lesson');
    });

    test('should support pagination', async () => {
      const response = await request(app)
        .get('/api/lessons?page=1&pageSize=1')
        .expect(200);

      const body: ApiResponse<PaginatedResponse<any>> = response.body;
      expect(body.data.items).toHaveLength(1);
      expect(body.data.total).toBe(2);
      expect(body.data.hasMore).toBe(true);
    });

    test('should validate pagination parameters', async () => {
      await request(app)
        .get('/api/lessons?page=0')
        .expect(400);

      await request(app)
        .get('/api/lessons?pageSize=101')
        .expect(400);
    });
  });

  describe('GET /api/lessons/:id (Get Lesson by ID)', () => {
    let publishedLesson: any;
    let unpublishedLesson: any;

    beforeEach(async () => {
      publishedLesson = await prisma.lesson.create({
        data: {
          title: 'Published Test Lesson',
          description: 'A published lesson for testing',
          price: 2999,
          category: 'intermediate',
          published: true,
          instructorId: instructorUser.id
        }
      });

      unpublishedLesson = await prisma.lesson.create({
        data: {
          title: 'Unpublished Test Lesson',
          description: 'An unpublished lesson for testing',
          price: 3999,
          category: 'advanced',
          published: false,
          instructorId: instructorUser.id
        }
      });
    });

    test('should return published lesson to any user', async () => {
      const response = await request(app)
        .get(`/api/lessons/${publishedLesson.id}`)
        .expect(200);

      const body: ApiResponse<LessonApiResponse> = response.body;
      expect(body.data).toMatchObject({
        id: publishedLesson.id,
        title: 'Published Test Lesson',
        published: true,
        stats: {
          purchaseCount: 0,
          averageRating: null,
          reviewCount: 0
        }
      });
    });

    test('should return unpublished lesson to owner', async () => {
      const response = await request(app)
        .get(`/api/lessons/${unpublishedLesson.id}`)
        .set('x-test-user-id', instructorUser.id)
        .set('x-test-user-role', instructorUser.role)
        .expect(200);

      const body: ApiResponse<LessonApiResponse> = response.body;
      expect(body.data.id).toBe(unpublishedLesson.id);
      expect(body.data.published).toBe(false);
    });

    test('should return 403 for unpublished lesson to non-owner', async () => {
      await request(app)
        .get(`/api/lessons/${unpublishedLesson.id}`)
        .set('x-test-user-id', studentUser.id)
        .set('x-test-user-role', studentUser.role)
        .expect(403);
    });

    test('should return 404 for non-existent lesson', async () => {
      await request(app)
        .get('/api/lessons/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });

    test('should return 400 for invalid UUID format', async () => {
      await request(app)
        .get('/api/lessons/invalid-uuid')
        .expect(400);
    });

    test('should include user context for authenticated requests', async () => {
      // Create a purchase for testing user context
      await prisma.purchase.create({
        data: {
          id: 'router-test-purchase',
          userId: studentUser.id,
          lessonId: publishedLesson.id,
          amount: publishedLesson.price,
          platformFee: Math.floor(publishedLesson.price * 0.15),
          instructorEarnings: Math.floor(publishedLesson.price * 0.85),
          status: 'COMPLETED',
          stripePaymentIntentId: 'pi_router_test_123'
        }
      });

      const response = await request(app)
        .get(`/api/lessons/${publishedLesson.id}`)
        .set('x-test-user-id', studentUser.id)
        .set('x-test-user-role', studentUser.role)
        .expect(200);

      const body: ApiResponse<LessonApiResponse> = response.body;
      expect(body.data.isPurchased).toBe(true);
      expect(body.data.hasAccess).toBe(true);
    });
  });
});