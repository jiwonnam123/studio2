export type FormFieldType =
  | 'text'
  | 'email'
  | 'password'
  | 'number'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'date'
  | 'file';

export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormFieldDefinition {
  id: string;
  label: string;
  name: string; // Should be unique within a form, used as key in form data
  type: FormFieldType;
  placeholder?: string;
  required?: boolean;
  options?: FormFieldOption[]; // For select, radio
  defaultValue?: string | number | boolean | string[];
  // Basic validation rules, more complex can be handled by Zod schema generation
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string; // regex pattern
}

export interface FormDefinition {
  id: string;
  title: string;
  description?: string;
  fields: FormFieldDefinition[];
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
  userId?: string; // To associate form with a user
}

export interface FormSubmission {
  id: string;
  formId: string;
  data: Record<string, any>; // Field names as keys
  submittedAt: string; // ISO date string
  userId?: string; // To associate submission with a user
}

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
}
