import useTheme from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { Moon, Sun } from "lucide-react";
import { useState } from "react";

const ThemeSelector = () => {
  const [theme, setTheme] = useState<"dark" | "light">("light");

  useTheme(theme);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === "dark" ? "light" : "dark"));
  };

  return (
    <button
      type="button"
      className="flex size-8 cursor-pointer items-center justify-center rounded-md hover:bg-neutral-200/60 dark:hover:bg-neutral-900"
      onClick={() => toggleTheme()}
    >
      <Moon
        size={18}
        className={cn("hidden", {
          "animate-fade block": theme === "dark"
        })}
      />
      <Sun
        size={18}
        className={cn("animate-fade block", {
          hidden: theme === "dark"
        })}
      />
    </button>
  );
};

export default ThemeSelector;
