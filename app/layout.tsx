import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "My GitHub", template: "%s · My GitHub" },
  description: "Private self-hosted Git and deployment cloud"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
