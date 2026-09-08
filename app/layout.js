// Font
import { Inter } from "next/font/google";
// Providers
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { SubmissionsProvider } from "@/components/SubmissionsProvider";
// Styling
import "./globals.css";

export const metadata = {
  title: "Organization Name | Recruitment Portal",
  description: "Recruitment portal for Organization Name",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SubmissionsProvider>
          {children}
          <Toaster />
        </SubmissionsProvider>
      </body>
    </html>
  );
}
