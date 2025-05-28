
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
import { useState } from "react";

// Google Icon SVG
const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 48" fill="none" className="mr-2 h-5 w-5">
    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
    <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z"/>
    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
    <path fill="#1976D2" d="M43.611 20.083H24v8h11.303c-.792 2.237-2.238 4.145-4.244 5.576l6.19 5.238C42.012 35.245 44 30.025 44 24c0-1.341-.138-2.65-.389-3.917z"/>
  </svg>
);


export function LoginForm() {
  const { login, loginWithGoogle } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  const form = useForm<z.infer<typeof LoginSchema>>({
    resolver: zodResolver(LoginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(data: z.infer<typeof LoginSchema>) {
    setIsSubmitting(true);
    try {
      await login(data.email, data.password); 
      toast({
        title: "Login Successful",
        description: "Welcome back!",
      });
    } catch (error: any) {
      let errorMessage = "An unexpected error occurred.";
      if (error.code) {
        switch (error.code) {
          case 'auth/user-not-found':
          case 'auth/wrong-password':
          case 'auth/invalid-credential':
            errorMessage = "Invalid email or password.";
            break;
          case 'auth/invalid-email':
            errorMessage = "Invalid email format.";
            break;
          case 'auth/user-disabled':
            errorMessage = "This account has been disabled.";
            break;
          default:
            errorMessage = error.message || "Login failed. Please try again.";
        }
      }
      toast({
        title: "Login Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleGoogleLogin = async () => {
    setIsGoogleSubmitting(true);
    try {
      await loginWithGoogle();
      toast({
        title: "Google Login Successful",
        description: "Welcome!",
      });
    } catch (error: any) {
      let errorMessage = "Google login failed. Please try again.";
      if (error.code) {
        switch (error.code) {
          case 'auth/popup-closed-by-user':
            errorMessage = "Login cancelled. The Google sign-in popup was closed. If you didn't close it manually, please check if your browser is blocking popups or restricting third-party cookies for this site. Some browser extensions can also interfere.";
            break;
          case 'auth/cancelled-popup-request':
             errorMessage = "Login cancelled. This might happen if multiple popups were opened, the request was cancelled, or due to browser security settings (like popup or third-party cookie restrictions). Please try again, ensuring only one login attempt is active.";
            break;
          case 'auth/popup-blocked-by-browser':
            errorMessage = "Login failed. Please enable popups for this site to sign in with Google.";
            break;
          case 'auth/account-exists-with-different-credential':
            errorMessage = "An account already exists with this email but used a different sign-in method. Try that method, or use a different Google account.";
            break;
          case 'auth/unauthorized-domain': // This case was added previously
            errorMessage = "Login failed. This website's domain is not authorized for Google Sign-In. Please contact the site administrator or check Firebase project settings if you are the developer.";
            break;
          case 'auth/operation-not-allowed':
             errorMessage = "Google Sign-In is not enabled for this Firebase project. Please enable it in the Firebase console.";
            break;
          default:
            errorMessage = error.message || "Google login failed. Please try again.";
        }
      }
      toast({
        title: "Google Login Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsGoogleSubmitting(false);
    }
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
                    <Input placeholder="m@example.com" {...field} autoComplete="email" disabled={isSubmitting || isGoogleSubmitting} />
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
                    <Input type="password" placeholder="••••••••" {...field} autoComplete="current-password" disabled={isSubmitting || isGoogleSubmitting}/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={isSubmitting || isGoogleSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
        <Button variant="outline" className="w-full" onClick={handleGoogleLogin} disabled={isSubmitting || isGoogleSubmitting}>
          {isGoogleSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
