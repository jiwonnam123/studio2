"use client"; 

import type { FormDefinition } from '@/types';

const FORMS_STORAGE_KEY = 'formflow_forms';

// This function should ideally be run in a context or a hook that ensures it's client-side.
// For direct use in server components or on initial server render, localStorage is not available.
// The useLocalStorage hook handles this gracefully.

export const getForms = (): FormDefinition[] => {
  if (typeof window === 'undefined') return [];
  const formsJson = window.localStorage.getItem(FORMS_STORAGE_KEY);
  return formsJson ? JSON.parse(formsJson) : [];
};

export const getFormById = (id: string): FormDefinition | undefined => {
  const forms = getForms();
  return forms.find(form => form.id === id);
};

export const saveForm = (formToSave: FormDefinition): FormDefinition => {
  let forms = getForms();
  const existingFormIndex = forms.findIndex(form => form.id === formToSave.id);

  if (existingFormIndex > -1) {
    forms[existingFormIndex] = { ...formToSave, updatedAt: new Date().toISOString() };
  } else {
    const newForm = { ...formToSave, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    forms.push(newForm);
  }
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(FORMS_STORAGE_KEY, JSON.stringify(forms));
  }
  return formToSave; // or the updated/new form from the array
};

export const deleteForm = (id: string): void => {
  let forms = getForms();
  forms = forms.filter(form => form.id !== id);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(FORMS_STORAGE_KEY, JSON.stringify(forms));
  }
};

// Ensure crypto.randomUUID is available or polyfill if needed for older environments
// For modern browsers and Node.js, it's generally available.
export const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Basic fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};
