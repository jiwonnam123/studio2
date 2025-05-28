
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
  const router = useRouter();
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
        title: "로그인 성공",
        description: "다시 오신 것을 환영합니다!",
      });
    } catch (error: any) {
      let errorMessage = "예상치 못한 오류가 발생했습니다.";
      if (error.code) {
        switch (error.code) {
          case 'auth/user-not-found':
          case 'auth/wrong-password':
          case 'auth/invalid-credential':
            errorMessage = "잘못된 이메일 또는 비밀번호입니다.";
            break;
          case 'auth/invalid-email':
            errorMessage = "잘못된 이메일 형식입니다.";
            break;
          case 'auth/user-disabled':
            errorMessage = "이 계정은 비활성화되었습니다.";
            break;
          default:
            errorMessage = error.message || "로그인에 실패했습니다. 다시 시도해 주세요.";
        }
      }
      toast({
        title: "로그인 실패",
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
        title: "Google 로그인 성공",
        description: "환영합니다!",
      });
    } catch (error: any) {
      let errorMessage = "Google 로그인에 실패했습니다. 다시 시도해 주세요.";
      if (error.code) {
        switch (error.code) {
          case 'auth/popup-closed-by-user':
            errorMessage = "로그인이 취소되었습니다. Google 로그인 팝업이 닫혔습니다. 이는 브라우저 보안 정책, 팝업 차단기 또는 타사 쿠키 제한 때문일 수 있습니다. 브라우저 설정을 확인하고 다시 시도해 주세요.";
            break;
          case 'auth/cancelled-popup-request':
             errorMessage = "로그인이 취소되었습니다. 여러 팝업이 열렸거나 브라우저 보안 설정(팝업 또는 타사 쿠키 제한, Cross-Origin-Opener-Policy 등) 때문일 수 있습니다. 하나의 로그인 시도만 활성화되어 있는지 확인하고 다시 시도해 주세요.";
            break;
          case 'auth/popup-blocked-by-browser':
            errorMessage = "로그인 실패. Google로 로그인하려면 이 사이트에 대한 팝업을 활성화하세요.";
            break;
          case 'auth/account-exists-with-different-credential':
            errorMessage = "이 이메일로 이미 계정이 있지만 다른 로그인 방법을 사용했습니다. 해당 방법을 시도하거나 다른 Google 계정을 사용하세요.";
            break;
          case 'auth/unauthorized-domain':
            errorMessage = "로그인 실패. 이 웹사이트의 도메인은 Google 로그인이 승인되지 않았습니다. 사이트 관리자에게 문의하거나 개발자인 경우 Firebase 프로젝트 설정을 확인하세요.";
            break;
          case 'auth/operation-not-allowed':
             errorMessage = "이 Firebase 프로젝트에 Google 로그인이 활성화되어 있지 않습니다. Firebase 콘솔에서 활성화해주세요.";
            break;
          default:
            errorMessage = error.message || "Google 로그인에 실패했습니다. 다시 시도해 주세요.";
        }
      }
      toast({
        title: "Google 로그인 실패",
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
        <CardTitle className="text-2xl">로그인</CardTitle>
        <CardDescription>
          계정에 로그인하거나 Google을 사용하려면 아래에 이메일을 입력하세요.
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
                  <FormLabel>이메일</FormLabel>
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
                  <FormLabel>비밀번호</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} autoComplete="current-password" disabled={isSubmitting || isGoogleSubmitting}/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={isSubmitting || isGoogleSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              로그인
            </Button>
          </form>
        </Form>
        <div className="relative my-4">
          <Separator className="absolute left-0 top-1/2 -translate-y-1/2 w-full" />
          <span className="relative bg-card px-2 text-sm text-muted-foreground flex justify-center">
            또는
          </span>
        </div>
        <Button variant="outline" className="w-full" onClick={handleGoogleLogin} disabled={isSubmitting || isGoogleSubmitting}>
          {isGoogleSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <GoogleIcon />
          Google로 로그인
        </Button>
      </CardContent>
      <CardFooter className="flex-col items-start">
        <div className="mt-4 text-center text-sm w-full">
          계정이 없으신가요?{" "}
          <Link href="/register" className="underline text-primary hover:text-primary/80">
            회원가입
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}
