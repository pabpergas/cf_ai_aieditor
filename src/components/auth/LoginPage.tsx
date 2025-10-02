import { signIn } from "../../lib/auth-client";
import { Button } from "../button/Button";
import { Github } from "lucide-react";

export function LoginPage() {
  const handleGithubLogin = async () => {
    await signIn.social({
      provider: "github",
      callbackURL: "/",
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-neutral-900 dark:to-neutral-950">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-[#F48120] rounded-full mb-4">
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
              AI Code Editor
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400">
              Sign in to start coding with AI assistance
            </p>
          </div>

          <div className="space-y-4">
            <Button
              onClick={handleGithubLogin}
              className="w-full bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 font-semibold py-3 rounded-lg transition-all duration-200 flex items-center justify-center gap-3"
            >
              <Github size={20} />
              Continue with GitHub
            </Button>
          </div>

          <div className="mt-8 pt-6 border-t border-neutral-200 dark:border-neutral-800">
            <p className="text-xs text-center text-neutral-500 dark:text-neutral-500">
              By signing in, you agree to our Terms of Service and Privacy Policy
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
