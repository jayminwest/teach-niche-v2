export const PLATFORM_FEE_PERCENT = 15;

export function calculatePlatformFee(amount: number): number {
  return Math.floor(amount * PLATFORM_FEE_PERCENT / 100);
}

export function calculateInstructorEarnings(amount: number): number {
  return amount - calculatePlatformFee(amount);
}

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function parseQueryParams<T extends Record<string, any>>(
  searchParams: URLSearchParams
): T {
  const params: any = {};
  
  for (const [key, value] of searchParams.entries()) {
    if (value === 'true') params[key] = true;
    else if (value === 'false') params[key] = false;
    else if (!isNaN(Number(value))) params[key] = Number(value);
    else params[key] = value;
  }
  
  return params as T;
}

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Alias for backwards compatibility
export const ApiError = AppError;