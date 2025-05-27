"use client";

import type { FormSubmission } from '@/types';
import { generateId } from './formStore'; // Re-use ID generator

const SUBMISSIONS_STORAGE_KEY = 'formflow_submissions';

export const getSubmissions = (formId?: string): FormSubmission[] => {
  if (typeof window === 'undefined') return [];
  const submissionsJson = window.localStorage.getItem(SUBMISSIONS_STORAGE_KEY);
  let submissions: FormSubmission[] = submissionsJson ? JSON.parse(submissionsJson) : [];
  if (formId) {
    submissions = submissions.filter(sub => sub.formId === formId);
  }
  return submissions.sort((a,b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
};

export const getSubmissionById = (id: string): FormSubmission | undefined => {
  const submissions = getSubmissions();
  return submissions.find(sub => sub.id === id);
};

export const saveSubmission = (submissionData: Omit<FormSubmission, 'id' | 'submittedAt'>): FormSubmission => {
  const submissions = getSubmissions();
  const newSubmission: FormSubmission = {
    ...submissionData,
    id: generateId(),
    submittedAt: new Date().toISOString(),
  };
  submissions.unshift(newSubmission); // Add to the beginning for chronological order
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SUBMISSIONS_STORAGE_KEY, JSON.stringify(submissions));
  }
  return newSubmission;
};

export const deleteSubmission = (id: string): void => {
  let submissions = getSubmissions();
  submissions = submissions.filter(sub => sub.id !== id);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SUBMISSIONS_STORAGE_KEY, JSON.stringify(submissions));
  }
};

export const deleteSubmissionsByFormId = (formId: string): void => {
  let submissions = getSubmissions();
  submissions = submissions.filter(sub => sub.formId !== formId);
   if (typeof window !== 'undefined') {
    window.localStorage.setItem(SUBMISSIONS_STORAGE_KEY, JSON.stringify(submissions));
  }
};
