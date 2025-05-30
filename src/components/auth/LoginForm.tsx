"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { useRouter } from "next/navigation";
import Image from 'next/image';
import { useState, useCallback } from "react";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

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
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { LoginSchema, SignupSchema } from "@/lib/schemas";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

type AuthMode = 'login' | 'signup';

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
  const { login, loginWithGoogle, signup } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const loginForm = useForm<z.infer<typeof LoginSchema>>({
    resolver: zodResolver(LoginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const signupForm = useForm<z.infer<typeof SignupSchema>>({
    resolver: zodResolver(SignupSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const handleModeSwitch = (newMode: AuthMode) => {
    if (mode === newMode || isTransitioning) return;
    
    setIsTransitioning(true);
    
    // 150ms 후에 모드 전환
    setTimeout(() => {
      setMode(newMode);
      setIsTransitioning(false);
    }, 150);
  };

  const onLogin = async (data: z.infer<typeof LoginSchema>) => {
    setIsSubmitting(true);
    try {
      await login(data.email, data.password);
      toast({
        title: "로그인 성공",
        description: "다시 오신 것을 환영합니다!",
        duration: 2000,
      });
    } catch (error: any) {
      handleAuthError(error, "로그인");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSignup = async (data: z.infer<typeof SignupSchema>) => {
    if (data.password !== data.confirmPassword) {
      signupForm.setError('confirmPassword', {
        type: 'manual',
        message: '비밀번호가 일치하지 않습니다.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await signup(data.email, data.password);
      toast({
        title: "회원가입 성공",
        description: "가입을 환영합니다!",
        duration: 2000,
      });
      handleModeSwitch('login');
    } catch (error: any) {
      handleAuthError(error, "회원가입");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleAuth = async () => {
    setIsGoogleSubmitting(true);
    try {
      await loginWithGoogle();
      toast({
        title: `${mode === 'login' ? '로그인' : '회원가입'} 성공`,
        description: "환영합니다!",
        duration: 2000,
      });
    } catch (error: any) {
      handleAuthError(error, `Google ${mode === 'login' ? '로그인' : '회원가입'}`);
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  const handleAuthError = (error: any, action: string) => {
    let errorMessage = `예상치 못한 오류가 발생했습니다.`;
    
    if (error.code) {
      switch (error.code) {
        case 'auth/email-already-in-use':
          errorMessage = "이미 사용 중인 이메일입니다.";
          break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          errorMessage = "잘못된 이메일 또는 비밀번호입니다.";
          break;
        case 'auth/invalid-email':
          errorMessage = "잘못된 이메일 형식입니다.";
          break;
        case 'auth/weak-password':
          errorMessage = "비밀번호는 6자 이상이어야 합니다.";
          break;
        case 'auth/user-disabled':
          errorMessage = "이 계정은 비활성화되었습니다.";
          break;
        case 'auth/popup-closed-by-user':
          errorMessage = `${action}이 취소되었습니다.`;
          break;
        case 'auth/unauthorized-domain':
          errorMessage = "이 웹사이트의 도메인은 인증이 승인되지 않았습니다.";
          break;
        default:
          errorMessage = error.message || `${action} 중 오류가 발생했습니다.`;
      }
    }
    
    toast({
      title: `${action} 실패`,
      description: errorMessage,
      variant: "destructive",
    });
  };

  const renderLoginForm = () => (
    <Form {...loginForm}>
      <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
        <FormField
          control={loginForm.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>이메일</FormLabel>
              <FormControl>
                <Input 
                  placeholder="m@example.com" 
                  {...field} 
                  autoComplete="email"
                  disabled={isSubmitting || isGoogleSubmitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={loginForm.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>비밀번호</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input 
                    type={showLoginPassword ? "text" : "password"} 
                    placeholder="••••••••" 
                    {...field} 
                    autoComplete="current-password"
                    disabled={isSubmitting || isGoogleSubmitting}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-muted-foreground hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                    onClick={() => setShowLoginPassword((prev) => !prev)}
                    disabled={isSubmitting || isGoogleSubmitting}
                    aria-label={showLoginPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                  >
                    {showLoginPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </Button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button 
          type="submit" 
          className="w-full" 
          disabled={isSubmitting || isGoogleSubmitting}
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          로그인
        </Button>
      </form>
    </Form>
  );

  const renderSignupForm = () => (
    <Form {...signupForm}>
      <form onSubmit={signupForm.handleSubmit(onSignup)} className="space-y-4">
        <FormField
          control={signupForm.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>이메일</FormLabel>
              <FormControl>
                <Input 
                  placeholder="m@example.com" 
                  {...field} 
                  autoComplete="email"
                  disabled={isSubmitting || isGoogleSubmitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={signupForm.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>비밀번호</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input 
                    type={showSignupPassword ? "text" : "password"} 
                    placeholder="••••••••" 
                    {...field} 
                    autoComplete="new-password"
                    disabled={isSubmitting || isGoogleSubmitting}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-muted-foreground hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                    onClick={() => setShowSignupPassword((prev) => !prev)}
                    disabled={isSubmitting || isGoogleSubmitting}
                    aria-label={showSignupPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                  >
                    {showSignupPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </Button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={signupForm.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>비밀번호 확인</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input 
                    type={showConfirmPassword ? "text" : "password"} 
                    placeholder="••••••••" 
                    {...field} 
                    autoComplete="new-password"
                    disabled={isSubmitting || isGoogleSubmitting}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-muted-foreground hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    disabled={isSubmitting || isGoogleSubmitting}
                    aria-label={showConfirmPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </Button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button 
          type="submit" 
          className="w-full" 
          disabled={isSubmitting || isGoogleSubmitting}
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          회원가입
        </Button>
      </form>
    </Form>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
      className="flex flex-col items-center w-full max-w-sm -mt-24"
    >
      {/* 로고 */}
      <div className="w-full flex justify-center mb-6">
        <Image 
          src="/adpopcorn-logo.png"
          alt="Adpopcorn Logo" 
          width={200}
          height={60}
          priority
          className="h-auto w-48"
        />
      </div>
      
      <div className="relative w-full min-h-[400px]">
        {/* 로그인 폼 */}
        <div 
          className={cn(
            "absolute inset-0 w-full transition-all duration-300 ease-in-out motion-reduce:transition-none",
            mode === 'login' 
              ? 'opacity-100 translate-x-0 z-10' 
              : 'opacity-0 translate-x-4 pointer-events-none'
          )}
          role="tabpanel"
          aria-labelledby="login-tab"
        >
          <Card className="w-full shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader>
              <CardTitle className="text-2xl">로그인</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {renderLoginForm()}
              
              <div className="relative my-4">
                <Separator className="absolute left-0 top-1/2 -translate-y-1/2 w-full" />
                <span className="relative bg-card px-2 text-sm text-muted-foreground flex justify-center">
                  또는
                </span>
              </div>
              
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={handleGoogleAuth}
                disabled={isSubmitting || isGoogleSubmitting}
              >
                {isGoogleSubmitting ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <GoogleIcon />
                )}
                Google로 로그인
              </Button>
            </CardContent>
            <CardFooter className="justify-center text-sm pt-2">
              <span className="text-muted-foreground">계정이 없으신가요? </span>
              <Button 
                variant="link" 
                className="p-0 h-auto font-semibold text-blue-600 ml-2" 
                onClick={() => handleModeSwitch('signup')}
                disabled={isTransitioning}
              >
                회원가입
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* 회원가입 폼 */}
        <div 
          className={cn(
            "absolute inset-0 w-full transition-all duration-300 ease-in-out motion-reduce:transition-none",
            mode === 'signup' 
              ? 'opacity-100 translate-x-0 z-10' 
              : 'opacity-0 -translate-x-4 pointer-events-none'
          )}
          role="tabpanel"
          aria-labelledby="signup-tab"
        >
          <Card className="w-full shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader>
              <CardTitle className="text-2xl">회원가입</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {renderSignupForm()}
            </CardContent>
            <CardFooter className="justify-center text-sm pt-2">
              <span className="text-muted-foreground">이미 계정이 있으신가요? </span>
              <Button 
                variant="link" 
                className="p-0 h-auto font-semibold text-blue-600 ml-1" 
                onClick={() => handleModeSwitch('login')}
                disabled={isTransitioning}
              >
                로그인
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
