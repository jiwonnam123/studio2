'use server';

/**
 * @fileOverview AI-powered form field suggestion flow.
 *
 * This file defines a Genkit flow that suggests relevant form fields based on the form title and description.
 * It exports:
 *   - suggestFormFields: The main function to trigger the form field suggestion flow.
 *   - SuggestFormFieldsInput: The input type for the suggestFormFields function.
 *   - SuggestFormFieldsOutput: The output type for the suggestFormFields function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestFormFieldsInputSchema = z.object({
  formTitle: z.string().describe('The title of the form.'),
  formDescription: z.string().describe('A description of the form and its purpose.'),
});
export type SuggestFormFieldsInput = z.infer<typeof SuggestFormFieldsInputSchema>;

const SuggestFormFieldsOutputSchema = z.object({
  suggestedFields: z
    .array(z.string())
    .describe('An array of suggested form fields based on the title and description.'),
});
export type SuggestFormFieldsOutput = z.infer<typeof SuggestFormFieldsOutputSchema>;

export async function suggestFormFields(input: SuggestFormFieldsInput): Promise<SuggestFormFieldsOutput> {
  return suggestFormFieldsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestFormFieldsPrompt',
  input: {schema: SuggestFormFieldsInputSchema},
  output: {schema: SuggestFormFieldsOutputSchema},
  prompt: `You are an AI assistant that suggests form fields based on the form title and description.

  Form Title: {{{formTitle}}}
  Form Description: {{{formDescription}}}

  Please provide a list of suggested form fields that would be relevant to this form.  The suggested fields should be generic and applicable in a wide variety of contexts. The response should be newline separated.
  For example:
  name\nemail\nphone number\naddress\ncomment`,
});

const suggestFormFieldsFlow = ai.defineFlow(
  {
    name: 'suggestFormFieldsFlow',
    inputSchema: SuggestFormFieldsInputSchema,
    outputSchema: SuggestFormFieldsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);

    // Split the output by newline to get an array of suggested fields
    const suggestedFields = output!.suggestedFields;
    return {
      suggestedFields: suggestedFields,
    };
  }
);
