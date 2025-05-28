
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
  userId?: string; // To associate form with a user (Firebase UID)
}

export interface FormSubmission {
  id: string;
  formId: string;
  data: Record<string, any>; // Field names as keys
  submittedAt: string; // ISO date string
  userId?: string; // To associate submission with a user (Firebase UID)
}

export interface UserProfile {
  id: string; // Firebase UID will be mapped to this
  email: string | null; // Firebase email can be null
  name?: string | null; // Firebase displayName can be null
}

// Inquiry data structure for Firestore
export interface SubmittedInquiryDataRow {
  campaignKey: string;
  campaignName: string;
  adidOrIdfa: string;
  userName: string;
  contact: string;
  remarks: string;
  // Add any other fixed columns if necessary, or allow flexible columns
  [key: string]: string; // Allows for potential extra columns if needed, though we aim for 6 fixed
}

// Base type for data as stored in Firestore or being prepared for storage
// `submittedAt` is special: serverTimestamp() on write, Firestore Timestamp on read.
export interface SubmittedInquiryBase {
  userId: string;
  source: 'excel' | 'direct';
  fileName?: string; // For excel uploads
  data: SubmittedInquiryDataRow[];
}

// Type for data after fetching from Firestore and processing for client-side use
export interface SubmittedInquiry extends SubmittedInquiryBase {
  id: string; // Firestore document ID
  submittedAt: string; // ISO date string for client-side display/sorting
}
