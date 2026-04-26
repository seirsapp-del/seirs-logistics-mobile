'use client';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearSession, getUser } from '@/lib/auth';

const LINKS = [
  { href: '/',          label: 'Overview'   },
  { href: '/deliveries',label: 'Deliveries' },
  { href: '/drivers',   label: 'Drivers'    },
  { href: '/users',     label: 'Users'      },
  { href: '/analytics', label: 'Analytics'  },
  { href: '/fraud',     label: 'Fraud'      },
  { href: '/pricing',   label: 'Pricing'    },
  { href: '/admins',    label: 'Admins'     },
];

export default function AdminNav() {
  const router   = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);

  // Load from localStorage only after mount — avoids server/client mismatch
  useEffect(() => { setUser(getUser()); }, []);

  const logout = () => {
    clearSession();
    router.replace('/login');
  };

  return (
    <nav className="bg-[#0D1B2A] text-white px-8 py-0 flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-1">
        <a href="/" className="text-xl font-black tracking-widest text-[#F4600C] mr-4 py-4">
          SEIRS
        </a>
        {LINKS.map((l) => {
          const active = pathname === l.href || (l.href !== '/' && pathname.startsWith(l.href));
          return (
            <a
              key={l.href}
              href={l.href}
              className={`px-3 py-4 text-sm font-medium border-b-2 transition-colors ${
                active
                  ? 'border-[#F4600C] text-white'
                  : 'border-transparent text-gray-400 hover:text-white hover:border-gray-600'
              }`}
            >
              {l.label}
            </a>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        {user && (
          <span className="text-xs text-gray-400">
            {user.name}
          </span>
        )}
        <button
          onClick={logout}
          className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
