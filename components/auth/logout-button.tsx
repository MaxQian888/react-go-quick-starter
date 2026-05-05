"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { authService } from "@/services/auth.service";
import { useAuthStore } from "@/stores/auth-store";

type Props = {
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "default";
};

export function LogoutButton({ variant = "outline", size = "sm" }: Props) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const queryClient = useQueryClient();
  const clear = useAuthStore((s) => s.clear);

  async function handleLogout() {
    await authService.logout();
    clear();
    queryClient.clear();
    router.replace(ROUTES.login);
  }

  return (
    <Button variant={variant} size={size} onClick={handleLogout}>
      <LogOut className="mr-2 h-4 w-4" />
      {t("logout")}
    </Button>
  );
}
