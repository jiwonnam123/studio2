"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { suggestFormFields, type SuggestFormFieldsInput } from '@/ai/flows/suggest-form-fields';
import { toast } from '@/hooks/use-toast';
import { Loader2, Sparkles, Wand2 } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { AiSuggestFieldsSchema } from '@/lib/schemas';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";

interface AiSuggestionsProps {
  onAddField: (fieldName: string) => void;
  currentTitle?: string;
  currentDescription?: string;
}

type AiSuggestFieldsFormValues = Zod.infer<typeof AiSuggestFieldsSchema>;

export function AiSuggestions({ onAddField, currentTitle = '', currentDescription = '' }: AiSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<AiSuggestFieldsFormValues>({
    resolver: zodResolver(AiSuggestFieldsSchema),
    defaultValues: {
      formTitle: currentTitle,
      formDescription: currentDescription,
    },
  });
  
  // Update form default values if props change
  useState(() => {
    form.reset({ formTitle: currentTitle, formDescription: currentDescription });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTitle, currentDescription, form.reset]);


  const handleFetchSuggestions = async (data: AiSuggestFieldsFormValues) => {
    setIsLoading(true);
    setSuggestions([]);
    try {
      const result = await suggestFormFields({
        formTitle: data.formTitle,
        formDescription: data.formDescription || '',
      });
      if (result.suggestedFields && result.suggestedFields.length > 0) {
        setSuggestions(result.suggestedFields);
        toast({
          title: "AI Suggestions Ready!",
          description: `${result.suggestedFields.length} fields suggested.`,
        });
      } else {
        toast({
          title: "No suggestions found",
          description: "Try refining your title or description.",
        });
      }
    } catch (error) {
      console.error("AI suggestion error:", error);
      toast({
        title: "AI Suggestion Error",
        description: "Could not fetch suggestions. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="bg-muted/30 border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Wand2 className="h-5 w-5 text-primary" /> AI Field Suggester</CardTitle>
        <CardDescription>
          Get intelligent field suggestions based on your form&apos;s title and description.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFetchSuggestions)} className="space-y-4">
            <FormField
              control={form.control}
              name="formTitle"
              render={({ field }) => (
                <FormItem>
                  <Label htmlFor="aiFormTitle">Form Title (for AI)</Label>
                  <Input id="aiFormTitle" placeholder="e.g., Customer Feedback Survey" {...field} />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="formDescription"
              render={({ field }) => (
                <FormItem>
                  <Label htmlFor="aiFormDescription">Form Description (optional, for AI)</Label>
                  <Textarea id="aiFormDescription" placeholder="e.g., A survey to collect feedback about our new product." {...field} />
                   <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={isLoading} className="w-full sm:w-auto">
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Suggest Fields
            </Button>
          </form>
        </Form>

        {suggestions.length > 0 && (
          <div className="mt-6">
            <h4 className="font-semibold mb-2">Suggested Fields:</h4>
            <ul className="space-y-2">
              {suggestions.map((suggestion, index) => (
                <li key={index} className="flex items-center justify-between p-2 bg-background rounded-md shadow-sm">
                  <span className="text-sm">{suggestion}</span>
                  <Button size="sm" variant="outline" onClick={() => onAddField(suggestion)}>
                    Add Field
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
