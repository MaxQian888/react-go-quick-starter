import { Header } from "@/components/layout/header";

/** Centered card shell shared by login & register pages. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header hideAuthActions />
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="bg-card w-full max-w-md rounded-xl border p-6 shadow-sm sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
