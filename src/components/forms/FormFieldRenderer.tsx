"use client";

import type { Control, ControllerRenderProps, FieldError } from 'react-hook-form';
import type { FormFieldDefinition } from '@/types';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormControl, FormDescription, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface FormFieldRendererProps {
  fieldDef: FormFieldDefinition;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formField: ControllerRenderProps<any, string>; // field from react-hook-form controller
  error?: FieldError;
  isPreview?: boolean;
}

export function FormFieldRenderer({ fieldDef, formField, error, isPreview = false }: FormFieldRendererProps) {
  const commonProps = {
    ...formField,
    id: fieldDef.name,
    placeholder: fieldDef.placeholder,
    disabled: isPreview,
    required: fieldDef.required, // HTML5 required, RHF handles actual validation
  };

  const renderField = () => {
    switch (fieldDef.type) {
      case 'text':
      case 'email':
      case 'password':
      case 'number':
        return <Input type={fieldDef.type} {...commonProps} />;
      case 'textarea':
        return <Textarea {...commonProps} />;
      case 'checkbox':
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={commonProps.id}
              checked={commonProps.value || false}
              onCheckedChange={commonProps.onChange}
              disabled={commonProps.disabled}
              required={commonProps.required}
              aria-labelledby={`${commonProps.id}-label`}
            />
            <label
              htmlFor={commonProps.id}
              id={`${commonProps.id}-label`}
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {fieldDef.label} {/* Checkbox often has label beside it, FormLabel might be redundant */}
            </label>
          </div>
        );
      case 'radio':
        return (
          <RadioGroup
            onValueChange={commonProps.onChange}
            defaultValue={commonProps.value || fieldDef.defaultValue as string}
            className="flex flex-col space-y-1"
            disabled={commonProps.disabled}
            required={commonProps.required}
          >
            {fieldDef.options?.map(option => (
              <FormItem key={option.value} className="flex items-center space-x-3 space-y-0">
                <FormControl>
                  <RadioGroupItem value={option.value} id={`${fieldDef.name}-${option.value}`} />
                </FormControl>
                <FormLabel htmlFor={`${fieldDef.name}-${option.value}`} className="font-normal">
                  {option.label}
                </FormLabel>
              </FormItem>
            ))}
          </RadioGroup>
        );
      case 'select':
        return (
          <Select
            onValueChange={commonProps.onChange}
            defaultValue={commonProps.value || fieldDef.defaultValue as string}
            disabled={commonProps.disabled}
            required={commonProps.required}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={fieldDef.placeholder || 'Select an option'} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {fieldDef.options?.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'date':
        return (
          <Popover>
            <PopoverTrigger asChild>
              <FormControl>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !formField.value && "text-muted-foreground"
                  )}
                  disabled={isPreview}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formField.value ? format(new Date(formField.value), "PPP") : <span>{fieldDef.placeholder || "Pick a date"}</span>}
                </Button>
              </FormControl>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={formField.value ? new Date(formField.value) : undefined}
                onSelect={(date) => formField.onChange(date ? date.toISOString() : '')}
                disabled={isPreview || ((date) => date < new Date("1900-01-01"))}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        );
      case 'file':
        // Basic file input, no actual upload logic here
        return <Input type="file" {...commonProps} disabled={isPreview || true} />; // File upload disabled for now
      default:
        return <Input type="text" {...commonProps} value={`Unsupported type: ${fieldDef.type}`} disabled />;
    }
  };

  // Checkbox has its label handled differently due to ShadCN structure
  if (fieldDef.type === 'checkbox') {
    return (
      <FormItem>
        <FormControl>{renderField()}</FormControl>
        {fieldDef.placeholder && <FormDescription>{fieldDef.placeholder}</FormDescription>}
        {error && <FormMessage>{error.message}</FormMessage>}
      </FormItem>
    );
  }

  return (
    <FormItem>
      <FormLabel htmlFor={fieldDef.name}>{fieldDef.label}{fieldDef.required && !isPreview && <span className="text-destructive">*</span>}</FormLabel>
      <FormControl>{renderField()}</FormControl>
      {/* For radio group, placeholder might not make sense. Consider description if needed */}
      {fieldDef.placeholder && fieldDef.type !== 'radio' && fieldDef.type !== 'date' && <FormDescription>{fieldDef.placeholder}</FormDescription>}
      {error && <FormMessage>{error.message}</FormMessage>}
    </FormItem>
  );
}
