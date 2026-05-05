"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

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
import { ROUTES } from "@/constants/routes";
import { ApiError } from "@/lib/api-client";
import { authService } from "@/services/auth.service";
import { useAuthStore } from "@/stores/auth-store";

type LoginValues = { email: string; password: string };

export default function LoginPage() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const params = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const [submitting, setSubmitting] = useState(false);

  const schema = z.object({
    email: z.email(t("errors.invalidEmail")),
    password: z.string().min(1),
  });

  const form = useForm<LoginValues>({
    resolver: standardSchemaResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    setSubmitting(true);
    try {
      const resp = await authService.login(values);
      setSession(resp);
      const next = params.get("next");
      router.replace(next && next.startsWith("/") ? next : ROUTES.dashboard);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t("errors.loginFailed");
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="mb-6 space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("login.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("login.subtitle")}</p>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("login.email")}</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder={t("login.emailPlaceholder")}
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
                <FormLabel>{t("login.password")}</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? t("login.submitting") : t("login.submit")}
          </Button>
        </form>
      </Form>
      <p className="text-muted-foreground mt-6 text-center text-sm">
        {t("login.noAccount")}{" "}
        <Link href={ROUTES.register} className="text-primary font-medium hover:underline">
          {t("login.registerLink")}
        </Link>
      </p>
    </>
  );
}
