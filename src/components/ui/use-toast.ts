import { useToast as useShadcnToast } from "@/components/ui/use-toast";

export function useToast() {
  const { toast } = useShadcnToast();
  
  return {
    toast: (props: {
      title: string;
      description?: string;
      variant?: "default" | "destructive";
    }) => {
      toast({
        ...props,
        className: "bg-white border border-gray-200 shadow-lg"
      });
    }
  };
}

export const toast = (props: {
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}) => {
  const { toast } = useShadcnToast();
  toast({
    ...props,
    className: "bg-white border border-gray-200 shadow-lg"
  });
};
