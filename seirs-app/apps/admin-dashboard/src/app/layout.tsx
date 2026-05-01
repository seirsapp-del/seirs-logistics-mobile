import type { Metadata } from 'next';
import './globals.css';
import NavWrapper from '@/components/NavWrapper';

export const metadata: Metadata = {
  title: 'Seirs Admin',
  description: 'Seirs Logistics Platform — Admin Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-[#F5F5F0] text-[#111827] font-sans antialiased">
        <NavWrapper>{children}</NavWrapper>
      </body>
    </html>
  );
}
