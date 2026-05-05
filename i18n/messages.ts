import en from "./messages/en.json";
import zh from "./messages/zh.json";
import type { Locale } from "./config";

export type Messages = typeof en;

export const allMessages: Record<Locale, Messages> = {
  en,
  zh: zh as Messages,
};
