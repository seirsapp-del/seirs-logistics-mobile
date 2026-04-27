import type { Metadata } from 'next';
import './globals.css';
import NavWrapper from '@/components/NavWrapper';

export const metadata: Metadata = {
  title: 'Seirs Admin',
  description: 'Seirs Logistics Platform — Admin Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#F5F0EB] text-[#0D1B2A] font-sans antialiased">
        <NavWrapper>{children}</NavWrapper>
      </body>
    </html>
  );
}
