import { z } from 'zod';

export const zString = (fieldName: string, min: number, max: number) => {
  return z
    .string({
      required_error: `${fieldName} is required`,
      invalid_type_error: `${fieldName} must be a string`
    })
    .min(min, `${fieldName} must be ${min} or more characters long`)
    .max(max, `${fieldName} must be ${max} or less characters long`)
    .trim();
};

export const zEmail = (fieldName: string) => {
  return z
    .string({
      required_error: `${fieldName} is required`,
      invalid_type_error: `${fieldName} must be a string`
    })
    .email(`${fieldName} must be a valid email address`)
    .trim();
};

export const zDate = (fieldName: string) => {
  return z
    .string({
      required_error: `${fieldName} is required`,
      invalid_type_error: `${fieldName} must be a string`
    })
    .date(`${fieldName} must be a valid date`)
    .trim();
};

export const zTime = (fieldName: string) => {
  return z
    .string({
      required_error: `${fieldName} is required`,
      invalid_type_error: `${fieldName} must be a string`
    })
    .regex(/^\d{2}:\d{2}$/, `${fieldName} must be a valid time`)
    .trim();
};

export const zISODateTime = (fieldName: string) => {
  return z
    .string({
      required_error: `${fieldName} is required`,
      invalid_type_error: `${fieldName} must be a string`
    })
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      `${fieldName} must be a valid ISO 8601 date and time with millis in UTC`
    )
    .trim();
};
