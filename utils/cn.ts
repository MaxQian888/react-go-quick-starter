// Re-export the existing cn() so `@/utils` consumers do not have to reach into
// `@/lib`. lib/utils.ts remains the source of truth.
export { cn } from "@/lib/utils";
