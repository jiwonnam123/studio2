import { FormBuilder } from '@/components/forms/FormBuilder';

export default function CreateFormPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Create New Form</h1>
        <p className="text-muted-foreground">
          Design your form structure, add fields, and configure validation.
        </p>
      </div>
      <FormBuilder />
    </div>
  );
}
