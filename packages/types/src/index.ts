/**
 * Shared cross-app types used by both API and frontend.
 * 
 * @description These types define the contracts between the API and frontend,
 * representing the shape of data as it flows over HTTP. This is the highest
 * level of the type system hierarchy.
 */

// === HTTP Response Types ===

/**
 * Standard API response wrapper for all endpoints.
 * 
 * @template T - The type of data being returned
 */
export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

/**
 * Paginated response wrapper for list endpoints.
 * 
 * @template T - The type of items in the list
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// === User Session Types ===

/**
 * User session data attached to authenticated requests.
 * Used by both API middleware and frontend auth context.
 */
export interface UserSession {
  uid: string;
  email: string;
  name: string | null;
  role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
  stripeCustomerId?: string;
  stripeAccountId?: string;
}

// === API Contract Types (Frontend <-> API) ===

/**
 * Lesson data as returned by the API to the frontend.
 * This is what the frontend receives and displays.
 */
export interface LessonApiResponse {
  id: string;
  title: string;
  description: string | null;
  price: number;
  category: string | null;
  thumbnailUrl: string | null;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  instructor: {
    id: string;
    name: string | null;
    email: string;
  };
  stats: {
    purchaseCount: number;
    averageRating: number | null;
    reviewCount: number;
  };
  isPurchased?: boolean;
  hasAccess?: boolean;
}

/**
 * Review data as returned by the API.
 */
export interface ReviewApiResponse {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
  };
}

/**
 * Instructor dashboard data from API.
 */
export interface InstructorDashboardApiResponse {
  totalEarnings: number;
  pendingEarnings: number;
  lessonCount: number;
  totalPurchases: number;
  monthlyStats: {
    month: string;
    earnings: number;
    purchases: number;
  }[];
  recentPurchases: PurchaseApiResponse[];
}

/**
 * Purchase data as returned by the API.
 */
export interface PurchaseApiResponse {
  id: string;
  amount: number;
  platformFee: number;
  instructorEarnings: number;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  createdAt: string;
  lesson: {
    id: string;
    title: string;
    thumbnailUrl: string | null;
  };
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

// === API Input Types (Frontend -> API) ===

/**
 * Input for creating a new lesson.
 */
export interface CreateLessonApiInput {
  title: string;
  description?: string;
  price: number;
  category?: string;
}

/**
 * Input for updating an existing lesson.
 */
export interface UpdateLessonApiInput {
  title?: string;
  description?: string;
  price?: number;
  category?: string;
  published?: boolean;
  thumbnailUrl?: string;
}

/**
 * Input for lesson search/filtering.
 */
export interface LessonSearchApiInput {
  query?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  instructorId?: string;
  published?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: 'created' | 'price' | 'rating' | 'purchases';
  sortOrder?: 'asc' | 'desc';
}

// === Payment Types ===

/**
 * Stripe checkout session response.
 */
export interface CheckoutSessionApiResponse {
  sessionId: string;
  sessionUrl: string;
  expiresAt: string;
}

/**
 * Video access response with signed URL.
 */
export interface VideoAccessApiResponse {
  url: string;
  expiresAt: string;
}