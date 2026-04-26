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
      <body className="bg-gray-50 text-gray-900 font-sans antialiased">
        <NavWrapper>{children}</NavWrapper>
      </body>
    </html>
  );
}
