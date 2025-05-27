
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { LoginSchema } from "@/lib/schemas";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";

type LoginFormValues = z.infer<typeof LoginSchema>;

// Google Icon SVG
const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 h-4 w-4">
    <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12s4.48 10 10 10 10-4.48 10-10z"/>
    <path d="M12 22c5.52 0 10-4.48 10-10H2c0 5.52 4.48 10 10 10z" fill="#4285F4"/>
    <path d="M12 2c5.52 0 10 4.48 10 10h-5.5L12 2z" fill="#EA4335"/>
    <path d="M2 12c0-5.52 4.48-10 10-10v5.5L2 12z" fill="#FBBC05"/>
    <path d="M22 12c0 5.52-4.48 10-10 10v-5.5L22 12z" fill="#34A853"/>
    <path d="M16.5 12c0-2.48-1.01-4.7-2.64-6.34l-3.86 3.86c.86.86 1.34 2.03 1.34 3.32s-.48 2.46-1.34 3.32l3.86 3.86C15.49 16.7 16.5 14.48 16.5 12z" fill="#FFFFFF"/>
    <path d="M7.5 12c0 2.48 1.01 4.7 2.64 6.34l3.86-3.86c-.86-.86-1.34-2.03-1.34-3.32s.48-2.46 1.34-3.32L10.14 5.66C8.51 7.3 7.5 9.52 7.5 12z" fill="#FFFFFF"/>
  </svg>
);


export function LoginForm() {
  const { login, isLoading } = useAuth();
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(LoginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(data: LoginFormValues) {
    try {
      await login(data.email); // Simplified login, password not used in mock
      toast({
        title: "Login Successful",
        description: "Welcome back!",
      });
    } catch (error) {
      toast({
        title: "Login Failed",
        description: (error as Error).message || "An unexpected error occurred.",
        variant: "destructive",
      });
    }
  }

  const handleGoogleLogin = () => {
    // Placeholder for Google login logic
    toast({
      title: "Google Login",
      description: "Google login functionality is not yet implemented.",
      variant: "default",
    });
  };

  return (
    <Card className="w-full max-w-sm shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl">Login</CardTitle>
        <CardDescription>
          Enter your email below to login to your account or use Google.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder="m@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Login
            </Button>
          </form>
        </Form>
        <div className="relative my-4">
          <Separator className="absolute left-0 top-1/2 -translate-y-1/2 w-full" />
          <span className="relative bg-card px-2 text-sm text-muted-foreground flex justify-center">
            OR
          </span>
        </div>
        <Button variant="outline" className="w-full" onClick={handleGoogleLogin} disabled={isLoading}>
          <GoogleIcon />
          Login with Google
        </Button>
      </CardContent>
      <CardFooter className="flex-col items-start">
        <div className="mt-4 text-center text-sm w-full">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="underline text-primary hover:text-primary/80">
            Sign up
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}

