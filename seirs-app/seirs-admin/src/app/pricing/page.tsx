'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';

interface PricingConfig {
  baseFare:        number;
  perKmRate:       number;
  platformCut:     number;
  surgeActive:     boolean;
  surgeMultiplier: number;
}

export default function PricingPage() {
  const [config,  setConfig]  = useState<PricingConfig | null>(null);
  const [form,    setForm]    = useState<PricingConfig | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.pricing.get().then((data: PricingConfig) => {
      setConfig(data);
      setForm(data);
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setSaved(false);
    try {
      const updated = await adminApi.pricing.update(form);
      setConfig(updated);
      setForm(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof PricingConfig, label: string, prefix = '', suffix = '', type: 'number' | 'toggle' = 'number') => {
    if (!form) return null;
    if (type === 'toggle') {
      return (
        <div key={key} className="flex items-center justify-between py-4 border-b border-gray-100 last:border-0">
          <div>
            <p className="text-sm font-medium text-gray-900">{label}</p>
          </div>
          <button
            onClick={() => setForm({ ...form, [key]: !form[key] })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              form[key] ? 'bg-[#F4600C]' : 'bg-gray-200'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              form[key] ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
      );
    }

    return (
      <div key={key} className="flex items-center justify-between py-4 border-b border-gray-100 last:border-0">
        <div>
          <p className="text-sm font-medium text-gray-900">{label}</p>
          {config && config[key] !== form[key] && (
            <p className="text-xs text-amber-500">
              Current: {prefix}{Number(config[key]).toLocaleString()}{suffix}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {prefix && <span className="text-sm text-gray-500">{prefix}</span>}
          <input
            type="number"
            value={String(form[key])}
            min={0}
            step={key === 'platformCut' ? 0.01 : 1}
            onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
            className="w-28 text-right border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F4600C]"
          />
          {suffix && <span className="text-sm text-gray-500">{suffix}</span>}
        </div>
      </div>
    );
  };

  // Live price preview
  const previewPrice = form
    ? Math.round(
        (form.baseFare + form.perKmRate * 10) *
        (form.surgeActive ? form.surgeMultiplier : 1)
      )
    : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Pricing Controls</h1>

        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading...</div>
        ) : form ? (
          <div className="space-y-6">
            {/* Config card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Base Rates</h2>
              {field('baseFare',    'Base Fare (minimum charge)', '₦')}
              {field('perKmRate',   'Per-Kilometre Rate', '₦', '/km')}
              {field('platformCut', 'Platform Commission', '', ' (0–1)', 'number')}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Surge Pricing</h2>
              {field('surgeActive',     'Enable Surge Pricing', '', '', 'toggle')}
              {field('surgeMultiplier', 'Surge Multiplier', '×', 'x')}
            </div>

            {/* Live preview */}
            <div className="bg-[#0D1B2A] rounded-xl p-6 text-white">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Live Preview — 10 km delivery</p>
              <p className="text-3xl font-black text-[#F4600C]">₦{previewPrice.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-1">
                ₦{form.baseFare} base + ₦{form.perKmRate} × 10 km
                {form.surgeActive ? ` × ${form.surgeMultiplier}x surge` : ''}
              </p>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-[#F4600C] text-white py-3 rounded-xl font-semibold text-sm hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
            </button>
          </div>
        ) : (
          <p className="text-gray-400 text-center py-20">Failed to load config.</p>
        )}
      </main>
    </div>
  );
}
