import type { Locale } from "./config";
import en from "./messages/en.json";
import zh from "./messages/zh.json";

export type Messages = typeof en;

export const allMessages: Record<Locale, Messages> = {
  en,
  zh: zh as Messages,
};
