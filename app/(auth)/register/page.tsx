"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/constants/routes";
import { ApiError } from "@/lib/api-client";
import { authService } from "@/services/auth.service";
import { useAuthStore } from "@/stores/auth-store";

type RegisterValues = { email: string; password: string };

export default function RegisterPage() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [submitting, setSubmitting] = useState(false);

  const schema = z.object({
    email: z.email(t("errors.invalidEmail")),
    password: z.string().min(8, t("errors.passwordTooShort")),
  });

  const form = useForm<RegisterValues>({
    resolver: standardSchemaResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: RegisterValues) {
    setSubmitting(true);
    try {
      const resp = await authService.register(values);
      setSession(resp);
      router.replace(ROUTES.dashboard);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t("errors.registerFailed");
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="mb-6 space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("register.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("register.subtitle")}</p>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("register.email")}</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder={t("register.emailPlaceholder")}
                    {...field}
                  />
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
                <FormLabel>{t("register.password")}</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormDescription>{t("register.passwordHint")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? t("register.submitting") : t("register.submit")}
          </Button>
        </form>
      </Form>
      <p className="text-muted-foreground mt-6 text-center text-sm">
        {t("register.hasAccount")}{" "}
        <Link href={ROUTES.login} className="text-primary font-medium hover:underline">
          {t("register.loginLink")}
        </Link>
      </p>
    </>
  );
}
