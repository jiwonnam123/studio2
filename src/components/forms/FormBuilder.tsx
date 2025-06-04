"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { FormDefinition, FormFieldDefinition } from '@/types';
import { FormDefinitionSchema } from '@/lib/schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { PlusCircle, Save, Eye, Loader2 } from 'lucide-react';
import { FieldEditor } from './FieldEditor';
import { AiSuggestions } from './AiSuggestions';
import { saveForm, generateId } from '@/lib/formStore';
import { toast } from '@/hooks/use-toast';
import useLocalStorage from '@/hooks/useLocalStorage'; // To ensure forms are persisted
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableItem } from '@/components/ui/SortableItem'; // A new component for sortable items
import { useAuth } from '@/contexts/AuthContext';

const FORMS_STORAGE_KEY = 'formflow_forms';

interface FormBuilderProps {
  existingForm?: FormDefinition;
}

export function FormBuilder({ existingForm }: FormBuilderProps) {
  const router = useRouter();
  const { user } = useAuth();
  // This local state is mainly to trigger re-renders of the form list for localStorage changes
  const [, setStoredForms] = useLocalStorage<FormDefinition[]>(FORMS_STORAGE_KEY, []);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormDefinition>({
    resolver: zodResolver(FormDefinitionSchema),
    defaultValues: existingForm || {
      id: generateId(),
      title: '',
      description: '',
      fields: [{ 
        id: generateId(), 
        label: 'First Field', 
        name: 'first_field', 
        type: 'text', 
        required: false 
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: user?.id,
    },
  });

  const { control, handleSubmit, watch, setValue, reset } = form;
  const formTitle = watch('title');
  const formDescription = watch('description');

  const { fields, append, remove, update, move } = useFieldArray({
    control,
    name: "fields",
    keyName: "keyId", // To avoid using 'id' which is part of FormFieldDefinition
  });

  useEffect(() => {
    if (existingForm) {
      reset(existingForm);
    }
  }, [existingForm, reset]);
  
  // Ensure userId is set if user context is available
  useEffect(() => {
    if (user?.id && !watch('userId')) {
      setValue('userId', user.id);
    }
  }, [user, watch, setValue]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const {active, over} = event;
    if (over && active.id !== over.id) {
      const oldIndex = fields.findIndex((field) => field.id === active.id);
      const newIndex = fields.findIndex((field) => field.id === over.id);
      move(oldIndex, newIndex);
    }
  }

  const onSubmitHandler = (data: FormDefinition) => {
    setIsSubmitting(true);
    try {
      const formToSave = { ...data, updatedAt: new Date().toISOString() };
      if (!existingForm) { // if new form, ensure createdAt is also set
        formToSave.createdAt = formToSave.createdAt || new Date().toISOString();
      }
      saveForm(formToSave); // Saves to localStorage
      setStoredForms(prev => { // Trigger potential re-renders elsewhere if needed
        const index = prev.findIndex(f => f.id === formToSave.id);
        if (index > -1) {
          const newForms = [...prev];
          newForms[index] = formToSave;
          return newForms;
        }
        return [...prev, formToSave];
      });
      toast({
        title: "Form Saved!",
        description: `"${data.title}" has been successfully saved.`,
      });
      router.push(`/forms/${formToSave.id}/edit`); // or /dashboard
    } catch (error) {
      console.error("Error saving form:", error);
      toast({
        title: "Error Saving Form",
        description: "Could not save the form. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const addField = (type: FormFieldDefinition['type'] = 'text', labelPrefix: string = 'New') => {
    const newFieldName = `${labelPrefix.toLowerCase().replace(/\s+/g, '_')}_${fields.length + 1}`;
    append({
      id: generateId(),
      label: `${labelPrefix} Field ${fields.length + 1}`,
      name: newFieldName,
      type: type,
      required: false,
    });
  };

  const addSuggestedField = (fieldNameSuggestion: string) => {
    const normalizedName = fieldNameSuggestion.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/gi, '');
    append({
      id: generateId(),
      label: fieldNameSuggestion, // Use the suggestion as label
      name: `${normalizedName}_${fields.length + 1}`, // Ensure unique name
      type: 'text', // Default to text type
      required: false,
    });
     toast({
        title: "Field Added",
        description: `Field "${fieldNameSuggestion}" added to the form.`,
      });
  };

  const updateField = (index: number, updatedFieldData: FormFieldDefinition) => {
    update(index, updatedFieldData);
  };

  const deleteField = (index: number) => {
    if (fields.length > 1) { // Prevent deleting the last field
      remove(index);
    } else {
      toast({
        title: "Cannot Delete",
        description: "A form must have at least one field.",
        variant: "destructive",
      });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmitHandler)} className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Form Details</CardTitle>
            <CardDescription>Define the title and description of your form.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Form Title</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Contact Us, Event Registration" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Form Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Provide a brief description of your form's purpose." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <AiSuggestions 
          onAddField={addSuggestedField} 
          currentTitle={formTitle} 
          currentDescription={formDescription} 
        />

        <Card>
          <CardHeader>
            <CardTitle>Form Fields</CardTitle>
            <CardDescription>Add, edit, and reorder the fields for your form.</CardDescription>
          </CardHeader>
          <CardContent>
            {fields.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-muted-foreground">This form has no fields yet.</p>
                <Button type="button" variant="link" onClick={() => addField()} className="mt-2">
                  <PlusCircle className="mr-2 h-4 w-4" /> Add your first field
                </Button>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                  {fields.map((field, index) => (
                    <SortableItem key={field.id} id={field.id}>
                       {/* Pass field from form.watch() to ensure FieldEditor gets latest data */}
                       <FieldEditor
                        field={watch(`fields.${index}` as const)}
                        onUpdateField={(updatedData) => updateField(index, updatedData)}
                        onDeleteField={() => deleteField(index)}
                        index={index}
                        isOnlyField={fields.length === 1}
                      />
                    </SortableItem>
                  ))}
                </SortableContext>
              </DndContext>
            )}
            <Button type="button" variant="outline" onClick={() => addField()} className="mt-4">
              <PlusCircle className="mr-2 h-4 w-4" /> Add Field
            </Button>
          </CardContent>
        </Card>
        
        <Separator />

        <div className="flex flex-col sm:flex-row justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(existingForm ? `/forms/${existingForm.id}/preview` : '/dashboard')}
            disabled={isSubmitting}
          >
            <Eye className="mr-2 h-4 w-4" /> {existingForm ? 'Preview Form' : 'Cancel'}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" /> Save Form
          </Button>
        </div>
      </form>
    </Form>
  );
}
