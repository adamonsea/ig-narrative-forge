import { z } from 'zod';

// Newsletter validation schema
export const newsletterSchema = z.object({
  email: z
    .string()
    .trim()
    .min(5, 'Email must be at least 5 characters')
    .max(255, 'Email must be less than 255 characters')
    .email('Please enter a valid email address')
    .refine(
      (email) => !email.includes('<') && !email.includes('>') && !email.includes('"'),
      'Email contains invalid characters'
    ),
  name: z
    .string()
    .trim()
    .max(100, 'Name must be less than 100 characters')
    .optional()
    .transform((val) => val || undefined),
});

// Topic creation schema
export const topicSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Topic name is required')
    .max(100, 'Topic name must be less than 100 characters')
    .refine(
      (name) => !/[<>\"'&]/.test(name),
      'Topic name contains invalid characters'
    ),
  description: z
    .string()
    .trim()
    .max(500, 'Description must be less than 500 characters')
    .optional()
    .transform((val) => val || undefined),
  keywords: z
    .array(z.string().trim().max(50))
    .max(20, 'Maximum 20 keywords allowed')
    .optional()
    .default([]),
});

// Content validation schema
export const contentSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters'),
  content: z
    .string()
    .trim()
    .min(10, 'Content must be at least 10 characters')
    .max(10000, 'Content must be less than 10,000 characters'),
  summary: z
    .string()
    .trim()
    .max(1000, 'Summary must be less than 1000 characters')
    .optional()
    .transform((val) => val || undefined),
});

// User profile validation schema
export const userProfileSchema = z.object({
  display_name: z
    .string()
    .trim()
    .max(100, 'Display name must be less than 100 characters')
    .optional()
    .transform((val) => val || undefined),
  bio: z
    .string()
    .trim()
    .max(500, 'Bio must be less than 500 characters')
    .optional()
    .transform((val) => val || undefined),
});

// Search query validation
export const searchSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1, 'Search query cannot be empty')
    .max(200, 'Search query must be less than 200 characters')
    .refine(
      (query) => !/[<>\"'&]/.test(query),
      'Search query contains invalid characters'
    ),
  filters: z.record(z.any()).optional().default({}),
});

export type NewsletterFormData = z.infer<typeof newsletterSchema>;
export type TopicFormData = z.infer<typeof topicSchema>;
export type ContentFormData = z.infer<typeof contentSchema>;
export type UserProfileFormData = z.infer<typeof userProfileSchema>;
export type SearchFormData = z.infer<typeof searchSchema>;