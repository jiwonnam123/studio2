import { z } from 'zod';

export const FormFieldOptionSchema = z.object({
  value: z.string().min(1, "Option value cannot be empty"),
  label: z.string().min(1, "Option label cannot be empty"),
});

export const FormFieldDefinitionSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1, "Label is required").max(100, "Label is too long"),
  name: z.string().min(1, "Field name is required").max(50, "Field name is too long").regex(/^[a-zA-Z0-9_]+$/, "Field name can only contain letters, numbers, and underscores"),
  type: z.enum([
    'text',
    'email',
    'password',
    'number',
    'textarea',
    'select',
    'checkbox',
    'radio',
    'date',
    'file',
  ]),
  placeholder: z.string().max(100, "Placeholder is too long").optional(),
  required: z.boolean().optional(),
  options: z.array(FormFieldOptionSchema).optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
  minLength: z.number().int().positive().optional(),
  maxLength: z.number().int().positive().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().optional(),
});

export const FormDefinitionSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1, "Title is required").max(150, "Title is too long"),
  description: z.string().max(500, "Description is too long").optional(),
  fields: z.array(FormFieldDefinitionSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  userId: z.string().optional(),
});

export const FormSubmissionSchema = z.object({
  id: z.string().uuid(),
  formId: z.string().uuid(),
  data: z.record(z.any()),
  submittedAt: z.string().datetime(),
  userId: z.string().optional(),
});

export const SignupSchema = z.object({
  name: z.string().min(2, { message: "이름은 2글자 이상이어야 합니다." }),
  email: z.string().email({
    message: "올바른 이메일 형식을 입력해주세요.",
  }),
  password: z.string().min(8, { message: "비밀번호는 8자 이상이어야 합니다." }),
  confirmPassword: z.string().min(8, { message: "비밀번호 확인을 입력해주세요." }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "비밀번호가 일치하지 않습니다.",
  path: ["confirmPassword"], // 에러 메시지를 confirmPassword 필드에 표시
});

export const RegisterSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters" }).max(50, { message: "Name is too long" }),
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"], // path to field that gets the error
});

export const LoginSchema = z.object({
  email: z.string().email({
    message: "올바른 이메일 형식을 입력해주세요.",
  }),
  password: z.string().min(1, { message: "비밀번호를 입력해주세요." }),
});

// Schema for AI field suggestions input
export const AiSuggestFieldsSchema = z.object({
  formTitle: z.string().min(1, "Form title is required for AI suggestions."),
  formDescription: z.string().optional(),
});
