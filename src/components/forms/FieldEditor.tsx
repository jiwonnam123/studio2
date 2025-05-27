"use client";

import type { FormFieldDefinition, FormFieldOption } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trash2, PlusCircle, GripVertical } from 'lucide-react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormFieldDefinitionSchema } from '@/lib/schemas'; // Using the main schema for individual field editing too.
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

interface FieldEditorProps {
  field: FormFieldDefinition;
  onUpdateField: (updatedField: FormFieldDefinition) => void;
  onDeleteField: (fieldId: string) => void;
  index: number;
  isOnlyField: boolean;
}

export function FieldEditor({ field, onUpdateField, onDeleteField, index, isOnlyField }: FieldEditorProps) {
  const form = useForm<FormFieldDefinition>({
    resolver: zodResolver(FormFieldDefinitionSchema),
    defaultValues: field,
    // Trigger re-validation and re-render when field prop changes
    values: field, 
    resetOptions: {
      keepDirtyValues: true, // Keep user's changes if they are editing
    },
  });

  const { control, watch, handleSubmit, setValue } = form;
  const fieldType = watch('type');

  const { fields: options, append: appendOption, remove: removeOption } = useFieldArray({
    control,
    name: "options",
  });

  const onSubmit = (data: FormFieldDefinition) => {
    onUpdateField(data);
  };

  // Auto-save on blur / value change (debounced would be better for production)
  const handleBlur = () => {
     handleSubmit(onSubmit)();
  };

  return (
    <Card className="mb-4 border border-border shadow-md" data-id={field.id}>
      <CardHeader className="flex flex-row items-center justify-between bg-muted/50 p-3">
        <div className="flex items-center gap-2">
           <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
           <CardTitle className="text-md">Field #{index + 1}: {watch('label') || `(Untitled ${watch('type')} field)`}</CardTitle>
        </div>
        <Button variant="ghost" size="icon" onClick={() => onDeleteField(field.id)} disabled={isOnlyField} aria-label="Delete field">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </CardHeader>
      <CardContent className="p-4">
        <Form {...form}>
          <form onChange={handleBlur} className="space-y-4"> {/* onChange for auto-save simulation */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={control}
                name="label"
                render={({ field: formField }) => (
                  <FormItem>
                    <FormLabel>Label</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Your Name" {...formField} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="name"
                render={({ field: formField }) => (
                  <FormItem>
                    <FormLabel>Field Name (for data)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., user_name (no spaces)" {...formField} />
                    </FormControl>
                    <FormDescription>Unique identifier for this field. No spaces or special characters.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={control}
              name="type"
              render={({ field: formField }) => (
                <FormItem>
                  <FormLabel>Field Type</FormLabel>
                  <Select onValueChange={(value) => {
                      formField.onChange(value);
                      if (value !== 'select' && value !== 'radio') {
                        setValue('options', []); // Clear options if not select/radio
                      }
                    }} defaultValue={formField.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select field type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="password">Password</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="textarea">Textarea</SelectItem>
                      <SelectItem value="select">Select</SelectItem>
                      <SelectItem value="radio">Radio Group</SelectItem>
                      <SelectItem value="checkbox">Checkbox</SelectItem>
                      <SelectItem value="date">Date</SelectItem>
                      <SelectItem value="file" disabled>File Upload (Soon)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {(fieldType === 'text' || fieldType === 'email' || fieldType === 'password' || fieldType === 'textarea') && (
              <FormField
                control={control}
                name="placeholder"
                render={({ field: formField }) => (
                  <FormItem>
                    <FormLabel>Placeholder</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Enter your email address" {...formField} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {fieldType === 'textarea' && (
               <FormField
                control={control}
                name="maxLength" // Example, can be minRows, maxRows etc.
                render={({ field: formField }) => (
                  <FormItem>
                    <FormLabel>Max Length (Textarea)</FormLabel>
                    <FormControl>
                       <Input type="number" placeholder="e.g., 500" {...formField} onChange={e => formField.onChange(parseInt(e.target.value))} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            {(fieldType === 'select' || fieldType === 'radio') && (
              <div className="space-y-3">
                <FormLabel>Options</FormLabel>
                {options.map((option, optionIndex) => (
                  <Card key={option.id} className="p-3 bg-muted/20">
                    <div className="flex items-end gap-2">
                      <FormField
                        control={control}
                        name={`options.${optionIndex}.label`}
                        render={({ field: formField }) => (
                           <FormItem className="flex-1">
                            <FormLabel className="text-xs">Label</FormLabel>
                            <FormControl><Input placeholder="Option Label" {...formField} /></FormControl>
                            <FormMessage/>
                           </FormItem>
                        )}
                      />
                       <FormField
                        control={control}
                        name={`options.${optionIndex}.value`}
                        render={({ field: formField }) => (
                           <FormItem className="flex-1">
                            <FormLabel className="text-xs">Value</FormLabel>
                            <FormControl><Input placeholder="Option Value" {...formField} /></FormControl>
                            <FormMessage/>
                           </FormItem>
                        )}
                      />
                      <Button variant="ghost" size="icon" onClick={() => removeOption(optionIndex)} aria-label="Delete option">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </Card>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => appendOption({ label: '', value: '' })}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Add Option
                </Button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <FormField
                control={control}
                name="required"
                render={({ field: formField }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 shadow-sm">
                    <FormControl>
                       <Checkbox checked={formField.value} onCheckedChange={formField.onChange} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Required Field</FormLabel>
                      <FormDescription>Is this field mandatory?</FormDescription>
                    </div>
                  </FormItem>
                )}
              />
               <FormField
                control={control}
                name="defaultValue"
                render={({ field: formField }) => (
                  <FormItem>
                    <FormLabel>Default Value (optional)</FormLabel>
                    <FormControl>
                       <Input placeholder="Default value" {...formField} />
                    </FormControl>
                     <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Basic validation examples - could be expanded */}
            {(fieldType === 'text' || fieldType === 'textarea' || fieldType === 'password') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={control}
                  name="minLength"
                  render={({ field: formField }) => (
                    <FormItem>
                      <FormLabel>Min Length</FormLabel>
                      <FormControl><Input type="number" placeholder="e.g., 5" {...formField} onChange={e => formField.onChange(parseInt(e.target.value))} /></FormControl>
                      <FormMessage/>
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="maxLength"
                  render={({ field: formField }) => (
                    <FormItem>
                      <FormLabel>Max Length</FormLabel>
                      <FormControl><Input type="number" placeholder="e.g., 100" {...formField} onChange={e => formField.onChange(parseInt(e.target.value))} /></FormControl>
                      <FormMessage/>
                    </FormItem>
                  )}
                />
              </div>
            )}
             {fieldType === 'number' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={control}
                  name="min"
                  render={({ field: formField }) => (
                    <FormItem>
                      <FormLabel>Min Value</FormLabel>
                      <FormControl><Input type="number" placeholder="e.g., 0" {...formField} onChange={e => formField.onChange(parseFloat(e.target.value))} /></FormControl>
                      <FormMessage/>
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="max"
                  render={({ field: formField }) => (
                    <FormItem>
                      <FormLabel>Max Value</FormLabel>
                      <FormControl><Input type="number" placeholder="e.g., 100" {...formField} onChange={e => formField.onChange(parseFloat(e.target.value))} /></FormControl>
                      <FormMessage/>
                    </FormItem>
                  )}
                />
              </div>
            )}

          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
