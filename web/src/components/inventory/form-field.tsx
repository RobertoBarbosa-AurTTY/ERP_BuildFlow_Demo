import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  label: React.ReactNode;
  htmlFor?: string;
  error?: string;
  description?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** Campo de formulário com rótulo, ajuda e erro inline. */
export function FormField({ label, htmlFor, error, description, required, className, children }: FormFieldProps) {
  return (
    <Field data-invalid={error ? true : undefined} className={cn("gap-1.5", className)}>
      <FieldLabel htmlFor={htmlFor}>
        {label}
        {required && <span className="text-destructive">*</span>}
      </FieldLabel>
      {children}
      {error ? <FieldError>{error}</FieldError> : description ? <FieldDescription className="text-xs">{description}</FieldDescription> : null}
    </Field>
  );
}
