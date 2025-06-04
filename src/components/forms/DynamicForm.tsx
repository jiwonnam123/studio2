"use client";

import type { FormDefinition, FormFieldDefinition } from '@/types';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { FormFieldRenderer } from './FormFieldRenderer';
import { Form } from '@/components/ui/form';
import { Loader2, Send } from 'lucide-react';
import { useState } from 'react';

interface DynamicFormProps {
  formDefinition: FormDefinition;
  onSubmit: (data: Record<string, any>) => Promise<void>;
  isPreview?: boolean;
  initialData?: Record<string, any>;
}

// Dynamically build Zod schema from form definition
const buildZodSchema = (fields: FormFieldDefinition[]) => {
  const schemaShape: Record<string, z.ZodTypeAny> = {};
  fields.forEach(field => {
    let zodType: z.ZodTypeAny;

    switch (field.type) {
      case 'text':
      case 'textarea':
      case 'password':
      case 'select': // Assuming select value is string
      case 'radio':  // Assuming radio value is string
        zodType = z.string();
        if (field.minLength) zodType = zodType.min(field.minLength, { message: `${field.label} must be at least ${field.minLength} characters.` });
        if (field.maxLength) zodType = zodType.max(field.maxLength, { message: `${field.label} cannot exceed ${field.maxLength} characters.` });
        break;
      case 'email':
        zodType = z.string().email({ message: `Invalid email address for ${field.label}.` });
        break;
      case 'number':
        zodType = z.preprocess(
          (val) => (val === "" || val === null || val === undefined ? undefined : Number(val)),
          z.number({ invalid_type_error: `${field.label} must be a number.` })
        );
        if (field.min !== undefined) zodType = zodType.min(field.min, { message: `${field.label} must be at least ${field.min}.` });
        if (field.max !== undefined) zodType = zodType.max(field.max, { message: `${field.label} cannot exceed ${field.max}.` });
        break;
      case 'checkbox':
        zodType = z.boolean();
        break;
      case 'date':
        zodType = z.string().refine(val => !isNaN(Date.parse(val)), { message: `Invalid date for ${field.label}.` });
        break;
      case 'file':
        zodType = z.any(); // Basic file validation, can be extended with Zod File
        break;
      default:
        zodType = z.any();
    }

    if (field.required && field.type !== 'checkbox') { // Checkbox 'required' means it must be checked.
      if (zodType instanceof z.ZodString) {
        zodType = zodType.min(1, { message: `${field.label} is required.` });
      } else {
         // For other types, non-empty check is implicit if it's a string/number. For boolean or others, it's tricky.
         // For now, we rely on the base type. Zod .optional() is the opposite of required.
      }
    }
     if (field.required && field.type === 'checkbox') {
        zodType = z.literal(true, { errorMap: () => ({ message: `${field.label} must be checked.` }) });
    }


    schemaShape[field.name] = field.required ? zodType : zodType.optional();
    if(field.required && field.type === 'checkbox') { // Special handling for required checkbox
       schemaShape[field.name] = z.literal(true, { errorMap: () => ({ message: `${field.label} is required.` }) });
    } else if (field.type === 'checkbox') {
       schemaShape[field.name] = z.boolean().optional(); // Optional checkbox
    } else {
       schemaShape[field.name] = field.required ? zodType : zodType.optional();
    }


  });
  return z.object(schemaShape);
};


export function DynamicForm({ formDefinition, onSubmit, isPreview = false, initialData = {} }: DynamicFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const zodSchema = buildZodSchema(formDefinition.fields);
  
  const form = useForm<z.infer<typeof zodSchema>>({
    resolver: zodResolver(zodSchema),
    defaultValues: formDefinition.fields.reduce((acc, field) => {
      acc[field.name] = initialData[field.name] ?? field.defaultValue ?? (field.type === 'checkbox' ? false : '');
      return acc;
    }, {} as Record<string, any>),
  });

  const handleFormSubmit = async (data: z.infer<typeof zodSchema>) => {
    if (isPreview) {
      alert("This is a preview. Form submission is disabled.");
      return;
    }
    setIsSubmitting(true);
    await onSubmit(data);
    setIsSubmitting(false);
    if (!isPreview) form.reset(); // Reset form after successful submission if not preview
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
        {formDefinition.fields.map(fieldDef => (
          <Controller
            key={fieldDef.id}
            name={fieldDef.name as any} // Type assertion needed due to dynamic nature
            control={form.control}
            render={({ field: formField, fieldState: { error } }) => (
              <FormFieldRenderer
                fieldDef={fieldDef}
                formField={formField}
                error={error}
                isPreview={isPreview}
              />
            )}
          />
        ))}
        {!isPreview && (
          <Button type="submit" disabled={isSubmitting || form.formState.isSubmitting} className="w-full sm:w-auto">
            {(isSubmitting || form.formState.isSubmitting) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Send className="mr-2 h-4 w-4" />
            Submit Form
          </Button>
        )}
      </form>
    </Form>
  );
}
