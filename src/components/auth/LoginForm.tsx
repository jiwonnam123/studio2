"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { useRouter } from "next/navigation";
import Image from 'next/image';
import { useState, useCallback } from "react";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input as UiInput } from "@/components/ui/input"; // Renamed to avoid conflict
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
    
    // setIsTransitioning(true); // isTransitioning might not be needed with AnimatePresence mode="wait" or careful variant timing
    setMode(newMode);
    // It's often better to let animation complete events handle isTransitioning state
    // For now, let's see how it behaves without manual isTransitioning and timeout.
    // If glitches occur, we can re-add or use onAnimationComplete.
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
      <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-6">
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
                  className="rounded-md focus:border-primary transition-colors duration-200"
                  whileFocus={{ scale: 1.02 }}
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
                    className="pr-10 rounded-md focus:border-primary transition-colors duration-200"
                    whileFocus={{ scale: 1.02 }}
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
          className="w-full hover:scale-105 transform transition-transform duration-200"
          disabled={isSubmitting || isGoogleSubmitting}
          asChild // Required for motion props on Button if it's not a motion component itself
        >
          <motion.button whileTap={{ scale: 0.98 }}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            로그인
          </motion.button>
        </Button>
      </form>
    </Form>
  );

  const renderSignupForm = () => (
    <Form {...signupForm}>
      <form onSubmit={signupForm.handleSubmit(onSignup)} className="space-y-6">
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
                  className="rounded-md focus:border-primary transition-colors duration-200"
                  whileFocus={{ scale: 1.02 }}
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
                    className="pr-10 rounded-md focus:border-primary transition-colors duration-200"
                    whileFocus={{ scale: 1.02 }}
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
                    className="pr-10 rounded-md focus:border-primary transition-colors duration-200"
                    whileFocus={{ scale: 1.02 }}
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
          className="w-full hover:scale-105 transform transition-transform duration-200"
          disabled={isSubmitting || isGoogleSubmitting}
          asChild
        >
          <motion.button whileTap={{ scale: 0.98 }}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            회원가입
          </motion.button>
        </Button>
      </form>
    </Form>
  );

  const formVariants = {
    hidden: (direction: number) => ({
      opacity: 0,
      x: direction > 0 ? 100 : -100, // Slide from right or left
      scale: 0.95,
    }),
    visible: {
      opacity: 1,
      x: 0,
      scale: 1,
      transition: { type: "spring", stiffness: 260, damping: 25 },
    },
    exit: (direction: number) => ({
      opacity: 0,
      x: direction < 0 ? 100 : -100, // Slide to right or left
      scale: 0.95,
      transition: { type: "spring", stiffness: 260, damping: 25, duration: 0.3 }, // Added duration for exit
    }),
  };

  const Input = motion(UiInput); // Create a motion version of the Input component
  const MotionButton = motion(Button); // Create a motion version of the Button component

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
      className="flex flex-col items-center w-full max-w-md -mt-24"
    >
      {/* 로고 */}
      <div className="w-full flex justify-center mb-8">
        <Image 
          src="/adpopcorn-logo.png"
          alt="Adpopcorn Logo" 
          width={240}
          height={72}
          priority
          className="h-auto w-56"
        />
      </div>
      
      <div className="relative w-full min-h-[480px]">
        <AnimatePresence initial={false} mode="wait" custom={mode === 'login' ? 1 : -1}>
          {mode === 'login' && (
            <motion.div
              key="login"
              custom={1} // Direction: 1 for login (comes from right or goes to left)
              variants={formVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="absolute inset-0 w-full" // Removed transition classes
              role="tabpanel"
              aria-labelledby="login-tab"
            >
              <Card className="w-full shadow-xl hover:shadow-2xl transition-shadow duration-300 bg-gradient-to-br from-violet-50 to-blue-100 rounded-lg">
                <CardHeader className="pt-8">
                  <CardTitle className="text-3xl font-bold text-center">로그인</CardTitle>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                  {renderLoginForm()}

                  <div className="relative my-6">
                    <Separator className="absolute left-0 top-1/2 -translate-y-1/2 w-full bg-slate-200" />
                    <span className="relative bg-gradient-to-br from-violet-50 to-blue-100 px-2 text-xs text-slate-400 flex justify-center">
                      또는
                    </span>
                  </div>

                  <MotionButton
                    variant="default"
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 hover:scale-105 transform transition-all duration-200 rounded-md"
                    onClick={handleGoogleAuth}
                    disabled={isSubmitting || isGoogleSubmitting}
                    whileTap={{ scale: 0.98 }}
                  >
                    {isGoogleSubmitting ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      <GoogleIcon />
                    )}
                    Google로 로그인
                  </MotionButton>
                </CardContent>
                <CardFooter className="justify-center text-sm pt-6 pb-8">
                  <span className="text-muted-foreground">계정이 없으신가요? </span>
                  <Button
                    variant="link"
                    className="p-0 h-auto font-semibold text-blue-600 hover:text-blue-500 hover:underline ml-2"
                    onClick={() => handleModeSwitch('signup')}
                    // disabled={isTransitioning} // Let AnimatePresence handle disabling interaction
                  >
                    회원가입
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          )}

          {mode === 'signup' && (
            <motion.div
              key="signup"
              custom={-1} // Direction: -1 for signup (comes from left or goes to right)
              variants={formVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="absolute inset-0 w-full" // Removed transition classes
              role="tabpanel"
              aria-labelledby="signup-tab"
            >
              <Card className="w-full shadow-xl hover:shadow-2xl transition-shadow duration-300 bg-gradient-to-br from-violet-50 to-blue-100 rounded-lg">
                <CardHeader className="pt-8">
                  <CardTitle className="text-3xl font-bold text-center">회원가입</CardTitle>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                  {renderSignupForm()}
                </CardContent>
                <CardFooter className="justify-center text-sm pt-6 pb-8">
                  <span className="text-muted-foreground">이미 계정이 있으신가요? </span>
                  <Button
                    variant="link"
                    className="p-0 h-auto font-semibold text-blue-600 hover:text-blue-500 hover:underline ml-1"
                    onClick={() => handleModeSwitch('login')}
                    // disabled={isTransitioning} // Let AnimatePresence handle disabling interaction
                  >
                    로그인
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
