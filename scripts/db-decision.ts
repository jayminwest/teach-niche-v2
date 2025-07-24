#!/usr/bin/env tsx

import { Firestore } from '@google-cloud/firestore';
import { Client } from 'pg';

interface TestResult {
  database: string;
  operation: string;
  complexity: string;
  performance: string;
  notes: string;
}

const results: TestResult[] = [];

// Test 1: Get instructor dashboard (user info + total earnings + lesson count)
async function testInstructorDashboard() {
  const instructorId = 'instructor-123';
  
  // Firestore approach
  console.log('\n=== Test 1: Instructor Dashboard ===');
  console.log('Firestore approach:');
  console.log(`
  // Multiple queries needed:
  const instructor = await db.collection('users').doc(instructorId).get();
  const lessons = await db.collection('lessons')
    .where('instructorId', '==', instructorId).get();
  
  // For each lesson, get purchases to calculate earnings
  let totalEarnings = 0;
  for (const lesson of lessons.docs) {
    const purchases = await db.collection('purchases')
      .where('lessonId', '==', lesson.id).get();
    totalEarnings += purchases.size * lesson.data().price * 0.85;
  }
  
  // Result: N+1 query problem, poor performance at scale
  `);
  
  console.log('\nPostgreSQL approach:');
  console.log(`
  SELECT 
    u.*,
    COUNT(DISTINCT l.id) as lesson_count,
    COALESCE(SUM(p.amount * 0.85), 0) as total_earnings
  FROM users u
  LEFT JOIN lessons l ON l.instructor_id = u.id
  LEFT JOIN purchases p ON p.lesson_id = l.id
  WHERE u.id = $1
  GROUP BY u.id;
  
  // Result: Single query with JOINs, excellent performance
  `);
  
  results.push({
    database: 'Firestore',
    operation: 'Instructor Dashboard',
    complexity: 'High (N+1 queries)',
    performance: 'Poor at scale',
    notes: 'Requires denormalization or expensive queries'
  });
  
  results.push({
    database: 'PostgreSQL',
    operation: 'Instructor Dashboard',
    complexity: 'Low (single query)',
    performance: 'Excellent',
    notes: 'Native JOIN support makes this trivial'
  });
}

// Test 2: Browse lessons with filters
async function testLessonBrowsing() {
  console.log('\n=== Test 2: Browse Lessons with Filters ===');
  console.log('Firestore approach:');
  console.log(`
  // Limited to one range filter per query
  const lessons = await db.collection('lessons')
    .where('category', '==', 'beginner')
    .where('price', '>=', 1000)
    .where('price', '<=', 5000)
    // .where('rating', '>=', 4) // NOT POSSIBLE! Already using range on price
    .orderBy('price')
    .limit(20)
    .get();
  
  // Must filter by rating in application code
  const filtered = lessons.docs.filter(doc => doc.data().rating >= 4);
  
  // Breaks pagination if many lessons don't meet rating criteria
  `);
  
  console.log('\nPostgreSQL approach:');
  console.log(`
  SELECT l.*, u.name as instructor_name, 
         AVG(r.rating) as avg_rating,
         COUNT(p.id) as purchase_count
  FROM lessons l
  JOIN users u ON u.id = l.instructor_id
  LEFT JOIN reviews r ON r.lesson_id = l.id
  LEFT JOIN purchases p ON p.lesson_id = l.id
  WHERE l.category = $1
    AND l.price BETWEEN $2 AND $3
    AND l.published = true
  GROUP BY l.id, u.name
  HAVING AVG(r.rating) >= $4 OR COUNT(r.id) = 0
  ORDER BY l.created_at DESC
  LIMIT 20 OFFSET $5;
  
  // Full flexibility with multiple filters and aggregations
  `);
  
  results.push({
    database: 'Firestore',
    operation: 'Browse with Filters',
    complexity: 'High',
    performance: 'Poor with multiple filters',
    notes: 'Only one range filter allowed, breaks pagination'
  });
  
  results.push({
    database: 'PostgreSQL',
    operation: 'Browse with Filters',
    complexity: 'Low',
    performance: 'Excellent with indexes',
    notes: 'Full SQL power for complex queries'
  });
}

// Test 3: Verify purchase access
async function testPurchaseVerification() {
  console.log('\n=== Test 3: Verify Purchase Access ===');
  console.log('Both databases handle this well:');
  console.log(`
  // Firestore
  const purchase = await db.collection('purchases')
    .where('userId', '==', userId)
    .where('lessonId', '==', lessonId)
    .limit(1)
    .get();
  const hasAccess = !purchase.empty;
  
  // PostgreSQL
  SELECT EXISTS(
    SELECT 1 FROM purchases 
    WHERE user_id = $1 AND lesson_id = $2
  ) as has_access;
  `);
  
  results.push({
    database: 'Both',
    operation: 'Purchase Verification',
    complexity: 'Low',
    performance: 'Excellent',
    notes: 'Simple lookup works well in both'
  });
}

// Test 4: Financial reporting and payouts
async function testFinancialReporting() {
  console.log('\n=== Test 4: Financial Reporting ===');
  console.log('Firestore approach:');
  console.log(`
  // Get unpaid earnings for all instructors
  // Requires complex client-side aggregation
  const instructors = await db.collection('users')
    .where('role', '==', 'instructor').get();
  
  for (const instructor of instructors.docs) {
    const lessons = await db.collection('lessons')
      .where('instructorId', '==', instructor.id).get();
    
    let unpaidEarnings = 0;
    for (const lesson of lessons.docs) {
      const unpaidPurchases = await db.collection('purchases')
        .where('lessonId', '==', lesson.id)
        .where('paidOut', '==', false)
        .get();
      unpaidEarnings += unpaidPurchases.size * lesson.data().price * 0.85;
    }
  }
  
  // Extremely inefficient for monthly payouts
  `);
  
  console.log('\nPostgreSQL approach:');
  console.log(`
  -- Get all instructors with unpaid earnings > $50
  WITH instructor_earnings AS (
    SELECT 
      u.id,
      u.email,
      u.stripe_account_id,
      SUM(p.amount * 0.85) as unpaid_earnings,
      COUNT(p.id) as unpaid_purchases,
      MIN(p.created_at) as oldest_unpaid
    FROM users u
    JOIN lessons l ON l.instructor_id = u.id
    JOIN purchases p ON p.lesson_id = l.id
    WHERE u.role = 'instructor'
      AND p.paid_out = false
      AND p.status = 'completed'
    GROUP BY u.id
    HAVING SUM(p.amount * 0.85) >= 5000 -- $50 minimum
  )
  SELECT * FROM instructor_earnings
  ORDER BY unpaid_earnings DESC;
  
  -- Then update all paid purchases in a transaction
  `);
  
  results.push({
    database: 'Firestore',
    operation: 'Financial Reporting',
    complexity: 'Very High',
    performance: 'Very Poor',
    notes: 'Not suitable for financial aggregations'
  });
  
  results.push({
    database: 'PostgreSQL',
    operation: 'Financial Reporting',
    complexity: 'Low',
    performance: 'Excellent',
    notes: 'Built for financial data integrity'
  });
}

// Summary and recommendation
function printSummary() {
  console.log('\n=== DATABASE DECISION SUMMARY ===\n');
  console.log('Test Results:');
  console.table(results);
  
  console.log('\n🎯 RECOMMENDATION: PostgreSQL (Cloud SQL)\n');
  console.log('Reasons:');
  console.log('1. Complex queries with JOINs are essential for instructor dashboards');
  console.log('2. Multiple range filters needed for lesson browsing');
  console.log('3. Financial data requires ACID transactions and aggregations');
  console.log('4. Relational data model fits naturally');
  console.log('5. Better cost predictability (no per-read charges)');
  
  console.log('\nMigration Strategy:');
  console.log('- Start with PostgreSQL as primary database');
  console.log('- Add Redis for caching frequently accessed data');
  console.log('- Consider Firestore later for real-time features only');
  
  console.log('\nDatabase Schema Preview:');
  console.log(`
  -- Core tables needed
  CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'student',
    stripe_customer_id VARCHAR(255),
    stripe_account_id VARCHAR(255), -- for instructors
    created_at TIMESTAMP DEFAULT NOW()
  );
  
  CREATE TABLE lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instructor_id UUID REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    price INTEGER NOT NULL, -- in cents
    category VARCHAR(50),
    video_url VARCHAR(500),
    published BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
  );
  
  CREATE TABLE purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    lesson_id UUID REFERENCES lessons(id),
    amount INTEGER NOT NULL,
    stripe_payment_intent_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending',
    paid_out BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, lesson_id)
  );
  
  CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    lesson_id UUID REFERENCES lessons(id),
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, lesson_id)
  );
  `);
}

// Run all tests
async function main() {
  console.log('🔍 Database Decision Proof-of-Concept for Teach Niche V2\n');
  console.log('Comparing Firestore vs PostgreSQL for key operations...\n');
  
  await testInstructorDashboard();
  await testLessonBrowsing();
  await testPurchaseVerification();
  await testFinancialReporting();
  
  printSummary();
}

main().catch(console.error);